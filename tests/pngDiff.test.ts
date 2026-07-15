import { describe, expect, it } from 'vitest';
// @ts-expect-error The production visual-diff CLI is a dependency-free ESM module.
import { comparePngBuffers, encodeRgbaPng } from '../scripts/lib/png-diff.mjs';

describe('PNG visual diff', () => {
  it('passes identical reference and implementation renders', async () => {
    const png = await encodeRgbaPng(2, 1, new Uint8Array([
      255, 0, 0, 255,
      0, 0, 255, 255,
    ]));

    const result = await comparePngBuffers(png, png);

    expect(result).toEqual(expect.objectContaining({
      width: 2,
      height: 1,
      differentPixels: 0,
      diffRatio: 0,
      meanAbsoluteError: 0,
      maxChannelDelta: 0,
    }));
  });

  it('measures changed pixels independently from the acceptance threshold', async () => {
    const reference = await encodeRgbaPng(2, 1, new Uint8Array([
      255, 0, 0, 255,
      0, 0, 255, 255,
    ]));
    const implementation = await encodeRgbaPng(2, 1, new Uint8Array([
      250, 0, 0, 255,
      0, 255, 0, 255,
    ]));

    const strict = await comparePngBuffers(reference, implementation);
    const tolerant = await comparePngBuffers(reference, implementation, { pixelThreshold: 0.02 });

    expect(strict.differentPixels).toBe(2);
    expect(strict.diffRatio).toBe(1);
    expect(strict.maxChannelDelta).toBe(255);
    expect(tolerant.differentPixels).toBe(1);
    expect(tolerant.diffRatio).toBe(0.5);
  });

  it('rejects renders with different dimensions', async () => {
    const onePixel = await encodeRgbaPng(1, 1, new Uint8Array([0, 0, 0, 255]));
    const twoPixels = await encodeRgbaPng(2, 1, new Uint8Array([
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]));

    await expect(comparePngBuffers(onePixel, twoPixels)).rejects.toThrow('dimensions');
  });
});
