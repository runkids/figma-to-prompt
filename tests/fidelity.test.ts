import { describe, expect, it } from 'vitest';
import { collectRenderedFallbackCandidates } from '../src/shared/fidelity';
import type { UISerializedNode } from '../src/shared/types';

describe('collectRenderedFallbackCandidates', () => {
  it('collects exact-render fallbacks for text, vectors, and critical visual risks', () => {
    const root: UISerializedNode = {
      id: 'root',
      name: 'Card',
      type: 'FRAME',
      children: [
        { id: 'text', name: 'Title', type: 'TEXT', text: 'Hello' },
        { id: 'vector', name: 'Logo', type: 'VECTOR' },
        {
          id: 'pattern',
          name: 'Pattern',
          type: 'RECTANGLE',
          fidelityWarnings: [{
            code: 'unsupported-fill-pattern',
            severity: 'critical',
            message: 'Pattern needs a renderer.',
          }],
        },
        { id: 'plain', name: 'Plain', type: 'RECTANGLE' },
      ],
    };

    expect(collectRenderedFallbackCandidates(root)).toEqual([
      { nodeId: 'text', reasons: ['text-rendering'] },
      { nodeId: 'vector', reasons: ['vector-geometry'] },
      { nodeId: 'pattern', reasons: ['critical-fidelity-warning'] },
    ]);
  });

  it('renders the enclosing group once when masks or background blur need sibling context', () => {
    const root: UISerializedNode = {
      id: 'root',
      name: 'Card',
      type: 'FRAME',
      children: [{
        id: 'masked-group',
        name: 'Masked artwork',
        type: 'GROUP',
        children: [
          { id: 'mask', name: 'Mask', type: 'VECTOR', style: { isMask: true } },
          { id: 'blur', name: 'Blurred image', type: 'RECTANGLE', style: { blurEffects: [{ type: 'background', radius: 12 }] } },
          { id: 'label', name: 'Label', type: 'TEXT', text: 'Inside' },
        ],
      }],
    };

    expect(collectRenderedFallbackCandidates(root)).toEqual([
      { nodeId: 'masked-group', reasons: ['context-dependent-effect'] },
    ]);
  });

  it('captures arcs, squircle geometry, and unknown node types but skips hidden subtrees', () => {
    const root = {
      id: 'root',
      name: 'Card',
      type: 'FRAME',
      children: [
        { id: 'arc', name: 'Arc', type: 'ELLIPSE', arcData: { startingAngle: 0, endingAngle: 1, innerRadius: 0.5 } },
        { id: 'squircle', name: 'Squircle', type: 'RECTANGLE', style: { cornerSmoothing: 0.8 } },
        { id: 'unknown', name: 'Unknown', type: 'INK' },
        { id: 'hidden', name: 'Hidden', type: 'GROUP', visible: false, children: [{ id: 'hidden-text', name: 'Text', type: 'TEXT' }] },
      ],
    } as unknown as UISerializedNode;

    expect(collectRenderedFallbackCandidates(root)).toEqual([
      { nodeId: 'arc', reasons: ['arc-geometry'] },
      { nodeId: 'squircle', reasons: ['corner-smoothing'] },
      { nodeId: 'unknown', reasons: ['unsupported-node'] },
    ]);
  });

  it('keeps precise child fallbacks when a parent has its own non-contextual risk', () => {
    const root: UISerializedNode = {
      id: 'root',
      name: 'Squircle card',
      type: 'FRAME',
      style: { cornerSmoothing: 0.8 },
      children: [{ id: 'text', name: 'Title', type: 'TEXT', text: 'Hello' }],
    };

    expect(collectRenderedFallbackCandidates(root)).toEqual([
      { nodeId: 'root', reasons: ['corner-smoothing'] },
      { nodeId: 'text', reasons: ['text-rendering'] },
    ]);
  });

  it('treats text on a path as known text plus vector geometry', () => {
    const root = {
      id: 'path-text',
      name: 'Circular label',
      type: 'TEXT_PATH',
      text: 'Around',
    } as UISerializedNode;

    expect(collectRenderedFallbackCandidates(root)).toEqual([
      { nodeId: 'path-text', reasons: ['text-rendering', 'vector-geometry'] },
    ]);
  });

  it('marks transform modifiers for an exact rendered fallback', () => {
    const root = {
      id: 'repeat',
      name: 'Repeated ornament',
      type: 'TRANSFORM_GROUP',
      transformModifiers: [{
        type: 'repeat',
        repeatType: 'radial',
        count: 12,
        unitType: 'relative',
        offset: 0,
      }],
    } as UISerializedNode;

    expect(collectRenderedFallbackCandidates(root)).toEqual([
      { nodeId: 'repeat', reasons: ['transform-modifier'] },
    ]);
  });

  it('renders an enclosing context for non-normal blend modes', () => {
    const root: UISerializedNode = {
      id: 'root',
      name: 'Blend fixture',
      type: 'FRAME',
      children: [
        { id: 'backdrop', name: 'Backdrop', type: 'RECTANGLE' },
        {
          id: 'blended',
          name: 'Multiply artwork',
          type: 'RECTANGLE',
          style: { blendMode: 'multiply' },
        },
      ],
    };

    expect(collectRenderedFallbackCandidates(root)).toEqual([
      { nodeId: 'root', reasons: ['context-dependent-effect'] },
    ]);
  });

  it('covers renderer-sensitive shadows, layer blur, and gradient interpolation', () => {
    const root: UISerializedNode = {
      id: 'root',
      name: 'Effects fixture',
      type: 'FRAME',
      children: [
        {
          id: 'shadow',
          name: 'Shadow',
          type: 'RECTANGLE',
          style: {
            shadows: [{
              type: 'drop',
              color: '#000000',
              offsetX: 0,
              offsetY: 8,
              blur: 24,
              spread: 0,
            }],
          },
        },
        {
          id: 'blur',
          name: 'Layer blur',
          type: 'RECTANGLE',
          style: { blurEffects: [{ type: 'layer', radius: 12 }] },
        },
        {
          id: 'gradient',
          name: 'Gradient',
          type: 'RECTANGLE',
          style: {
            fills: [{
              type: 'gradient',
              sourceType: 'GRADIENT_LINEAR',
              gradientType: 'linear',
            }],
          },
        },
      ],
    };

    expect(collectRenderedFallbackCandidates(root)).toEqual([
      { nodeId: 'shadow', reasons: ['shadow-rendering'] },
      { nodeId: 'blur', reasons: ['blur-rendering'] },
      { nodeId: 'gradient', reasons: ['paint-interpolation'] },
    ]);
  });
});
