import type { MediaApi } from '../shared/ipc';

declare global {
  interface Window {
    mediaApi: MediaApi;
  }
}
