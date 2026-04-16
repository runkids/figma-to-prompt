import { useMemo } from 'preact/hooks';
import type { State } from '../state';
import { collectImageAssets, countNodes } from '../prompt';

declare const __APP_VERSION__: string;

interface Props {
  state: State;
}

type DotState = 'idle' | 'active' | 'loading' | 'error';

const DOT_COLORS: Record<DotState, string> = {
  idle: 'var(--muted-fg)',
  active: 'var(--quaternary)',
  loading: 'var(--tertiary)',
  error: 'var(--secondary)',
};

/** Derive status text + dot color directly from state. The original imperative
 *  code mutated a single status string with regex .replace() chains across
 *  multiple message handlers — declarative derivation eliminates that fragility. */
function deriveStatus(
  state: State,
  nodeCount: number,
  imageCount: number,
): { text: string; dot: DotState; loading: boolean } {
  if (!state.data) return { text: 'No selection', dot: 'idle', loading: false };

  const willExport = state.mode === 'merged' || imageCount > 0;
  const loadedCount = state.mergedImage ? 1 : Object.keys(state.images).length;
  const stillLoading = willExport && loadedCount === 0;

  let suffix = '';
  let dot: DotState = willExport ? 'loading' : 'active';

  if (willExport) {
    if (stillLoading) {
      suffix = state.mode === 'merged' ? ' · merged (loading…)' : ` · ${imageCount} images (loading…)`;
    } else if (state.mode === 'merged') {
      suffix = state.mergedImage ? ' · merged ✓' : ' · merged failed';
      dot = state.mergedImage ? 'active' : 'error';
    } else if (loadedCount > 0) {
      suffix = ` · ${loadedCount} images ✓`;
      dot = 'active';
    } else {
      suffix = ' · images failed';
      dot = 'error';
    }
  }

  return {
    text: `${state.data.name} · ${nodeCount} nodes${suffix}`,
    dot,
    loading: stillLoading,
  };
}

export function StatusBar({ state }: Props) {
  // Walk the tree once per selection — countNodes and collectImageAssets are both O(n).
  const { nodeCount, imageCount } = useMemo(
    () =>
      state.data
        ? { nodeCount: countNodes(state.data), imageCount: collectImageAssets(state.data).length }
        : { nodeCount: 0, imageCount: 0 },
    [state.data],
  );
  const { text, dot, loading } = deriveStatus(state, nodeCount, imageCount);
  return (
    <div class="status-bar" role="status" aria-live="polite">
      <span
        class={loading ? 'status-dot loading' : 'status-dot'}
        style={{ background: DOT_COLORS[dot] }}
      />
      <span>{text}</span>
      <span class="version-label">v{__APP_VERSION__}</span>
    </div>
  );
}
