import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type MediaApi } from '../shared/ipc';
import type { JobState } from '../shared/types';

const api: MediaApi = {
  platform: process.platform,
  listTools: () => ipcRenderer.invoke(IPC.listTools),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  pickFiles: (extensions) => ipcRenderer.invoke(IPC.pickFiles, extensions),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  enqueueJobs: (requests) => ipcRenderer.invoke(IPC.enqueueJobs, requests),
  cancelJob: (id) => ipcRenderer.invoke(IPC.cancelJob, id),
  listJobs: () => ipcRenderer.invoke(IPC.listJobs),
  clearFinished: () => ipcRenderer.invoke(IPC.clearFinished),
  onJobUpdate: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, job: JobState) =>
      listener(job);
    ipcRenderer.on(IPC.jobUpdate, handler);
    return () => ipcRenderer.removeListener(IPC.jobUpdate, handler);
  },
  revealPath: (p) => ipcRenderer.invoke(IPC.revealPath, p),
  openPath: (p) => ipcRenderer.invoke(IPC.openPath, p),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  getDuration: (p) => ipcRenderer.invoke(IPC.probe, p),
  startDrag: (p) => ipcRenderer.send(IPC.startDrag, p),
  setWatch: (target) => ipcRenderer.invoke(IPC.setWatch, target),
  onOpenFiles: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, paths: string[]) =>
      listener(paths);
    ipcRenderer.on(IPC.openFiles, handler);
    return () => ipcRenderer.removeListener(IPC.openFiles, handler);
  },
  takeOpenedFiles: () => ipcRenderer.invoke(IPC.takeOpenedFiles),
};

contextBridge.exposeInMainWorld('mediaApi', api);
