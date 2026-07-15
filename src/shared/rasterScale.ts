interface PixelSize {
  width: number;
  height: number;
}

interface ImagePaintGeometry {
  scaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  transform?: [[number, number, number], [number, number, number]];
  scalingFactor?: number;
  rotation?: number;
}

interface SourceRasterEvidence {
  verified: boolean;
  density?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  renderedWidth: number;
  renderedHeight: number;
}

export interface SourceRasterDensity {
  density: number;
  method: 'fill' | 'fit' | 'crop-transform' | 'crop-fallback' | 'tile-scale';
}

export const MIN_SHARP_RASTER_SCALE = 2;
export const MAX_RASTER_SCALE = 4;

export function assertMinimumSourceRasterDensity(
  evidence: SourceRasterEvidence | undefined,
  minimumScale: number,
  label: string,
): void {
  if (!evidence?.verified || !Number.isFinite(evidence.density)) {
    throw new Error(
      `${label} source resolution could not be verified. Download stopped because a rendered Original file might only contain upscaled pixels. Replace or reload the source image in Figma, then retry.`,
    );
  }
  if ((evidence.density as number) + 0.01 < minimumScale) {
    const source = evidence.sourceWidth && evidence.sourceHeight
      ? ` (${evidence.sourceWidth}×${evidence.sourceHeight}px source)`
      : '';
    throw new Error(
      `${label} source provides only ${(evidence.density as number).toFixed(2)}× real detail${source}; `
      + `${minimumScale}× is required. Figma would only upscale and remain blurry. Replace it with a higher-resolution source image.`,
    );
  }
}

function validSize(size: PixelSize | null): size is PixelSize {
  return Boolean(
    size
    && Number.isFinite(size.width)
    && Number.isFinite(size.height)
    && size.width > 0
    && size.height > 0,
  );
}

/**
 * Measures real source pixels per rendered CSS pixel before Figma exportAsync
 * can upscale the raster. This distinguishes genuine detail from a large file
 * containing interpolated pixels.
 */
export function effectiveSourceRasterDensity(
  sourceSize: PixelSize | null,
  renderedSize: PixelSize,
  paint: ImagePaintGeometry,
): SourceRasterDensity | null {
  if (!validSize(sourceSize) || !validSize(renderedSize)) return null;
  const scaleMode = paint.scaleMode ?? 'fill';

  if (scaleMode === 'tile') {
    if (!Number.isFinite(paint.scalingFactor) || (paint.scalingFactor ?? 0) <= 0) return null;
    return { density: 1 / (paint.scalingFactor as number), method: 'tile-scale' };
  }

  if (scaleMode === 'crop' && paint.transform) {
    const [[a, b], [c, d]] = paint.transform;
    // Figma's crop transform maps normalized node axes into normalized source
    // coordinates: an axis length below 1 means only that fraction of the
    // uploaded image is visible. Convert those normalized source vectors to
    // source pixels, then measure how many land on each rendered node axis.
    const sourcePixelsAlongNodeX = Math.hypot(a * sourceSize.width, c * sourceSize.height);
    const sourcePixelsAlongNodeY = Math.hypot(b * sourceSize.width, d * sourceSize.height);
    if (sourcePixelsAlongNodeX <= 0 || sourcePixelsAlongNodeY <= 0) return null;
    return {
      density: Math.min(
        sourcePixelsAlongNodeX / renderedSize.width,
        sourcePixelsAlongNodeY / renderedSize.height,
      ),
      method: 'crop-transform',
    };
  }

  const quarterTurns = Math.round((paint.rotation ?? 0) / 90);
  const rotated = Math.abs(quarterTurns % 2) === 1;
  const sourceWidth = rotated ? sourceSize.height : sourceSize.width;
  const sourceHeight = rotated ? sourceSize.width : sourceSize.height;
  const widthDensity = sourceWidth / renderedSize.width;
  const heightDensity = sourceHeight / renderedSize.height;
  if (scaleMode === 'fit') {
    return { density: Math.max(widthDensity, heightDensity), method: 'fit' };
  }
  return {
    density: Math.min(widthDensity, heightDensity),
    method: scaleMode === 'crop' ? 'crop-fallback' : 'fill',
  };
}

export function assertMinimumRasterDensity(
  actualSize: PixelSize,
  logicalSize: PixelSize,
  minimumScale: number,
  label: string,
): number {
  if (
    !Number.isFinite(actualSize.width)
    || !Number.isFinite(actualSize.height)
    || !Number.isFinite(logicalSize.width)
    || !Number.isFinite(logicalSize.height)
    || !Number.isFinite(minimumScale)
    || actualSize.width <= 0
    || actualSize.height <= 0
    || logicalSize.width <= 0
    || logicalSize.height <= 0
    || minimumScale <= 0
  ) {
    throw new Error(`${label} has invalid raster density dimensions.`);
  }
  // Pair short-to-short and long-to-long so 90° rotation remains valid while a
  // single undersampled axis cannot hide behind excess pixels on the other.
  const actualAxes = [actualSize.width, actualSize.height].sort((a, b) => a - b);
  const logicalAxes = [logicalSize.width, logicalSize.height].sort((a, b) => a - b);
  const density = Math.min(
    actualAxes[0] / logicalAxes[0],
    actualAxes[1] / logicalAxes[1],
  );
  if (density + 0.01 < minimumScale) {
    throw new Error(
      `${label} encoded at ${density.toFixed(2)}×; expected at least ${minimumScale}× `
      + `(${actualSize.width}×${actualSize.height}px output for `
      + `${logicalSize.width}×${logicalSize.height}px design). Download stopped to prevent a blurry file.`,
    );
  }
  return density;
}

export function rasterPixelSize(size: PixelSize, scale: number): PixelSize {
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * Uses every real source pixel available to an AI-package asset without asking
 * Figma to invent additional pixels. Values below 1x still export at 1x so the
 * asset preserves the authored target viewport; callers surface that source
 * limitation separately instead of disguising it as a high-resolution file.
 */
export function sourceAwareAssetRasterScale(
  evidence: Pick<SourceRasterEvidence, 'verified' | 'density'> | undefined,
): number {
  if (!evidence?.verified || !Number.isFinite(evidence.density) || (evidence.density as number) <= 0) {
    return 1;
  }
  const clamped = Math.max(1, Math.min(MAX_RASTER_SCALE, evidence.density as number));
  return Math.floor((clamped + Number.EPSILON) * 100) / 100;
}

/**
 * Choose the sharpest supported Figma export scale for an image paint that
 * cannot return its uploaded bytes directly (for example crop/filter variants).
 * Preserve the source pixel density when possible, while never falling below
 * a retina-quality 2x raster.
 */
export function renderSpecificRasterScale(
  sourceSize: PixelSize | null,
  renderedSize: PixelSize,
  effectiveDensity?: number,
): number {
  if (
    !sourceSize
    || !Number.isFinite(sourceSize.width)
    || !Number.isFinite(sourceSize.height)
    || !Number.isFinite(renderedSize.width)
    || !Number.isFinite(renderedSize.height)
    || sourceSize.width <= 0
    || sourceSize.height <= 0
    || renderedSize.width <= 0
    || renderedSize.height <= 0
  ) {
    return MIN_SHARP_RASTER_SCALE;
  }

  const sourceDensity = Number.isFinite(effectiveDensity) && (effectiveDensity as number) > 0
    ? effectiveDensity as number
    : Math.max(
        sourceSize.width / renderedSize.width,
        sourceSize.height / renderedSize.height,
      );

  return Math.max(
    MIN_SHARP_RASTER_SCALE,
    sourceAwareAssetRasterScale({ verified: true, density: sourceDensity }),
  );
}
