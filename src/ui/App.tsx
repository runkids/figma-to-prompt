import { useCallback, useEffect, useMemo, useReducer, useState } from 'preact/hooks';
import { initialState, reducer } from './state';
import { buildPrompt, sanitizeFileName } from './prompt';
import { toSandboxFormat } from './transcode';
import { PROTOCOL_VERSION } from '../shared/types';
import { rasterPixelSize } from '../shared/rasterScale';
import type { ImageDataMessage, SandboxMessage, UIMessage } from '../shared/types';
import { ChildrenFilter } from './components/ChildrenFilter';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { CodePanel } from './components/CodePanel';
import { CopyButton } from './components/CopyButton';
import { ExportCard } from './components/ExportCard';
import { Banners } from './components/Banners';
import { StatusBar } from './components/StatusBar';
import { ButtonGroup } from './components/ButtonGroup';
import { HelpTip } from './components/HelpTip';
import { TextPreviewModal } from './components/PromptPreviewModal';
import type { PromptDetailLevel, PromptTemplate, UISerializedNode } from '../shared/types';

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
  const pixelSize = rasterPixelSize(payload, scale);
  canvas.width = pixelSize.width;
  canvas.height = pixelSize.height;
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

const PROMPT_DETAIL_OPTIONS: { value: PromptDetailLevel; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'full', label: 'Full' },
];

const PROMPT_TEMPLATE_OPTIONS: { value: PromptTemplate; label: string }[] = [
  { value: 'component', label: 'Component' },
  { value: 'pixel-perfect', label: 'Pixel Perfect' },
];

const DEPTH_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'all' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

function truncateToDepth(node: UISerializedNode, depth: number): UISerializedNode {
  if (!node.children) return node;
  if (depth <= 0) return { ...node, children: [] };
  return {
    ...node,
    children: node.children.map((c) => truncateToDepth(c, depth - 1)),
  };
}

function excludeChildren(
  node: UISerializedNode,
  excludedIds: Set<string>,
): UISerializedNode {
  if (!node.children || excludedIds.size === 0) return node;
  return {
    ...node,
    children: node.children.map((c) => {
      if (!excludedIds.has(c.id)) return c;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        layout: c.layout
          ? { ...c.layout, x: c.layout.x, y: c.layout.y }
          : undefined,
        children: [],
      } as UISerializedNode;
    }),
  };
}

function sendToSandbox(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isTextPreviewOpen, setTextPreviewOpen] = useState(false);

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
          dispatch({
            type: 'RAW_IMAGES_RECEIVED',
            images: msg.images,
            merged: null,
            sourceRasterEvidence: msg.sourceRasterEvidence,
          });
          void composeMergedTiles(msg.mergedTiles).then((dataUrl) => {
            if (cancelled) return;
            dispatch({
              type: 'RAW_IMAGES_RECEIVED',
              images: msg.images,
              merged: dataUrl,
              sourceRasterEvidence: msg.sourceRasterEvidence,
            });
          });
        } else {
          dispatch({
            type: 'RAW_IMAGES_RECEIVED',
            images: msg.images,
            merged: msg.merged ?? null,
            sourceRasterEvidence: msg.sourceRasterEvidence,
          });
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

  const displayData = useMemo(() => {
    if (!state.data) return state.data;
    let tree = state.data;
    if (state.excludedChildIds.size > 0) {
      tree = excludeChildren(tree, state.excludedChildIds);
    }
    if (state.extractDepth !== null) {
      tree = truncateToDepth(tree, state.extractDepth);
    }
    return tree;
  }, [state.data, state.excludedChildIds, state.extractDepth]);

  // Lazy-derive the active tab's text so rapid frame switching only pays for
  // whichever view is visible. Previously the reducer computed JSON.stringify
  // AND buildPrompt on every SELECTION_RECEIVED, thrashing the main thread.
  // useMemo caches across re-renders that don't touch these deps (e.g. image
  // arrivals, export-setting toggles).
  const text = useMemo(() => {
    if (!displayData) return '';
    if (state.tab === 'json') return JSON.stringify(displayData, null, 2);
    const merged = state.mode === 'merged' && displayData.layout
      ? {
          name: state.mergedImageName.trim() || sanitizeFileName(displayData.name),
          width: Math.round(displayData.layout.width),
          height: Math.round(displayData.layout.height),
        }
      : undefined;
    return buildPrompt(displayData, {
      imageNameOverrides: state.nameOverrides,
      mockImagePaths: state.mockImagePaths,
      merged,
      perSelection: state.mode === 'per-selection',
      promptTemplate: state.promptTemplate,
      promptDetail: state.promptDetail,
    });
  }, [
    state.tab,
    displayData,
    state.mode,
    state.nameOverrides,
    state.mockImagePaths,
    state.mergedImageName,
    state.promptTemplate,
    state.promptDetail,
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
        {state.tab === 'prompt' && state.data && (
          <div class="prompt-options">
            <div class="prompt-option">
              <span class="label-row">
                <span class="quality-label">Template</span>
                <HelpTip
                  label="Prompt template help"
                  text="Component creates a maintainable frontend component. Pixel Perfect creates a stricter prompt for visual matching with reference images, mock paths, and screenshot comparison."
                />
              </span>
              <ButtonGroup
                ariaLabel="Prompt template"
                variant="segmented"
                options={PROMPT_TEMPLATE_OPTIONS}
                value={state.promptTemplate}
                onChange={(promptTemplate) => dispatch({ type: 'PROMPT_TEMPLATE_CHANGED', promptTemplate })}
              />
            </div>
            <div class="prompt-option">
              <span class="quality-label">Detail</span>
              <ButtonGroup
                ariaLabel="Prompt detail"
                variant="chip"
                options={PROMPT_DETAIL_OPTIONS}
                value={state.promptDetail}
                onChange={(promptDetail) => dispatch({ type: 'PROMPT_DETAIL_CHANGED', promptDetail })}
              />
            </div>
          </div>
        )}
        {state.data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span class="quality-label">Depth</span>
            <ButtonGroup
              ariaLabel="Extraction depth"
              variant="chip"
              options={DEPTH_OPTIONS}
              value={state.extractDepth === null ? '' : String(state.extractDepth)}
              onChange={(v) => dispatch({ type: 'EXTRACT_DEPTH_CHANGED', extractDepth: v === '' ? null : Number(v) })}
            />
          </div>
        )}
        {state.data?.children && state.data.children.length > 0 && (
          <ChildrenFilter
            children={state.data.children}
            excludedIds={state.excludedChildIds}
            onToggle={(id) => dispatch({ type: 'CHILD_EXCLUSION_TOGGLED', id })}
            onToggleAll={(exclude) => dispatch({ type: 'CHILD_EXCLUSION_ALL', exclude })}
          />
        )}
        <div class={`copy-actions${state.data ? '' : ' copy-actions--single'}`}>
          {state.data && (
            <button
              type="button"
              class="btn-secondary"
              disabled={!text}
              onClick={() => setTextPreviewOpen(true)}
            >
              {state.tab === 'json' ? 'Preview JSON' : 'Preview Prompt'}
            </button>
          )}
          <CopyButton tab={state.tab} text={text} />
        </div>
        <ExportCard state={state} dispatch={dispatch} />
      </div>
      <Banners protocolMismatch={state.protocolMismatch} />
      <StatusBar state={state} />
      {isTextPreviewOpen && (
        <TextPreviewModal
          tab={state.tab}
          text={text}
          onClose={() => setTextPreviewOpen(false)}
        />
      )}
    </>
  );
}
