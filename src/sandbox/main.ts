import { extractNode } from './extractor';
import { normalizeNode } from './normalizer';
import { PROTOCOL_VERSION } from '../shared/types';
import type { SandboxMessage, UISerializedNode, UIMessage, UILayout } from '../shared/types';

figma.showUI(__html__, { width: 480, height: 560 });

/** Marker id for a synthetic multi-selection root. The UI treats it as a
 *  regular node; the sandbox recognizes it in export flows since no real
 *  Figma node has this id. */
const SYNTHETIC_MULTI_ID = '__multi_selection__';

function countNodes(n: Record<string, unknown>): number {
  let count = 1;
  const children = n.children as Record<string, unknown>[] | undefined;
  if (children) {
    for (const child of children) {
      count += countNodes(child);
    }
  }
  return count;
}

interface AbsBBox { x: number; y: number; width: number; height: number }

/** Compute the axis-aligned bounding box of a set of nodes in page-absolute coords. */
function selectionBBox(selection: ReadonlyArray<SceneNode>): AbsBBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;
  for (const n of selection) {
    const bb = (n as { absoluteBoundingBox?: AbsBBox }).absoluteBoundingBox;
    if (!bb) continue;
    found = true;
    if (bb.x < minX) minX = bb.x;
    if (bb.y < minY) minY = bb.y;
    if (bb.x + bb.width > maxX) maxX = bb.x + bb.width;
    if (bb.y + bb.height > maxY) maxY = bb.y + bb.height;
  }
  return found ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

/** Build a synthetic FRAME root that wraps the multi-selection so the rest of
 *  the pipeline (image-fill collection, JSON/prompt emission, per-image export)
 *  can treat it as a single tree. Children are repositioned relative to the
 *  bbox origin so the prompt JSON composes correctly. */
function buildMultiSelectionRoot(selection: ReadonlyArray<SceneNode>): UISerializedNode | null {
  const bbox = selectionBBox(selection);
  if (!bbox) return null;

  const children: UISerializedNode[] = [];
  for (const n of selection) {
    const extracted = extractNode(n);
    if (!extracted) continue;
    const bb = (n as { absoluteBoundingBox?: AbsBBox }).absoluteBoundingBox;
    const baseLayout: UILayout = extracted.layout ?? { width: bb?.width ?? 0, height: bb?.height ?? 0 };
    const layout: UILayout = bb
      ? { ...baseLayout, x: bb.x - bbox.x, y: bb.y - bbox.y }
      : baseLayout;
    children.push({ ...extracted, layout });
  }
  if (children.length === 0) return null;

  return {
    id: SYNTHETIC_MULTI_ID,
    name: `Selection (${children.length} items)`,
    type: 'FRAME',
    layout: { width: bbox.width, height: bbox.height, mode: 'none' },
    children,
  };
}

// ── Image Export ─────────────────────────────────────────

let currentExportId = 0;
let lastNormalized: UISerializedNode | null = null;

interface ImageNode { id: string; hash: string }

/** Collect nodes that have image fills (deduplicated by hash) */
function collectImageNodes(node: UISerializedNode): ImageNode[] {
  const nodes: ImageNode[] = [];
  const seen = new Set<string>();
  function walk(n: UISerializedNode): void {
    if (n.visible === false) return;
    if (n.style?.imageFillHash && !seen.has(n.style.imageFillHash)) {
      seen.add(n.style.imageFillHash);
      nodes.push({ id: n.id, hash: n.style.imageFillHash });
    }
    n.children?.forEach(walk);
  }
  walk(node);
  return nodes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? chars[b3 & 63] : '=';
  }
  return result;
}

/** Render the whole selection as one composite image (same as Figma's native Export) */
async function exportMerged(
  rootId: string,
  scale: number,
  format: 'PNG' | 'JPG' | 'SVG',
  exportId: number,
): Promise<void> {
  // Multi-selection: sandbox has no canvas, so render each top-level selection
  // and let the UI composite via <canvas>. Falls through to the single-node path
  // only when the synthetic root is somehow present without a live multi-selection.
  if (rootId === SYNTHETIC_MULTI_ID) {
    await exportMergedMulti(scale, format, exportId);
    return;
  }

  const sceneNode = figma.getNodeById(rootId);
  if (!sceneNode || !('exportAsync' in sceneNode)) {
    // Don't leave the UI stuck on "loading…"
    if (exportId !== currentExportId) return;
    figma.ui.postMessage({ type: 'image-data', images: {} } satisfies SandboxMessage);
    return;
  }

  // scale=0 is "original raster via getImageByHash" — meaningless for a merged render.
  // Fall back to 1x so the merged mode always renders at a sensible size.
  const effectiveScale = scale === 0 ? 1 : scale;

  try {
    const bytes = await (sceneNode as SceneNode).exportAsync({
      format,
      constraint: { type: 'SCALE' as const, value: effectiveScale },
    });
    if (exportId !== currentExportId) return;
    const mime = format === 'JPG'
      ? 'image/jpeg'
      : format === 'SVG'
        ? 'image/svg+xml'
        : 'image/png';
    const dataUrl = `data:${mime};base64,${uint8ArrayToBase64(bytes)}`;
    const msg: SandboxMessage = { type: 'image-data', images: {}, merged: dataUrl };
    figma.ui.postMessage(msg);
  } catch {
    if (exportId !== currentExportId) return;
    const msg: SandboxMessage = { type: 'image-data', images: {} };
    figma.ui.postMessage(msg);
  }
}

/** Multi-selection merged export: render each top-level selected node individually,
 *  ship the tiles plus bbox to the UI, which does the actual compositing. */
async function exportMergedMulti(
  scale: number,
  format: 'PNG' | 'JPG' | 'SVG',
  exportId: number,
): Promise<void> {
  const selection = figma.currentPage.selection;
  const bbox = selectionBBox(selection);
  if (!bbox || selection.length === 0) {
    if (exportId !== currentExportId) return;
    figma.ui.postMessage({ type: 'image-data', images: {} } satisfies SandboxMessage);
    return;
  }

  const effectiveScale = scale === 0 ? 1 : scale;
  const mime = format === 'JPG' ? 'image/jpeg' : format === 'SVG' ? 'image/svg+xml' : 'image/png';
  const tiles: Array<{ dataUrl: string; x: number; y: number; width: number; height: number }> = [];

  for (const node of selection) {
    if (exportId !== currentExportId) return;
    if (!('exportAsync' in node)) continue;
    const bb = (node as { absoluteBoundingBox?: AbsBBox }).absoluteBoundingBox;
    if (!bb) continue;
    try {
      const bytes = await (node as SceneNode).exportAsync({
        format,
        constraint: { type: 'SCALE' as const, value: effectiveScale },
      });
      tiles.push({
        dataUrl: `data:${mime};base64,${uint8ArrayToBase64(bytes)}`,
        x: bb.x - bbox.x,
        y: bb.y - bbox.y,
        width: bb.width,
        height: bb.height,
      });
    } catch { /* skip this tile */ }
  }

  if (exportId !== currentExportId) return;
  const msg: SandboxMessage = {
    type: 'image-data',
    images: {},
    mergedTiles: {
      tiles,
      width: bbox.width,
      height: bbox.height,
      format,
      scale: effectiveScale,
    },
  };
  figma.ui.postMessage(msg);
}

async function exportImages(
  node: UISerializedNode,
  scale: number,
  format: 'PNG' | 'JPG' | 'SVG',
  exportId: number,
): Promise<void> {
  const imageNodes = collectImageNodes(node);
  if (imageNodes.length === 0) return;

  const images: Record<string, string> = {};

  // scale=0 ("Original") means: bypass exportAsync and return the uploaded raster
  // via getImageByHash — this is always PNG by definition. The UI reconciles JPG/SVG
  // away from scale=0 so this branch only runs for PNG+Original.
  // Note: SVG export for nodes with IMAGE fills may have a <image> transform bug
  // upstream in Figma; we honor the user's format choice rather than silently
  // downgrading to PNG.
  if (scale === 0) {
    // Original quality: getImageByHash returns the uploaded raster at full resolution
    for (const img of imageNodes) {
      if (exportId !== currentExportId) return;
      try {
        const image = figma.getImageByHash(img.hash);
        if (image) {
          const bytes = await image.getBytesAsync();
          images[img.id] = `data:image/png;base64,${uint8ArrayToBase64(bytes)}`;
        }
      } catch { /* skip */ }
    }
  } else {
    // Render at scale: exportAsync produces the node as-rendered at chosen size
    const mime = format === 'JPG' ? 'image/jpeg' : format === 'SVG' ? 'image/svg+xml' : 'image/png';
    for (const img of imageNodes) {
      if (exportId !== currentExportId) return;
      try {
        const sceneNode = figma.getNodeById(img.id);
        if (!sceneNode || !('exportAsync' in sceneNode)) continue;
        const exportable = sceneNode as SceneNode;
        const bytes = await exportable.exportAsync({
          format,
          constraint: { type: 'SCALE' as const, value: scale },
        });
        images[img.id] = `data:${mime};base64,${uint8ArrayToBase64(bytes)}`;
      } catch { /* skip */ }
    }
  }

  if (exportId !== currentExportId) return;
  const msg: SandboxMessage = { type: 'image-data', images };
  figma.ui.postMessage(msg);
}

// ── Selection Handler ────────────────────────────────────

function handleSelection(): void {
  const exportId = ++currentExportId;
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    lastNormalized = null;
    const msg: SandboxMessage = { type: 'selection-empty' };
    figma.ui.postMessage(msg);
    return;
  }

  // Single vs multi: single selection flows through the original path (preserves
  // exact prior behavior — names, absolute positions, etc. stay unchanged).
  // Multi-selection gets wrapped in a synthetic FRAME so recursive walkers
  // (collectImageNodes, collectImageAssets, etc.) naturally see every fill.
  let normalized: UISerializedNode | null;
  if (selection.length === 1) {
    const extracted = extractNode(selection[0]);
    normalized = extracted ? normalizeNode(extracted) : null;
  } else {
    const root = buildMultiSelectionRoot(selection);
    normalized = root ? normalizeNode(root) : null;
  }

  if (!normalized) {
    lastNormalized = null;
    const msg: SandboxMessage = { type: 'selection-empty' };
    figma.ui.postMessage(msg);
    return;
  }

  lastNormalized = normalized;

  const msg: SandboxMessage = {
    type: 'export-result',
    protocolVersion: PROTOCOL_VERSION,
    data: normalized,
    meta: { nodeCount: countNodes(normalized as unknown as Record<string, unknown>) },
  };
  figma.ui.postMessage(msg);

  // Auto-export images at original quality (scale=0 → getImageByHash)
  exportImages(normalized, 0, 'PNG', exportId);
}

// ── Message Listeners ────────────────────────────────────

// UI → Sandbox: handle scale/format/mode change requests
figma.ui.onmessage = (msg: UIMessage) => {
  if (msg.type === 'export-images' && lastNormalized) {
    const exportId = ++currentExportId;
    if (msg.mode === 'merged') {
      exportMerged(lastNormalized.id, msg.scale, msg.format, exportId);
    } else {
      exportImages(lastNormalized, msg.scale, msg.format, exportId);
    }
  }
};

// Run on launch
handleSelection();

// Re-run when selection changes
figma.on('selectionchange', handleSelection);
