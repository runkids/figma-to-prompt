import type { JSX } from 'preact';

interface Props {
  label: string;
  text: string;
}

export function HelpTip({ label, text }: Props) {
  function handleClick(e: JSX.TargetedMouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <button
      type="button"
      class="help-tip"
      aria-label={label}
      data-tooltip={text}
      onClick={handleClick}
    >
      ?
    </button>
  );
}
