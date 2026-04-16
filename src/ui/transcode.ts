/**
 * Client-side image re-encoding. Figma's exportAsync can only produce
 * PNG / JPG / SVG natively, so to support WebP / AVIF (and to give users control
 * over JPG quality) we ask the sandbox for a PNG source and transcode in the UI
 * iframe. JPG/WebP use `<canvas>.toBlob`; AVIF uses a bundled WASM encoder first
 * because Chromium may silently fall back to PNG for canvas AVIF output.
 *
 * Scoped to the desktop Figma app, which ships a Chromium runtime — all formats
 * we advertise here (webp, avif) are encodable. Web-hosted Figma on non-Chromium
 * browsers is out of scope per product direction.
 */

import type { ImageFormat, SandboxImageFormat } from '../shared/types';

/** Format translation at the sandbox boundary: Figma natively understands
 *  PNG / JPG / SVG, but we route anything lossy through a PNG source so we can
 *  control quality. SVG passes through unchanged. */
export function toSandboxFormat(format: ImageFormat): SandboxImageFormat {
  return format === 'SVG' ? 'SVG' : 'PNG';
}

/** Whether the final output requires a lossy re-encode from the raw sandbox
 *  result. PNG / SVG are passthrough; JPG / WebP / AVIF must be encoded client-side. */
export function isLossy(format: ImageFormat): boolean {
  return format === 'JPG' || format === 'WEBP' || format === 'AVIF';
}

/** Canvas `toBlob` MIME type for a given lossy format. Undefined when the
 *  format doesn't require transcoding. */
export function targetMime(format: ImageFormat): string | null {
  switch (format) {
    case 'JPG':  return 'image/jpeg';
    case 'WEBP': return 'image/webp';
    case 'AVIF': return 'image/avif';
    default:     return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('reader failed'));
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function qualityToAvifCqLevel(quality: number): number {
  return Math.max(0, Math.min(63, Math.round(63 - quality * 63)));
}

async function encodeAvif(data: ImageData, quality: number): Promise<string | null> {
  try {
    const { encode } = await import('@jsquash/avif');
    const buffer = await encode(data, {
      cqLevel: qualityToAvifCqLevel(quality),
      speed: 6,
    });
    return arrayBufferToDataUrl(buffer, 'image/avif');
  } catch {
    return null;
  }
}

/** Decode `src` (any browser-supported raster data URL) and re-encode as
 *  `format` at `quality` (0–1, ignored for lossless formats). Returns the
 *  original data URL on any failure so the caller never ends up with nothing. */
export async function transcodeDataUrl(
  src: string,
  format: ImageFormat,
  quality: number,
): Promise<string> {
  const mime = targetMime(format);
  if (!mime) return src; // PNG / SVG: passthrough

  try {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0);

    if (format === 'AVIF') {
      const avif = await encodeAvif(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
        quality,
      );
      if (avif) return avif;
    }

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, mime, quality),
    );
    // `toBlob` returns null when the runtime can't encode the MIME (e.g. AVIF
    // on older browsers). Fall back to the PNG source so the user still gets
    // a usable file, and let the UI surface the issue via the file extension
    // no longer matching — acceptable since desktop Figma always supports both.
    if (!blob) return src;

    return await blobToDataUrl(blob);
  } catch {
    return src;
  }
}
