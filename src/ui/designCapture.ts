import { PROTOCOL_VERSION } from '../shared/types';
import type {
  CaptureReferenceDataMessage,
  SandboxMessage,
  UISerializedNode,
  UIMessage,
} from '../shared/types';
import { createZip, dataUrlToBlob } from './download';
import { sanitizeFileName } from './prompt';

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
  };
  root: {
    id: string;
    name: string;
    structurePath: 'design/nodes.json';
    referencePaths: string[];
  };
  files: DesignCaptureManifestFile[];
  warnings: string[];
  provenance: { selectionCount: number };
}

interface CaptureFile {
  path: string;
  role: 'design-structure' | 'reference-render' | 'design-asset';
  mediaType: string;
  nodeId: string | null;
  bytes: Uint8Array;
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
  timeoutMs = 30_000,
): Promise<CaptureReferenceDataMessage> {
  const id = requestId();
  const nodeIds = selectedNodeIds(root);
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
    };
    parent.postMessage({ pluginMessage: message }, '*');
  });
}

function safeNodeId(nodeId: string): string {
  return nodeId.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function dataUrlBytes(dataUrl: string): Promise<Uint8Array> {
  const blob = await dataUrlToBlob(dataUrl);
  if (blob.type !== 'image/png') {
    throw new Error(`Capture renderer returned unsupported media: ${blob.type || 'unknown'}`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export async function createDesignCaptureBundle(input: {
  root: UISerializedNode;
  capture: CaptureReferenceDataMessage;
  producerVersion: string;
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
  if (!files.some((file) => file.role === 'reference-render')) {
    throw new Error('Figma did not return a reference render for this selection.');
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
    },
    root: {
      id: root.id,
      name: root.name,
      structurePath: 'design/nodes.json',
      referencePaths: declarations
        .filter((file) => file.role === 'reference-render')
        .map((file) => file.path),
    },
    files: declarations,
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
