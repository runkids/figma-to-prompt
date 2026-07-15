import { PROTOCOL_VERSION } from '../shared/types';
import type {
  CaptureReferenceDataMessage,
  RenderedFallbackReason,
  SandboxMessage,
  UISerializedNode,
  UIMessage,
} from '../shared/types';
import { createZip, dataUrlToBlob } from './download';
import { collectImageAssets, sanitizeFileName } from './prompt';
import { collectRenderedFallbackCandidates } from '../shared/fidelity';
import { buildFigmaNodeUrl } from '../shared/figmaLocator';
import { sha256Hex } from '../shared/sha256';
import type { ReferenceStabilityEvidence } from './visualCompare';

export interface DesignCaptureManifestFile {
  path: string;
  role:
    | 'design-structure'
    | 'reference-render'
    | 'design-asset'
    | 'derived-prompt'
    | 'provenance';
  mediaType: string;
  size: number;
  sha256: string;
  nodeId: string | null;
  purpose?: 'rendered-fallback';
  fallbackVariant?: 'pixel' | 'vector';
  fallbackReasons?: string[];
  pixelDimensions?: { width: number; height: number };
}

export interface DesignCaptureManifest {
  schemaVersion: '1.0';
  producer: {
    name: 'runkids/figma-to-prompt';
    version: string;
    protocolVersion: number;
  };
  capturedAt: string;
  source: {
    provider: 'figma-plugin';
    fileKey: string | null;
    fileVersionId: null;
    nodeIds: string[];
    sourceUrl: string | null;
    locatorPath: 'mcp/figma-locator.json';
  };
  root: {
    id: string;
    name: string;
    structurePath: 'design/nodes.json';
    promptPath: 'prompt.md';
    primaryReferencePath: string;
    targetViewport: { width: number; height: number; referencePath: string };
    referencePaths: string[];
    fallbackPaths: string[];
  };
  files: DesignCaptureManifestFile[];
  fidelity: {
    policy: 'fail-closed';
    coveragePath: 'fidelity/coverage.json';
    candidateNodeCount: number;
    coveredNodeCount: number;
    unresolvedNodeIds: string[];
    exactVerification: {
      required: true;
      method: 'rgba-pixel-equality';
      referencePath: string;
      referenceStability: ReferenceStabilityEvidence;
    };
  };
  warnings: string[];
  provenance: { selectionCount: number };
}

interface CaptureFile {
  path: string;
  role: 'design-structure' | 'reference-render' | 'design-asset' | 'derived-prompt' | 'provenance';
  mediaType: string;
  nodeId: string | null;
  bytes: Uint8Array;
  purpose?: 'rendered-fallback';
  fallbackVariant?: 'pixel' | 'vector';
  fallbackReasons?: string[];
  pixelDimensions?: { width: number; height: number };
}

interface FidelityCoverageEntry {
  nodeId: string;
  reasons: RenderedFallbackReason[];
  pixelPath: string;
  vectorPath?: string;
}

interface FigmaMcpLocatorNode {
  nodeId: string;
  name: string;
  type: string;
  role: 'selected' | 'descendant';
  parentNodeId: string | null;
  selectionRootId: string;
  hierarchyNodeIds: string[];
  locator: {
    fileKey: string | null;
    nodeId: string;
    sourceUrl: string | null;
  };
}

interface FigmaMcpLocatorFile {
  schemaVersion: 1;
  provider: 'figma';
  resolution: 'mcp-resolvable' | 'local-only';
  fileKey: string | null;
  sourceUrl: string | null;
  selectedNodeIds: string[];
  syntheticRootId: string | null;
  structurePath: 'design/nodes.json';
  nodes: FigmaMcpLocatorNode[];
}

export interface BuiltDesignCapture {
  blob: Blob;
  filename: string;
  manifest: DesignCaptureManifest;
}

function selectedNodeIds(root: UISerializedNode): string[] {
  return root.id === '__multi_selection__'
    ? (root.children ?? []).map((child) => child.id)
    : [root.id];
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function requestCaptureReference(
  root: UISerializedNode,
  options: { includeAssets?: boolean; timeoutMs?: number } = {},
): Promise<CaptureReferenceDataMessage> {
  const id = requestId();
  const nodeIds = selectedNodeIds(root);
  const includeAssets = options.includeAssets ?? true;
  const timeoutMs = options.timeoutMs ?? (includeAssets ? 120_000 : 30_000);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Timed out while rendering the Design Capture reference.'));
    }, timeoutMs);

    function onMessage(event: MessageEvent): void {
      const message = event.data?.pluginMessage as SandboxMessage | undefined;
      if (message?.type !== 'capture-reference-data' || message.requestId !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        reject(new Error('The sandbox and UI capture protocols do not match.'));
        return;
      }
      resolve(message);
    }

    window.addEventListener('message', onMessage);
    const message: UIMessage = {
      type: 'export-capture',
      requestId: id,
      rootId: root.id,
      nodeIds,
      includeAssets,
    };
    parent.postMessage({ pluginMessage: message }, '*');
  });
}

function safeNodeId(nodeId: string): string {
  return nodeId.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_');
}

function figmaNodeSourceUrl(
  sourceUrl: string | null,
  fileKey: string | null,
  nodeId: string,
): string | null {
  return buildFigmaNodeUrl(fileKey, nodeId, sourceUrl);
}

function buildFigmaMcpLocator(
  root: UISerializedNode,
  capture: CaptureReferenceDataMessage,
): FigmaMcpLocatorFile {
  const selectedRoots = root.id === '__multi_selection__' ? (root.children ?? []) : [root];
  const nodes: FigmaMcpLocatorNode[] = [];

  function walk(
    node: UISerializedNode,
    parentNodeId: string | null,
    selectionRootId: string,
    hierarchyNodeIds: string[],
  ): void {
    const path = [...hierarchyNodeIds, node.id];
    nodes.push({
      nodeId: node.id,
      name: node.name,
      type: node.type,
      role: node.id === selectionRootId ? 'selected' : 'descendant',
      parentNodeId,
      selectionRootId,
      hierarchyNodeIds: path,
      locator: {
        fileKey: capture.fileKey,
        nodeId: node.id,
        sourceUrl: figmaNodeSourceUrl(capture.sourceUrl, capture.fileKey, node.id),
      },
    });
    for (const child of node.children ?? []) {
      walk(child, node.id, selectionRootId, path);
    }
  }

  for (const selectedRoot of selectedRoots) {
    walk(selectedRoot, null, selectedRoot.id, []);
  }

  return {
    schemaVersion: 1,
    provider: 'figma',
    resolution: capture.fileKey ? 'mcp-resolvable' : 'local-only',
    fileKey: capture.fileKey,
    sourceUrl: capture.sourceUrl,
    selectedNodeIds: [...capture.nodeIds],
    syntheticRootId: root.id === '__multi_selection__' ? root.id : null,
    structurePath: 'design/nodes.json',
    nodes,
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', Uint8Array.from(bytes));
      return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
    } catch { /* fall through for restricted Figma iframe runtimes */ }
  }
  return sha256Hex(bytes);
}

async function dataUrlBytes(dataUrl: string, expectedMediaType = 'image/png'): Promise<Uint8Array> {
  const blob = await dataUrlToBlob(dataUrl);
  const mediaType = blob.type.split(';')[0];
  if (mediaType !== expectedMediaType) {
    throw new Error(`Capture renderer returned unsupported media: ${blob.type || 'unknown'}`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    !signature.every((byte, index) => bytes[index] === byte) ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR'
  ) {
    throw new Error('Capture renderer returned an invalid PNG reference.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width < 1 || height < 1) {
    throw new Error('Capture renderer returned an empty PNG reference.');
  }
  return { width, height };
}

export async function createDesignCaptureBundle(input: {
  root: UISerializedNode;
  capture: CaptureReferenceDataMessage;
  compositeReferenceDataUrl?: string;
  prompt: string;
  producerVersion: string;
  referenceStability: ReferenceStabilityEvidence;
  capturedAt?: Date;
}): Promise<BuiltDesignCapture> {
  const { root, capture } = input;
  const expectedNodeIds = selectedNodeIds(root);
  if (
    capture.rootId !== root.id ||
    capture.nodeIds.length !== expectedNodeIds.length ||
    !capture.nodeIds.every((nodeId, index) => nodeId === expectedNodeIds[index])
  ) {
    throw new Error('The Design Capture response does not match the selected structure.');
  }
  const missingReferences = expectedNodeIds.filter((nodeId) => !capture.references[nodeId]);
  if (missingReferences.length > 0) {
    throw new Error(`AI package is missing reference renders for node ${missingReferences.join(', ')}.`);
  }
  if (root.id === '__multi_selection__' && !input.compositeReferenceDataUrl) {
    throw new Error('The multi-selection AI package is missing its authoritative composite reference.');
  }
  const fallbackCandidates = collectRenderedFallbackCandidates(root);
  const missingPixelFallbacks = fallbackCandidates
    .map((candidate) => candidate.nodeId)
    .filter((nodeId) =>
      !capture.references[nodeId] &&
      !capture.renderedFallbacks?.[nodeId]?.pngDataUrl);
  if (missingPixelFallbacks.length > 0) {
    throw new Error(`AI package is missing pixel fallbacks for node ${missingPixelFallbacks.join(', ')}.`);
  }
  const missingDesignAssets = collectImageAssets(root)
    .map((asset) => asset.nodeId)
    .filter((nodeId) => !capture.assets[nodeId]);
  if (missingDesignAssets.length > 0) {
    throw new Error(`AI package is missing design assets for node ${missingDesignAssets.join(', ')}.`);
  }

  const encoder = new TextEncoder();
  const files: CaptureFile[] = [
    {
      path: 'design/nodes.json',
      role: 'design-structure',
      mediaType: 'application/json',
      nodeId: root.id,
      bytes: encoder.encode(JSON.stringify(root)),
    },
  ];

  for (const [index, nodeId] of capture.nodeIds.entries()) {
    const dataUrl = capture.references[nodeId];
    if (!dataUrl) continue;
    files.push({
      path: `references/${String(index + 1).padStart(3, '0')}-${safeNodeId(nodeId)}.png`,
      role: 'reference-render',
      mediaType: 'image/png',
      nodeId,
      bytes: await dataUrlBytes(dataUrl),
    });
  }
  const primaryReferencePath = root.id === '__multi_selection__'
    ? 'references/selection.png'
    : `references/001-${safeNodeId(root.id)}.png`;
  if (root.id === '__multi_selection__' && input.compositeReferenceDataUrl) {
    files.push({
      path: primaryReferencePath,
      role: 'reference-render',
      mediaType: 'image/png',
      nodeId: root.id,
      bytes: await dataUrlBytes(input.compositeReferenceDataUrl),
    });
  }
  let assetIndex = 0;
  for (const nodeId of Object.keys(capture.assets).sort()) {
    const dataUrl = capture.assets[nodeId];
    if (!dataUrl) continue;
    assetIndex += 1;
    files.push({
      path: `assets/${String(assetIndex).padStart(3, '0')}-${safeNodeId(nodeId)}.png`,
      role: 'design-asset',
      mediaType: 'image/png',
      nodeId,
      bytes: await dataUrlBytes(dataUrl),
    });
  }
  let fallbackIndex = 0;
  for (const candidate of [...fallbackCandidates].sort((left, right) =>
    left.nodeId.localeCompare(right.nodeId))) {
    const nodeId = candidate.nodeId;
    const fallback = capture.renderedFallbacks?.[nodeId];
    if (!fallback?.pngDataUrl && !fallback?.svgDataUrl) continue;
    fallbackIndex += 1;
    const prefix = `fallbacks/${String(fallbackIndex).padStart(3, '0')}-${safeNodeId(nodeId)}`;
    if (fallback.pngDataUrl) {
      files.push({
        path: `${prefix}.png`,
        role: 'design-asset',
        mediaType: 'image/png',
        nodeId,
        bytes: await dataUrlBytes(fallback.pngDataUrl),
        purpose: 'rendered-fallback',
        fallbackVariant: 'pixel',
        fallbackReasons: [...candidate.reasons],
      });
    }
    if (fallback.svgDataUrl) {
      files.push({
        path: `${prefix}.svg`,
        role: 'design-asset',
        mediaType: 'image/svg+xml',
        nodeId,
        bytes: await dataUrlBytes(fallback.svgDataUrl, 'image/svg+xml'),
        purpose: 'rendered-fallback',
        fallbackVariant: 'vector',
        fallbackReasons: [...candidate.reasons],
      });
    }
  }
  const allReferencePaths = files
    .filter((file) => file.role === 'reference-render')
    .map((file) => file.path);
  const referencePaths = [
    primaryReferencePath,
    ...allReferencePaths.filter((path) => path !== primaryReferencePath),
  ];
  const primaryReference = files.find((file) => file.path === primaryReferencePath);
  if (!primaryReference) {
    throw new Error('Figma did not return an authoritative reference for this selection.');
  }
  const targetViewport = {
    ...readPngDimensions(primaryReference.bytes),
    referencePath: primaryReferencePath,
  };
  const stability = input.referenceStability;
  if (
    stability.renderCount !== 2 ||
    stability.differentPixels !== 0 ||
    stability.maxChannelDelta !== 0 ||
    stability.width !== targetViewport.width ||
    stability.height !== targetViewport.height
  ) {
    throw new Error('AI package requires two pixel-identical Figma reference renders at the target viewport.');
  }
  const assetFiles = files.filter((file) => file.role === 'design-asset' && file.purpose !== 'rendered-fallback');
  const fallbackFiles = files.filter((file) => file.purpose === 'rendered-fallback');
  const coverageEntries: FidelityCoverageEntry[] = fallbackCandidates.flatMap((candidate) => {
    const directReference = files.find((file) =>
      file.role === 'reference-render' && file.nodeId === candidate.nodeId);
    const pixelFallback = fallbackFiles.find((file) =>
      file.nodeId === candidate.nodeId && file.fallbackVariant === 'pixel');
    const vectorFallback = fallbackFiles.find((file) =>
      file.nodeId === candidate.nodeId && file.fallbackVariant === 'vector');
    const pixelPath = directReference?.path ?? pixelFallback?.path;
    if (!pixelPath) return [];
    return [{
      nodeId: candidate.nodeId,
      reasons: [...candidate.reasons],
      pixelPath,
      ...(vectorFallback ? { vectorPath: vectorFallback.path } : {}),
    }];
  });
  const coveredNodeIds = new Set(coverageEntries.map((entry) => entry.nodeId));
  const unresolvedNodeIds = fallbackCandidates
    .map((candidate) => candidate.nodeId)
    .filter((nodeId) => !coveredNodeIds.has(nodeId));
  if (unresolvedNodeIds.length > 0) {
    throw new Error(`AI package fidelity coverage is unresolved for node ${unresolvedNodeIds.join(', ')}.`);
  }
  const fidelityCoverage = {
    schemaVersion: 1,
    policy: 'fail-closed' as const,
    exactVerification: {
      required: true,
      method: 'rgba-pixel-equality' as const,
      referencePath: primaryReferencePath,
      targetViewport,
      referenceStability: stability,
    },
    nodes: coverageEntries,
    unresolvedNodeIds,
  };
  files.push({
    path: 'fidelity/coverage.json',
    role: 'provenance',
    mediaType: 'application/json',
    nodeId: root.id,
    bytes: encoder.encode(JSON.stringify(fidelityCoverage)),
  });
  const mcpLocator = buildFigmaMcpLocator(root, capture);
  files.push({
    path: 'mcp/figma-locator.json',
    role: 'provenance',
    mediaType: 'application/json',
    nodeId: root.id,
    bytes: encoder.encode(JSON.stringify(mcpLocator)),
  });
  const bundleInstructions = [
    '## Capture Bundle Inputs (Authoritative)',
    '- Keep this bundle intact. Resolve every path relative to the bundle root.',
    '- Review `mcp/figma-locator.json` before calling a Figma MCP tool. Prefer each node\'s exact `locator.sourceUrl`; otherwise pass its `locator.fileKey` and colon-form `locator.nodeId` through the MCP tool\'s documented inputs.',
    '- Locator data is for discovery or refresh only. An MCP re-capture creates a new immutable capture; it never replaces the evidence in this bundle.',
    ...(mcpLocator.resolution === 'local-only'
      ? ['- This capture has no Figma file key, so MCP cannot reopen its source; rely on the bundled evidence.']
      : []),
    '- Review `fidelity/coverage.json` before implementation. Every listed node must use its exact pixel fallback or an equivalent implementation proven by the final RGBA comparison.',
    '- Use the reference renders below as the visual source of truth and iterate with screenshot comparison.',
    `- Authoritative target: \`${primaryReferencePath}\` at exactly ${targetViewport.width}×${targetViewport.height} CSS pixels. Do not infer the viewport from Figma's fractional geometry or another asset.`,
    '- Reference determinism gate passed: two consecutive Figma renders were RGBA-identical. If a later reference becomes unstable, stop exact verification until the changing content is frozen.',
    '- Provide the final exact-size screenshot so the user can load it into Figma to Prompt\'s built-in `Verify AI screenshot` checker.',
    ...referencePaths.map((path) => `- Reference render: \`${path}\``),
    '- Match design assets by their manifest `nodeId`; bundled paths override any generated filename elsewhere in this prompt.',
    ...assetFiles.map((file) => `- Design asset for node \`${file.nodeId}\`: \`${file.path}\``),
    '- Rendered fallbacks are Figma-authored precision assets. Use the PNG variant for the exact 1× target; use the outlined, unsimplified SVG variant when the node must scale. Preserve semantics or interactions with an accessible overlay when needed.',
    ...fallbackFiles.map((file) => `- Rendered fallback (${file.fallbackVariant}) for node \`${file.nodeId}\` (${file.fallbackReasons?.join(', ')}): \`${file.path}\``),
  ].join('\n');
  files.push({
    path: 'prompt.md',
    role: 'derived-prompt',
    mediaType: 'text/markdown',
    nodeId: root.id,
    bytes: encoder.encode(`${input.prompt.trim()}\n\n${bundleInstructions}\n`),
  });
  files.sort((left, right) => left.path.localeCompare(right.path));

  const declarations: DesignCaptureManifestFile[] = [];
  for (const file of files) {
    declarations.push({
      path: file.path,
      role: file.role,
      mediaType: file.mediaType,
      size: file.bytes.byteLength,
      sha256: await sha256(file.bytes),
      nodeId: file.nodeId,
      ...(file.purpose ? { purpose: file.purpose } : {}),
      ...(file.fallbackVariant ? { fallbackVariant: file.fallbackVariant } : {}),
      ...(file.fallbackReasons ? { fallbackReasons: file.fallbackReasons } : {}),
      ...(file.mediaType === 'image/png'
        ? { pixelDimensions: readPngDimensions(file.bytes) }
        : {}),
    });
  }
  const warnings = [...new Set([
    ...capture.warnings,
    'Figma file version is unavailable in the plugin sandbox.',
  ])];
  const manifest: DesignCaptureManifest = {
    schemaVersion: '1.0',
    producer: {
      name: 'runkids/figma-to-prompt',
      version: input.producerVersion,
      protocolVersion: PROTOCOL_VERSION,
    },
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
    source: {
      provider: 'figma-plugin',
      fileKey: capture.fileKey,
      fileVersionId: null,
      nodeIds: [...capture.nodeIds],
      sourceUrl: capture.sourceUrl,
      locatorPath: 'mcp/figma-locator.json',
    },
    root: {
      id: root.id,
      name: root.name,
      structurePath: 'design/nodes.json',
      promptPath: 'prompt.md',
      primaryReferencePath,
      targetViewport,
      referencePaths,
      fallbackPaths: declarations
        .filter((file) => file.purpose === 'rendered-fallback')
        .map((file) => file.path),
    },
    files: declarations,
    fidelity: {
      policy: 'fail-closed',
      coveragePath: 'fidelity/coverage.json',
      candidateNodeCount: fallbackCandidates.length,
      coveredNodeCount: coverageEntries.length,
      unresolvedNodeIds,
      exactVerification: {
        required: true,
        method: 'rgba-pixel-equality',
        referencePath: primaryReferencePath,
        referenceStability: stability,
      },
    },
    warnings,
    provenance: { selectionCount: capture.nodeIds.length },
  };
  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));
  const blob = createZip([
    { name: 'manifest.json', data: manifestBytes },
    ...files.map((file) => ({ name: file.path, data: file.bytes })),
  ]);
  return {
    blob,
    filename: `${sanitizeFileName(root.name)}.figmacapture.zip`,
    manifest,
  };
}
