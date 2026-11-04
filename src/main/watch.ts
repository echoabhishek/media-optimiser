import fs from 'node:fs';
import path from 'node:path';

interface Options {
  /** Should this file be converted (e.g. extension accepted by the tool)? */
  accepts(file: string): boolean;
  /** Files this app wrote itself, which must not be picked up again. */
  isOwnOutput(file: string): boolean;
  onFile(file: string): void;
  /** How long a file's size must stay unchanged before it counts as done. */
  settleMs?: number;
}

/**
 * Watches one folder (not recursive) for new files. Files that existed when
 * watching started are ignored; new ones are reported once fully written.
 */
export class FolderWatcher {
  private watcher?: fs.FSWatcher;
  private seen = new Set<string>();
  private settling = new Set<string>();

  constructor(private readonly opts: Options) {}

  start(folder: string): void {
    this.stop();
    this.seen = new Set(
      fs.readdirSync(folder).map((name) => path.join(folder, name)),
    );
    this.watcher = fs.watch(folder, (_event, name) => {
      if (name) void this.consider(path.join(folder, name.toString()));
    });
    this.watcher.on('error', () => this.stop());
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
    this.settling.clear();
  }

  get active(): boolean {
    return !!this.watcher;
  }

  private async consider(file: string): Promise<void> {
    const name = path.basename(file);
    if (this.seen.has(file) || this.settling.has(file)) return;
    // Hidden/temporary files, our own partial outputs, other types.
    if (name.startsWith('.') || name.includes('.part.')) return;
    if (!this.opts.accepts(file) || this.opts.isOwnOutput(file)) return;

    this.settling.add(file);
    try {
      if (await waitUntilStable(file, this.opts.settleMs ?? 1500)) {
        this.seen.add(file);
        if (this.watcher && !this.opts.isOwnOutput(file))
          this.opts.onFile(file);
      }
    } finally {
      this.settling.delete(file);
    }
  }
}

/** Resolves true once the file's size is non-zero and unchanged for `ms`. */
async function waitUntilStable(file: string, ms: number): Promise<boolean> {
  let last = -1;
  for (let i = 0; i < 1200; i++) {
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile()) return false;
    if (stat.size > 0 && stat.size === last) return true;
    last = stat.size;
    await new Promise((r) => setTimeout(r, ms));
  }
  return false;
}
