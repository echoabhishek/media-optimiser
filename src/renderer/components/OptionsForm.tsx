import type { OptionField, OptionValues } from '../../shared/types';

interface Props {
  fields: OptionField[];
  values: OptionValues;
  onChange(key: string, value: OptionValues[string]): void;
}

/** Renders any tool's options from its declarative schema. */
export function OptionsForm({ fields, values, onChange }: Props) {
  return (
    <div className="options">
      {fields.map((f) => (
        <div key={f.key} className="option">
          <label className="option-label" htmlFor={`opt-${f.key}`}>
            {f.label}
            {(values[f.key] ?? f.default) !== f.default && (
              <span className="changed" title="Changed from the default">
                {' '}
                · changed
              </span>
            )}
          </label>
          <Field
            field={f}
            value={values[f.key] ?? f.default}
            onChange={(v) => onChange(f.key, v)}
          />
          <p className="option-help">
            {helpFor(f, values[f.key] ?? f.default)}
          </p>
        </div>
      ))}
    </div>
  );
}

function helpFor(f: OptionField, value: OptionValues[string]): string {
  if (f.type === 'select') {
    return f.choices.find((c) => c.value === value)?.help ?? f.help ?? '';
  }
  return f.help ?? '';
}

function Field({
  field: f,
  value,
  onChange,
}: {
  field: OptionField;
  value: OptionValues[string];
  onChange(v: OptionValues[string]): void;
}) {
  switch (f.type) {
    case 'select':
      // Up to 4 choices read best as a segmented control; more as a dropdown.
      if (f.choices.length <= 4) {
        return (
          <div className="segmented" role="radiogroup" id={`opt-${f.key}`}>
            {f.choices.map((c) => (
              <button
                key={c.value}
                role="radio"
                aria-checked={value === c.value}
                className={value === c.value ? 'on' : ''}
                onClick={() => onChange(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        );
      }
      return (
        <select
          id={`opt-${f.key}`}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {f.choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      );
    case 'number':
      return (
        <div className="range">
          <input
            id={`opt-${f.key}`}
            type="range"
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span>
            {String(value)}
            {f.unit ?? ''}
          </span>
        </div>
      );
    case 'toggle':
      return (
        <input
          id={`opt-${f.key}`}
          type="checkbox"
          className="toggle"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
  }
}
