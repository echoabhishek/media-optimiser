import { app, BrowserWindow, nativeTheme, Notification, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getCliArgs, runCli } from './cli';
import { registerIpc } from './ipc';
import { JobRunner } from './jobs/JobRunner';
import { formatBytes } from '../shared/format';
import type { JobState } from '../shared/types';
import { iconPath } from './icon';
import { setupOpenFiles } from './open-files';
import { handlePreviewScheme, registerPreviewScheme } from './preview';
import { SettingsStore } from './settings';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) app.quit();

const runner = new JobRunner();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 760,
    minHeight: 520,
    title: 'Media Optimiser',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141210' : '#EEF1F6',
    icon: iconPath(), // Windows/Linux taskbar; macOS uses the bundle icon
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Dropping a file outside the drop zone must not navigate away from the app.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

const cliArgs = getCliArgs();

if (cliArgs) {
  app.dock?.hide();
  void app
    .whenReady()
    .then(() => runCli(cliArgs))
    .catch((err: Error) => {
      console.error(err.message);
      return 1;
    })
    .then((code) => app.exit(code));
} else if (!setupOpenFiles()) {
  // Another window is already open; it receives our files and focuses.
  app.quit();
} else {
  registerPreviewScheme();
  app.whenReady().then(() => {
    handlePreviewScheme();
    app.setAboutPanelOptions({
      applicationName: 'Media Optimiser',
      applicationVersion: app.getVersion(),
      credits:
        'Smaller files. Same quality.\nVideo and audio by FFmpeg, images by libvips.',
      iconPath: iconPath(), // Windows/Linux; macOS uses the bundle icon
    });
    const settings = new SettingsStore();
    // Drives prefers-color-scheme in the page and the native window chrome.
    nativeTheme.themeSource = settings.get().theme;
    registerIpc(runner, settings);
    notifyWhenBatchFinishes();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// Kill any running ffmpeg and delete partial files before the app exits.
app.on('will-quit', () => runner.shutdown());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/** Notifies when the queue empties, if the window isn't in front. */
function notifyWhenBatchFinishes(): void {
  let finished: JobState[] = [];
  runner.on('update', (job) => {
    if (job.status !== 'done' && job.status !== 'error') return;
    finished.push(job);
    const busy = runner
      .list()
      .some((j) => j.status === 'queued' || j.status === 'running');
    if (busy) return;

    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isFocused() && Notification.isSupported()) {
      const done = finished.filter((j) => j.status === 'done');
      const failed = finished.length - done.length;
      const before = done.reduce((s, j) => s + j.inputBytes, 0);
      const after = done.reduce((s, j) => s + (j.outputBytes ?? 0), 0);
      const n = new Notification({
        title: failed
          ? `${done.length} done, ${failed} failed`
          : `${done.length} file${done.length === 1 ? '' : 's'} ready`,
        body: done.length
          ? `${formatBytes(before)} → ${formatBytes(after)}`
          : 'See the app for details.',
        icon: iconPath(),
      });
      n.on('click', () => win.show());
      n.show();
    }
    finished = [];
  });
}
