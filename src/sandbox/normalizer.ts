import type { UISerializedNode } from '@shared/types';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface LineHeight {
  unit: 'AUTO' | 'PIXELS' | 'PERCENT';
  value?: number;
}

export function rgbaToHex(color: RGBA): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).toUpperCase().padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function normalizeLineHeight(lh: LineHeight, fontSize: number): number | undefined {
  if (lh.unit === 'PIXELS') return lh.value;
  if (lh.unit === 'PERCENT') return Math.round(((lh.value ?? 0) / 100) * fontSize);
  return undefined;
}

/**
 * Round a number to at most `decimals` decimal places,
 * stripping trailing float noise (e.g. 9.600000381469727 → 9.6).
 */
export function roundNum(n: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Recursively round all numeric values in a plain object / array.
 * Strings, booleans, null, undefined are left untouched.
 */
function roundDeep<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') return roundNum(obj) as T;
  if (Array.isArray(obj)) return obj.map(roundDeep) as T;
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      out[key] = roundDeep(val);
    }
    return out as T;
  }
  return obj;
}

export function normalizeNode(node: UISerializedNode): UISerializedNode {
  const result: UISerializedNode = { ...node };

  // visible: true → omit; visible: false → keep
  if (result.visible === true) {
    delete result.visible;
  }

  // Round all numeric values in layout & style
  if (result.layout) result.layout = roundDeep(result.layout);
  if (result.style) result.style = roundDeep(result.style);
  if (result.textStyleRanges) result.textStyleRanges = roundDeep(result.textStyleRanges);

  // children: empty → remove; non-empty → recurse
  if (result.children !== undefined) {
    if (result.children.length === 0) {
      delete result.children;
    } else {
      result.children = result.children.map(normalizeNode);
    }
  }

  // padding: all zeros → remove
  if (result.layout?.padding) {
    const p = result.layout.padding;
    if (p.top === 0 && p.right === 0 && p.bottom === 0 && p.left === 0) {
      result.layout = { ...result.layout };
      delete result.layout.padding;
    }
  }

  return result;
}
