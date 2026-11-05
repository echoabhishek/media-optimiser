import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MediaInfo } from '../../main/engines/ffmpeg';
import type { Engines } from '../../main/engines';
import { resolveOptions } from '../../shared/options';
import type { OptionValues } from '../../shared/types';
import { convertVideo } from './convert';

/** Runs the tool against a fake ffmpeg and returns the arguments it built. */
async function argsFor(
  options: OptionValues,
  info: Partial<MediaInfo> = {},
): Promise<string[]> {
  let captured: string[] = [];
  const ffmpeg = {
    probe: async () => ({
      durationSec: 10,
      hasVideo: true,
      hasAudio: true,
      width: 3024,
      height: 1964,
      ...info,
    }),
    ssim: async () => 0.9991,
    run: async (args: string[]) => {
      captured = args;
    },
  };
  await convertVideo.run({
    inputPath: 'in.mov',
    outputPath: 'out.mp4',
    options: resolveOptions(convertVideo.options, options),
    engines: { ffmpeg } as unknown as Engines,
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  return captured;
}

/** Value following a flag, e.g. valueOf(args, '-crf') → '23'. */
const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('convert video', () => {
  it('defaults to H.264 balanced, tuned for screen recordings', async () => {
    const args = await argsFor({});
    expect(valueOf(args, '-c:v')).toBe('libx264');
    expect(valueOf(args, '-crf')).toBe('23');
    expect(valueOf(args, '-preset')).toBe('slow');
    expect(valueOf(args, '-tune')).toBe('stillimage');
    expect(valueOf(args, '-pix_fmt')).toBe('yuv420p');
    expect(valueOf(args, '-movflags')).toBe('+faststart');
    expect(valueOf(args, '-map')).toBe('0:v:0');
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('uses x265 with the hvc1 tag for HEVC', async () => {
    const args = await argsFor({ codec: 'h265' });
    expect(valueOf(args, '-c:v')).toBe('libx265');
    expect(valueOf(args, '-tag:v')).toBe('hvc1');
    expect(valueOf(args, '-crf')).toBe('26');
    expect(args).not.toContain('-tune');
  });

  it('maps quality to CRF', async () => {
    expect(valueOf(await argsFor({ quality: 'high' }), '-crf')).toBe('19');
    expect(valueOf(await argsFor({ quality: 'small' }), '-crf')).toBe('28');
  });

  it('downscales only when the video is larger than the limit', async () => {
    expect(valueOf(await argsFor({ resolution: '1080' }), '-vf')).toBe(
      'scale=-2:1080:flags=lanczos',
    );
    expect(
      await argsFor({ resolution: '1080' }, { height: 970 }),
    ).not.toContain('-vf');
    expect(await argsFor({})).not.toContain('-vf');
  });

  it('keeps audio as AAC, or drops it when absent or removed', async () => {
    const withAudio = await argsFor({ audio: 'high' });
    expect(valueOf(withAudio, '-c:a')).toBe('aac');
    expect(valueOf(withAudio, '-b:a')).toBe('256k');
    expect(await argsFor({}, { hasAudio: false })).toContain('-an');
    expect(await argsFor({ audio: 'none' })).toContain('-an');
  });

  it('rejects files without video', async () => {
    await expect(argsFor({}, { hasVideo: false })).rejects.toThrow(
      'No video stream',
    );
  });

  it('caps frame rate without upsampling', async () => {
    expect(valueOf(await argsFor({ fps: '30' }), '-fpsmax')).toBe('30');
    expect(await argsFor({})).not.toContain('-fpsmax');
  });

  it('strips metadata but keeps the creation date by default', async () => {
    const args = await argsFor({}, { creationTime: '2026-11-03T20:39:41Z' });
    expect(valueOf(args, '-map_metadata')).toBe('-1');
    expect(valueOf(args, '-metadata')).toBe(
      'creation_time=2026-11-03T20:39:41Z',
    );
    expect(
      valueOf(await argsFor({ keepMetadata: true }), '-map_metadata'),
    ).toBe('0');
  });

  it('reports visual similarity, except when the frame rate changes', async () => {
    const run = (options: OptionValues) =>
      convertVideo.run({
        inputPath: 'in.mov',
        outputPath: 'out.mp4',
        options: resolveOptions(convertVideo.options, options),
        engines: {
          ffmpeg: {
            probe: async () => ({
              durationSec: 5,
              hasVideo: true,
              hasAudio: false,
            }),
            ssim: async () => 0.9991,
            run: async () => {},
          },
        } as unknown as Engines,
        signal: new AbortController().signal,
        onProgress: () => {},
      });
    expect(await run({})).toEqual({ quality: 0.9991 });
    expect(await run({ fps: '30' })).toEqual({ quality: undefined });
  });

  it('encodes WebM as VP9 constant quality with Opus audio', async () => {
    const args = await argsFor({ format: 'webm' });
    expect(valueOf(args, '-c:v')).toBe('libvpx-vp9');
    expect(valueOf(args, '-crf')).toBe('31');
    expect(valueOf(args, '-b:v')).toBe('0');
    expect(valueOf(args, '-tune-content')).toBe('screen');
    expect(valueOf(args, '-c:a')).toBe('libopus');
    expect(valueOf(args, '-b:a')).toBe('128k');
    expect(args).not.toContain('-movflags');
    expect(args).not.toContain('-tune');
  });

  it('names the output after the chosen format', () => {
    const ext = (format: string) =>
      convertVideo.outputExtensionFor!('in.mp4', { format });
    expect(['mp4', 'webm', 'mov'].map(ext)).toEqual(['mp4', 'webm', 'mov']);
  });

  it('leaves the format to the user: presets never change it', () => {
    for (const preset of convertVideo.presets ?? [])
      expect(preset.values).not.toHaveProperty('format');
  });

  it('every preset only uses valid option values', () => {
    for (const preset of convertVideo.presets ?? []) {
      expect(resolveOptions(convertVideo.options, preset.values)).toMatchObject(
        preset.values,
      );
    }
  });
});

describe('convert video size limit', () => {
  /** Runs with a fake ffmpeg whose output is `outputBytes` big; returns every call. */
  async function encodes(
    outputBytes: number,
    options: OptionValues,
    durationSec = 60,
  ) {
    const calls: string[][] = [];
    const out = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'mo-size-')),
      'out.mp4',
    );
    const ffmpeg = {
      probe: async () => ({
        durationSec,
        hasVideo: true,
        hasAudio: true,
        height: 1080,
      }),
      ssim: async () => 0.9991,
      run: async (args: string[]) => {
        calls.push(args);
        if (args.at(-1) === out)
          fs.writeFileSync(out, Buffer.alloc(outputBytes));
      },
    };
    await convertVideo.run({
      inputPath: 'in.mov',
      outputPath: out,
      options: resolveOptions(convertVideo.options, options),
      engines: { ffmpeg } as unknown as Engines,
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    return calls;
  }

  it('keeps the normal encode when it already fits', async () => {
    const calls = await encodes(3_000_000, { sizeLimit: '10' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('-crf');
  });

  it('re-encodes in two passes at the bitrate that fits', async () => {
    const calls = await encodes(30_000_000, { sizeLimit: '10' });
    expect(calls).toHaveLength(3);
    const [, pass1, pass2] = calls;
    expect(valueOf(pass1, '-pass')).toBe('1');
    expect(pass1).toContain('-an');
    expect(valueOf(pass2, '-pass')).toBe('2');
    // 10 MB * 8 * 0.96 / 60 s = 1280 kbps total, minus 160 kbps audio.
    expect(valueOf(pass2, '-b:v')).toBe('1120k');
  });

  it('uses x265 stats files for HEVC two-pass', async () => {
    const [, pass1] = await encodes(30_000_000, {
      sizeLimit: '10',
      codec: 'h265',
    });
    expect(valueOf(pass1, '-x265-params')).toMatch(/pass=1:stats=.+\.log/);
  });

  it('uses VP9 two-pass and Opus bitrate for WebM', async () => {
    const [, pass1, pass2] = await encodes(30_000_000, {
      sizeLimit: '10',
      format: 'webm',
    });
    expect(valueOf(pass1, '-pass')).toBe('1');
    expect(valueOf(pass2, '-c:v')).toBe('libvpx-vp9');
    // 1280 kbps total minus 128 kbps Opus.
    expect(valueOf(pass2, '-b:v')).toBe('1152k');
  });

  it('refuses limits that would ruin quality', async () => {
    await expect(
      encodes(30_000_000, { sizeLimit: '10' }, 3600),
    ).rejects.toThrow('too long to fit');
  });
});
