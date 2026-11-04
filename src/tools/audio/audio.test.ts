import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Engines } from '../../main/engines';
import { FfmpegEngine } from '../../main/engines/ffmpeg';
import { resolveOptions } from '../../shared/options';
import type { OptionValues } from '../../shared/types';
import type { ToolDefinition } from '../types';
import { cleanupAudio, cleanupFilters } from './cleanup';
import { convertAudio } from './convert';
import { normaliseLoudness, parseMeasurements } from './normalise';

// Integration tests against the real bundled ffmpeg.
const bin = path.join(
  process.cwd(),
  'node_modules',
  'ffmpeg-static',
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
);
const ffmpeg = new FfmpegEngine(bin);
let dir: string;
let speech: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-audio-'));
  speech = path.join(dir, 'speech.wav');
  // 1 s silence, 3 s quiet tone with hiss, 1 s silence; 44.1 kHz stereo.
  execFileSync(bin, [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=f=300:d=3:sample_rate=44100',
    '-f',
    'lavfi',
    '-i',
    'anoisesrc=d=3:a=0.02:r=44100',
    '-filter_complex',
    '[0][1]amix=inputs=2:normalize=0,volume=0.1,adelay=1000|1000,apad=pad_dur=1,aformat=channel_layouts=stereo',
    speech,
  ]);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

async function runTool(
  tool: ToolDefinition,
  input: string,
  options: OptionValues = {},
): Promise<string> {
  const resolved = resolveOptions(tool.options, options);
  const ext =
    tool.outputExtensionFor?.(input, resolved) ?? tool.outputExtension;
  const name = Object.values(options).join('-') || 'default';
  const out = path.join(dir, `${tool.id}-${name}.${ext}`);
  await tool.run({
    inputPath: input,
    outputPath: out,
    options: resolved,
    engines: { ffmpeg } as Engines,
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  return out;
}

/** ffmpeg's description of a file's streams (it prints to stderr). */
function describeFile(file: string): string {
  return spawnSync(bin, ['-hide_banner', '-i', file], { encoding: 'utf8' })
    .stderr;
}

/** Integrated loudness in LUFS, measured independently with ebur128. */
function measureLufs(file: string): number {
  const { stderr } = spawnSync(
    bin,
    [
      '-hide_banner',
      '-nostats',
      '-i',
      file,
      '-af',
      'ebur128',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
  const m = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/.exec(stderr);
  return m ? Number(m[1]) : NaN;
}

describe('convert audio (real ffmpeg)', () => {
  it.each([
    ['mp3', 'Audio: mp3'],
    ['m4a', 'Audio: aac'],
    ['opus', 'Audio: opus'],
    ['flac', 'Audio: flac'],
    ['wav', 'Audio: pcm_s16le'],
  ])('converts to %s', async (format, codec) => {
    const out = await runTool(convertAudio, speech, { format });
    expect(path.extname(out)).toBe(`.${format}`);
    expect(describeFile(out)).toContain(codec);
    expect((await ffmpeg.probe(out)).durationSec).toBeCloseTo(5, 0);
  });

  it('makes smaller mono files when asked', async () => {
    const stereo = fs.statSync(
      await runTool(convertAudio, speech, { format: 'm4a' }),
    ).size;
    const mono = fs.statSync(
      await runTool(convertAudio, speech, {
        format: 'm4a',
        channels: 'mono',
        quality: 'small',
      }),
    ).size;
    expect(mono).toBeLessThan(stereo);
    expect(
      describeFile(path.join(dir, 'audio.convert-m4a-mono-small.m4a')),
    ).toContain('mono');
  });
});

describe('normalise loudness (real ffmpeg)', () => {
  it.each(['-16', '-23'])(
    'reaches %s LUFS within 1 LU, keeping format and sample rate',
    async (target) => {
      const out = await runTool(normaliseLoudness, speech, { target });
      expect(path.extname(out)).toBe('.wav');
      expect(Math.abs(measureLufs(out) - Number(target))).toBeLessThan(1);
      expect((await ffmpeg.probe(out)).sampleRate).toBe(44100);
    },
  );

  it('parses loudnorm measurements', () => {
    const stderr =
      'noise\n{\n "input_i" : "-30.1",\n "input_tp" : "-12.0",\n "input_lra" : "1.2",\n "input_thresh" : "-40.5",\n "target_offset" : "0.3"\n}\n';
    expect(parseMeasurements(stderr)?.input_i).toBe('-30.1');
    expect(parseMeasurements('nothing')).toBeNull();
  });
});

describe('clean up recording (real ffmpeg)', () => {
  it('cuts leading and trailing silence', async () => {
    const out = await runTool(cleanupAudio, speech);
    const duration = (await ffmpeg.probe(out)).durationSec!;
    expect(duration).toBeGreaterThan(2.5);
    expect(duration).toBeLessThan(3.5);
  });

  it('builds the filter chain from options', () => {
    expect(
      cleanupFilters({ rumble: true, noise: 'off', trimSilence: false }),
    ).toBe('highpass=f=80');
    expect(
      cleanupFilters({ rumble: false, noise: 'strong', trimSilence: false }),
    ).toContain('afftdn=nr=20');
    expect(
      cleanupFilters({ rumble: false, noise: 'off', trimSilence: false }),
    ).toBe('');
  });
});
