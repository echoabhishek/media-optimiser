import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1_000_000;

/** e.g. ~/Library/Logs/Media Optimiser/main.log on macOS. */
export function logPath(): string {
  return path.join(app.getPath('logs'), 'main.log');
}

/** Appends a line to the log file; keeps one rotated copy. Never throws. */
export function log(level: 'info' | 'error', message: string): void {
  try {
    const file = logPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if ((fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) {
      fs.renameSync(file, `${file}.old`);
    }
    fs.appendFileSync(
      file,
      `${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`,
    );
  } catch {
    // Logging must never break a conversion.
  }
}
