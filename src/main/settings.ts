import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../shared/types';

const DEFAULTS: AppSettings = {
  selectedToolId: null,
  outputDir: null,
  toolOptions: {},
  trashOriginals: false,
};

/**
 * User settings persisted as JSON in the OS app-data folder
 * (macOS: ~/Library/Application Support/Media Optimiser/settings.json).
 * Written immediately and atomically on every change, so a crash or
 * force-quit never loses them (unlike renderer localStorage, which
 * Chromium flushes lazily).
 */
export class SettingsStore {
  private readonly file = path.join(app.getPath('userData'), 'settings.json');
  private data: AppSettings;

  constructor() {
    this.data = this.read();
  }

  get(): AppSettings {
    return this.data;
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...patch };
    const tmp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
    return this.data;
  }

  private read(): AppSettings {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(this.file, 'utf8'),
      ) as Partial<AppSettings>;
      return { ...DEFAULTS, ...parsed, toolOptions: parsed.toolOptions ?? {} };
    } catch {
      return { ...DEFAULTS };
    }
  }
}
