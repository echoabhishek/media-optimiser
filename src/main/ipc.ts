import {
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} from 'electron';
import fs from 'node:fs';
import { extension } from '../shared/format';
import { getTool } from '../tools';
import { iconPath } from './icon';
import { log } from './log';
import { FolderWatcher } from './watch';
import { IPC } from '../shared/ipc';
import type { AppSettings, JobRequest, WatchTarget } from '../shared/types';
import { toManifest, tools } from '../tools';
import { getEngines } from './engines';
import { JobRunner } from './jobs/JobRunner';
import type { SettingsStore } from './settings';

export function registerIpc(runner: JobRunner, settings: SettingsStore): void {
  ipcMain.handle(IPC.listTools, () => tools.map(toManifest));
  ipcMain.handle(IPC.getSettings, () => settings.get());
  ipcMain.handle(IPC.updateSettings, (_e, patch: Partial<AppSettings>) =>
    settings.update(patch),
  );

  ipcMain.handle(IPC.pickFiles, async (e, extensions: string[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Supported files', extensions }],
    });
    return res.canceled ? [] : res.filePaths;
  });

  ipcMain.handle(IPC.pickFolder, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle(IPC.enqueueJobs, (_e, requests: JobRequest[]) =>
    runner.enqueue(requests),
  );
  ipcMain.handle(IPC.cancelJob, (_e, id: string) => runner.cancel(id));
  ipcMain.handle(IPC.listJobs, () => runner.list());
  ipcMain.handle(IPC.clearFinished, () => runner.clearFinished());
  ipcMain.handle(IPC.revealPath, (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.handle(
    IPC.probe,
    async (_e, p: string) => (await getEngines().ffmpeg.probe(p)).durationSec,
  );
  // Watch folder: new files are converted with the tool's saved settings.
  const watcher = new FolderWatcher({
    accepts: (file) => {
      const tool = getTool(settings.get().watch?.toolId ?? '');
      return !!tool && tool.inputExtensions.includes(extension(file));
    },
    isOwnOutput: (file) => runner.list().some((j) => j.outputPath === file),
    onFile: (file) => {
      const s = settings.get();
      if (!s.watch) return;
      log('info', `watch: new file ${file}`);
      runner
        .enqueue([
          {
            toolId: s.watch.toolId,
            inputPath: file,
            options: s.toolOptions[s.watch.toolId] ?? {},
            outputDir: s.outputDir ?? undefined,
            trashOriginal: s.trashOriginals,
          },
        ])
        .catch((err: Error) => log('error', `watch: ${err.message}`));
    },
  });
  const applyWatch = (target: WatchTarget | null) => {
    if (target && fs.existsSync(target.folder)) watcher.start(target.folder);
    else watcher.stop();
  };
  applyWatch(settings.get().watch);
  ipcMain.handle(IPC.setWatch, (_e, target: WatchTarget | null) => {
    settings.update({ watch: target });
    applyWatch(target);
  });

  let dragIcon: Electron.NativeImage | undefined;
  ipcMain.on(IPC.startDrag, (e, p: string) => {
    // Only files this app produced can be dragged out.
    if (!runner.list().some((j) => j.status === 'done' && j.outputPath === p)) {
      return;
    }
    dragIcon ??= nativeImage.createFromPath(iconPath()).resize({ width: 64 });
    e.sender.startDrag({ file: p, icon: dragIcon });
  });
  ipcMain.handle(IPC.copyText, (_e, text: string) => clipboard.writeText(text));
  ipcMain.handle(IPC.openPath, async (_e, p: string) => {
    await shell.openPath(p);
  });

  runner.on('update', (job) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.jobUpdate, job);
    }
  });
}
