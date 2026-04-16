import type { Tab } from '../state';
import { copyToClipboard, useFeedback } from '../utils';

interface Props {
  tab: Tab;
  json: string;
  promptText: string;
}

type Feedback = 'copied' | 'failed';

export function CopyButton({ tab, json, promptText }: Props) {
  const [feedback, flash] = useFeedback<Feedback>();
  const text = tab === 'json' ? json : promptText;

  const baseLabel = tab === 'json' ? 'Copy JSON' : 'Copy Prompt';
  const label = feedback === 'copied' ? 'Copied!' : feedback === 'failed' ? 'Copy failed' : baseLabel;
  const cls = `btn-candy${feedback === 'copied' ? ' copied' : feedback === 'failed' ? ' copy-failed' : ''}`;

  async function handleClick() {
    if (!text) return;
    flash((await copyToClipboard(text)) ? 'copied' : 'failed');
  }

  return (
    <button class={cls} disabled={!text} onClick={handleClick}>
      {label}
    </button>
  );
}
