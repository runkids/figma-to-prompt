/**
 * Generic radio-button-style group. Replaces the imperative `makeGroup` factory
 * from the legacy main.ts: visual selected state + aria-checked + per-option
 * disabled flag are all derived from `value` prop, so React reconciles for free.
 */
export interface ButtonGroupOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  /** ARIA label for the radiogroup wrapper */
  ariaLabel: string;
  /** Visual variant: "segmented" (full-width pills) or "chip" (compact chips) */
  variant: 'segmented' | 'chip';
  options: ButtonGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ButtonGroup<T extends string>({
  ariaLabel,
  variant,
  options,
  value,
  onChange,
}: Props<T>) {
  const wrapperClass = variant === 'segmented' ? 'segmented' : 'chip-row';
  const buttonClass = variant === 'segmented' ? 'segment' : 'chip';
  return (
    <div class={wrapperClass} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            type="button"
            role="radio"
            class={selected ? `${buttonClass} selected` : buttonClass}
            aria-checked={selected}
            disabled={opt.disabled}
            onClick={() => {
              if (opt.disabled || selected) return;
              onChange(opt.value);
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
