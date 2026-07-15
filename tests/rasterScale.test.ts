import { describe, expect, it } from 'vitest';
import {
  assertMinimumRasterDensity,
  assertMinimumSourceRasterDensity,
  effectiveSourceRasterDensity,
  rasterPixelSize,
  renderSpecificRasterScale,
  sourceAwareAssetRasterScale,
} from '../src/shared/rasterScale';

describe('rasterPixelSize', () => {
  it('preserves the requested scale for merged-selection canvases', () => {
    expect(rasterPixelSize({ width: 320, height: 180 }, 2)).toEqual({
      width: 640,
      height: 360,
    });
    expect(rasterPixelSize({ width: 320.4, height: 180.4 }, 4)).toEqual({
      width: 1282,
      height: 722,
    });
  });
});

describe('renderSpecificRasterScale', () => {
  it('preserves available source density up to the supported 4x export ceiling', () => {
    expect(renderSpecificRasterScale(
      { width: 1200, height: 800 },
      { width: 300, height: 200 },
    )).toBe(4);
    expect(renderSpecificRasterScale(
      { width: 900, height: 600 },
      { width: 300, height: 200 },
    )).toBe(3);
  });

  it('never rasterizes a render-specific original request below retina-quality 2x', () => {
    expect(renderSpecificRasterScale(
      { width: 300, height: 200 },
      { width: 300, height: 200 },
    )).toBe(2);
    expect(renderSpecificRasterScale(null, { width: 300, height: 200 })).toBe(2);
  });

  it('uses fractional real source density without rounding up into interpolated pixels', () => {
    expect(renderSpecificRasterScale(
      { width: 825, height: 550 },
      { width: 300, height: 200 },
      2.75,
    )).toBe(2.75);
  });

  it('does not over-export based on unused source pixels after crop geometry is measured', () => {
    expect(renderSpecificRasterScale(
      { width: 4000, height: 4000 },
      { width: 1000, height: 1000 },
      1,
    )).toBe(2);
    expect(renderSpecificRasterScale(
      { width: 4000, height: 4000 },
      { width: 1000, height: 1000 },
      3,
    )).toBe(3);
  });
});

describe('sourceAwareAssetRasterScale', () => {
  it('exports AI-package assets at their highest non-interpolated density up to 4x', () => {
    expect(sourceAwareAssetRasterScale({ verified: true, density: 4.5 })).toBe(4);
    expect(sourceAwareAssetRasterScale({ verified: true, density: 2.756 })).toBe(2.75);
    expect(sourceAwareAssetRasterScale({ verified: true, density: 1.5 })).toBe(1.5);
  });

  it('keeps the authored 1x viewport when source density is unavailable or lower', () => {
    expect(sourceAwareAssetRasterScale(undefined)).toBe(1);
    expect(sourceAwareAssetRasterScale({ verified: false, density: 4 })).toBe(1);
    expect(sourceAwareAssetRasterScale({ verified: true, density: 0.5 })).toBe(1);
  });
});

describe('effectiveSourceRasterDensity', () => {
  it('uses the limiting axis for FILL and the contained image axis for FIT', () => {
    const source = { width: 4000, height: 1000 };
    const rendered = { width: 1000, height: 1000 };

    expect(effectiveSourceRasterDensity(source, rendered, { scaleMode: 'fill' })).toEqual({
      density: 1,
      method: 'fill',
    });
    expect(effectiveSourceRasterDensity(source, rendered, { scaleMode: 'fit' })).toEqual({
      density: 4,
      method: 'fit',
    });
  });

  it('accounts for quarter-turn image rotation before measuring FILL density', () => {
    expect(effectiveSourceRasterDensity(
      { width: 1000, height: 4000 },
      { width: 1000, height: 500 },
      { scaleMode: 'fill', rotation: 90 },
    )).toEqual({ density: 2, method: 'fill' });
  });

  it('uses the crop transform to detect zoomed low-density source pixels', () => {
    expect(effectiveSourceRasterDensity(
      { width: 4000, height: 4000 },
      { width: 1000, height: 1000 },
      { scaleMode: 'crop', transform: [[0.25, 0, 0.375], [0, 0.25, 0.375]] },
    )).toEqual({ density: 1, method: 'crop-transform' });
  });

  it('converts rotated crop axes from source pixels to rendered node pixels', () => {
    expect(effectiveSourceRasterDensity(
      { width: 4000, height: 2000 },
      { width: 1000, height: 500 },
      { scaleMode: 'crop', transform: [[0, 0.25, 0.25], [-0.25, 0, 0.75]] },
    )).toEqual({ density: 0.5, method: 'crop-transform' });
  });

  it('uses tile scaling factor as source pixels per rendered pixel', () => {
    expect(effectiveSourceRasterDensity(
      { width: 100, height: 100 },
      { width: 1000, height: 1000 },
      { scaleMode: 'tile', scalingFactor: 0.5 },
    )).toEqual({ density: 2, method: 'tile-scale' });
  });

  it('returns null when source density cannot be proven', () => {
    expect(effectiveSourceRasterDensity(null, { width: 100, height: 100 }, { scaleMode: 'fill' })).toBeNull();
  });
});

describe('assertMinimumRasterDensity', () => {
  it('accepts exact or effect-expanded 2x raster output', () => {
    expect(assertMinimumRasterDensity(
      { width: 640, height: 360 },
      { width: 320, height: 180 },
      2,
      'Hero',
    )).toBeCloseTo(2);
    expect(assertMinimumRasterDensity(
      { width: 700, height: 400 },
      { width: 320, height: 180 },
      2,
      'Hero',
    )).toBeGreaterThan(2);
    expect(assertMinimumRasterDensity(
      { width: 360, height: 640 },
      { width: 320, height: 180 },
      2,
      'Rotated hero',
    )).toBeCloseTo(2);
  });

  it('rejects a final encoded file below the requested pixel density', () => {
    expect(() => assertMinimumRasterDensity(
      { width: 320, height: 180 },
      { width: 320, height: 180 },
      2,
      'Hero',
    )).toThrow('Hero encoded at 1.00×; expected at least 2×');
  });

  it('rejects one blurry axis even when total pixel area looks like 2x', () => {
    expect(() => assertMinimumRasterDensity(
      { width: 1280, height: 180 },
      { width: 320, height: 180 },
      2,
      'Anisotropic hero',
    )).toThrow('Anisotropic hero encoded at 1.00×');
  });
});

describe('assertMinimumSourceRasterDensity', () => {
  it('accepts proven real source detail at the required density', () => {
    expect(() => assertMinimumSourceRasterDensity({
      verified: true,
      density: 2,
      sourceWidth: 2000,
      sourceHeight: 1000,
      renderedWidth: 1000,
      renderedHeight: 500,
    }, 2, 'Hero')).not.toThrow();
  });

  it('rejects interpolated output backed by an undersized source', () => {
    expect(() => assertMinimumSourceRasterDensity({
      verified: true,
      density: 1,
      sourceWidth: 1000,
      sourceHeight: 500,
      renderedWidth: 1000,
      renderedHeight: 500,
    }, 2, 'Hero')).toThrow(
      'Hero source provides only 1.00× real detail (1000×500px source); 2× is required. Figma would only upscale and remain blurry.',
    );
  });

  it('fails closed when Figma cannot report source dimensions', () => {
    expect(() => assertMinimumSourceRasterDensity(undefined, 2, 'Hero'))
      .toThrow('Hero source resolution could not be verified. Download stopped');
  });
});
