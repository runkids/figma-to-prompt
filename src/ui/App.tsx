import { useEffect, useMemo, useReducer } from 'preact/hooks';
import { initialState, reducer } from './state';
import { buildPrompt, sanitizeFileName } from './prompt';
import { toSandboxFormat } from './transcode';
import { PROTOCOL_VERSION } from '../shared/types';
import type { ImageDataMessage, SandboxMessage, UIMessage } from '../shared/types';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { CodePanel } from './components/CodePanel';
import { CopyButton } from './components/CopyButton';
import { ExportCard } from './components/ExportCard';
import { Banners } from './components/Banners';
import { StatusBar } from './components/StatusBar';

type MergedTilesPayload = NonNullable<ImageDataMessage['mergedTiles']>;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Compose per-node tiles into a single data URL. Sandbox can't do this (no canvas),
 *  so the UI runs it whenever the sandbox ships `mergedTiles` for a multi-selection. */
async function composeMergedTiles(payload: MergedTilesPayload): Promise<string | null> {
  if (payload.tiles.length === 0) return null;

  if (payload.format === 'SVG') {
    // Nested <svg> elements support x/y/width/height positioning. Best-effort for
    // complex assets (shared defs/IDs across tiles may conflict — users needing
    // pixel-perfect SVG should stick to per-image SVG export).
    const parts: string[] = [];
    for (const t of payload.tiles) {
      const base64 = t.dataUrl.split(',')[1] ?? '';
      let raw: string;
      try { raw = atob(base64); } catch { continue; }
      const body = raw.replace(/<\?xml[^>]*\?>/g, '').trim();
      const positioned = body.replace(
        /^<svg\b([^>]*)>/,
        `<svg$1 x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}">`,
      );
      parts.push(positioned);
    }
    if (parts.length === 0) return null;
    const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${payload.width}" height="${payload.height}" viewBox="0 0 ${payload.width} ${payload.height}">${parts.join('')}</svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(full)))}`;
  }

  const scale = payload.scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(payload.width * scale));
  canvas.height = Math.max(1, Math.round(payload.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  for (const t of payload.tiles) {
    const img = await loadImage(t.dataUrl);
    if (!img) continue;
    ctx.drawImage(img, t.x * scale, t.y * scale, t.width * scale, t.height * scale);
  }

  const mime = payload.format === 'JPG' ? 'image/jpeg' : 'image/png';
  return canvas.toDataURL(mime);
}

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
    let cancelled = false;

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
        // Sandbox delivers preview/source pixels (always PNG / SVG). Download
        // encoding happens lazily in ExportCard so quality slider drags never
        // block preview rendering.
        if (msg.mergedTiles) {
          // Async composite — publish raw without the merged yet so the status
          // bar can show "loading", then fill in once the canvas finishes.
          dispatch({ type: 'RAW_IMAGES_RECEIVED', images: msg.images, merged: null });
          void composeMergedTiles(msg.mergedTiles).then((dataUrl) => {
            if (cancelled) return;
            dispatch({ type: 'RAW_IMAGES_RECEIVED', images: msg.images, merged: dataUrl });
          });
        } else {
          dispatch({ type: 'RAW_IMAGES_RECEIVED', images: msg.images, merged: msg.merged ?? null });
        }
      }
    }
    window.addEventListener('message', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('message', handler);
    };
  }, []);

  // Re-export source pixels whenever reducer bumps the request id (mode/scale
  // change, or selection received in merged mode, or SVG ↔ raster switch).
  // Raster output-format swaps reuse the existing PNG preview/source and defer
  // actual JPG/WebP/AVIF encoding until Download.
  useEffect(() => {
    if (state.exportRequestId === 0 || !state.data) return;
    sendToSandbox({
      type: 'export-images',
      scale: state.scale,
      format: toSandboxFormat(state.format),
      mode: state.mode,
    });
  }, [state.exportRequestId]);

  // Preview pipeline: mirror sandbox source pixels into the UI preview. This
  // intentionally does not depend on format or quality; lossy encoding can be
  // expensive (especially AVIF WASM) and only matters for the downloaded file.
  useEffect(() => {
    const hasRaw =
      Object.keys(state.rawImages).length > 0 || state.rawMerged != null;
    if (!hasRaw) {
      // Empty raw → empty final. Keeps the two sides in sync when a selection
      // clears or swaps before new data arrives.
      dispatch({ type: 'IMAGES_RECEIVED', images: {}, merged: null });
      return;
    }

    dispatch({
      type: 'IMAGES_RECEIVED',
      images: state.rawImages,
      merged: state.rawMerged,
    });
  }, [state.rawImages, state.rawMerged]);

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

  // Lazy-derive the active tab's text so rapid frame switching only pays for
  // whichever view is visible. Previously the reducer computed JSON.stringify
  // AND buildPrompt on every SELECTION_RECEIVED, thrashing the main thread.
  // useMemo caches across re-renders that don't touch these deps (e.g. image
  // arrivals, export-setting toggles).
  const text = useMemo(() => {
    if (!state.data) return '';
    if (state.tab === 'json') return JSON.stringify(state.data, null, 2);
    const merged = state.mode === 'merged' && state.data.layout
      ? {
          name: state.mergedImageName.trim() || sanitizeFileName(state.data.name),
          width: Math.round(state.data.layout.width),
          height: Math.round(state.data.layout.height),
        }
      : undefined;
    return buildPrompt(state.data, {
      imageNameOverrides: state.nameOverrides,
      merged,
    });
  }, [
    state.tab,
    state.data,
    state.mode,
    state.nameOverrides,
    state.mergedImageName,
  ]);

  return (
    <>
      <Header />
      <TabBar tab={state.tab} onChange={(t) => dispatch({ type: 'TAB_CHANGED', tab: t })} />
      <CodePanel
        tab={state.tab}
        text={text}
        hasData={!!state.data}
      />
      <div class="actions-bar">
        <CopyButton tab={state.tab} text={text} />
        <ExportCard state={state} dispatch={dispatch} />
      </div>
      <Banners protocolMismatch={state.protocolMismatch} updateAvailable={state.updateAvailable} />
      <StatusBar state={state} />
    </>
  );
}
