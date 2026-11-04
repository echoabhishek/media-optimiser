import { useState } from 'react';
import type { MediaKind } from '../../shared/types';
import { Logo } from './Logo';

const NOUN: Record<MediaKind, string> = {
  video: 'videos',
  audio: 'audio files',
  image: 'images',
};

interface Props {
  kind: MediaKind;
  extensions: string[];
  onFiles(paths: string[]): void;
  /** Smaller once files are listed, so the list stays in view. */
  compact?: boolean;
}

export function DropZone({ kind, extensions, onFiles, compact }: Props) {
  const [over, setOver] = useState(false);

  const browse = async () => {
    const paths = await window.mediaApi.pickFiles(extensions);
    if (paths.length) onFiles(paths);
  };

  return (
    <button
      type="button"
      className={`dropzone ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
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
      {compact ? (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
      ) : (
        <Logo size={64} />
      )}
      <strong>
        {compact ? `Add more ${NOUN[kind]}` : `Drop ${NOUN[kind]} here`}
      </strong>
      <span>
        {compact
          ? 'Drop or click to choose'
          : `or click to choose · ${extensions.map((e) => `.${e}`).join(' ')}`}
      </span>
    </button>
  );
}
