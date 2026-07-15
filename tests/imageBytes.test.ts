import { describe, expect, it } from 'vitest';
import { detectEncodedImageMediaType } from '../src/shared/imageBytes';

describe('detectEncodedImageMediaType', () => {
  it.each([
    [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'],
    [Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    [new TextEncoder().encode('GIF89a'), 'image/gif'],
    [new TextEncoder().encode('RIFF1234WEBP'), 'image/webp'],
    [Uint8Array.from([0, 0, 0, 20, ...new TextEncoder().encode('ftypavif')]), 'image/avif'],
  ] as const)('detects encoded bytes as %s', (bytes, mediaType) => {
    expect(detectEncodedImageMediaType(bytes)).toBe(mediaType);
  });

  it('rejects unknown bytes instead of falsely labeling them PNG', () => {
    expect(detectEncodedImageMediaType(new TextEncoder().encode('not-an-image'))).toBeNull();
  });
});
