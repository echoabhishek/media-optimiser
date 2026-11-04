import type { ThemePreference } from '../../shared/types';

const CHOICES: { value: ThemePreference; label: string; icon: string }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  },
  {
    value: 'system',
    label: 'Match system',
    icon: 'M3 5h18v11H3zM8 20h8m-4-4v4',
  },
];

interface Props {
  value: ThemePreference;
  onChange(value: ThemePreference): void;
}

export function ThemeSwitch({ value, onChange }: Props) {
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Appearance">
      {CHOICES.map((c) => (
        <button
          key={c.value}
          role="radio"
          aria-checked={value === c.value}
          aria-label={c.label}
          title={c.label}
          className={value === c.value ? 'on' : ''}
          onClick={() => onChange(c.value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d={c.icon} />
          </svg>
        </button>
      ))}
    </div>
  );
}
