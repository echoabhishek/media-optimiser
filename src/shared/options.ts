import type { OptionField, OptionValue, OptionValues } from './types';

/**
 * Returns a value for every field, falling back to the default when a value
 * is missing or no longer valid (e.g. saved settings from an older version).
 */
export function resolveOptions(fields: OptionField[], values: OptionValues = {}): OptionValues {
  return Object.fromEntries(
    fields.map((f) => [f.key, isValid(f, values[f.key]) ? values[f.key] : f.default]),
  );
}

function isValid(f: OptionField, v: OptionValue | undefined): boolean {
  switch (f.type) {
    case 'select':
      return f.choices.some((c) => c.value === v);
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) && v >= f.min && v <= f.max;
    case 'toggle':
      return typeof v === 'boolean';
  }
}
