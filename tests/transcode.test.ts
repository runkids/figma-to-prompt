import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transcodeDataUrl } from '../src/ui/transcode';
import { encode } from '@jsquash/avif';

vi.mock('@jsquash/avif', () => ({
  encode: vi.fn(),
}));

const originalDocument = globalThis.document;
const originalFileReader = globalThis.FileReader;
const originalImage = globalThis.Image;

function setGlobal(name: 'document' | 'FileReader' | 'Image', value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function installCanvasTranscodeMocks(encodedMime: string) {
  const drawImage = vi.fn();
  const imageData = {
    data: new Uint8ClampedArray(12 * 8 * 4),
    width: 12,
    height: 8,
  } as ImageData;
  const getImageData = vi.fn(() => imageData);
  const toBlob = vi.fn((callback: BlobCallback, _mime: string, _quality?: number) => {
    callback(new Blob(['encoded'], { type: encodedMime }));
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage, getImageData })),
    toBlob,
  };

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 12;
    naturalHeight = 8;
    width = 12;
    height = 8;

    set src(_src: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  class FakeFileReader {
    result: string | ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    error: Error | null = null;

    readAsDataURL(blob: Blob) {
      this.result = `data:${blob.type};base64,encoded`;
      queueMicrotask(() => this.onload?.());
    }
  }

  setGlobal('document', { createElement: vi.fn(() => canvas) });
  setGlobal('FileReader', FakeFileReader);
  setGlobal('Image', FakeImage);

  return { canvas, drawImage, getImageData, imageData, toBlob };
}

describe('transcodeDataUrl', () => {
  beforeEach(() => {
    vi.mocked(encode).mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
  });

  afterEach(() => {
    vi.mocked(encode).mockReset();
    setGlobal('document', originalDocument);
    setGlobal('FileReader', originalFileReader);
    setGlobal('Image', originalImage);
  });

  it('passes AVIF quality through to the WASM encoder', async () => {
    const { canvas, drawImage, getImageData, imageData, toBlob } = installCanvasTranscodeMocks('image/avif');

    const result = await transcodeDataUrl('data:image/png;base64,source', 'AVIF', 0.8);

    expect(canvas.width).toBe(12);
    expect(canvas.height).toBe(8);
    expect(drawImage).toHaveBeenCalled();
    expect(getImageData).toHaveBeenCalledWith(0, 0, 12, 8);
    expect(encode).toHaveBeenCalledWith(imageData, expect.objectContaining({ cqLevel: 13, speed: 6 }));
    expect(toBlob).not.toHaveBeenCalled();
    expect(result).toBe('data:image/avif;base64,AQID');
  });

  it('passes WebP quality through to canvas.toBlob', async () => {
    const { toBlob } = installCanvasTranscodeMocks('image/webp');

    const result = await transcodeDataUrl('data:image/png;base64,source', 'WEBP', 0.72);

    expect(encode).not.toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.72);
    expect(result).toBe('data:image/webp;base64,encoded');
  });

  it('preserves the actual MIME when WASM fails and the browser falls back from AVIF to PNG', async () => {
    vi.mocked(encode).mockRejectedValueOnce(new Error('wasm failed'));
    const { toBlob } = installCanvasTranscodeMocks('image/png');

    const result = await transcodeDataUrl('data:image/png;base64,source', 'AVIF', 0.8);

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/avif', 0.8);
    expect(result).toBe('data:image/png;base64,encoded');
  });
});
