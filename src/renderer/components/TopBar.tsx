import type { ReactNode } from 'react';
import type { MediaKind, ToolManifest } from '../../shared/types';

const KINDS: { kind: MediaKind; label: string }[] = [
  { kind: 'video', label: 'Video' },
  { kind: 'audio', label: 'Audio' },
  { kind: 'image', label: 'Image' },
];

interface Props {
  tools: ToolManifest[];
  kind: MediaKind | undefined;
  onSelectKind(kind: MediaKind): void;
  end?: ReactNode;
}

export function TopBar({ tools, kind, onSelectKind, end }: Props) {
  return (
    <header className="topbar">
      <nav className="kinds" aria-label="Media type">
        {KINDS.filter((k) => tools.some((t) => t.kind === k.kind)).map((k) => (
          <button
            key={k.kind}
            className={`kind kind-${k.kind} ${k.kind === kind ? 'on' : ''}`}
            aria-pressed={k.kind === kind}
            onClick={() => onSelectKind(k.kind)}
          >
            <span className="dot" aria-hidden />
            {k.label}
          </button>
        ))}
      </nav>
      <span className="spacer" />
      {end}
    </header>
  );
}
