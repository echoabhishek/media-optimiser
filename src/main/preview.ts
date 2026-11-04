import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { tools } from '../tools';

const SCHEME = 'media';

const MIME: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

/** Must run before the app is ready. */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

/**
 * Serves local files to <video>/<audio>/<img> as media://file/<encoded path>,
 * with Range support so players can seek without reading the whole file.
 * Only file types some tool accepts are served, so the renderer can't use
 * this to read arbitrary files.
 */
export function handlePreviewScheme(): void {
  const allowed = new Set(tools.flatMap((t) => t.inputExtensions));
  protocol.handle(SCHEME, async (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1));
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (!path.isAbsolute(filePath) || !allowed.has(ext)) {
      return new Response('Not allowed', { status: 403 });
    }
    const size = (await fs.promises.stat(filePath).catch(() => null))?.size;
    if (size == null) return new Response('Not found', { status: 404 });

    const headers: Record<string, string> = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
    };
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '');
    if (!range) {
      headers['Content-Length'] = String(size);
      return new Response(body(filePath), { status: 200, headers });
    }

    // "bytes=a-b", "bytes=a-" or the suffix form "bytes=-n" (last n bytes).
    const start = range[1]
      ? Number(range[1])
      : Math.max(0, size - Number(range[2]));
    const end =
      range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    headers['Content-Length'] = String(end - start + 1);
    return new Response(body(filePath, start, end), { status: 206, headers });
  });
}

function body(filePath: string, start?: number, end?: number): ReadableStream {
  return Readable.toWeb(
    fs.createReadStream(filePath, { start, end }),
  ) as ReadableStream;
}
