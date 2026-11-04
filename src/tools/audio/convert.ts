import { trimArgs, trimmedDuration } from '../trim';
import type { ToolDefinition } from '../types';
import { AUDIO_EXTENSIONS } from './shared';

type Format = 'mp3' | 'm4a' | 'opus' | 'wav' | 'flac';
type Quality = 'high' | 'standard' | 'small';

/** Lossy encoder settings per quality. MP3 uses VBR (-q:a), others bitrate. */
const LOSSY: Record<'mp3' | 'm4a' | 'opus', Record<Quality, string[]>> = {
  mp3: {
    high: ['-c:a', 'libmp3lame', '-q:a', '0'],
    standard: ['-c:a', 'libmp3lame', '-q:a', '2'],
    small: ['-c:a', 'libmp3lame', '-q:a', '5'],
  },
  m4a: {
    high: ['-c:a', 'aac', '-b:a', '256k'],
    standard: ['-c:a', 'aac', '-b:a', '192k'],
    small: ['-c:a', 'aac', '-b:a', '128k'],
  },
  opus: {
    high: ['-c:a', 'libopus', '-b:a', '160k'],
    standard: ['-c:a', 'libopus', '-b:a', '112k'],
    small: ['-c:a', 'libopus', '-b:a', '64k'],
  },
};

/** Formats that can carry album art. */
const COVER_ART: Format[] = ['mp3', 'm4a', 'flac'];

export const convertAudio: ToolDefinition = {
  id: 'audio.convert',
  name: 'Convert audio',
  description:
    'Convert between MP3, M4A, Opus, WAV and FLAC, or extract the soundtrack from a video.',
  kind: 'audio',
  operation: 'convert',
  inputExtensions: [
    ...AUDIO_EXTENSIONS,
    'mp4',
    'mov',
    'm4v',
    'mkv',
    'webm',
    'avi',
  ],
  outputExtension: 'mp3',
  supportsTrim: true,
  options: [
    {
      type: 'select',
      key: 'format',
      label: 'Format',
      default: 'mp3',
      choices: [
        { value: 'mp3', label: 'MP3', help: 'Plays everywhere.' },
        {
          value: 'm4a',
          label: 'M4A',
          help: 'AAC: better than MP3 at the same size. Apple default.',
        },
        {
          value: 'opus',
          label: 'Opus',
          help: 'Smallest for the quality. Modern browsers and apps.',
        },
        {
          value: 'wav',
          label: 'WAV',
          help: 'Uncompressed: for editing. Very large.',
        },
        {
          value: 'flac',
          label: 'FLAC',
          help: 'Lossless, about half the size of WAV.',
        },
      ],
    },
    {
      type: 'select',
      key: 'quality',
      label: 'Quality',
      default: 'standard',
      help: 'WAV and FLAC are lossless and ignore this.',
      choices: [
        {
          value: 'high',
          label: 'High',
          help: 'Indistinguishable from the original for music.',
        },
        {
          value: 'standard',
          label: 'Standard',
          help: 'Transparent for most listeners.',
        },
        {
          value: 'small',
          label: 'Small',
          help: 'Fine for speech and podcasts.',
        },
      ],
    },
    {
      type: 'select',
      key: 'channels',
      advanced: true,
      label: 'Channels',
      default: 'original',
      choices: [
        { value: 'original', label: 'Original' },
        {
          value: 'mono',
          label: 'Mono',
          help: 'Halves the size of voice recordings.',
        },
      ],
    },
    {
      type: 'toggle',
      key: 'keepMetadata',
      advanced: true,
      label: 'Keep tags and album art',
      default: true,
    },
  ],

  outputExtensionFor: (_input, options) => String(options.format),

  async run({
    inputPath,
    outputPath,
    options,
    trim,
    engines,
    signal,
    onProgress,
  }) {
    const { ffmpeg } = engines;
    const info = await ffmpeg.probe(inputPath);
    if (!info.hasAudio) throw new Error('No audio found in this file.');

    const format = options.format as Format;
    const t = trimArgs(trim);
    const args = [...t.input, '-i', inputPath, ...t.output, '-map', '0:a:0'];

    const keepArt =
      options.keepMetadata && info.hasCoverArt && COVER_ART.includes(format);
    if (keepArt) {
      args.push(
        '-map',
        '0:v:0',
        '-c:v',
        'copy',
        '-disposition:v:0',
        'attached_pic',
      );
    } else {
      args.push('-vn');
    }

    if (format === 'wav') {
      args.push('-c:a', info.highBitDepth ? 'pcm_s24le' : 'pcm_s16le');
    } else if (format === 'flac') {
      args.push('-c:a', 'flac');
    } else {
      args.push(...LOSSY[format][options.quality as Quality]);
    }
    if (options.channels === 'mono') args.push('-ac', '1');
    // Opus only supports specific sample rates; 48 kHz is its native rate.
    if (format === 'opus') args.push('-ar', '48000');

    args.push('-map_metadata', options.keepMetadata ? '0' : '-1', outputPath);
    await ffmpeg.run(args, {
      signal,
      durationSec: trimmedDuration(info.durationSec, trim),
      onProgress,
    });
  },
};
