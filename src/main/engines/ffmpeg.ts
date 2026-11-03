import { spawn } from 'node:child_process';

export interface MediaInfo {
  durationSec: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Total duration, used to turn ffmpeg's timestamps into 0..1 progress. */
  durationSec?: number | null;
  onProgress?: (fraction: number) => void;
}

export class AbortError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'AbortError';
  }
}

/**
 * Thin wrapper around an ffmpeg binary. Knows nothing about tools; tools
 * build argument lists and hand them to `run`.
 */
export class FfmpegEngine {
  constructor(readonly binaryPath: string) {}

  /** Reads duration and stream info by parsing `ffmpeg -i` output. */
  async probe(input: string): Promise<MediaInfo> {
    const { stderr } = await this.exec(['-hide_banner', '-i', input], {
      allowFailure: true,
    });
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
    const size = /Stream #.*?Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr);
    return {
      durationSec: d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : null,
      hasVideo: /Stream #.*?Video:/.test(stderr),
      hasAudio: /Stream #.*?Audio:/.test(stderr),
      width: size ? +size[1] : undefined,
      height: size ? +size[2] : undefined,
    };
  }

  /** Runs ffmpeg with the given arguments, reporting progress. */
  async run(args: string[], opts: RunOptions = {}): Promise<void> {
    const full = [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-progress',
      'pipe:1',
      '-nostats',
      ...args,
    ];
    const total = opts.durationSec ?? 0;
    let buffered = '';
    await this.exec(full, {
      signal: opts.signal,
      onStdout: (chunk) => {
        if (!opts.onProgress || total <= 0) return;
        buffered += chunk;
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          // out_time_us is microseconds (out_time_ms is too, despite its name).
          const m = /^out_time_us=(\d+)/.exec(line);
          if (m) opts.onProgress(Math.min(1, +m[1] / 1e6 / total));
        }
      },
    });
  }

  private exec(
    args: string[],
    opts: {
      signal?: AbortSignal;
      allowFailure?: boolean;
      onStdout?: (chunk: string) => void;
    },
  ): Promise<{ stderr: string }> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new AbortError());
      const child = spawn(this.binaryPath, args, { windowsHide: true });
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c: string) => opts.onStdout?.(c));
      child.stderr.on('data', (c: string) => {
        // Keep only the tail; long encodes can log a lot.
        stderr = (stderr + c).slice(-20_000);
      });

      const onAbort = () => child.kill('SIGKILL');
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      child.on('error', (err) => {
        opts.signal?.removeEventListener('abort', onAbort);
        reject(err);
      });
      child.on('close', (code) => {
        opts.signal?.removeEventListener('abort', onAbort);
        if (opts.signal?.aborted) return reject(new AbortError());
        if (code === 0 || opts.allowFailure) return resolve({ stderr });
        reject(new Error(lastErrorLines(stderr) || `ffmpeg exited ${code}`));
      });
    });
  }
}

function lastErrorLines(stderr: string): string {
  return stderr.trim().split('\n').slice(-4).join('\n');
}
