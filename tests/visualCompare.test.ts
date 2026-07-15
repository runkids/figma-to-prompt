import { describe, expect, it } from 'vitest';
import type { CaptureReferenceDataMessage, UISerializedNode } from '../src/shared/types';
import {
  buildCaptureReferenceTiles,
  requireStableReference,
  type ImageComparisonResult,
} from '../src/ui/visualCompare';

describe('buildCaptureReferenceTiles', () => {
  it('maps multi-selection references into the synthetic root coordinate system', () => {
    const root: UISerializedNode = {
      id: '__multi_selection__',
      name: 'Selection',
      type: 'FRAME',
      layout: { mode: 'none', width: 320, height: 180 },
      children: [
        { id: '1:1', name: 'Header', type: 'FRAME', layout: { width: 120, height: 40, x: 10, y: 20 } },
        { id: '2:2', name: 'Badge', type: 'ELLIPSE', layout: { width: 32, height: 32, x: 260, y: 12 } },
      ],
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request',
      rootId: root.id,
      nodeIds: ['1:1', '2:2'],
      fileKey: null,
      sourceUrl: null,
      references: { '1:1': 'data:header', '2:2': 'data:badge' },
      assets: {},
      warnings: [],
    };

    expect(buildCaptureReferenceTiles(root, capture)).toEqual({
      width: 320,
      height: 180,
      tiles: [
        { source: 'data:header', x: 10, y: 20, width: 120, height: 40 },
        { source: 'data:badge', x: 260, y: 12, width: 32, height: 32 },
      ],
    });
  });
});

describe('requireStableReference', () => {
  it('returns machine-readable evidence for two identical Figma renders', () => {
    const result: Extract<ImageComparisonResult, { kind: 'compared' }> = {
      kind: 'compared',
      referenceWidth: 320,
      referenceHeight: 180,
      candidateWidth: 320,
      candidateHeight: 180,
      channelThreshold: 0,
      totalPixels: 57_600,
      differentPixels: 0,
      diffRatio: 0,
      pixelMatch: 100,
      meanAbsoluteError: 0,
      maxChannelDelta: 0,
      diffBounds: null,
      diffRegions: [],
      totalDiffRegions: 0,
      diffRgba: new Uint8ClampedArray(320 * 180 * 4),
      diffDataUrl: 'data:image/png;base64,stable',
    };

    expect(requireStableReference(result)).toEqual({
      renderCount: 2,
      width: 320,
      height: 180,
      differentPixels: 0,
      maxChannelDelta: 0,
    });
  });

  it('rejects changing dimensions or pixels in the Figma reference itself', () => {
    expect(() => requireStableReference({
      kind: 'dimension-mismatch',
      referenceWidth: 320,
      referenceHeight: 180,
      candidateWidth: 321,
      candidateHeight: 180,
    })).toThrow('changed size between consecutive renders');

    const unstable = {
      kind: 'compared',
      referenceWidth: 1,
      referenceHeight: 1,
      candidateWidth: 1,
      candidateHeight: 1,
      channelThreshold: 0,
      totalPixels: 1,
      differentPixels: 1,
      diffRatio: 1,
      pixelMatch: 0,
      meanAbsoluteError: 12,
      maxChannelDelta: 48,
      diffBounds: { x: 0, y: 0, width: 1, height: 1 },
      diffRegions: [{
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        differentPixels: 1,
        density: 1,
        meanAbsoluteError: 12,
        maxChannelDelta: 48,
      }],
      totalDiffRegions: 1,
      diffRgba: new Uint8ClampedArray(4),
      diffDataUrl: 'data:image/png;base64,unstable',
    } satisfies Extract<ImageComparisonResult, { kind: 'compared' }>;
    expect(() => requireStableReference(unstable)).toThrow('1 pixels changed');
  });
});
