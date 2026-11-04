import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native module: shipped as files by the forge packageAfterCopy hook.
      external: ['sharp'],
    },
  },
});
