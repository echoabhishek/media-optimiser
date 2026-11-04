import type { TrimRange } from '../shared/types';

/** ffmpeg arguments for a trim: `input` goes before `-i`, `output` after. */
export function trimArgs(trim?: TrimRange): {
  input: string[];
  output: string[];
} {
  if (!trim) return { input: [], output: [] };
  return {
    // Before -i: fast seek, still frame-accurate because we re-encode.
    input: trim.start > 0 ? ['-ss', String(trim.start)] : [],
    output: trim.end != null ? ['-t', String(trim.end - trim.start)] : [],
  };
}

/** Length of the output in seconds, or null when unknown. */
export function trimmedDuration(
  total: number | null,
  trim?: TrimRange,
): number | null {
  if (!trim) return total;
  const end = trim.end ?? total;
  return end == null ? null : Math.max(0, end - trim.start);
}
