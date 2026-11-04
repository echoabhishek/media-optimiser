import { describe, expect, it } from 'vitest';
import { formatTime, parseTime } from '../shared/format';
import { trimArgs, trimmedDuration } from './trim';

describe('trim', () => {
  it('seeks before the input and limits length after it', () => {
    expect(trimArgs({ start: 3, end: 9.5 })).toEqual({
      input: ['-ss', '3'],
      output: ['-t', '6.5'],
    });
    expect(trimArgs({ start: 0, end: 5 })).toEqual({
      input: [],
      output: ['-t', '5'],
    });
    expect(trimArgs({ start: 2 })).toEqual({ input: ['-ss', '2'], output: [] });
    expect(trimArgs()).toEqual({ input: [], output: [] });
  });

  it('computes the output duration', () => {
    expect(trimmedDuration(15, { start: 3, end: 9.5 })).toBe(6.5);
    expect(trimmedDuration(15, { start: 3 })).toBe(12);
    expect(trimmedDuration(15)).toBe(15);
    expect(trimmedDuration(null, { start: 3 })).toBeNull();
  });
});

describe('time helpers', () => {
  it.each([
    ['90', 90],
    ['1:30', 90],
    ['1:02:03.5', 3723.5],
    ['0.5', 0.5],
  ])('parses %s', (text, seconds) => expect(parseTime(text)).toBe(seconds));

  it.each(['', 'abc', '1:2:3:4', '-5', '1:'])('rejects %j', (text) =>
    expect(parseTime(text)).toBeNull(),
  );

  it('formats m:ss.s', () => {
    expect(formatTime(3)).toBe('0:03.0');
    expect(formatTime(83.25)).toBe('1:23.3');
  });
});
