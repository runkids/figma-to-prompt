import type { JSX } from 'preact';
import type { Tab } from '../state';

interface Props {
  tab: Tab;
  json: string;
  promptText: string;
  hasData: boolean;
}

const EMPTY_GLYPH: Record<Tab, JSX.Element> = {
  json: (
    <>
      <path
        d="M14 20v-6h6M34 20v-6h-6M14 28v6h6M34 28v6h-6"
        stroke="#8B5CF6"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M24 20v8M20 24h8" stroke="#64748B" stroke-width="1.5" stroke-linecap="round" />
    </>
  ),
  prompt: (
    <>
      <rect x="12" y="8" width="24" height="32" rx="4" stroke="#8B5CF6" stroke-width="2" stroke-dasharray="4 3" />
      <path d="M18 18h12M18 24h9M18 30h10" stroke="#64748B" stroke-width="1.5" stroke-linecap="round" />
    </>
  ),
};

const EMPTY_HINT: Record<Tab, string> = {
  json: 'Click any frame or component\nin Figma to extract its JSON',
  prompt: 'Click any frame or component\nin Figma to generate a prompt',
};

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        {EMPTY_GLYPH[tab]}
      </svg>
      <p class="empty-title">Select a frame</p>
      <p class="empty-hint" style={{ whiteSpace: 'pre-line' }}>
        {EMPTY_HINT[tab]}
      </p>
    </div>
  );
}

export function CodePanel({ tab, json, promptText, hasData }: Props) {
  const text = tab === 'json' ? json : promptText;
  return (
    <div class="content-area">
      {/* `key={tab}` remounts on tab switch — fade animation needs a fresh DOM
          node to retrigger. Replaces the legacy reflow trick (offsetWidth read). */}
      <div key={tab} class="code-panel fade-in" role="tabpanel">
        {hasData ? <pre class="code-text">{text}</pre> : <EmptyState tab={tab} />}
      </div>
    </div>
  );
}
