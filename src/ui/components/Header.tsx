export function Header() {
  return (
    <header class="plugin-header">
      <div class="logo-mark">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M5 5.5h6M5 8h4M5 10.5h5" stroke="white" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
      <h1 class="plugin-title">Figma to Prompt</h1>
      <div class="header-dots">
        <span class="deco-dot" style={{ background: 'var(--tertiary)' }} />
        <span class="deco-dot" style={{ background: 'var(--secondary)' }} />
        <span class="deco-dot" style={{ background: 'var(--quaternary)' }} />
      </div>
    </header>
  );
}
