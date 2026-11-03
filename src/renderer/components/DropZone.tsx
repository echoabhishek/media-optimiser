import { useState } from 'react';

interface Props {
  extensions: string[];
  onFiles(paths: string[]): void;
}

export function DropZone({ extensions, onFiles }: Props) {
  const [over, setOver] = useState(false);

  const browse = async () => {
    const paths = await window.mediaApi.pickFiles(extensions);
    if (paths.length) onFiles(paths);
  };

  return (
    <button
      type="button"
      className={`dropzone ${over ? 'over' : ''}`}
      onClick={browse}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const paths = [...e.dataTransfer.files]
          .map((f) => window.mediaApi.getPathForFile(f))
          .filter(Boolean);
        if (paths.length) onFiles(paths);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <strong>Drop files here or click to choose</strong>
      <span>{extensions.map((e) => `.${e}`).join('  ')}</span>
    </button>
  );
}
