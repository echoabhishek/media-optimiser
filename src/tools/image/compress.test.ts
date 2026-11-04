import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Engines } from '../../main/engines';
import { FfmpegEngine } from '../../main/engines/ffmpeg';
import { resolveOptions } from '../../shared/options';
import type { OptionValues } from '../../shared/types';
import { compressImages } from './compress';

// Integration tests against the real sharp/libvips (and ffmpeg for SSIM).
const ffmpegBin = path.join(
  process.cwd(),
  'node_modules',
  'ffmpeg-static',
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
);
let dir: string;
let photo: string; // 1600x1200 JPEG at quality 100, EXIF orientation 6
let logo: string; // PNG with transparency
let small: string; // already well-compressed JPEG

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-img-'));
  photo = path.join(dir, 'photo.jpg');
  logo = path.join(dir, 'logo.png');
  small = path.join(dir, 'small.jpg');
  const noise = Buffer.alloc(1600 * 1200 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
  await sharp(noise, { raw: { width: 1600, height: 1200, channels: 3 } })
    .blur(2)
    .jpeg({ quality: 100 })
    .withMetadata({ orientation: 6 })
    .toFile(photo);
  await sharp({
    create: {
      width: 300,
      height: 200,
      channels: 4,
      background: { r: 0, g: 120, b: 255, alpha: 0.5 },
    },
  })
    .png()
    .toFile(logo);
  await sharp(photo)
    .resize(320)
    .jpeg({ quality: 40, mozjpeg: true })
    .toFile(small);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

async function compress(input: string, options: OptionValues = {}) {
  const resolved = resolveOptions(compressImages.options, options);
  const ext = compressImages.outputExtensionFor!(input, resolved);
  const out = path.join(
    dir,
    `out-${Object.values(options).join('-') || 'default'}-${path.basename(input, path.extname(input))}.${ext}`,
  );
  await compressImages.run({
    inputPath: input,
    outputPath: out,
    options: resolved,
    engines: {
      loadSharp: async () => sharp,
      ffmpeg: new FfmpegEngine(ffmpegBin),
    } as unknown as Engines,
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  return out;
}

describe('compress images (real sharp)', () => {
  it('shrinks a JPEG and rotates it upright', async () => {
    const out = await compress(photo);
    expect(fs.statSync(out).size).toBeLessThan(fs.statSync(photo).size / 2);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 1600]);
    expect(meta.orientation ?? 1).toBe(1);
  });

  it('strips EXIF by default and keeps it when asked', async () => {
    expect(
      (await sharp(await compress(photo)).metadata()).exif,
    ).toBeUndefined();
    expect(
      (await sharp(await compress(photo, { keepMetadata: true })).metadata())
        .exif,
    ).toBeDefined();
  });

  it.each(['webp', 'avif', 'png'])('converts to %s', async (format) => {
    const out = await compress(photo, { format });
    expect((await sharp(out).metadata()).format).toBe(
      format === 'avif' ? 'heif' : format,
    );
  });

  it('resizes the longest side without enlarging', async () => {
    const meta = await sharp(
      await compress(photo, { maxSize: '1280' }),
    ).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1280);
    const tiny = await sharp(
      await compress(logo, { maxSize: '1280' }),
    ).metadata();
    expect([tiny.width, tiny.height]).toEqual([300, 200]);
  });

  it('flattens transparency onto white for JPEG', async () => {
    const out = await compress(logo, { format: 'jpeg' });
    const meta = await sharp(out).metadata();
    expect(meta.hasAlpha).toBe(false);
    const { data } = await sharp(out)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(100); // blended with white, not black
  });

  it('never returns a bigger file when keeping the format', async () => {
    const out = await compress(small, { quality: 'high' });
    expect(fs.readFileSync(out).equals(fs.readFileSync(small))).toBe(true);
  });

  it.runIf(process.platform === 'darwin')(
    'converts HEIC via sips on macOS',
    async () => {
      const heic = path.join(dir, 'phone.heic');
      execFileSync('sips', ['-s', 'format', 'heic', photo, '--out', heic], {
        stdio: 'ignore',
      });
      const out = await compress(heic);
      expect(path.extname(out)).toBe('.jpg');
      expect((await sharp(out).metadata()).format).toBe('jpeg');
    },
  );

  it('reports visual similarity for upright images only', async () => {
    const run = (input: string) =>
      compressImages.run({
        inputPath: input,
        outputPath: path.join(dir, `q-${path.basename(input)}`),
        options: resolveOptions(compressImages.options),
        engines: {
          loadSharp: async () => sharp,
          ffmpeg: new FfmpegEngine(ffmpegBin),
        } as unknown as Engines,
        signal: new AbortController().signal,
        onProgress: () => {},
      });
    const logoResult = await run(logo);
    expect(logoResult?.quality).toBeGreaterThan(0.95);
    expect((await run(photo))?.quality).toBeUndefined(); // EXIF-rotated
  });
});
