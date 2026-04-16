import { useEffect, useReducer } from 'preact/hooks';
import { initialState, reducer } from './state';
import { PROTOCOL_VERSION } from '../shared/types';
import type { SandboxMessage, UIMessage } from '../shared/types';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { CodePanel } from './components/CodePanel';
import { CopyButton } from './components/CopyButton';
import { ExportCard } from './components/ExportCard';
import { Banners } from './components/Banners';
import { StatusBar } from './components/StatusBar';

declare const __APP_VERSION__: string;

const REPO = 'runkids/figma-to-prompt';

function sendToSandbox(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
  }
  return 0;
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Sandbox → UI message bridge
  useEffect(() => {
    function handler(event: MessageEvent) {
      const msg = event.data?.pluginMessage as SandboxMessage | undefined;
      if (!msg) return;
      if (msg.type === 'export-result' && msg.protocolVersion !== PROTOCOL_VERSION) {
        dispatch({ type: 'PROTOCOL_MISMATCH' });
      }
      if (msg.type === 'selection-empty') {
        dispatch({ type: 'SELECTION_EMPTY' });
      } else if (msg.type === 'export-result') {
        dispatch({ type: 'SELECTION_RECEIVED', data: msg.data });
      } else if (msg.type === 'image-data') {
        dispatch({ type: 'IMAGES_RECEIVED', images: msg.images, merged: msg.merged });
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Re-export images whenever reducer bumps the request id (mode/scale/format
  // change, or selection received in merged mode). exportRequestId === 0 means
  // sandbox already auto-exported per-image on selection, no UI request needed.
  useEffect(() => {
    if (state.exportRequestId === 0 || !state.data) return;
    sendToSandbox({
      type: 'export-images',
      scale: state.scale,
      format: state.format,
      mode: state.mode,
    });
  }, [state.exportRequestId]);

  // Best-effort GitHub release check; fully silent on failure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const latest = (data.tag_name as string).replace(/^v/, '');
        if (compareVersions(__APP_VERSION__, latest) < 0 && !cancelled) {
          dispatch({ type: 'UPDATE_AVAILABLE', version: latest, url: data.html_url as string });
        }
      } catch {
        // offline / rate-limited
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Header />
      <TabBar tab={state.tab} onChange={(t) => dispatch({ type: 'TAB_CHANGED', tab: t })} />
      <CodePanel
        tab={state.tab}
        json={state.json}
        promptText={state.promptText}
        hasData={!!state.data}
      />
      <div class="actions-bar">
        <CopyButton tab={state.tab} json={state.json} promptText={state.promptText} />
        <ExportCard state={state} dispatch={dispatch} />
      </div>
      <Banners protocolMismatch={state.protocolMismatch} updateAvailable={state.updateAvailable} />
      <StatusBar state={state} />
    </>
  );
}
