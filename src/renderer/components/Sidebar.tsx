import type { ReactNode } from 'react';
import type { MediaKind, ToolManifest } from '../../shared/types';

const KINDS: { kind: MediaKind; label: string; icon: string }[] = [
  {
    kind: 'video',
    label: 'Video',
    icon: 'M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm12 4 5-3v10l-5-3',
  },
  {
    kind: 'audio',
    label: 'Audio',
    icon: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  },
  {
    kind: 'image',
    label: 'Image',
    icon: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01',
  },
];

interface Props {
  tools: ToolManifest[];
  selectedId: string | null;
  onSelect(id: string): void;
  footer?: ReactNode;
}

export function Sidebar({ tools, selectedId, onSelect, footer }: Props) {
  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        Media Optimiser
      </div>
      {KINDS.map(({ kind, label, icon }) => {
        const group = tools.filter((t) => t.kind === kind);
        return (
          <section key={kind} className="nav-group">
            <h2>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={icon} />
              </svg>
              {label}
            </h2>
            {group.length === 0 ? (
              <div className="nav-item soon">Coming soon</div>
            ) : (
              group.map((t) => (
                <button
                  key={t.id}
                  className={`nav-item ${t.id === selectedId ? 'active' : ''}`}
                  onClick={() => onSelect(t.id)}
                >
                  {t.name}
                </button>
              ))
            )}
          </section>
        );
      })}
      {footer}
    </nav>
  );
}
