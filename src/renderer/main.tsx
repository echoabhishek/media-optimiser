import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import { App } from './App';
import './styles.css';

// Stop the window from navigating to a file dropped outside the drop zone.
for (const ev of ['dragover', 'drop'] as const) {
  document.addEventListener(ev, (e) => e.preventDefault());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
