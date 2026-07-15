import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ImageFormat } from '../shared/types';

/**
 * Synchronous fallback copy via a hidden textarea + execCommand. Figma's plugin iframe
 * sometimes blocks `navigator.clipboard.writeText`; this works in those contexts.
 */
function execCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;

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
  // In Figma's iframe, navigator.clipboard.writeText can resolve without
  // updating the system clipboard. Keep the synchronous copy path first so it
  // still runs inside the user's click activation.
  if (execCopy(text)) return true;

  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** scale=0 returns the original PNG raster when possible, then we transcode
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
    case 'image/gif': return 'gif';
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
