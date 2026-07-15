import { extractNode } from './extractor';
import { normalizeNode } from './normalizer';
import { PROTOCOL_VERSION } from '../shared/types';
import { getImageAssetKey, hasRenderSpecificImagePaint } from '../shared/imageAssets';
import { collectRenderedFallbackCandidates } from '../shared/fidelity';
import { detectEncodedImageMediaType } from '../shared/imageBytes';
import { buildFigmaNodeUrl } from '../shared/figmaLocator';
import { mapWithConcurrency } from '../shared/asyncPool';
import { effectiveSourceRasterDensity, MIN_SHARP_RASTER_SCALE, renderSpecificRasterScale, sourceAwareAssetRasterScale } from '../shared/rasterScale';
import type { CaptureReferenceDataMessage, ImageSourceRasterEvidence, SandboxMessage, UISerializedNode, UIMessage, UILayout, UITransform } from '../shared/types';

figma.showUI(__html__, { width: 480, height: 560 });

const CAPTURE_EXPORT_CONCURRENCY = 4;
const FALLBACK_NODE_CONCURRENCY = 2;

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

interface ImageNode {
  id: string;
  hash: string;
  renderAtOriginalScale: boolean;
  scaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  transform?: UITransform;
  scalingFactor?: number;
  rotation?: number;
  width: number;
  height: number;
}

/** Collect nodes that have image fills, deduped by rendered appearance. */
function collectImageNodes(node: UISerializedNode): ImageNode[] {
  const entries: Array<{
    id: string;
    hash: string;
    key: string;
    renderSpecific: boolean;
    scaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
    transform?: UITransform;
    scalingFactor?: number;
    rotation?: number;
    width: number;
    height: number;
  }> = [];
  const seenKeys = new Set<string>();
  function walk(n: UISerializedNode): void {
    if (n.visible === false) return;
    const key = getImageAssetKey(n);
    if (n.style?.imageFillHash && key && !seenKeys.has(key)) {
      seenKeys.add(key);
      entries.push({
        id: n.id,
        hash: n.style.imageFillHash,
        key,
        renderSpecific: hasRenderSpecificImagePaint(n),
        scaleMode: n.style.imageFillScaleMode,
        transform: n.style.imageFillTransform,
        scalingFactor: n.style.imageFillScalingFactor,
        rotation: n.style.imageFillRotation,
        width: n.layout?.width ?? 0,
        height: n.layout?.height ?? 0,
      });
    }
    n.children?.forEach(walk);
  }
  walk(node);

  const keysByHash = new Map<string, Set<string>>();
  for (const entry of entries) {
    const keys = keysByHash.get(entry.hash) ?? new Set<string>();
    keys.add(entry.key);
    keysByHash.set(entry.hash, keys);
  }

  return entries.map((entry) => ({
    id: entry.id,
    hash: entry.hash,
    renderAtOriginalScale: entry.renderSpecific || (keysByHash.get(entry.hash)?.size ?? 0) > 1,
    scaleMode: entry.scaleMode,
    transform: entry.transform,
    scalingFactor: entry.scalingFactor,
    rotation: entry.rotation,
    width: entry.width,
    height: entry.height,
  }));
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

async function measureSourceRasterEvidence(
  imageNodes: ImageNode[],
): Promise<Record<string, ImageSourceRasterEvidence>> {
  const entries = await mapWithConcurrency(
    imageNodes,
    CAPTURE_EXPORT_CONCURRENCY,
    async (imageNode): Promise<[string, ImageSourceRasterEvidence]> => {
      const sceneNode = figma.getNodeById(imageNode.id);
      const renderedWidth = sceneNode && 'width' in sceneNode
        ? (sceneNode as SceneNode).width
        : imageNode.width;
      const renderedHeight = sceneNode && 'height' in sceneNode
        ? (sceneNode as SceneNode).height
        : imageNode.height;
      try {
        const image = figma.getImageByHash(imageNode.hash);
        const sourceSize = image ? await image.getSizeAsync() : null;
        const density = effectiveSourceRasterDensity(sourceSize, {
          width: renderedWidth,
          height: renderedHeight,
        }, {
          scaleMode: imageNode.scaleMode,
          transform: imageNode.transform,
          scalingFactor: imageNode.scalingFactor,
          rotation: imageNode.rotation,
        });
        return [imageNode.id, {
          verified: density !== null,
          ...density,
          ...(sourceSize ? { sourceWidth: sourceSize.width, sourceHeight: sourceSize.height } : {}),
          renderedWidth,
          renderedHeight,
        }];
      } catch {
        return [imageNode.id, { verified: false, renderedWidth, renderedHeight }];
      }
    },
  );
  return Object.fromEntries(entries);
}

/** Render the whole selection as one composite image (same as Figma's native Export) */
async function exportMerged(
  root: UISerializedNode,
  scale: number,
  format: 'PNG' | 'JPG' | 'SVG',
  exportId: number,
): Promise<void> {
  const sourceRasterEvidence = format === 'SVG'
    ? {}
    : await measureSourceRasterEvidence(collectImageNodes(root));
  // Multi-selection: sandbox has no canvas, so render each top-level selection
  // and let the UI composite via <canvas>. Falls through to the single-node path
  // only when the synthetic root is somehow present without a live multi-selection.
  if (root.id === SYNTHETIC_MULTI_ID) {
    await exportMergedMulti(scale, format, exportId, sourceRasterEvidence);
    return;
  }

  const sceneNode = figma.getNodeById(root.id);
  if (!sceneNode || !('exportAsync' in sceneNode)) {
    // Don't leave the UI stuck on "loading…"
    if (exportId !== currentExportId) return;
    figma.ui.postMessage({ type: 'image-data', images: {} } satisfies SandboxMessage);
    return;
  }

  // Orig is meaningless for a merged render. Preserve the sharp default if a
  // stale request reaches this defensive path during a mode transition.
  const effectiveScale = scale === 0 ? MIN_SHARP_RASTER_SCALE : scale;

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
    const msg: SandboxMessage = {
      type: 'image-data',
      images: {},
      merged: dataUrl,
      ...(Object.keys(sourceRasterEvidence).length > 0 ? { sourceRasterEvidence } : {}),
    };
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
  sourceRasterEvidence: Record<string, ImageSourceRasterEvidence>,
): Promise<void> {
  const selection = figma.currentPage.selection;
  const bbox = selectionBBox(selection);
  if (!bbox || selection.length === 0) {
    if (exportId !== currentExportId) return;
    figma.ui.postMessage({ type: 'image-data', images: {} } satisfies SandboxMessage);
    return;
  }

  const effectiveScale = scale === 0 ? MIN_SHARP_RASTER_SCALE : scale;
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
    ...(Object.keys(sourceRasterEvidence).length > 0 ? { sourceRasterEvidence } : {}),
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
  const sourceRasterEvidence = format === 'SVG'
    ? {}
    : await measureSourceRasterEvidence(
        scale === 0 ? imageNodes.filter((image) => image.renderAtOriginalScale) : imageNodes,
      );

  // scale=0 ("Original") returns uploaded raster bytes via getImageByHash when
  // possible. Paint-specific crop/filter/transform variants must use exportAsync.
  // Note: SVG export for nodes with IMAGE fills may have a <image> transform bug
  // upstream in Figma; we honor the user's format choice rather than silently
  // downgrading to PNG.
  if (scale === 0) {
    // Original quality: getImageByHash returns the uploaded raster at full resolution.
    // If the same hash appears with different rendered paint metadata, export the
    // node instead so crop/filter/opacity variants do not collapse to one file.
    for (const img of imageNodes) {
      if (exportId !== currentExportId) return;
      try {
        if (img.renderAtOriginalScale) {
          const sceneNode = figma.getNodeById(img.id);
          if (!sceneNode || !('exportAsync' in sceneNode)) continue;
          const exportable = sceneNode as SceneNode;
          const measured = sourceRasterEvidence[img.id];
          const sourceSize = measured?.sourceWidth && measured.sourceHeight
            ? { width: measured.sourceWidth, height: measured.sourceHeight }
            : null;
          const effectiveScale = renderSpecificRasterScale(sourceSize, {
            width: exportable.width,
            height: exportable.height,
          }, measured?.density);
          const bytes = await exportable.exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE' as const, value: effectiveScale },
          });
          images[img.id] = `data:image/png;base64,${uint8ArrayToBase64(bytes)}`;
          continue;
        }

        const image = figma.getImageByHash(img.hash);
        if (image) {
          const bytes = await image.getBytesAsync();
          const mediaType = detectEncodedImageMediaType(bytes);
          if (mediaType) {
            images[img.id] = `data:${mediaType};base64,${uint8ArrayToBase64(bytes)}`;
          }
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
  const msg: SandboxMessage = {
    type: 'image-data',
    images,
    ...(Object.keys(sourceRasterEvidence).length > 0 ? { sourceRasterEvidence } : {}),
  };
  figma.ui.postMessage(msg);
}

/** Per-selection export: render each top-level selected node as its own image.
 *  Unlike per-image (which digs into the tree for image-fill nodes), this treats
 *  every selection entry as an opaque renderable unit. */
async function exportPerSelection(
  scale: number,
  format: 'PNG' | 'JPG' | 'SVG',
  exportId: number,
): Promise<void> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return;

  const effectiveScale = scale === 0 ? MIN_SHARP_RASTER_SCALE : scale;
  const mime = format === 'JPG' ? 'image/jpeg' : format === 'SVG' ? 'image/svg+xml' : 'image/png';
  const images: Record<string, string> = {};
  const sourceRasterEvidence = format === 'SVG' || !lastNormalized
    ? {}
    : await measureSourceRasterEvidence(collectImageNodes(lastNormalized));

  for (const node of selection) {
    if (exportId !== currentExportId) return;
    if (!('exportAsync' in node)) continue;
    try {
      const bytes = await (node as SceneNode).exportAsync({
        format,
        constraint: { type: 'SCALE' as const, value: effectiveScale },
      });
      images[node.id] = `data:${mime};base64,${uint8ArrayToBase64(bytes)}`;
    } catch { /* skip */ }
  }

  if (exportId !== currentExportId) return;
  const msg: SandboxMessage = {
    type: 'image-data',
    images,
    ...(Object.keys(sourceRasterEvidence).length > 0 ? { sourceRasterEvidence } : {}),
  };
  figma.ui.postMessage(msg);
}

function topLevelNodeIds(root: UISerializedNode): string[] {
  return root.id === SYNTHETIC_MULTI_ID
    ? (root.children ?? []).map((child) => child.id)
    : [root.id];
}

async function exportNodePng(nodeId: string, scale = 1): Promise<string | null> {
  const node = figma.getNodeById(nodeId);
  if (!node || !('exportAsync' in node)) return null;
  try {
    const bytes = await (node as SceneNode).exportAsync({
      format: 'PNG',
      contentsOnly: true,
      constraint: { type: 'SCALE', value: scale },
      colorProfile: 'DOCUMENT',
    });
    return `data:image/png;base64,${uint8ArrayToBase64(bytes)}`;
  } catch {
    return null;
  }
}

async function exportNodeSvgFallback(nodeId: string): Promise<string | null> {
  const node = figma.getNodeById(nodeId);
  if (!node || !('exportAsync' in node)) return null;
  try {
    const bytes = await (node as SceneNode).exportAsync({
      format: 'SVG',
      contentsOnly: true,
      svgOutlineText: true,
      svgSimplifyStroke: false,
      svgIdAttribute: false,
      colorProfile: 'DOCUMENT',
    });
    return `data:image/svg+xml;base64,${uint8ArrayToBase64(bytes)}`;
  } catch {
    return null;
  }
}

async function exportCapture(
  request: Extract<UIMessage, { type: 'export-capture' }>,
): Promise<void> {
  const warnings: string[] = [];
  const actualNodeIds = lastNormalized ? topLevelNodeIds(lastNormalized) : [];
  const selectionMatches =
    lastNormalized?.id === request.rootId &&
    actualNodeIds.length === request.nodeIds.length &&
    actualNodeIds.every((nodeId, index) => nodeId === request.nodeIds[index]);

  if (!lastNormalized || !selectionMatches) {
    figma.ui.postMessage({
      type: 'capture-reference-data',
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      rootId: request.rootId,
      nodeIds: request.nodeIds,
      fileKey: figma.fileKey ?? null,
      sourceUrl: null,
      references: {},
      assets: {},
      renderedFallbacks: {},
      warnings: ['The Figma selection changed before capture started.'],
    } satisfies SandboxMessage);
    return;
  }

  const references: Record<string, string> = {};
  const referenceResults = await mapWithConcurrency(
    request.nodeIds,
    CAPTURE_EXPORT_CONCURRENCY,
    async (nodeId) => ({ nodeId, dataUrl: await exportNodePng(nodeId) }),
  );
  for (const { nodeId, dataUrl } of referenceResults) {
    if (dataUrl) references[nodeId] = dataUrl;
    else warnings.push(`Unable to render selected node ${nodeId}.`);
  }

  const assets: Record<string, string> = {};
  const renderedFallbacks: NonNullable<CaptureReferenceDataMessage['renderedFallbacks']> = {};
  if (request.includeAssets) {
    const imageNodes = collectImageNodes(lastNormalized);
    const sourceRasterEvidence = await measureSourceRasterEvidence(imageNodes);
    const assetResults = await mapWithConcurrency(
      imageNodes,
      CAPTURE_EXPORT_CONCURRENCY,
      async (image) => {
        const evidence = sourceRasterEvidence[image.id];
        return {
          image,
          evidence,
          dataUrl: await exportNodePng(image.id, sourceAwareAssetRasterScale(evidence)),
        };
      },
    );
    for (const { image, evidence, dataUrl } of assetResults) {
      if (dataUrl) assets[image.id] = dataUrl;
      else warnings.push(`Unable to render design asset ${image.id}.`);
      if (!evidence?.verified || !Number.isFinite(evidence.density)) {
        warnings.push(`Unable to verify source resolution for design asset ${image.id}; its AI-package asset is limited to the authored 1× viewport.`);
      } else if ((evidence.density as number) + 0.01 < MIN_SHARP_RASTER_SCALE) {
        warnings.push(`Design asset ${image.id} provides only ${(evidence.density as number).toFixed(2)}× real source detail; replace the Figma image with a 2× or higher source for retina-sharp AI output.`);
      }
    }

    const fallbackResults = await mapWithConcurrency(
      collectRenderedFallbackCandidates(lastNormalized),
      FALLBACK_NODE_CONCURRENCY,
      async (candidate) => {
        const [pngDataUrl, svgDataUrl] = await Promise.all([
          exportNodePng(candidate.nodeId),
          exportNodeSvgFallback(candidate.nodeId),
        ]);
        return { candidate, pngDataUrl, svgDataUrl };
      },
    );
    for (const { candidate, pngDataUrl, svgDataUrl } of fallbackResults) {
      if (pngDataUrl || svgDataUrl) {
        renderedFallbacks[candidate.nodeId] = {
          ...(pngDataUrl ? { pngDataUrl } : {}),
          ...(svgDataUrl ? { svgDataUrl } : {}),
          reasons: candidate.reasons,
        };
      }
      if (!pngDataUrl) warnings.push(`Unable to render pixel fallback ${candidate.nodeId}.`);
      if (!svgDataUrl) warnings.push(`Unable to render vector fallback ${candidate.nodeId}.`);
    }
  }

  const fileKey = figma.fileKey ?? null;
  const sourceUrl = buildFigmaNodeUrl(fileKey, request.nodeIds[0] ?? request.rootId);
  figma.ui.postMessage({
    type: 'capture-reference-data',
    protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId,
    rootId: request.rootId,
    nodeIds: request.nodeIds,
    fileKey,
    sourceUrl,
    references,
    assets,
    renderedFallbacks,
    warnings,
  } satisfies SandboxMessage);
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
  if (msg.type === 'export-capture') {
    void exportCapture(msg);
  } else if (msg.type === 'export-images' && lastNormalized) {
    const exportId = ++currentExportId;
    if (msg.mode === 'merged') {
      exportMerged(lastNormalized, msg.scale, msg.format, exportId);
    } else if (msg.mode === 'per-selection') {
      exportPerSelection(msg.scale, msg.format, exportId);
    } else {
      exportImages(lastNormalized, msg.scale, msg.format, exportId);
    }
  }
};

// Run on launch
handleSelection();

// Re-run when selection changes
figma.on('selectionchange', handleSelection);
