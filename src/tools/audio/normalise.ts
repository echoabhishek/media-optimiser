import type { ToolDefinition } from '../types';
import {
  AUDIO_EXTENSIONS,
  NULL_OUTPUT,
  VIDEO_CONTAINERS,
  extOf,
  mapArgs,
  sameFormatArgs,
} from './shared';

const TRUE_PEAK = -1.5;
const LOUDNESS_RANGE = 11;

interface Measured {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

export const normaliseLoudness: ToolDefinition = {
  id: 'audio.normalise',
  name: 'Normalise loudness',
  description:
    'Make audio as loud as platforms expect (EBU R128), without clipping. Keeps the file format; videos keep their picture untouched.',
  kind: 'audio',
  operation: 'optimise',
  inputExtensions: [...AUDIO_EXTENSIONS, ...VIDEO_CONTAINERS],
  outputExtension: 'same as input',
  options: [
    {
      type: 'select',
      key: 'target',
      label: 'Target',
      default: '-16',
      choices: [
        {
          value: '-14',
          label: 'Streaming',
          help: '−14 LUFS: Spotify, YouTube, Apple Music.',
        },
        {
          value: '-16',
          label: 'Podcast & voice',
          help: '−16 LUFS: podcasts, voiceovers, Apple Podcasts.',
        },
        {
          value: '-23',
          label: 'Broadcast',
          help: '−23 LUFS: EBU R128 for TV and radio.',
        },
      ],
    },
  ],

  outputExtensionFor: (inputPath) => extOf(inputPath),

  async run({ inputPath, outputPath, options, engines, signal, onProgress }) {
    const { ffmpeg } = engines;
    const info = await ffmpeg.probe(inputPath);
    if (!info.hasAudio) throw new Error('No audio found in this file.');
    const target = `I=${options.target}:TP=${TRUE_PEAK}:LRA=${LOUDNESS_RANGE}`;

    // Pass 1: measure. loudnorm prints its measurements as JSON at the end.
    const stderr = await ffmpeg.run(
      [
        '-i',
        inputPath,
        '-map',
        '0:a:0',
        '-af',
        `loudnorm=${target}:print_format=json`,
        '-f',
        'null',
        NULL_OUTPUT,
      ],
      {
        signal,
        durationSec: info.durationSec,
        onProgress: (p) => onProgress(p * 0.5),
      },
    );
    const m = parseMeasurements(stderr);
    if (!m) throw new Error('Could not measure the loudness of this file.');
    if (!Number.isFinite(Number(m.input_i)))
      throw new Error('This file is silent.');

    // Pass 2: apply a single linear gain using the measurements, so dynamics
    // are preserved. loudnorm works at 192 kHz, so restore the original rate.
    const ext = extOf(inputPath);
    const filter =
      `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
      `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}` +
      `:offset=${m.target_offset}:linear=true`;
    await ffmpeg.run(
      [
        '-i',
        inputPath,
        ...mapArgs(ext, info),
        '-af',
        filter,
        '-ar',
        String(info.sampleRate ?? 48000),
        ...sameFormatArgs(ext, info),
        '-map_metadata',
        '0',
        outputPath,
      ],
      {
        signal,
        durationSec: info.durationSec,
        onProgress: (p) => onProgress(0.5 + p * 0.5),
      },
    );
  },
};

export function parseMeasurements(stderr: string): Measured | null {
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr)?.[0];
  if (!json) return null;
  try {
    return JSON.parse(json) as Measured;
  } catch {
    return null;
  }
}
