import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '../shared/ipc';

/** Files opened before the window could receive them. */
let queued: string[] = [];

/**
 * Handles files opened with the app: "Open With", dropping on the Dock
 * icon (macOS `open-file`) or file paths on the command line (Windows,
 * Linux, and a second launch while the app is open).
 * Returns false when another instance is already running; quit then.
 */
export function setupOpenFiles(): boolean {
  if (!app.requestSingleInstanceLock()) return false;

  app.on('open-file', (e, file) => {
    e.preventDefault();
    deliver([file]);
  });
  app.on('second-instance', (_e, argv, cwd) => {
    deliver(filesFromArgv(argv, cwd));
    const win = BrowserWindow.getAllWindows()[0];
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  ipcMain.handle(IPC.takeOpenedFiles, () => {
    const files = queued;
    queued = [];
    return files;
  });

  queued.push(...filesFromArgv(process.argv, process.cwd()));
  return true;
}

function deliver(files: string[]): void {
  if (!files.length) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.webContents.isLoading()) {
    win.webContents.send(IPC.openFiles, files);
  } else {
    queued.push(...files);
  }
}

/** Existing files among the arguments (skips the executable and flags). */
function filesFromArgv(argv: string[], cwd: string): string[] {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-'))
    .map((a) => path.resolve(cwd, a))
    .filter((p) => fs.statSync(p, { throwIfNoEntry: false })?.isFile());
}
