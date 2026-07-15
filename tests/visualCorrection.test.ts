import { describe, expect, it } from 'vitest';
import type { UISerializedNode } from '../src/shared/types';
import type { ImageComparisonResult } from '../src/ui/visualCompare';
import { createVisualCorrectionBundle } from '../src/ui/visualCorrection';

const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('createVisualCorrectionBundle', () => {
  it('packages the fresh reference, candidate, diff, and machine-readable correction report', async () => {
    const root: UISerializedNode = {
      id: '1:23',
      name: 'Checkout Card',
      type: 'FRAME',
      layout: { width: 1, height: 1 },
    };
    const result: Extract<ImageComparisonResult, { kind: 'compared' }> = {
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
      meanAbsoluteError: 12.5,
      maxChannelDelta: 50,
      diffBounds: { x: 0, y: 0, width: 1, height: 1 },
      diffRegions: [{
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        differentPixels: 1,
        density: 1,
        meanAbsoluteError: 12.5,
        maxChannelDelta: 50,
      }],
      totalDiffRegions: 1,
      diffRgba: new Uint8ClampedArray([255, 0, 170, 255]),
      diffDataUrl: pixel,
    };
    const candidate = new File([await (await fetch(pixel)).arrayBuffer()], 'ai-output.png', {
      type: 'image/png',
    });

    const bundle = await createVisualCorrectionBundle({
      root,
      referenceDataUrl: pixel,
      candidate,
      result,
    });

    expect(bundle.filename).toBe('Checkout_Card.visual-correction.zip');
    expect(bundle.report).toEqual(expect.objectContaining({
      schemaVersion: 1,
      selection: { id: '1:23', name: 'Checkout Card' },
      candidateFileName: 'ai-output.png',
      targetViewport: { width: 1, height: 1 },
      metrics: expect.objectContaining({
        differentPixels: 1,
        totalPixels: 1,
        pixelMatch: 0,
        diffBounds: { x: 0, y: 0, width: 1, height: 1 },
        totalDiffRegions: 1,
        diffRegions: [expect.objectContaining({
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          differentPixels: 1,
          nodes: [{
            nodeId: '1:23',
            name: 'Checkout Card',
            type: 'FRAME',
            overlapRatio: 1,
          }],
        })],
      }),
    }));
    const zipText = new TextDecoder().decode(await bundle.blob.arrayBuffer());
    expect(zipText).toContain('reference.png');
    expect(zipText).toContain('candidate.png');
    expect(zipText).toContain('visual-diff.png');
    expect(zipText).toContain('verification.json');
    expect(zipText).toContain('instructions.md');
    expect(zipText).toContain('Fix every magenta pixel');
    expect(zipText).toContain('Priority correction regions');
    expect(zipText).toContain('x 0, y 0, 1×1px');
    expect(zipText).toContain('Checkout Card (FRAME, node 1:23)');
    expect(zipText).toContain('"differentPixels": 1');
  });
});
