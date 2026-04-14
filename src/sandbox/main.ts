import { extractNode } from './extractor';
import { normalizeNode } from './normalizer';
import type { SandboxMessage, UISerializedNode, UIMessage } from '../shared/types';

figma.showUI(__html__, { width: 480, height: 560 });

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

async function exportImages(
  node: UISerializedNode,
  scale: number,
  format: 'PNG' | 'JPG' | 'SVG',
  exportId: number,
): Promise<void> {
  const imageNodes = collectImageNodes(node);
  if (imageNodes.length === 0) return;

  const images: Record<string, string> = {};

  // Figma's SVG export has a known bug with IMAGE fills — the <image> transform
  // is miscalculated, causing overflow/sizing issues. For nodes with IMAGE fills,
  // always use getImageByHash (original raster) regardless of format selection.
  // SVG format only works correctly for pure vector nodes.
  const useOriginal = scale === 0 || format === 'SVG';

  if (useOriginal) {
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
    const mime = format === 'JPG' ? 'image/jpeg' : 'image/png';
    for (const img of imageNodes) {
      if (exportId !== currentExportId) return;
      try {
        const sceneNode = figma.getNodeById(img.id);
        if (!sceneNode || !('exportAsync' in sceneNode)) continue;
        const exportable = sceneNode as SceneNode;
        const bytes = await exportable.exportAsync({
          format: format as 'PNG' | 'JPG',
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

  const node = selection[0];
  const extracted = extractNode(node);

  if (!extracted) {
    lastNormalized = null;
    const msg: SandboxMessage = { type: 'selection-empty' };
    figma.ui.postMessage(msg);
    return;
  }

  const normalized = normalizeNode(extracted);
  lastNormalized = normalized;

  const msg: SandboxMessage = {
    type: 'export-result',
    data: normalized,
    meta: { nodeCount: countNodes(normalized) },
  };
  figma.ui.postMessage(msg);

  // Auto-export images at original quality (scale=0 → getImageByHash)
  exportImages(normalized, 0, 'PNG', exportId);
}

// ── Message Listeners ────────────────────────────────────

// UI → Sandbox: handle scale/format change requests
figma.ui.onmessage = (msg: UIMessage) => {
  if (msg.type === 'export-images' && lastNormalized) {
    const exportId = ++currentExportId;
    exportImages(lastNormalized, msg.scale, msg.format, exportId);
  }
};

// Run on launch
handleSelection();

// Re-run when selection changes
figma.on('selectionchange', handleSelection);
