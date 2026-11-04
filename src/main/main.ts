import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getCliArgs, runCli } from './cli';
import { registerIpc } from './ipc';
import { JobRunner } from './jobs/JobRunner';
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
    backgroundColor: '#111214',
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
} else {
  registerPreviewScheme();
  app.whenReady().then(() => {
    handlePreviewScheme();
    registerIpc(runner, new SettingsStore());
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
