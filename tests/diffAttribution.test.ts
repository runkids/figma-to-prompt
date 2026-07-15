import { describe, expect, it } from 'vitest';
import { attributeDiffRegions } from '../src/shared/diffAttribution';
import type { UISerializedNode } from '../src/shared/types';
import type { VisualDiffRegion } from '../src/shared/visualDiff';

const root: UISerializedNode = {
  id: 'root',
  name: 'Checkout',
  type: 'FRAME',
  layout: { width: 240, height: 140 },
  children: [
    {
      id: 'header',
      name: 'Header',
      type: 'FRAME',
      layout: { x: 10, y: 10, width: 180, height: 40 },
      children: [{
        id: 'title',
        name: 'Title',
        type: 'TEXT',
        layout: { x: 8, y: 6, width: 100, height: 24 },
      }],
    },
    {
      id: 'button',
      name: 'Submit',
      type: 'RECTANGLE',
      layout: { x: 120, y: 80, width: 80, height: 40 },
    },
  ],
};

function region(overrides: Partial<VisualDiffRegion>): VisualDiffRegion {
  return {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    differentPixels: 1,
    density: 1,
    meanAbsoluteError: 10,
    maxChannelDelta: 40,
    ...overrides,
  };
}

describe('attributeDiffRegions', () => {
  it('maps correction boxes to the deepest overlapping Figma nodes', () => {
    const attributed = attributeDiffRegions(root, [
      region({ x: 20, y: 18, width: 20, height: 10 }),
      region({ x: 130, y: 90, width: 10, height: 10 }),
    ]);

    expect(attributed[0].nodes).toEqual([{
      nodeId: 'title',
      name: 'Title',
      type: 'TEXT',
      overlapRatio: 1,
    }]);
    expect(attributed[1].nodes).toEqual([{
      nodeId: 'button',
      name: 'Submit',
      type: 'RECTANGLE',
      overlapRatio: 1,
    }]);
  });

  it('uses effect-inclusive render bounds during attribution', () => {
    const shadowRoot: UISerializedNode = {
      id: 'root',
      name: 'Shadow fixture',
      type: 'FRAME',
      layout: { width: 100, height: 100 },
      children: [{
        id: 'card',
        name: 'Card shadow',
        type: 'RECTANGLE',
        layout: {
          x: 20,
          y: 20,
          width: 40,
          height: 40,
          renderBounds: { x: -8, y: -8, width: 56, height: 64 },
        },
      }],
    };

    expect(attributeDiffRegions(shadowRoot, [
      region({ x: 14, y: 68, width: 8, height: 8 }),
    ])[0].nodes[0]).toEqual(expect.objectContaining({ nodeId: 'card' }));
  });
});
