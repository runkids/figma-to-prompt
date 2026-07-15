import type { UISerializedNode } from '../shared/types';
import { attributeDiffRegions, type AttributedDiffRegion } from '../shared/diffAttribution';
import { createZip, dataUrlToBlob } from './download';
import { sanitizeFileName } from './prompt';
import type { ImageComparisonResult } from './visualCompare';

type ComparedResult = Extract<ImageComparisonResult, { kind: 'compared' }>;

export interface VisualCorrectionReport {
  schemaVersion: 1;
  selection: { id: string; name: string };
  candidateFileName: string;
  targetViewport: { width: number; height: number };
  metrics: {
    channelThreshold: number;
    totalPixels: number;
    differentPixels: number;
    diffRatio: number;
    pixelMatch: number;
    meanAbsoluteError: number;
    maxChannelDelta: number;
    diffBounds: ComparedResult['diffBounds'];
    diffRegions: AttributedDiffRegion[];
    totalDiffRegions: number;
  };
  files: {
    reference: 'reference.png';
    candidate: 'candidate.png';
    diff: 'visual-diff.png';
    instructions: 'instructions.md';
  };
}

export interface BuiltVisualCorrection {
  blob: Blob;
  filename: string;
  report: VisualCorrectionReport;
}

async function pngBytes(blob: Blob, label: string): Promise<Uint8Array> {
  if (blob.type.split(';')[0] !== 'image/png') {
    throw new Error(`${label} must be a lossless PNG.`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export async function createVisualCorrectionBundle(input: {
  root: UISerializedNode;
  referenceDataUrl: string;
  candidate: File;
  result: ComparedResult;
}): Promise<BuiltVisualCorrection> {
  const { root, result } = input;
  if (result.differentPixels === 0) {
    throw new Error('An exact pixel match does not need a correction package.');
  }

  const [referenceBytes, candidateBytes, diffBytes] = await Promise.all([
    dataUrlToBlob(input.referenceDataUrl).then((blob) => pngBytes(blob, 'Reference')),
    pngBytes(input.candidate, 'Candidate'),
    dataUrlToBlob(result.diffDataUrl).then((blob) => pngBytes(blob, 'Visual diff')),
  ]);
  const attributedRegions = attributeDiffRegions(root, result.diffRegions);
  const report: VisualCorrectionReport = {
    schemaVersion: 1,
    selection: { id: root.id, name: root.name },
    candidateFileName: input.candidate.name,
    targetViewport: { width: result.referenceWidth, height: result.referenceHeight },
    metrics: {
      channelThreshold: result.channelThreshold,
      totalPixels: result.totalPixels,
      differentPixels: result.differentPixels,
      diffRatio: result.diffRatio,
      pixelMatch: result.pixelMatch,
      meanAbsoluteError: result.meanAbsoluteError,
      maxChannelDelta: result.maxChannelDelta,
      diffBounds: result.diffBounds,
      diffRegions: attributedRegions,
      totalDiffRegions: result.totalDiffRegions,
    },
    files: {
      reference: 'reference.png',
      candidate: 'candidate.png',
      diff: 'visual-diff.png',
      instructions: 'instructions.md',
    },
  };
  const encoder = new TextEncoder();
  const regionInstructions = attributedRegions.map((region, index) => {
    const nodes = region.nodes.map((node) =>
      `${node.name} (${node.type}, node ${node.nodeId})`).join('; ');
    return `${index + 1}. x ${region.x}, y ${region.y}, ${region.width}×${region.height}px; `
      + `${region.differentPixels.toLocaleString()} changed pixels; `
      + `${(region.density * 100).toFixed(1)}% density; `
      + `mean error ${region.meanAbsoluteError.toFixed(2)}; max channel delta ${region.maxChannelDelta}.`
      + (nodes ? ` Likely Figma nodes: ${nodes}.` : '');
  });
  const instructions = [
    '# Visual Correction Pass',
    '',
    'Fix every magenta pixel shown in `visual-diff.png`.',
    'Use `reference.png` as visual truth and `candidate.png` as the implementation output from the previous pass.',
    `Render the next screenshot at exactly ${result.referenceWidth}×${result.referenceHeight} CSS pixels as a lossless PNG.`,
    'Read `verification.json` for exact error counts and the smallest changed bounding box.',
    '',
    '## Priority correction regions',
    ...regionInstructions,
    ...(result.totalDiffRegions > result.diffRegions.length
      ? [`Only the ${result.diffRegions.length} largest of ${result.totalDiffRegions} disconnected regions are listed; use the full diff for the remainder.`]
      : []),
    '',
    'Do not declare completion until Figma to Prompt reports zero different pixels.',
  ].join('\n');

  return {
    blob: createZip([
      { name: 'reference.png', data: referenceBytes },
      { name: 'candidate.png', data: candidateBytes },
      { name: 'visual-diff.png', data: diffBytes },
      { name: 'verification.json', data: encoder.encode(JSON.stringify(report, null, 2)) },
      { name: 'instructions.md', data: encoder.encode(`${instructions}\n`) },
    ]),
    filename: `${sanitizeFileName(root.name)}.visual-correction.zip`,
    report,
  };
}
