import { describe, expect, it } from 'vitest';
import { extractNode } from '../src/sandbox/extractor';
import { collectRenderedFallbackCandidates } from '../src/shared/fidelity';

function rectangle(id: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    id,
    name: id,
    type: 'RECTANGLE',
    visible: true,
    width: 100,
    height: 60,
    opacity: 1,
    fills: [{
      type: 'SOLID',
      visible: true,
      opacity: 1,
      color: { r: 0.5, g: 0.5, b: 0.5 },
    }],
    strokes: [],
    effects: [],
    ...overrides,
  };
}

function frame(children: unknown[]): SceneNode {
  return {
    id: 'root',
    name: 'Fidelity corpus',
    type: 'FRAME',
    visible: true,
    width: 600,
    height: 400,
    opacity: 1,
    layoutMode: 'NONE',
    fills: [],
    strokes: [],
    effects: [],
    children,
  } as unknown as SceneNode;
}

describe('Figma-like fidelity fixture corpus', () => {
  it('carries a Figma blend mode through extraction into an enclosing-context fallback', () => {
    const extracted = extractNode(frame([
      rectangle('backdrop'),
      rectangle('multiply-artwork', { blendMode: 'MULTIPLY' }),
    ]));

    expect(extracted).not.toBeNull();
    expect(extracted!.children?.[1].style?.blendMode).toBe('multiply');
    expect(collectRenderedFallbackCandidates(extracted!)).toEqual([
      { nodeId: 'root', reasons: ['context-dependent-effect'] },
    ]);
  });

  it('covers shadow, layer blur, and gradient renderer differences end to end', () => {
    const extracted = extractNode(frame([
      rectangle('shadow', {
        effects: [{
          type: 'DROP_SHADOW',
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: 8 },
          radius: 24,
          spread: 0,
        }],
      }),
      rectangle('layer-blur', {
        effects: [{ type: 'LAYER_BLUR', visible: true, radius: 12 }],
      }),
      rectangle('gradient', {
        fills: [{
          type: 'GRADIENT_LINEAR',
          visible: true,
          opacity: 1,
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
          gradientTransform: [[1, 0, 0], [0, 1, 0]],
        }],
      }),
    ]));

    expect(extracted).not.toBeNull();
    expect(collectRenderedFallbackCandidates(extracted!)).toEqual([
      { nodeId: 'shadow', reasons: ['shadow-rendering'] },
      { nodeId: 'layer-blur', reasons: ['blur-rendering'] },
      { nodeId: 'gradient', reasons: ['paint-interpolation'] },
    ]);
  });
});
