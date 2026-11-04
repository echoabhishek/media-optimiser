import type { OptionValues, ToolPreset } from '../../shared/types';

interface Props {
  presets: ToolPreset[];
  values: OptionValues;
  onApply(values: OptionValues): void;
}

/** One-click setting bundles; a preset is "active" while all its values match. */
export function Presets({ presets, values, onApply }: Props) {
  const active = presets.find((p) =>
    Object.entries(p.values).every(([k, v]) => values[k] === v),
  );
  return (
    <div className="presets">
      <span className="option-label">
        Optimise for
        {!active && <span className="changed"> · custom settings</span>}
      </span>
      <div className="preset-grid">
        {presets.map((p) => (
          <button
            key={p.id}
            className={p === active ? 'preset on' : 'preset'}
            aria-pressed={p === active}
            onClick={() => onApply(p.values)}
          >
            <strong>{p.label}</strong>
            <span>{p.help}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
