import { describe, expect, it } from 'vitest';
import type { MediaInfo } from '../../main/engines/ffmpeg';
import type { Engines } from '../../main/engines';
import { resolveOptions } from '../../shared/options';
import type { OptionValues } from '../../shared/types';
import { movToMp4 } from './mov-to-mp4';

/** Runs the tool against a fake ffmpeg and returns the arguments it built. */
async function argsFor(options: OptionValues, info: Partial<MediaInfo> = {}): Promise<string[]> {
  let captured: string[] = [];
  const ffmpeg = {
    probe: async () => ({ durationSec: 10, hasVideo: true, hasAudio: true, width: 3024, height: 1964, ...info }),
    run: async (args: string[]) => {
      captured = args;
    },
  };
  await movToMp4.run({
    inputPath: 'in.mov',
    outputPath: 'out.mp4',
    options: resolveOptions(movToMp4.options, options),
    engines: { ffmpeg } as unknown as Engines,
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  return captured;
}

/** Value following a flag, e.g. valueOf(args, '-crf') → '23'. */
const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('mov-to-mp4', () => {
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
    expect(valueOf(await argsFor({ resolution: '1080' }), '-vf')).toBe('scale=-2:1080:flags=lanczos');
    expect(await argsFor({ resolution: '1080' }, { height: 970 })).not.toContain('-vf');
    expect(await argsFor({})).not.toContain('-vf');
  });

  it('keeps audio as AAC, or drops it when absent or removed', async () => {
    const withAudio = await argsFor({ audio: 'aac256' });
    expect(valueOf(withAudio, '-c:a')).toBe('aac');
    expect(valueOf(withAudio, '-b:a')).toBe('256k');
    expect(await argsFor({}, { hasAudio: false })).toContain('-an');
    expect(await argsFor({ audio: 'none' })).toContain('-an');
  });

  it('rejects files without video', async () => {
    await expect(argsFor({}, { hasVideo: false })).rejects.toThrow('No video stream');
  });
});
