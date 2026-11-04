export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export function dirname(p: string): string {
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.join('/') || '/';
}

export function extension(p: string): string {
  const name = basename(p);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** SSIM 0..1 → "99.9% match" (floored, so 0.99999 never shows as 100%). */
export function formatMatch(ssim: number): string {
  return `${(Math.floor(ssim * 1000) / 10).toFixed(1)}% match`;
}
