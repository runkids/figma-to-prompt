import { describe, expect, it } from 'vitest';
import { compareRgbaPixels } from '../src/shared/visualDiff';

describe('compareRgbaPixels', () => {
  it('reports a perfect pixel match for identical images', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);

    const result = compareRgbaPixels(pixels, pixels.slice(), 2, 1);

    expect(result).toEqual(expect.objectContaining({
      totalPixels: 2,
      differentPixels: 0,
      diffRatio: 0,
      pixelMatch: 100,
      meanAbsoluteError: 0,
      maxChannelDelta: 0,
      diffBounds: null,
    }));
    expect([...result.diffRgba]).toEqual([
      76, 76, 76, 255,
      150, 150, 150, 255,
    ]);
  });

  it('requires exact channel equality for a default 100% score', () => {
    const reference = new Uint8ClampedArray([100, 100, 100, 255]);
    const candidate = new Uint8ClampedArray([101, 100, 100, 255]);

    const result = compareRgbaPixels(reference, candidate, 1, 1);

    expect(result.differentPixels).toBe(1);
    expect(result.pixelMatch).toBe(0);
    expect(result.maxChannelDelta).toBe(1);
  });

  it('ignores channel differences within the configured threshold', () => {
    const reference = new Uint8ClampedArray([100, 100, 100, 255]);
    const candidate = new Uint8ClampedArray([103, 98, 104, 255]);

    const result = compareRgbaPixels(reference, candidate, 1, 1, {
      channelThreshold: 4,
    });

    expect(result.differentPixels).toBe(0);
    expect(result.pixelMatch).toBe(100);
    expect(result.meanAbsoluteError).toBeCloseTo(2.25);
    expect(result.maxChannelDelta).toBe(4);
  });

  it('marks changed pixels in magenta and reports their exact ratio', () => {
    const reference = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
    const candidate = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 40, 0, 255,
    ]);

    const result = compareRgbaPixels(reference, candidate, 2, 1, {
      channelThreshold: 8,
    });

    expect(result.differentPixels).toBe(1);
    expect(result.diffRatio).toBe(0.5);
    expect(result.pixelMatch).toBe(50);
    expect(result.diffBounds).toEqual({ x: 1, y: 0, width: 1, height: 1 });
    expect([...result.diffRgba].slice(4)).toEqual([255, 0, 170, 255]);
  });

  it('rejects pixel buffers that do not match the declared dimensions', () => {
    expect(() => compareRgbaPixels(
      new Uint8ClampedArray(4),
      new Uint8ClampedArray(8),
      1,
      1,
    )).toThrow('RGBA buffer length');
  });

  it('clusters separate changed areas into prioritized correction regions', () => {
    const reference = new Uint8ClampedArray(5 * 3 * 4);
    const candidate = reference.slice();
    for (const [x, y, value] of [[0, 0, 40], [1, 0, 80], [4, 2, 20]] as const) {
      const offset = (y * 5 + x) * 4;
      candidate[offset] = value;
    }

    const result = compareRgbaPixels(reference, candidate, 5, 3);

    expect(result.diffRegions).toEqual([
      {
        x: 0,
        y: 0,
        width: 2,
        height: 1,
        differentPixels: 2,
        density: 1,
        meanAbsoluteError: 15,
        maxChannelDelta: 80,
      },
      {
        x: 4,
        y: 2,
        width: 1,
        height: 1,
        differentPixels: 1,
        density: 1,
        meanAbsoluteError: 5,
        maxChannelDelta: 20,
      },
    ]);
    expect(result.totalDiffRegions).toBe(2);
  });
});
