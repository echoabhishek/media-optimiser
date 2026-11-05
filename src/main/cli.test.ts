import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { convertVideo } from '../tools/video/convert';
import { parseToolArgs, runCli } from './cli';

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
}));

let dir: string;
let mov: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-cli-'));
  mov = path.join(dir, 'clip.mov');
  fs.writeFileSync(mov, '');
  fs.writeFileSync(path.join(dir, 'photo.png'), '');
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const parse = (...args: string[]) => parseToolArgs(convertVideo, args);

describe('parseToolArgs', () => {
  it('parses files, --key value and --key=value', () => {
    expect(
      parse(mov, '--codec', 'h265', '--quality=small', '--out', dir),
    ).toEqual({
      files: [mov],
      options: { codec: 'h265', quality: 'small' },
      outDir: dir,
      trashOriginals: false,
      json: false,
    });
    expect(parse(mov, '--trash-originals').trashOriginals).toBe(true);
    expect(parse(mov, '--json').json).toBe(true);
  });

  it('uses kebab-case flags for camelCase options', () => {
    expect(parse(mov, '--size-limit', '25', '--keep-metadata').options).toEqual(
      {
        sizeLimit: '25',
        keepMetadata: true,
      },
    );
  });

  it('applies a preset, with explicit flags taking priority', () => {
    expect(
      parse(mov, '--quality', 'high', '--preset', 'github').options,
    ).toMatchObject({
      sizeLimit: '10',
      resolution: '1080',
      quality: 'high',
    });
    expect(() => parse(mov, '--preset', 'nope')).toThrow(
      'Unknown preset "nope"',
    );
  });

  it('parses --start and --end into a trim range', () => {
    expect(parse(mov, '--start', '0:03', '--end', '9.5').trim).toEqual({
      start: 3,
      end: 9.5,
    });
    expect(parse(mov, '--end', '5').trim).toEqual({ start: 0, end: 5 });
    expect(parse(mov).trim).toBeUndefined();
    expect(() => parse(mov, '--start', '9', '--end', '3')).toThrow(
      '--end must be after --start',
    );
    expect(() => parse(mov, '--start', 'soon')).toThrow('Invalid --start');
  });

  it('de-duplicates input files', () => {
    expect(parse(mov, mov).files).toEqual([mov]);
  });

  it.each([
    [['--codec', 'h264'], 'No input files'],
    [['missing.mov'], 'File not found'],
    [['PHOTO'], 'Unsupported file'],
    [['MOV', '--codec', 'vp9'], 'Invalid --codec "vp9"'],
    [['MOV', '--bogus', '1'], 'Unknown option --bogus'],
    [['MOV', '--codec'], 'Missing value for --codec'],
    [['MOV', '--out', '/no/such/folder'], 'Output folder not found'],
  ])('rejects %j', (args, message) => {
    const resolved = args.map((a) =>
      a === 'MOV' ? mov : a === 'PHOTO' ? path.join(dir, 'photo.png') : a,
    );
    expect(() => parse(...resolved)).toThrow(message);
  });
});

describe('runCli commands', () => {
  /** Runs the CLI and returns its exit code and everything it printed. */
  async function cli(...args: string[]) {
    const out: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((t) => out.push(t));
    const err = vi
      .spyOn(console, 'error')
      .mockImplementation((t) => out.push(t));
    try {
      return { code: await runCli(args), out: out.join('\n') };
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  }

  it('lists the tools of a media type', async () => {
    const { code, out } = await cli('video');
    expect(code).toBe(0);
    expect(out).toContain('video convert');
    expect(out).toContain('video gif');
    expect(out).not.toContain('audio convert');
  });

  it('shows help for a type and tool, or the tool id', async () => {
    for (const args of [['video', 'convert'], ['video.convert']]) {
      const { code, out } = await cli(...args, '--help');
      expect(code).toBe(0);
      expect(out).toContain('Usage: media-optimiser video convert');
      expect(out).toContain('--format <mp4|webm|mov>');
    }
  });

  it('rejects an unknown tool with exit code 2', async () => {
    const { code, out } = await cli('video', 'mov-to-mp4');
    expect(code).toBe(2);
    expect(out).toContain('Unknown video tool "mov-to-mp4"');
  });
});
