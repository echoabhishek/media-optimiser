import type { AppSettings, JobRequest, JobState, ToolManifest } from './types';

/** IPC channel names, in one place so main and preload can't drift. */
export const IPC = {
  listTools: 'tools:list',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  pickFiles: 'dialog:pick-files',
  pickFolder: 'dialog:pick-folder',
  enqueueJobs: 'jobs:enqueue',
  cancelJob: 'jobs:cancel',
  listJobs: 'jobs:list',
  clearFinished: 'jobs:clear-finished',
  jobUpdate: 'jobs:update',
  revealPath: 'shell:reveal',
  openPath: 'shell:open',
  copyText: 'clipboard:write',
} as const;

/** The API the preload script exposes on `window.mediaApi`. */
export interface MediaApi {
  platform: NodeJS.Platform;
  listTools(): Promise<ToolManifest[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  pickFiles(extensions: string[]): Promise<string[]>;
  pickFolder(): Promise<string | null>;
  /** Resolves the absolute path of a file dropped onto the window. */
  getPathForFile(file: File): string;
  enqueueJobs(requests: JobRequest[]): Promise<JobState[]>;
  cancelJob(id: string): Promise<void>;
  listJobs(): Promise<JobState[]>;
  clearFinished(): Promise<void>;
  /** Subscribes to job changes; returns an unsubscribe function. */
  onJobUpdate(listener: (job: JobState) => void): () => void;
  revealPath(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  copyText(text: string): Promise<void>;
}
