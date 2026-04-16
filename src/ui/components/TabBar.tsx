import type { Tab } from '../state';

interface Props {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

export function TabBar({ tab, onChange }: Props) {
  return (
    <nav class="tab-bar" role="tablist">
      <button
        class={tab === 'json' ? 'tab-btn active' : 'tab-btn'}
        role="tab"
        aria-selected={tab === 'json'}
        onClick={() => onChange('json')}
      >
        JSON
      </button>
      <button
        class={tab === 'prompt' ? 'tab-btn active' : 'tab-btn'}
        role="tab"
        aria-selected={tab === 'prompt'}
        onClick={() => onChange('prompt')}
      >
        Prompt
      </button>
    </nav>
  );
}
