import type { OptionValues } from '../../shared/types';
import type { ToolDefinition } from '../types';
import { AUDIO_EXTENSIONS, extOf, sameFormatArgs } from './shared';

/** afftdn settings: reduction amount (dB) and assumed noise floor (dB). */
const NOISE: Record<string, string | null> = {
  off: null,
  light: 'afftdn=nr=10:nf=-45:tn=1',
  strong: 'afftdn=nr=20:nf=-35:tn=1',
};

/** Removes leading silence; applied reversed as well to trim the end. */
const SILENCE =
  'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2';

export const cleanupAudio: ToolDefinition = {
  id: 'audio.cleanup',
  name: 'Clean up recording',
  description:
    'Reduce background noise and hum, and cut silence from the start and end of voice recordings.',
  kind: 'audio',
  operation: 'optimise',
  // Audio only: cutting silence would put a video's picture out of sync.
  inputExtensions: AUDIO_EXTENSIONS,
  outputExtension: 'same as input',
  options: [
    {
      type: 'select',
      key: 'noise',
      label: 'Noise reduction',
      default: 'light',
      choices: [
        { value: 'off', label: 'Off' },
        {
          value: 'light',
          label: 'Light',
          help: 'Fan and room noise. Keeps the voice natural.',
        },
        {
          value: 'strong',
          label: 'Strong',
          help: 'Noisy rooms. May sound slightly processed.',
        },
      ],
    },
    {
      type: 'toggle',
      key: 'trimSilence',
      label: 'Cut silence at start and end',
      default: true,
    },
    {
      type: 'toggle',
      key: 'rumble',
      advanced: true,
      label: 'Remove low rumble',
      default: true,
      help: 'Filters out sound below 80 Hz (desk bumps, traffic, mains hum).',
    },
  ],

  outputExtensionFor: (inputPath) => extOf(inputPath),

  async run({ inputPath, outputPath, options, engines, signal, onProgress }) {
    const { ffmpeg } = engines;
    const info = await ffmpeg.probe(inputPath);
    if (!info.hasAudio) throw new Error('No audio found in this file.');
    const filters = cleanupFilters(options);
    if (!filters)
      throw new Error('Nothing to do: every clean-up option is off.');

    await ffmpeg.run(
      [
        '-i',
        inputPath,
        '-map',
        '0:a:0',
        '-af',
        filters,
        ...sameFormatArgs(extOf(inputPath), info),
        '-map_metadata',
        '0',
        outputPath,
      ],
      { signal, durationSec: info.durationSec, onProgress },
    );
  },
};

export function cleanupFilters(options: OptionValues): string {
  const chain: string[] = [];
  if (options.rumble) chain.push('highpass=f=80');
  const noise = NOISE[String(options.noise)];
  if (noise) chain.push(noise);
  if (options.trimSilence) chain.push(SILENCE, 'areverse', SILENCE, 'areverse');
  return chain.join(',');
}
