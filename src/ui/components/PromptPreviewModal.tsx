import { useEffect } from 'preact/hooks';
import { CopyButton } from './CopyButton';
import type { Tab } from '../state';

interface Props {
  tab: Tab;
  text: string;
  onClose: () => void;
}

export function TextPreviewModal({ tab, text, onClose }: Props) {
  const title = tab === 'json' ? 'JSON Preview' : 'Prompt Preview';
  const closeLabel = tab === 'json' ? 'Close JSON preview' : 'Close prompt preview';

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div class="modal-backdrop" onMouseDown={onClose}>
      <section
        class="prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header class="prompt-modal-header">
          <h2 id="text-preview-title">{title}</h2>
          <button
            type="button"
            class="modal-close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div class="prompt-modal-body">
          <pre class="prompt-modal-text">{text}</pre>
        </div>
        <footer class="prompt-modal-actions">
          <CopyButton tab={tab} text={text} />
          <button type="button" class="btn-secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
