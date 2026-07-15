import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { UISerializedNode } from '../../shared/types';
import { attributeDiffRegions } from '../../shared/diffAttribution';
import { requestCaptureReference } from '../designCapture';
import { downloadBlob } from '../download';
import { createVisualCorrectionBundle } from '../visualCorrection';
import {
  buildCaptureReferenceSource,
  compareImageSources,
  compareImageToReference,
  requireStableReference,
  type ImageComparisonResult,
} from '../visualCompare';

interface Props {
  root: UISerializedNode;
}

export function VisualCompareCard({ root }: Props) {
  const [result, setResult] = useState<ImageComparisonResult | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [correctionInput, setCorrectionInput] = useState<{
    referenceDataUrl: string;
    candidate: File;
  } | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);

  useEffect(() => {
    setResult(null);
    setCandidateName('');
    setError(null);
    setComparing(false);
    setCorrectionInput(null);
    setSavingCorrection(false);
  }, [root.id]);

  async function handleFile(event: JSX.TargetedEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || comparing) return;

    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      setCandidateName(file.name);
      setResult(null);
      setCorrectionInput(null);
      setError('Choose a lossless PNG screenshot. JPEG and WebP compression cannot prove an exact pixel match.');
      return;
    }

    setComparing(true);
    setCandidateName(file.name);
    setResult(null);
    setCorrectionInput(null);
    setError(null);
    try {
      const capture = await requestCaptureReference(root, { includeAssets: false });
      const referenceSource = await buildCaptureReferenceSource(root, capture);
      if (!referenceSource) throw new Error('Figma could not render the selected design.');
      const secondCapture = await requestCaptureReference(root, { includeAssets: false });
      const secondReferenceSource = await buildCaptureReferenceSource(root, secondCapture);
      if (!secondReferenceSource) throw new Error('Figma could not repeat the selected design render.');
      requireStableReference(await compareImageSources(referenceSource, secondReferenceSource));
      const comparison = await compareImageToReference(referenceSource, file);
      setResult(comparison);
      if (comparison.kind === 'compared' && comparison.differentPixels > 0) {
        setCorrectionInput({ referenceDataUrl: referenceSource, candidate: file });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Image comparison failed.');
    } finally {
      setComparing(false);
    }
  }

  async function handleDownloadCorrection() {
    if (
      result?.kind !== 'compared' ||
      result.differentPixels === 0 ||
      !correctionInput ||
      savingCorrection
    ) return;
    setSavingCorrection(true);
    setError(null);
    try {
      const bundle = await createVisualCorrectionBundle({
        root,
        result,
        ...correctionInput,
      });
      downloadBlob(bundle.filename, bundle.blob);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Correction package failed.');
    } finally {
      setSavingCorrection(false);
    }
  }

  const score = result?.kind === 'compared' ? result.pixelMatch : null;
  const withinTolerance = result?.kind === 'compared' && result.differentPixels === 0;
  const exact = result?.kind === 'compared' && result.maxChannelDelta === 0;
  const attributedRegions = result?.kind === 'compared'
    ? attributeDiffRegions(root, result.diffRegions)
    : [];

  return (
    <details class="visual-compare-card">
      <summary class="visual-compare-summary">Verify AI screenshot</summary>
      <div class="visual-compare-body">
        <p class="visual-compare-help">
          Upload a lossless PNG produced by the AI at the exact selection size. It is compared locally with a fresh Figma render.
        </p>
        <label class="btn-secondary visual-compare-upload">
          <input
            class="visual-compare-input"
            type="file"
            accept="image/png"
            disabled={comparing}
            onChange={handleFile}
          />
          {comparing ? 'Comparing…' : result || error ? 'Compare another screenshot' : 'Choose AI screenshot'}
        </label>
        {candidateName && <div class="visual-compare-file" title={candidateName}>{candidateName}</div>}

        {error && <div class="visual-compare-error" role="alert">{error}</div>}

        {result?.kind === 'dimension-mismatch' && (
          <div class="visual-compare-error" role="alert">
            Size mismatch: reference {result.referenceWidth}×{result.referenceHeight}px, AI screenshot{' '}
            {result.candidateWidth}×{result.candidateHeight}px. Capture it again at the exact selection size.
          </div>
        )}

        {result?.kind === 'compared' && score != null && (
          <div class="visual-compare-result" aria-live="polite">
            <div class={exact ? 'visual-compare-score exact' : 'visual-compare-score'}>
              <span>{score.toFixed(2)}%</span>
              <small>{exact ? 'Exact pixel match' : withinTolerance ? 'Within tolerance' : 'Pixel match'}</small>
            </div>
            <dl class="visual-compare-stats">
              <div><dt>Size</dt><dd>{result.referenceWidth}×{result.referenceHeight}px</dd></div>
              <div><dt>Different</dt><dd>{result.differentPixels.toLocaleString()} / {result.totalPixels.toLocaleString()}</dd></div>
              <div><dt>Mean error</dt><dd>{result.meanAbsoluteError.toFixed(2)} / 255</dd></div>
              <div><dt>Tolerance</dt><dd>{result.channelThreshold} / channel</dd></div>
              <div class="visual-compare-stat-wide"><dt>Reference</dt><dd>2 consecutive RGBA-identical Figma renders</dd></div>
              {result.diffBounds && (
                <div class="visual-compare-stat-wide">
                  <dt>Changed area</dt>
                  <dd>x {result.diffBounds.x}, y {result.diffBounds.y}, {result.diffBounds.width}×{result.diffBounds.height}px</dd>
                </div>
              )}
            </dl>
            {result.differentPixels > 0 && (
              <figure class="visual-compare-diff">
                {result.diffRegions.length > 0 && (
                  <div class="visual-compare-regions">
                    <div class="visual-compare-regions-heading">
                      <strong>Priority regions</strong>
                      <span>{result.totalDiffRegions} total</span>
                    </div>
                    <ol>
                      {attributedRegions.slice(0, 5).map((region) => (
                        <li key={`${region.x}:${region.y}:${region.width}:${region.height}`}>
                          <code>x {region.x}, y {region.y}</code>
                          <span>{region.width}×{region.height}px · {region.differentPixels.toLocaleString()} pixels</span>
                          <small>{(region.density * 100).toFixed(1)}% density · Δ {region.maxChannelDelta}</small>
                          {region.nodes.length > 0 && (
                            <small>{region.nodes.map((node) => `${node.name} · ${node.type} · ${node.nodeId}`).join(' / ')}</small>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <img src={result.diffDataUrl} alt="Pixel difference preview; changed pixels are magenta" />
                <figcaption>Magenta pixels differ. Download the correction package and send the whole ZIP back to the AI.</figcaption>
                <button
                  type="button"
                  class="btn-secondary"
                  disabled={savingCorrection}
                  onClick={handleDownloadCorrection}
                >
                  {savingCorrection ? 'Packaging…' : 'Download correction package'}
                </button>
              </figure>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
