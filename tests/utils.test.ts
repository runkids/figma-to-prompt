import { describe, expect, it } from 'vitest';
import { mergedExt, perImageExt } from '../src/ui/utils';

describe('image output extensions', () => {
  it('uses the actual encoded data URL MIME when available', () => {
    expect(perImageExt(1, 'AVIF', 'data:image/png;base64,source')).toBe('png');
    expect(perImageExt(1, 'AVIF', 'data:image/avif;base64,encoded')).toBe('avif');
    expect(perImageExt(1, 'WEBP', 'data:image/webp;base64,encoded')).toBe('webp');
    expect(mergedExt('WEBP', 'data:image/jpeg;base64,encoded')).toBe('jpg');
  });

  it('falls back to the selected format before image data arrives', () => {
    expect(perImageExt(1, 'AVIF')).toBe('avif');
    expect(mergedExt('PNG', null)).toBe('png');
  });
});
