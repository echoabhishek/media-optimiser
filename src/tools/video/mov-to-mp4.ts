import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MediaInfo } from '../../main/engines/ffmpeg';
import type { OptionValues } from '../../shared/types';
import type { ToolDefinition } from '../types';

type Codec = 'h264' | 'h265';
type Quality = 'high' | 'balanced' | 'small';

/**
 * CRF per codec. Lower = better quality / bigger file. x265 needs a CRF
 * roughly 3 higher than x264 for similar visual quality.
 */
const CRF: Record<Codec, Record<Quality, number>> = {
  h264: { high: 19, balanced: 23, small: 28 },
  h265: { high: 22, balanced: 26, small: 31 },
};

export const movToMp4: ToolDefinition = {
  id: 'video.mov-to-mp4',
  name: 'MOV to MP4',
  description:
    'Convert QuickTime / screen recordings to a small MP4 that plays everywhere, keeping video and audio quality.',
  kind: 'video',
  operation: 'convert',
  inputExtensions: ['mov', 'm4v', 'mkv', 'webm', 'avi', 'mp4'],
  outputExtension: 'mp4',
  options: [
    {
      type: 'select',
      key: 'quality',
      label: 'Quality',
      default: 'balanced',
      choices: [
        {
          value: 'high',
          label: 'High',
          help: 'Visually lossless. Larger file.',
        },
        {
          value: 'balanced',
          label: 'Balanced',
          help: 'Looks the same as the original in normal viewing.',
        },
        {
          value: 'small',
          label: 'Smallest',
          help: 'Noticeably softer, best for sharing quickly.',
        },
      ],
    },
    {
      type: 'select',
      key: 'resolution',
      label: 'Max resolution',
      default: 'original',
      help: 'Retina screen recordings are very large; 1080p is usually plenty.',
      choices: [
        { value: 'original', label: 'Original' },
        { value: '1440', label: '1440p' },
        { value: '1080', label: '1080p' },
        { value: '720', label: '720p' },
      ],
    },
    {
      type: 'select',
      key: 'sizeLimit',
      label: 'Size limit',
      default: 'none',
      help: 'Only re-encodes harder when the file would be bigger than the limit.',
      choices: [
        { value: 'none', label: 'None' },
        {
          value: '10',
          label: '10 MB',
          help: 'GitHub and Discord upload limit.',
        },
        { value: '25', label: '25 MB', help: 'Email attachment limit.' },
        { value: '50', label: '50 MB' },
      ],
    },
    {
      type: 'select',
      key: 'codec',
      advanced: true,
      label: 'Codec',
      default: 'h264',
      choices: [
        {
          value: 'h264',
          label: 'H.264',
          help: 'Plays everywhere: Slack, GitHub, every browser, old devices.',
        },
        {
          value: 'h265',
          label: 'H.265 / HEVC',
          help: 'Often smaller for long or busy videos. Plays on Apple devices, Windows 10+ and modern browsers.',
        },
      ],
    },
    {
      type: 'select',
      key: 'content',
      advanced: true,
      label: 'Content',
      default: 'screen',
      choices: [
        {
          value: 'screen',
          label: 'Screen recording',
          help: 'Tuned for sharp text and mostly-still frames.',
        },
        {
          value: 'camera',
          label: 'Camera footage',
          help: 'Tuned for natural motion and grain.',
        },
      ],
    },
    {
      type: 'select',
      key: 'speed',
      advanced: true,
      label: 'Encoding speed',
      default: 'slow',
      choices: [
        {
          value: 'fast',
          label: 'Fast',
          help: 'Quicker, slightly larger file.',
        },
        { value: 'medium', label: 'Medium' },
        {
          value: 'slow',
          label: 'Thorough',
          help: 'Slower, smallest file at the same quality.',
        },
      ],
    },
    {
      type: 'select',
      key: 'audio',
      advanced: true,
      label: 'Audio',
      default: 'aac160',
      choices: [
        {
          value: 'aac160',
          label: 'AAC 160 kbps',
          help: 'Transparent for speech and most music.',
        },
        {
          value: 'aac256',
          label: 'AAC 256 kbps',
          help: 'For music where every detail matters.',
        },
        { value: 'none', label: 'Remove audio' },
      ],
    },
    {
      type: 'select',
      key: 'fps',
      advanced: true,
      label: 'Max frame rate',
      default: 'original',
      help: 'Screen recordings at 60 fps shrink a lot at 30 fps.',
      choices: [
        { value: 'original', label: 'Original' },
        { value: '60', label: '60' },
        { value: '30', label: '30' },
        { value: '24', label: '24' },
      ],
    },
    {
      type: 'toggle',
      key: 'keepMetadata',
      advanced: true,
      label: 'Keep all metadata',
      default: false,
      help: 'Off removes location and device info but keeps the creation date.',
    },
  ],
  presets: [
    {
      id: 'standard',
      label: 'Standard',
      help: 'Same resolution, much smaller file. Plays everywhere.',
      values: {
        quality: 'balanced',
        resolution: 'original',
        sizeLimit: 'none',
      },
    },
    {
      id: 'chat',
      label: 'Chat',
      help: 'Slack, Teams: 1080p, plays everywhere.',
      values: {
        quality: 'balanced',
        resolution: '1080',
        sizeLimit: 'none',
        codec: 'h264',
      },
    },
    {
      id: 'github',
      label: 'GitHub',
      help: 'Pull requests and issues: under 10 MB.',
      values: {
        quality: 'balanced',
        resolution: '1080',
        sizeLimit: '10',
        codec: 'h264',
      },
    },
    {
      id: 'email',
      label: 'Email',
      help: 'Attachments: under 25 MB.',
      values: {
        quality: 'balanced',
        resolution: '1080',
        sizeLimit: '25',
        codec: 'h264',
      },
    },
    {
      id: 'best',
      label: 'Best quality',
      help: 'Archiving: full resolution, visually lossless.',
      values: { quality: 'high', resolution: 'original', sizeLimit: 'none' },
    },
  ],

  async run({ inputPath, outputPath, options, engines, signal, onProgress }) {
    const { ffmpeg } = engines;
    const info = await ffmpeg.probe(inputPath);
    if (!info.hasVideo) throw new Error('No video stream found in this file.');

    const limitMB =
      options.sizeLimit === 'none' ? 0 : Number(options.sizeLimit);
    const crfArgs = encodeArgs(inputPath, outputPath, options, info, {
      mode: 'crf',
    });
    const progress = (from: number, to: number) => (p: number) =>
      onProgress(from + p * (to - from));

    // Normal quality-based encode; usually all that's needed.
    await ffmpeg.run(crfArgs, {
      signal,
      durationSec: info.durationSec,
      onProgress: progress(0, limitMB ? 0.5 : 1),
    });
    if (!limitMB) return;

    const limitBytes = limitMB * 1_000_000;
    if ((await fs.stat(outputPath)).size <= limitBytes) return;

    // Too big: two-pass encode at the bitrate that fits the limit.
    const duration = info.durationSec;
    if (!duration)
      throw new Error('Unknown duration, so the size limit cannot be applied.');
    const audioKbps =
      options.audio === 'none' || !info.hasAudio ? 0 : audioBitrate(options);
    // 4% headroom for container overhead.
    const videoKbps = Math.floor(
      (limitBytes * 8 * 0.96) / duration / 1000 - audioKbps,
    );
    if (videoKbps < 100) {
      throw new Error(
        `This video is too long to fit in ${limitMB} MB at watchable quality. Try a lower resolution or a larger limit.`,
      );
    }

    const passlog = path.join(os.tmpdir(), `media-optimiser-${randomUUID()}`);
    try {
      for (const pass of [1, 2] as const) {
        await ffmpeg.run(
          encodeArgs(inputPath, outputPath, options, info, {
            mode: 'bitrate',
            videoKbps,
            pass,
            passlog,
          }),
          {
            signal,
            durationSec: duration,
            onProgress: progress(
              pass === 1 ? 0.5 : 0.75,
              pass === 1 ? 0.75 : 1,
            ),
          },
        );
      }
    } finally {
      const prefix = path.basename(passlog);
      for (const f of await fs.readdir(os.tmpdir())) {
        if (f.startsWith(prefix))
          await fs.rm(path.join(os.tmpdir(), f), { force: true });
      }
    }
  },
};

type RateControl =
  | { mode: 'crf' }
  | { mode: 'bitrate'; videoKbps: number; pass: 1 | 2; passlog: string };

function audioBitrate(options: OptionValues): number {
  return options.audio === 'aac256' ? 256 : 160;
}

/** Builds the ffmpeg arguments for one encode (CRF, or one pass of two-pass). */
export function encodeArgs(
  inputPath: string,
  outputPath: string,
  options: OptionValues,
  info: MediaInfo,
  rate: RateControl,
): string[] {
  const codec = options.codec as Codec;
  const isFirstPass = rate.mode === 'bitrate' && rate.pass === 1;
  const args: string[] = ['-i', inputPath];

  // Video: first video stream only. This skips timecode/data tracks that
  // QuickTime files carry and MP4 can't hold.
  args.push('-map', '0:v:0');
  const maxH =
    options.resolution === 'original' ? 0 : Number(options.resolution);
  if (maxH && info.height && info.height > maxH) {
    // -2 keeps the aspect ratio and an even width (required by yuv420p).
    args.push('-vf', `scale=-2:${maxH}:flags=lanczos`);
  }
  if (options.fps !== 'original') args.push('-fpsmax', String(options.fps));

  args.push(
    '-c:v',
    codec === 'h265' ? 'libx265' : 'libx264',
    '-preset',
    String(options.speed),
  );
  if (rate.mode === 'crf') {
    args.push('-crf', String(CRF[codec][options.quality as Quality]));
  } else {
    args.push('-b:v', `${rate.videoKbps}k`);
  }
  args.push('-pix_fmt', 'yuv420p');

  const x265: string[] = ['log-level=error'];
  if (codec === 'h264') {
    args.push('-tune', options.content === 'screen' ? 'stillimage' : 'film');
    if (rate.mode === 'bitrate')
      args.push('-pass', String(rate.pass), '-passlogfile', rate.passlog);
  } else {
    // hvc1 tag is what QuickTime / Safari / iOS require to play HEVC in MP4.
    args.push('-tag:v', 'hvc1');
    if (rate.mode === 'bitrate')
      x265.push(`pass=${rate.pass}`, `stats=${rate.passlog}.log`);
  }
  if (codec === 'h265') args.push('-x265-params', x265.join(':'));

  // The first pass only analyses video; its output is discarded.
  if (isFirstPass) {
    args.push(
      '-an',
      '-f',
      'null',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
    );
    return args;
  }

  // Audio: every audio stream, if any ("?" = don't fail when there is none).
  if (options.audio === 'none' || !info.hasAudio) {
    args.push('-an');
  } else {
    args.push(
      '-map',
      '0:a?',
      '-c:a',
      'aac',
      '-b:a',
      `${audioBitrate(options)}k`,
    );
  }

  // Strip location/device metadata unless asked to keep it, but keep the
  // creation date so the video still sorts correctly in Photos etc.
  if (options.keepMetadata) {
    args.push('-map_metadata', '0');
  } else {
    args.push('-map_metadata', '-1');
    if (info.creationTime)
      args.push('-metadata', `creation_time=${info.creationTime}`);
  }
  // Index first so web players can start before the whole file downloads.
  args.push('-movflags', '+faststart', outputPath);
  return args;
}
