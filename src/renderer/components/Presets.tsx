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
    <div className="option presets">
      <span className="option-label">Optimise for</span>
      <div className="chips">
        {presets.map((p) => (
          <button
            key={p.id}
            className={p === active ? 'chip on' : 'chip'}
            aria-pressed={p === active}
            title={p.help}
            onClick={() => onApply(p.values)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="option-help">{active?.help ?? 'Custom settings'}</p>
    </div>
  );
}
