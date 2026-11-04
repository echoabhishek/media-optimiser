import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FolderWatcher } from './watch';

let dir: string;
let found: string[];
let outputs: Set<string>;
let watcher: FolderWatcher;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-watch-'));
  found = [];
  outputs = new Set();
  watcher = new FolderWatcher({
    accepts: (f) => f.endsWith('.mov') || f.endsWith('.mp4'),
    isOwnOutput: (f) => outputs.has(f),
    onFile: (f) => found.push(f),
    settleMs: 50,
  });
});
afterEach(() => {
  watcher.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('FolderWatcher', () => {
  it('ignores files that existed before watching started', async () => {
    fs.writeFileSync(path.join(dir, 'old.mov'), 'x');
    watcher.start(dir);
    fs.appendFileSync(path.join(dir, 'old.mov'), 'y');
    await wait(300);
    expect(found).toEqual([]);
  });

  it('reports a new file once, after it stops growing', async () => {
    watcher.start(dir);
    const file = path.join(dir, 'new.mov');
    fs.writeFileSync(file, 'a');
    await wait(20);
    fs.appendFileSync(file, 'b'); // still being written
    await wait(400);
    expect(found).toEqual([file]);
  });

  it('skips other types, hidden, partial and own output files', async () => {
    watcher.start(dir);
    const own = path.join(dir, 'converted.mp4');
    outputs.add(own);
    for (const name of ['notes.txt', '.hidden.mov', 'x.mp4.part.mp4']) {
      fs.writeFileSync(path.join(dir, name), 'x');
    }
    fs.writeFileSync(own, 'x');
    await wait(300);
    expect(found).toEqual([]);
  });

  it('stops reporting after stop()', async () => {
    watcher.start(dir);
    watcher.stop();
    fs.writeFileSync(path.join(dir, 'late.mov'), 'x');
    await wait(300);
    expect(found).toEqual([]);
    expect(watcher.active).toBe(false);
  });
});
