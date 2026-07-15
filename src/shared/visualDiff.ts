export interface VisualDiffOptions {
  /** Maximum per-channel delta (0-255) that still counts as a matching pixel. */
  channelThreshold?: number;
}

export interface VisualDiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  differentPixels: number;
  /** Fraction of pixels inside this bounding box that differ. */
  density: number;
  meanAbsoluteError: number;
  maxChannelDelta: number;
}

export interface VisualDiffResult {
  channelThreshold: number;
  totalPixels: number;
  differentPixels: number;
  diffRatio: number;
  /** Percentage of pixels whose RGBA channels stay within the threshold. */
  pixelMatch: number;
  meanAbsoluteError: number;
  maxChannelDelta: number;
  diffBounds: { x: number; y: number; width: number; height: number } | null;
  /** Largest disconnected changed areas, sorted by changed-pixel impact. */
  diffRegions: VisualDiffRegion[];
  /** Total connected regions before the report is capped to its largest entries. */
  totalDiffRegions: number;
  /** Grayscale reference pixels with changed pixels highlighted in magenta. */
  diffRgba: Uint8ClampedArray;
}

const MAX_REPORTED_DIFF_REGIONS = 20;

function collectDiffRegions(
  changed: Uint8Array,
  reference: Uint8ClampedArray,
  candidate: Uint8ClampedArray,
  width: number,
  height: number,
): { regions: VisualDiffRegion[]; total: number } {
  const queue = new Int32Array(width * height);
  const regions: VisualDiffRegion[] = [];

  for (let start = 0; start < changed.length; start += 1) {
    if (changed[start] !== 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    changed[start] = 2;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let differentPixels = 0;
    let absoluteError = 0;
    let maxChannelDelta = 0;

    while (head < tail) {
      const pixelIndex = queue[head++];
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      differentPixels += 1;
      const offset = pixelIndex * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(reference[offset + channel] - candidate[offset + channel]);
        absoluteError += delta;
        maxChannelDelta = Math.max(maxChannelDelta, delta);
      }

      for (let neighborY = Math.max(0, y - 1); neighborY <= Math.min(height - 1, y + 1); neighborY += 1) {
        for (let neighborX = Math.max(0, x - 1); neighborX <= Math.min(width - 1, x + 1); neighborX += 1) {
          const neighbor = neighborY * width + neighborX;
          if (changed[neighbor] !== 1) continue;
          changed[neighbor] = 2;
          queue[tail++] = neighbor;
        }
      }
    }

    const regionWidth = maxX - minX + 1;
    const regionHeight = maxY - minY + 1;
    regions.push({
      x: minX,
      y: minY,
      width: regionWidth,
      height: regionHeight,
      differentPixels,
      density: differentPixels / (regionWidth * regionHeight),
      meanAbsoluteError: absoluteError / (differentPixels * 4),
      maxChannelDelta,
    });
  }

  regions.sort((left, right) =>
    right.differentPixels - left.differentPixels
    || right.maxChannelDelta - left.maxChannelDelta
    || left.y - right.y
    || left.x - right.x);
  return { regions: regions.slice(0, MAX_REPORTED_DIFF_REGIONS), total: regions.length };
}

export function compareRgbaPixels(
  reference: Uint8ClampedArray,
  candidate: Uint8ClampedArray,
  width: number,
  height: number,
  options: VisualDiffOptions = {},
): VisualDiffResult {
  const totalPixels = width * height;
  const expectedLength = totalPixels * 4;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Image dimensions must be positive integers.');
  }
  if (reference.length !== expectedLength || candidate.length !== expectedLength) {
    throw new Error(`RGBA buffer length must equal width × height × 4 (${expectedLength}).`);
  }

  const channelThreshold = options.channelThreshold ?? 0;
  if (!Number.isFinite(channelThreshold) || channelThreshold < 0 || channelThreshold > 255) {
    throw new Error('Channel threshold must be between 0 and 255.');
  }

  const diffRgba = new Uint8ClampedArray(expectedLength);
  const changed = new Uint8Array(totalPixels);
  let differentPixels = 0;
  let absoluteError = 0;
  let maxChannelDelta = 0;
  let minDiffX = width;
  let minDiffY = height;
  let maxDiffX = -1;
  let maxDiffY = -1;

  for (let offset = 0; offset < expectedLength; offset += 4) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(reference[offset + channel] - candidate[offset + channel]);
      absoluteError += delta;
      pixelDelta = Math.max(pixelDelta, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }

    if (pixelDelta > channelThreshold) {
      differentPixels += 1;
      const pixelIndex = offset / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minDiffX = Math.min(minDiffX, x);
      minDiffY = Math.min(minDiffY, y);
      maxDiffX = Math.max(maxDiffX, x);
      maxDiffY = Math.max(maxDiffY, y);
      changed[pixelIndex] = 1;
      diffRgba[offset] = 255;
      diffRgba[offset + 1] = 0;
      diffRgba[offset + 2] = 170;
      diffRgba[offset + 3] = 255;
      continue;
    }

    const grayscale = Math.round(
      reference[offset] * 0.299
      + reference[offset + 1] * 0.587
      + reference[offset + 2] * 0.114,
    );
    diffRgba[offset] = grayscale;
    diffRgba[offset + 1] = grayscale;
    diffRgba[offset + 2] = grayscale;
    diffRgba[offset + 3] = reference[offset + 3];
  }

  const diffRatio = differentPixels / totalPixels;
  const diffBounds = differentPixels === 0
    ? null
    : {
        x: minDiffX,
        y: minDiffY,
        width: maxDiffX - minDiffX + 1,
        height: maxDiffY - minDiffY + 1,
      };
  const regionResult = collectDiffRegions(changed, reference, candidate, width, height);
  return {
    channelThreshold,
    totalPixels,
    differentPixels,
    diffRatio,
    pixelMatch: (1 - diffRatio) * 100,
    meanAbsoluteError: absoluteError / expectedLength,
    maxChannelDelta,
    diffBounds,
    diffRegions: regionResult.regions,
    totalDiffRegions: regionResult.total,
    diffRgba,
  };
}
