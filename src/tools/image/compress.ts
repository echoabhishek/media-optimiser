import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { OptionValues } from '../../shared/types';
import { extension as extOf } from '../../shared/format';
import type { ToolDefinition } from '../types';

type Format = 'keep' | 'jpeg' | 'webp' | 'avif' | 'png';
type Quality = 'high' | 'balanced' | 'small';

/** Encoder quality per format (AVIF's scale runs lower for the same look). */
const QUALITY: Record<
  Quality,
  { jpeg: number; webp: number; avif: number; png: number }
> = {
  high: { jpeg: 88, webp: 88, avif: 64, png: 100 },
  balanced: { jpeg: 80, webp: 80, avif: 52, png: 85 },
  small: { jpeg: 68, webp: 68, avif: 40, png: 65 },
};

const HEIC = ['heic', 'heif'];
const EXT: Record<Exclude<Format, 'keep'>, string> = {
  jpeg: 'jpg',
  webp: 'webp',
  avif: 'avif',
  png: 'png',
};

export const compressImages: ToolDefinition = {
  id: 'image.compress',
  name: 'Compress images',
  description:
    'Shrink photos and screenshots, convert to modern formats and remove location data. Photos are rotated upright automatically.',
  kind: 'image',
  operation: 'optimise',
  inputExtensions: [
    'jpg',
    'jpeg',
    'png',
    'webp',
    'avif',
    'tif',
    'tiff',
    ...HEIC,
  ],
  outputExtension: 'same as input',
  options: [
    {
      type: 'select',
      key: 'format',
      label: 'Format',
      default: 'keep',
      choices: [
        {
          value: 'keep',
          label: 'Keep',
          help: 'Same format as each original (HEIC becomes JPEG).',
        },
        {
          value: 'jpeg',
          label: 'JPEG',
          help: 'Works everywhere. Best for photos.',
        },
        {
          value: 'webp',
          label: 'WebP',
          help: 'About 30% smaller than JPEG. All modern browsers.',
        },
        {
          value: 'avif',
          label: 'AVIF',
          help: 'Smallest. Modern browsers; slower to create.',
        },
        {
          value: 'png',
          label: 'PNG',
          help: 'Best for screenshots, text and transparency.',
        },
      ],
    },
    {
      type: 'select',
      key: 'quality',
      label: 'Quality',
      default: 'balanced',
      choices: [
        {
          value: 'high',
          label: 'High',
          help: 'Indistinguishable from the original. PNG stays lossless.',
        },
        {
          value: 'balanced',
          label: 'Balanced',
          help: 'Looks the same at normal viewing size.',
        },
        {
          value: 'small',
          label: 'Smallest',
          help: 'Visible softening on close inspection.',
        },
      ],
    },
    {
      type: 'select',
      key: 'maxSize',
      label: 'Max dimensions',
      default: 'original',
      help: 'Longest side in pixels. Smaller images are never enlarged.',
      choices: [
        { value: 'original', label: 'Original' },
        { value: '3840', label: '4K' },
        { value: '1920', label: '1920' },
        { value: '1280', label: '1280' },
      ],
    },
    {
      type: 'toggle',
      key: 'keepMetadata',
      advanced: true,
      label: 'Keep all metadata',
      default: false,
      help: 'Off removes location, camera and date info. The colour profile is always kept.',
    },
  ],
  presets: [
    {
      id: 'web',
      label: 'Website',
      help: 'WebP, 1920 px: fast-loading pages.',
      values: { format: 'webp', quality: 'balanced', maxSize: '1920' },
    },
    {
      id: 'email',
      label: 'Email',
      help: 'JPEG, 1920 px: opens anywhere.',
      values: { format: 'jpeg', quality: 'balanced', maxSize: '1920' },
    },
    {
      id: 'archive',
      label: 'Archive',
      help: 'Same format and size, high quality.',
      values: { format: 'keep', quality: 'high', maxSize: 'original' },
    },
  ],

  outputExtensionFor: (inputPath, options) => outputExt(inputPath, options),

  async run({ inputPath, outputPath, options, engines, signal, onProgress }) {
    const sharp = await engines.loadSharp();
    const inExt = extOf(inputPath);
    const tmp = HEIC.includes(inExt) ? await heicToPng(inputPath) : null;
    try {
      const source = tmp ?? inputPath;
      const meta = await sharp(source).metadata();
      const format = formatFor(outputExt(inputPath, options));
      const q = QUALITY[options.quality as Quality];
      const maxSize =
        options.maxSize === 'original' ? 0 : Number(options.maxSize);

      let img = sharp(source, { failOn: 'none' }).rotate(); // upright via EXIF
      if (maxSize) {
        img = img.resize({
          width: maxSize,
          height: maxSize,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      img = options.keepMetadata ? img.keepMetadata() : img.keepIccProfile();
      if (format === 'jpeg' && meta.hasAlpha)
        img = img.flatten({ background: '#ffffff' });

      if (format === 'jpeg') img = img.jpeg({ quality: q.jpeg, mozjpeg: true });
      else if (format === 'webp')
        img = img.webp({ quality: q.webp, effort: 5 });
      else if (format === 'avif')
        img = img.avif({ quality: q.avif, effort: 4 });
      else if (format === 'tiff') img = img.tiff({ compression: 'lzw' });
      else if (q.png === 100)
        img = img.png({ compressionLevel: 9, adaptiveFiltering: true });
      else
        img = img.png({
          palette: true,
          quality: q.png,
          effort: 8,
          compressionLevel: 9,
        });

      await img.toFile(outputPath);

      // Re-saving in the same format at full size can grow already-optimised
      // files; never hand back something bigger than the original.
      const resized =
        maxSize > 0 && Math.max(meta.width ?? 0, meta.height ?? 0) > maxSize;
      const sameFormat = formatFor(inExt) === format;
      if (sameFormat && !resized && !tmp) {
        const [inSize, outSize] = await Promise.all([
          fs.stat(inputPath),
          fs.stat(outputPath),
        ]);
        if (outSize.size >= inSize.size)
          await fs.copyFile(inputPath, outputPath);
      }
      onProgress(1);

      // ffmpeg ignores EXIF rotation, so only compare unrotated images.
      const upright = (meta.orientation ?? 1) === 1;
      const quality = upright
        ? await engines.ffmpeg.ssim(outputPath, source, 1, signal)
        : null;
      return { quality: quality ?? undefined };
    } finally {
      if (tmp) await fs.rm(path.dirname(tmp), { recursive: true, force: true });
    }
  },
};

function outputExt(inputPath: string, options: OptionValues): string {
  const format = options.format as Format;
  if (format !== 'keep') return EXT[format];
  const ext = extOf(inputPath);
  return HEIC.includes(ext) ? 'jpg' : ext;
}

function formatFor(ext: string): 'jpeg' | 'webp' | 'avif' | 'png' | 'tiff' {
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'tif' || ext === 'tiff') return 'tiff';
  return ext as 'webp' | 'avif' | 'png';
}

/**
 * sharp's prebuilt libvips can't decode HEIC (patent-encumbered HEVC), so
 * on macOS we convert with the built-in `sips` first.
 */
async function heicToPng(inputPath: string): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new Error(
      'HEIC photos can only be converted on macOS. Export them as JPEG first.',
    );
  }
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), `media-optimiser-${randomUUID()}`),
  );
  const out = path.join(dir, 'image.png');
  await promisify(execFile)('sips', [
    '-s',
    'format',
    'png',
    inputPath,
    '--out',
    out,
  ]);
  return out;
}
