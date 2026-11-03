import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { FfmpegEngine } from './ffmpeg';

/**
 * All processing back-ends available to tools. Add new engines here
 * (e.g. `sharp` for images) and they become available on ToolRunContext.
 */
export interface Engines {
  ffmpeg: FfmpegEngine;
}

const exe = process.platform === 'win32' ? '.exe' : '';

/**
 * Finds the ffmpeg binary:
 * 1. MEDIA_OPTIMISER_FFMPEG env var (handy for testing other builds)
 * 2. Packaged app: copied into resources/ by forge `extraResource`
 * 3. Development: the binary downloaded by the `ffmpeg-static` package
 */
function resolveFfmpeg(): string {
  const candidates = [
    process.env.MEDIA_OPTIMISER_FFMPEG,
    app.isPackaged
      ? path.join(process.resourcesPath, `ffmpeg${exe}`)
      : path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', `ffmpeg${exe}`),
  ].filter((p): p is string => !!p);

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`ffmpeg binary not found. Looked in:\n${candidates.join('\n')}`);
  }
  return found;
}

let engines: Engines | undefined;

export function getEngines(): Engines {
  engines ??= { ffmpeg: new FfmpegEngine(resolveFfmpeg()) };
  return engines;
}
