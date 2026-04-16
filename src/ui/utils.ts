import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ImageFormat } from '../shared/types';

/**
 * Synchronous fallback copy via a hidden textarea + execCommand. Figma's plugin iframe
 * sometimes blocks `navigator.clipboard.writeText`; this works in those contexts.
 */
function execCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return execCopy(text);
    }
  }
  return execCopy(text);
}

/** scale=0 pulls the original PNG raster via getImageByHash, then we transcode
 *  client-side when the user picks a lossy target. When a browser cannot encode
 *  the requested MIME (notably AVIF), canvas falls back to PNG; in that case the
 *  extension must follow the actual data URL so we never save fake .avif files. */
export function perImageExt(_scale: number, format: ImageFormat, dataUrl?: string | null): string {
  return dataUrlExt(dataUrl) ?? formatExt(format);
}

/** Extension used in merged-mode download, matching the actual encoded data. */
export function mergedExt(format: ImageFormat, dataUrl?: string | null): string {
  return dataUrlExt(dataUrl) ?? formatExt(format);
}

/** Lower-cased file extension (no dot) for an output format. */
function formatExt(format: ImageFormat): string {
  switch (format) {
    case 'JPG': return 'jpg';
    case 'SVG': return 'svg';
    case 'WEBP': return 'webp';
    case 'AVIF': return 'avif';
    default: return 'png';
  }
}

function dataUrlExt(dataUrl?: string | null): string | null {
  const mime = /^data:([^;,]+)/.exec(dataUrl ?? '')?.[1]?.toLowerCase();
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/svg+xml': return 'svg';
    case 'image/webp': return 'webp';
    case 'image/avif': return 'avif';
    default: return null;
  }
}

/**
 * Transient feedback flash for action buttons (Copy / Download).
 * Clears the timeout on unmount so we never call setState on a dead component.
 */
export function useFeedback<T>(durationMs = 1500) {
  const [feedback, setFeedback] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = useCallback(
    (value: T) => {
      if (timer.current) clearTimeout(timer.current);
      setFeedback(value);
      timer.current = setTimeout(() => setFeedback(null), durationMs);
    },
    [durationMs],
  );

  return [feedback, flash] as const;
}

/**
 * Debounce a callback so rapid invocations (e.g., per-keystroke input) collapse
 * into a single trailing call. Returns a stable function reference.
 *
 * Why this lives here: name-input keystrokes used to dispatch immediately, which
 * forced `buildPrompt` (a full tree walk + token collection) to run per keystroke.
 * Debouncing at the input layer keeps the reducer pure while flattening the cost.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (...args: Args) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delayMs);
    },
    [delayMs],
  );
}
