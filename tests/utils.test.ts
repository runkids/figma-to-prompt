import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, mergedExt, perImageExt } from '../src/ui/utils';

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

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubDocument(execResult: boolean) {
    const textarea = {
      value: '',
      style: {},
      select: vi.fn(),
    };
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const execCommand = vi.fn(() => execResult);

    vi.stubGlobal('document', {
      body: { appendChild, removeChild },
      createElement: vi.fn(() => textarea),
      execCommand,
    });

    return { textarea, appendChild, removeChild, execCommand };
  }

  it('prefers synchronous copy before navigator clipboard in Figma iframes', async () => {
    const writeText = vi.fn();
    const { textarea, execCommand } = stubDocument(true);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyToClipboard('prompt text')).resolves.toBe(true);

    expect(textarea.value).toBe('prompt text');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to navigator clipboard when execCommand is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubDocument(false);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyToClipboard('prompt text')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('prompt text');
  });
});
