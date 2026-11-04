import { app } from 'electron';
import path from 'node:path';

/** The app icon PNG (shipped via forge `extraResource` when packaged). */
export function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'assets', 'icon.png');
}
