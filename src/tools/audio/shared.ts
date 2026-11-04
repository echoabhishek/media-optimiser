import path from 'node:path';
import type { MediaInfo } from '../../main/engines/ffmpeg';

export const AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'aac',
  'wav',
  'flac',
  'ogg',
  'opus',
  'aiff',
  'aif',
];
/** Video containers whose audio we can process while copying the picture. */
export const VIDEO_CONTAINERS = ['mp4', 'mov', 'm4v'];

export const NULL_OUTPUT = process.platform === 'win32' ? 'NUL' : '/dev/null';

export function extOf(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase();
}

/**
 * Codec arguments to re-encode audio back into the input's own format at
 * high quality (used by tools that keep the format, like normalise).
 */
export function sameFormatArgs(ext: string, info: MediaInfo): string[] {
  switch (ext) {
    case 'mp3':
      return ['-c:a', 'libmp3lame', '-q:a', '0'];
    case 'm4a':
    case 'aac':
      return ['-c:a', 'aac', '-b:a', '256k'];
    case 'wav':
      return ['-c:a', info.highBitDepth ? 'pcm_s24le' : 'pcm_s16le'];
    case 'aiff':
    case 'aif':
      return ['-c:a', info.highBitDepth ? 'pcm_s24be' : 'pcm_s16be'];
    case 'flac':
      return ['-c:a', 'flac'];
    case 'ogg':
      return ['-c:a', 'libvorbis', '-q:a', '7'];
    case 'opus':
      return ['-c:a', 'libopus', '-b:a', '160k'];
    default:
      // Video containers: keep the picture untouched, re-encode audio only.
      return ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k'];
  }
}

/** Stream selection: first audio stream, plus the picture for video containers. */
export function mapArgs(ext: string, info: MediaInfo): string[] {
  const args = ['-map', '0:a:0'];
  if (VIDEO_CONTAINERS.includes(ext) && info.hasVideo)
    args.unshift('-map', '0:v:0');
  return args;
}
