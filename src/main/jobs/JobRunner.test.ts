import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { JobState, OptionValues } from '../../shared/types';
import { JobRunner, uniqueOutputPath } from './JobRunner';

// Real ffmpeg from ffmpeg-static (resolved via app.getAppPath() in dev mode).
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getVersion: () => '0.0.0-test',
    getPath: () => path.join(os.tmpdir(), 'mo-test-logs'),
  },
  // Stand-in for the OS Trash: just delete the file.
  shell: { trashItem: async (p: string) => fs.rmSync(p) },
}));

const ffmpegBin = path.join(
  process.cwd(),
  'node_modules',
  'ffmpeg-static',
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
);
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-jobs-'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Generates a small test .mov (with audio) using the bundled ffmpeg. */
function makeClip(name: string, seconds: number, size = '640x360'): string {
  const file = path.join(dir, name);
  execFileSync(ffmpegBin, [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=s=${size}:r=30:d=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=f=440:d=${seconds}`,
    '-c:v',
    'mpeg4',
    '-q:v',
    '2',
    '-c:a',
    'pcm_s16le',
    '-shortest',
    file,
  ]);
  return file;
}

/** Runs one job to completion and returns its final state. */
function runJob(
  runner: JobRunner,
  inputPath: string,
  onRunning?: (job: JobState) => void,
  options: OptionValues = {},
): Promise<JobState> {
  return new Promise((resolve, reject) => {
    runner.on('update', (job) => {
      if (job.status === 'running') onRunning?.(job);
      if (!['queued', 'running'].includes(job.status)) resolve(job);
    });
    runner
      .enqueue([
        {
          toolId: 'video.convert',
          inputPath,
          options: { speed: 'fast', ...options },
        },
      ])
      .catch(reject);
  });
}

describe('uniqueOutputPath', () => {
  it('never overwrites an existing file or the input itself', async () => {
    const input = path.join(dir, 'a.mp4');
    fs.writeFileSync(input, '');
    expect(await uniqueOutputPath(input, 'mp4')).toBe(
      path.join(dir, 'a (optimised).mp4'),
    );
    fs.writeFileSync(path.join(dir, 'a (optimised).mp4'), '');
    expect(await uniqueOutputPath(input, 'mp4')).toBe(
      path.join(dir, 'a (optimised 2).mp4'),
    );
    expect(await uniqueOutputPath(path.join(dir, 'b.mov'), 'mp4', '/out')).toBe(
      path.join('/out', 'b.mp4'),
    );
  });
});

describe('JobRunner (real ffmpeg)', () => {
  it('converts a clip and reports progress', async () => {
    const input = makeClip('ok.mov', 2);
    let sawProgress = false;
    const job = await runJob(
      new JobRunner(),
      input,
      (j) => (sawProgress ||= (j.progress ?? 0) > 0),
    );
    expect(job.status).toBe('done');
    expect(job.outputPath).toBe(path.join(dir, 'ok.mp4'));
    expect(fs.statSync(job.outputPath!).size).toBe(job.outputBytes);
    expect(sawProgress).toBe(true);
  });

  it('converts to WebM (VP9 + Opus) and MOV', async () => {
    const input = makeClip('formats.mov', 1);
    const expected = {
      webm: ['formats.webm', 'Video: vp9', 'Audio: opus'],
      mov: ['formats (optimised).mov', 'Video: h264', 'Audio: aac'],
    };
    for (const [format, [name, video, audio]] of Object.entries(expected)) {
      const job = await runJob(new JobRunner(), input, undefined, { format });
      expect(job.status).toBe('done');
      expect(job.outputPath).toBe(path.join(dir, name));
      expect(job.quality).toBeGreaterThan(0.9);
      const info = spawnSync(ffmpegBin, [
        '-hide_banner',
        '-i',
        job.outputPath!,
      ]);
      expect(info.stderr.toString()).toContain(video);
      expect(info.stderr.toString()).toContain(audio);
    }
  });

  it('cancels mid-encode and leaves no partial file', async () => {
    // Large and slow enough that cancelling lands mid-encode.
    const input = makeClip('long.mov', 20, '1920x1080');
    const runner = new JobRunner();
    const job = await runJob(
      runner,
      input,
      (j) => {
        if ((j.progress ?? 0) > 0) runner.cancel(j.id);
      },
      { speed: 'slow' },
    );
    expect(job.status).toBe('cancelled');
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('long.mp4'))).toEqual(
      [],
    );
  });

  it('reports a readable error and full details for a broken file', async () => {
    const input = path.join(dir, 'broken.mov');
    fs.writeFileSync(input, 'not a video');
    const job = await runJob(new JobRunner(), input);
    expect(job.status).toBe('error');
    expect(job.error).not.toBe('Conversion failed!');
    expect(job.errorDetails).toContain('Tool: video.convert');
    expect(job.errorDetails).toContain(`Input: ${input}`);
    expect(
      fs.readdirSync(dir).filter((f) => f.startsWith('broken.mp4')),
    ).toEqual([]);
  });
});

describe('JobRunner parallel naming', () => {
  it('gives parallel jobs distinct output names', async () => {
    const reserved = new Set<string>();
    const input = path.join(dir, 'same.mov');
    const [a, b] = await Promise.all([
      uniqueOutputPath(input, 'webp', undefined, reserved),
      uniqueOutputPath(path.join(dir, 'same.png'), 'webp', undefined, reserved),
    ]);
    expect(a).not.toBe(b);
    expect(reserved).toEqual(new Set([a, b]));
  });
});

describe('JobRunner trash originals (real ffmpeg)', () => {
  it('moves the original to the Trash only after success', async () => {
    const input = makeClip('trash-me.mov', 1);
    const runner = new JobRunner();
    const job = await new Promise<JobState>((resolve) => {
      runner.on('update', (j) => {
        if (j.status === 'done' || j.status === 'error') resolve(j);
      });
      void runner.enqueue([
        {
          toolId: 'video.convert',
          inputPath: input,
          options: { speed: 'fast' },
          trashOriginal: true,
        },
      ]);
    });
    expect(job.status).toBe('done');
    expect(job.originalTrashed).toBe(true);
    expect(fs.existsSync(input)).toBe(false);
    expect(fs.existsSync(job.outputPath!)).toBe(true);
  });

  it('keeps the original when the conversion fails', async () => {
    const input = path.join(dir, 'broken-keep.mov');
    fs.writeFileSync(input, 'not a video');
    const runner = new JobRunner();
    const job = await new Promise<JobState>((resolve) => {
      runner.on('update', (j) => {
        if (j.status === 'done' || j.status === 'error') resolve(j);
      });
      void runner.enqueue([
        {
          toolId: 'video.convert',
          inputPath: input,
          options: {},
          trashOriginal: true,
        },
      ]);
    });
    expect(job.status).toBe('error');
    expect(fs.existsSync(input)).toBe(true);
  });
});
