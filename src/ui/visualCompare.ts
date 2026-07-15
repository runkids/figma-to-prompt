import { compareRgbaPixels, type VisualDiffResult } from '../shared/visualDiff';
import type { CaptureReferenceDataMessage, UISerializedNode } from '../shared/types';

interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface CaptureReferenceTiles {
  width: number;
  height: number;
  tiles: Array<{ source: string; x: number; y: number; width: number; height: number }>;
}

export function buildCaptureReferenceTiles(
  root: UISerializedNode,
  capture: CaptureReferenceDataMessage,
): CaptureReferenceTiles | null {
  if (root.id !== '__multi_selection__' || !root.layout) return null;
  const tiles = (root.children ?? []).flatMap((child) => {
    const source = capture.references[child.id];
    if (!source || !child.layout) return [];
    return [{
      source,
      x: child.layout.x ?? 0,
      y: child.layout.y ?? 0,
      width: child.layout.width,
      height: child.layout.height,
    }];
  });
  if (tiles.length === 0) return null;
  return { width: root.layout.width, height: root.layout.height, tiles };
}

export type ImageComparisonResult =
  | {
      kind: 'dimension-mismatch';
      referenceWidth: number;
      referenceHeight: number;
      candidateWidth: number;
      candidateHeight: number;
    }
  | ({
      kind: 'compared';
      referenceWidth: number;
      referenceHeight: number;
      candidateWidth: number;
      candidateHeight: number;
      diffDataUrl: string;
    } & VisualDiffResult);

export interface ReferenceStabilityEvidence {
  renderCount: 2;
  width: number;
  height: number;
  differentPixels: 0;
  maxChannelDelta: 0;
}

export function requireStableReference(
  result: ImageComparisonResult,
): ReferenceStabilityEvidence {
  if (result.kind === 'dimension-mismatch') {
    throw new Error(
      `Figma reference changed size between consecutive renders: `
      + `${result.referenceWidth}×${result.referenceHeight}px → `
      + `${result.candidateWidth}×${result.candidateHeight}px.`,
    );
  }
  if (result.differentPixels > 0) {
    const location = result.diffBounds
      ? ` First change: x ${result.diffBounds.x}, y ${result.diffBounds.y}, ${result.diffBounds.width}×${result.diffBounds.height}px.`
      : '';
    throw new Error(
      `Figma reference is not deterministic: ${result.differentPixels.toLocaleString()} pixels changed `
      + `between consecutive renders across ${result.totalDiffRegions.toLocaleString()} regions.${location}`,
    );
  }
  return {
    renderCount: 2,
    width: result.referenceWidth,
    height: result.referenceHeight,
    differentPixels: 0,
    maxChannelDelta: 0,
  };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected image could not be decoded.'));
    image.src = source;
  });
}

export async function buildCaptureReferenceSource(
  root: UISerializedNode,
  capture: CaptureReferenceDataMessage,
): Promise<string | null> {
  if (root.id !== '__multi_selection__') return capture.references[root.id] ?? null;
  const composite = buildCaptureReferenceTiles(root, capture);
  if (!composite) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(composite.width));
  canvas.height = Math.max(1, Math.round(composite.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas reference composition is unavailable.');
  for (const tile of composite.tiles) {
    const image = await loadImage(tile.source);
    context.drawImage(image, tile.x, tile.y, tile.width, tile.height);
  }
  return canvas.toDataURL('image/png');
}

async function decodeImage(source: string): Promise<DecodedImage> {
  const image = await loadImage(source);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas image comparison is unavailable.');
  context.drawImage(image, 0, 0);
  return {
    width,
    height,
    pixels: context.getImageData(0, 0, width, height).data,
  };
}

function renderDiffDataUrl(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas diff rendering is unavailable.');
  const imageData = context.createImageData(width, height);
  imageData.data.set(pixels);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function compareImageToReference(
  referenceSource: string,
  candidateFile: File,
): Promise<ImageComparisonResult> {
  const candidateSource = URL.createObjectURL(candidateFile);
  try {
    return await compareImageSources(referenceSource, candidateSource);
  } finally {
    URL.revokeObjectURL(candidateSource);
  }
}

export async function compareImageSources(
  referenceSource: string,
  candidateSource: string,
): Promise<ImageComparisonResult> {
  const [reference, candidate] = await Promise.all([
    decodeImage(referenceSource),
    decodeImage(candidateSource),
  ]);
  const dimensions = {
    referenceWidth: reference.width,
    referenceHeight: reference.height,
    candidateWidth: candidate.width,
    candidateHeight: candidate.height,
  };
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    return { kind: 'dimension-mismatch', ...dimensions };
  }

  const diff = compareRgbaPixels(
    reference.pixels,
    candidate.pixels,
    reference.width,
    reference.height,
  );
  return {
    kind: 'compared',
    ...dimensions,
    ...diff,
    diffDataUrl: renderDiffDataUrl(diff.diffRgba, reference.width, reference.height),
  };
}
