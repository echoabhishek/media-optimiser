import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTool } from '../../tools';
import { resolveOptions } from '../../shared/options';
import type { JobRequest, JobState } from '../../shared/types';
import { AbortError, FfmpegError } from '../engines/ffmpeg';
import { getEngines } from '../engines';
import { log, logPath } from '../log';

interface Job {
  state: JobState;
  request: JobRequest;
  abort: AbortController;
  /** Set while encoding; deleted if the job doesn't finish. */
  tempPath?: string;
}

/**
 * FIFO queue. Runs one job at a time by default: video encoders already
 * use every CPU core, so parallel jobs just compete with each other.
 */
export class JobRunner extends EventEmitter<{ update: [JobState] }> {
  private jobs = new Map<string, Job>();
  private running = 0;

  constructor(private readonly concurrency = 1) {
    super();
  }

  async enqueue(requests: JobRequest[]): Promise<JobState[]> {
    const added: JobState[] = [];
    for (const request of requests) {
      if (!getTool(request.toolId))
        throw new Error(`Unknown tool ${request.toolId}`);
      const stat = await fs.stat(request.inputPath);
      const state: JobState = {
        id: randomUUID(),
        toolId: request.toolId,
        inputPath: request.inputPath,
        status: 'queued',
        progress: 0,
        inputBytes: stat.size,
      };
      this.jobs.set(state.id, { state, request, abort: new AbortController() });
      this.emit('update', state);
      added.push(state);
    }
    this.pump();
    return added;
  }

  cancel(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.state.status === 'queued') {
      this.update(job, { status: 'cancelled', finishedAt: Date.now() });
    }
    job.abort.abort();
  }

  /**
   * Called when the app quits: stops every job and removes partial output
   * synchronously, since the process exits before async cleanup would run.
   */
  shutdown(): void {
    for (const job of this.jobs.values()) {
      job.abort.abort();
      if (!job.tempPath) continue;
      try {
        // Retries cover Windows, where the file stays locked until ffmpeg exits.
        rmSync(job.tempPath, { force: true, maxRetries: 10, retryDelay: 100 });
      } catch {
        // Best effort; never block quitting.
      }
    }
  }

  list(): JobState[] {
    return [...this.jobs.values()].map((j) => j.state);
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (!['queued', 'running'].includes(job.state.status))
        this.jobs.delete(id);
    }
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const next = [...this.jobs.values()].find(
        (j) => j.state.status === 'queued',
      );
      if (!next) return;
      this.running++;
      void this.execute(next).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async execute(job: Job): Promise<void> {
    const tool = getTool(job.request.toolId)!;
    const outputPath = await uniqueOutputPath(
      job.request.inputPath,
      tool.outputExtension,
      job.request.outputDir,
    );
    // Encode to a temp name, rename when complete: no half-written files.
    const tempPath = `${outputPath}.part.${tool.outputExtension}`;
    job.tempPath = tempPath;
    this.update(job, { status: 'running', outputPath, startedAt: Date.now() });

    const options = resolveOptions(tool.options, job.request.options);
    log(
      'info',
      `start ${tool.id} ${job.request.inputPath} ${JSON.stringify(options)}`,
    );
    let lastEmit = 0;
    try {
      const result = await tool.run({
        inputPath: job.request.inputPath,
        outputPath: tempPath,
        options,
        engines: getEngines(),
        signal: job.abort.signal,
        onProgress: (p) => {
          const now = Date.now();
          if (now - lastEmit < 150) return; // throttle IPC traffic
          lastEmit = now;
          this.update(job, { progress: p });
        },
      });
      await fs.rename(tempPath, outputPath);
      job.tempPath = undefined;
      const { size } = await fs.stat(outputPath);
      log(
        'info',
        `done ${outputPath} ${job.state.inputBytes} -> ${size} bytes`,
      );
      this.update(job, {
        status: 'done',
        progress: 1,
        outputBytes: size,
        quality: result?.quality,
        finishedAt: Date.now(),
      });
    } catch (err) {
      await fs.rm(tempPath, { force: true });
      job.tempPath = undefined;
      const cancelled = err instanceof AbortError || job.abort.signal.aborted;
      if (cancelled) {
        log('info', `cancelled ${job.request.inputPath}`);
        this.update(job, { status: 'cancelled', finishedAt: Date.now() });
        return;
      }
      const message = (err as Error).message;
      const errorDetails = [
        `Media Optimiser ${app.getVersion()} · ${process.platform} ${process.arch}`,
        `Tool: ${tool.id}`,
        `Input: ${job.request.inputPath}`,
        `Options: ${JSON.stringify(options)}`,
        `Error: ${message}`,
        ...(err instanceof FfmpegError
          ? ['', '--- ffmpeg output ---', err.details]
          : []),
        '',
        `Log: ${logPath()}`,
      ].join('\n');
      log('error', errorDetails);
      this.update(job, {
        status: 'error',
        error: message,
        errorDetails,
        finishedAt: Date.now(),
      });
    }
  }

  private update(job: Job, patch: Partial<JobState>): void {
    job.state = { ...job.state, ...patch };
    this.emit('update', job.state);
  }
}

/** `clip.mov` → `clip.mp4`; never overwrites (incl. the input itself). */
export async function uniqueOutputPath(
  inputPath: string,
  ext: string,
  outputDir?: string,
): Promise<string> {
  const dir = outputDir ?? path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const candidates = [`${base}.${ext}`, `${base} (optimised).${ext}`];
  for (let i = 2; i < 1000; i++)
    candidates.push(`${base} (optimised ${i}).${ext}`);
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (path.resolve(p) === path.resolve(inputPath)) continue;
    try {
      await fs.access(p);
    } catch {
      return p;
    }
  }
  throw new Error('Could not find a free output filename');
}
