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
      key: 'codec',
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
      key: 'quality',
      label: 'Quality',
      default: 'balanced',
      choices: [
        { value: 'high', label: 'High', help: 'Visually lossless. Larger file.' },
        { value: 'balanced', label: 'Balanced', help: 'Looks the same as the original in normal viewing.' },
        { value: 'small', label: 'Smallest', help: 'Noticeably softer, best for sharing quickly.' },
      ],
    },
    {
      type: 'select',
      key: 'content',
      label: 'Content',
      default: 'screen',
      choices: [
        { value: 'screen', label: 'Screen recording', help: 'Tuned for sharp text and mostly-still frames.' },
        { value: 'camera', label: 'Camera footage', help: 'Tuned for natural motion and grain.' },
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
      key: 'speed',
      label: 'Encoding speed',
      default: 'slow',
      choices: [
        { value: 'fast', label: 'Fast', help: 'Quicker, slightly larger file.' },
        { value: 'medium', label: 'Medium' },
        { value: 'slow', label: 'Thorough', help: 'Slower, smallest file at the same quality.' },
      ],
    },
    {
      type: 'select',
      key: 'audio',
      label: 'Audio',
      default: 'aac160',
      choices: [
        { value: 'aac160', label: 'AAC 160 kbps', help: 'Transparent for speech and most music.' },
        { value: 'aac256', label: 'AAC 256 kbps', help: 'For music where every detail matters.' },
        { value: 'none', label: 'Remove audio' },
      ],
    },
  ],

  async run({ inputPath, outputPath, options, engines, signal, onProgress }) {
    const { ffmpeg } = engines;
    const codec = options.codec as Codec;
    const quality = options.quality as Quality;
    const info = await ffmpeg.probe(inputPath);
    if (!info.hasVideo) throw new Error('No video stream found in this file.');

    const args: string[] = ['-i', inputPath];

    // Video: first video stream only. This skips timecode/data tracks that
    // QuickTime files carry and MP4 can't hold.
    args.push('-map', '0:v:0');
    const maxH = options.resolution === 'original' ? 0 : Number(options.resolution);
    if (maxH && info.height && info.height > maxH) {
      // -2 keeps the aspect ratio and an even width (required by yuv420p).
      args.push('-vf', `scale=-2:${maxH}:flags=lanczos`);
    }
    args.push(
      '-c:v', codec === 'h265' ? 'libx265' : 'libx264',
      '-preset', String(options.speed),
      '-crf', String(CRF[codec][quality]),
      '-pix_fmt', 'yuv420p',
    );
    if (codec === 'h264') {
      args.push('-tune', options.content === 'screen' ? 'stillimage' : 'film');
    } else {
      // hvc1 tag is what QuickTime / Safari / iOS require to play HEVC in MP4.
      args.push('-tag:v', 'hvc1', '-x265-params', 'log-level=error');
    }

    // Audio: every audio stream, if any ("?" = don't fail when there is none).
    if (options.audio === 'none' || !info.hasAudio) {
      args.push('-an');
    } else {
      args.push(
        '-map', '0:a?',
        '-c:a', 'aac',
        '-b:a', options.audio === 'aac256' ? '256k' : '160k',
      );
    }

    // Keep metadata like creation date; put the index first so web
    // players can start before the whole file downloads.
    args.push('-map_metadata', '0', '-movflags', '+faststart', outputPath);

    await ffmpeg.run(args, {
      signal,
      durationSec: info.durationSec,
      onProgress,
    });
  },
};
