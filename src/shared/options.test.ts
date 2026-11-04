import { describe, expect, it } from 'vitest';
import { resolveOptions } from './options';
import type { OptionField } from './types';

const fields: OptionField[] = [
  {
    type: 'select',
    key: 'codec',
    label: 'Codec',
    default: 'h264',
    choices: [
      { value: 'h264', label: 'H.264' },
      { value: 'h265', label: 'H.265' },
    ],
  },
  { type: 'number', key: 'fps', label: 'FPS', default: 30, min: 1, max: 60 },
  { type: 'toggle', key: 'strip', label: 'Strip', default: false },
];

describe('resolveOptions', () => {
  it('fills defaults for missing values', () => {
    expect(resolveOptions(fields)).toEqual({
      codec: 'h264',
      fps: 30,
      strip: false,
    });
  });

  it('keeps valid values', () => {
    expect(
      resolveOptions(fields, { codec: 'h265', fps: 60, strip: true }),
    ).toEqual({ codec: 'h265', fps: 60, strip: true });
  });

  it('replaces invalid or stale values with defaults', () => {
    expect(
      resolveOptions(fields, { codec: 'vp9', fps: 120, strip: 'yes' }),
    ).toEqual({ codec: 'h264', fps: 30, strip: false });
  });

  it('drops unknown keys', () => {
    expect(resolveOptions(fields, { removed: 'x' })).not.toHaveProperty(
      'removed',
    );
  });
});

describe('formatMatch', () => {
  it('floors so near-identical never rounds up to 100%', async () => {
    const { formatMatch } = await import('./format');
    expect(formatMatch(0.99994)).toBe('99.9% match');
    expect(formatMatch(0.9876)).toBe('98.7% match');
  });
});
