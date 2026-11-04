import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { JobState } from '../../shared/types';
import { JobRunner, uniqueOutputPath } from './JobRunner';

// Real ffmpeg from ffmpeg-static (resolved via app.getAppPath() in dev mode).
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }));

const ffmpegBin = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-jobs-'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Generates a small test .mov (with audio) using the bundled ffmpeg. */
function makeClip(name: string, seconds: number, size = '640x360'): string {
  const file = path.join(dir, name);
  execFileSync(ffmpegBin, [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `testsrc2=s=${size}:r=30:d=${seconds}`,
    '-f', 'lavfi', '-i', `sine=f=440:d=${seconds}`,
    '-c:v', 'mpeg4', '-q:v', '2', '-c:a', 'pcm_s16le', '-shortest', file,
  ]);
  return file;
}

/** Runs one job to completion and returns its final state. */
function runJob(
  runner: JobRunner,
  inputPath: string,
  onRunning?: (job: JobState) => void,
  speed = 'fast',
): Promise<JobState> {
  return new Promise((resolve, reject) => {
    runner.on('update', (job) => {
      if (job.status === 'running') onRunning?.(job);
      if (!['queued', 'running'].includes(job.status)) resolve(job);
    });
    runner.enqueue([{ toolId: 'video.mov-to-mp4', inputPath, options: { speed } }]).catch(reject);
  });
}

describe('uniqueOutputPath', () => {
  it('never overwrites an existing file or the input itself', async () => {
    const input = path.join(dir, 'a.mp4');
    fs.writeFileSync(input, '');
    expect(await uniqueOutputPath(input, 'mp4')).toBe(path.join(dir, 'a (optimised).mp4'));
    fs.writeFileSync(path.join(dir, 'a (optimised).mp4'), '');
    expect(await uniqueOutputPath(input, 'mp4')).toBe(path.join(dir, 'a (optimised 2).mp4'));
    expect(await uniqueOutputPath(path.join(dir, 'b.mov'), 'mp4', '/out')).toBe(path.join('/out', 'b.mp4'));
  });
});

describe('JobRunner (real ffmpeg)', () => {
  it('converts a clip and reports progress', async () => {
    const input = makeClip('ok.mov', 2);
    let sawProgress = false;
    const job = await runJob(new JobRunner(), input, (j) => (sawProgress ||= (j.progress ?? 0) > 0));
    expect(job.status).toBe('done');
    expect(job.outputPath).toBe(path.join(dir, 'ok.mp4'));
    expect(fs.statSync(job.outputPath!).size).toBe(job.outputBytes);
    expect(sawProgress).toBe(true);
  });

  it('cancels mid-encode and leaves no partial file', async () => {
    // Large and slow enough that cancelling lands mid-encode.
    const input = makeClip('long.mov', 20, '1920x1080');
    const runner = new JobRunner();
    const job = await runJob(runner, input, (j) => {
      if ((j.progress ?? 0) > 0) runner.cancel(j.id);
    }, 'slow');
    expect(job.status).toBe('cancelled');
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('long.mp4'))).toEqual([]);
  });
});
