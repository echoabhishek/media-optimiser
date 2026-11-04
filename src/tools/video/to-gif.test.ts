import { describe, expect, it } from 'vitest';
import type { Engines } from '../../main/engines';
import { resolveOptions } from '../../shared/options';
import type { OptionValues } from '../../shared/types';
import { toGif } from './to-gif';

async function argsFor(options: OptionValues): Promise<string[]> {
  let captured: string[] = [];
  const ffmpeg = {
    probe: async () => ({ durationSec: 5, hasVideo: true, hasAudio: false }),
    run: async (args: string[]) => {
      captured = args;
    },
  };
  await toGif.run({
    inputPath: 'in.mov',
    outputPath: 'out.gif',
    options: resolveOptions(toGif.options, options),
    engines: { ffmpeg } as unknown as Engines,
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  return captured;
}

const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('to-gif', () => {
  it('builds a palette at the chosen size and frame rate, never upscaling', async () => {
    const filter = valueOf(
      await argsFor({ width: '480', fps: '10' }),
      '-filter_complex',
    );
    expect(filter).toContain('fps=10');
    expect(filter).toContain('scale=min(480\\,iw):-1');
    expect(filter).toContain('palettegen');
  });

  it('maps no extra streams (GIF holds exactly one)', async () => {
    expect(await argsFor({})).not.toContain('-map');
  });

  it('loops forever by default, or plays once', async () => {
    expect(valueOf(await argsFor({}), '-loop')).toBe('0');
    expect(valueOf(await argsFor({ loop: false }), '-loop')).toBe('-1');
  });
});
