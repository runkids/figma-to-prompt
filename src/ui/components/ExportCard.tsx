import { useMemo } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Action, State } from '../state';
import type { ExportMode, ImageFormat } from '../../shared/types';
import { type ImageAsset, collectImageAssets, sanitizeFileName } from '../prompt';
import { mergedExt, perImageExt, useDebouncedCallback, useFeedback } from '../utils';
import { createZip, dataUrlToBlob, downloadBlob } from '../download';
import { ButtonGroup } from './ButtonGroup';

interface Props {
  state: State;
  dispatch: (action: Action) => void;
}

const MODE_OPTIONS = [
  { value: 'per-image' as ExportMode, label: 'Each image' },
  { value: 'merged' as ExportMode, label: 'Whole frame' },
];

const FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: 'PNG', label: 'PNG' },
  { value: 'JPG', label: 'JPG' },
  { value: 'SVG', label: 'SVG' },
];

const SCALE_OPTIONS = [
  { value: '0', label: 'Orig' },
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '3', label: '3×' },
  { value: '4', label: '4×' },
];

// Per-keystroke prompt rebuild walks the entire node tree via buildPrompt;
// 80ms collapses bursts without lagging the input.
const NAME_DEBOUNCE_MS = 80;

// ── PreviewArea ─────────────────────────────────────────
function PreviewArea({ state, assets }: { state: State; assets: ImageAsset[] }) {
  if (!state.data) {
    return (
      <div class="preview-area" aria-live="polite">
        <div class="preview-placeholder">Waiting for selection…</div>
      </div>
    );
  }

  const loadedCount = state.mergedImage ? 1 : Object.keys(state.images).length;
  const willExport = state.mode === 'merged' || assets.length > 0;
  const stillLoading = willExport && loadedCount === 0;

  if (stillLoading) {
    return (
      <div class="preview-area" aria-live="polite">
        <div class="preview-loading">Generating preview…</div>
      </div>
    );
  }

  if (state.mode === 'merged') {
    return (
      <div class="preview-area" aria-live="polite">
        {state.mergedImage ? (
          <img class="preview-merged" src={state.mergedImage} alt={`Merged preview of ${state.data.name}`} />
        ) : (
          <div class="preview-placeholder">No preview available</div>
        )}
      </div>
    );
  }

  const thumbs = assets
    .map((a) => ({ asset: a, url: state.images[a.nodeId] }))
    .filter((t) => !!t.url);

  if (thumbs.length === 0) {
    return (
      <div class="preview-area" aria-live="polite">
        <div class="preview-placeholder">No images to export</div>
      </div>
    );
  }

  return (
    <div class="preview-area" aria-live="polite">
      <div class="preview-strip">
        {thumbs.map((t) => (
          <img
            key={t.asset.nodeId}
            class="preview-thumb"
            src={t.url}
            alt={t.asset.nodeName}
            title={t.asset.nodeName}
          />
        ))}
      </div>
    </div>
  );
}

// ── NameRow ─────────────────────────────────────────────
interface NameRowProps {
  label: string;
  placeholder: string;
  initialValue: string;
  ext: string;
  onCommit: (value: string) => void;
}

/** Uncontrolled input — keystrokes only fire the debounced commit, so the
 *  reducer (which rebuilds the whole prompt) doesn't run per keystroke. */
function NameRow({ label, placeholder, initialValue, ext, onCommit }: NameRowProps) {
  const debouncedCommit = useDebouncedCallback(onCommit, NAME_DEBOUNCE_MS);

  function handleInput(e: JSX.TargetedEvent<HTMLInputElement>) {
    const sanitized = sanitizeFileName(e.currentTarget.value);
    if (sanitized !== e.currentTarget.value) e.currentTarget.value = sanitized;
    debouncedCommit(sanitized);
  }

  function handleReset(e: JSX.TargetedMouseEvent<HTMLButtonElement>) {
    const input = e.currentTarget.parentElement?.querySelector<HTMLInputElement>('.name-input');
    if (input) input.value = '';
    onCommit(''); // commit immediately on reset — no point debouncing a click
  }

  return (
    <div class="name-row">
      <span class="name-row-label" title={label}>
        {label}
      </span>
      <span class="name-input-wrap">
        <input
          type="text"
          class="name-input"
          placeholder={placeholder}
          defaultValue={initialValue}
          spellcheck={false}
          onInput={handleInput}
        />
        <button
          type="button"
          class="name-reset"
          title="Reset to default"
          aria-label="Reset to default name"
          onClick={handleReset}
        >
          ×
        </button>
      </span>
      <span class="name-ext">.{ext}</span>
    </div>
  );
}

// ── RenamesList ─────────────────────────────────────────
function RenamesList({ state, assets, dispatch }: { state: State; assets: ImageAsset[]; dispatch: Props['dispatch'] }) {
  if (!state.data) return null;

  if (state.mode === 'merged') {
    return (
      <NameRow
        label="Whole frame"
        placeholder={sanitizeFileName(state.data.name)}
        initialValue={state.mergedImageName}
        ext={mergedExt(state.format)}
        onCommit={(v) => dispatch({ type: 'MERGED_NAME_CHANGED', value: v })}
      />
    );
  }

  const ext = perImageExt(state.scale, state.format);
  return (
    <>
      {assets.map((a) => (
        <NameRow
          key={a.nodeId}
          label={a.nodeName}
          placeholder={a.fileName.replace(/\.png$/, '')}
          initialValue={state.nameOverrides[a.nodeId] ?? ''}
          ext={ext}
          onCommit={(v) => dispatch({ type: 'NAME_OVERRIDE_CHANGED', id: a.nodeId, value: v })}
        />
      ))}
    </>
  );
}

// ── DownloadButton ──────────────────────────────────────
function DownloadButton({ state }: { state: State }) {
  const [feedback, flash] = useFeedback<number>();

  const loadedCount = state.mergedImage ? 1 : Object.keys(state.images).length;
  const disabled = !state.data || loadedCount === 0;

  async function handleClick() {
    if (!state.data) return;

    if (state.mode === 'merged') {
      if (!state.mergedImage) return;
      const base = state.mergedImageName.trim() || sanitizeFileName(state.data.name);
      downloadBlob(`${base}.${mergedExt(state.format)}`, dataUrlToBlob(state.mergedImage));
      flash(1);
      return;
    }

    if (Object.keys(state.images).length === 0) return;
    // Re-collect with overrides applied so user-set filenames + collision suffixing kick in.
    const namedAssets = collectImageAssets(state.data, state.nameOverrides);
    const ext = perImageExt(state.scale, state.format);
    const files: { name: string; data: Uint8Array }[] = [];

    for (const asset of namedAssets) {
      const dataUrl = state.images[asset.nodeId];
      if (!dataUrl) continue;
      const buffer = await dataUrlToBlob(dataUrl).arrayBuffer();
      files.push({
        name: asset.fileName.replace(/\.png$/, `.${ext}`),
        data: new Uint8Array(buffer),
      });
    }
    if (files.length === 0) return;
    if (files.length === 1) {
      downloadBlob(files[0].name, new Blob([files[0].data as BlobPart]));
    } else {
      downloadBlob(`${sanitizeFileName(state.data.name)}_images.zip`, createZip(files));
    }
    flash(files.length);
  }

  const label = feedback != null ? `${feedback} saved!` : 'Download image';
  const cls = feedback != null ? 'btn-candy btn-candy-sm saved' : 'btn-candy btn-candy-sm';

  return (
    <button class={cls} disabled={disabled} onClick={handleClick}>
      {label}
    </button>
  );
}

// ── ExportCard root ────────────────────────────────────
export function ExportCard({ state, dispatch }: Props) {
  // One tree walk per selection, shared with PreviewArea / RenamesList / DownloadButton.
  const assets = useMemo(() => (state.data ? collectImageAssets(state.data) : []), [state.data]);

  if (!state.data) return null;

  // "Orig" disabled in merged or non-PNG (mirrors reconcileScale in state.ts).
  const origForbidden = state.mode === 'merged' || state.format !== 'PNG';
  const scaleOptions = SCALE_OPTIONS.map((o) => ({ ...o, disabled: o.value === '0' && origForbidden }));
  const modeOptions = MODE_OPTIONS.map((o) => ({ ...o, disabled: o.value === 'per-image' && assets.length === 0 }));

  const namesToggleText = state.mode === 'merged'
    ? 'Rename file'
    : assets.length === 1
      ? 'Rename 1 image'
      : `Rename ${assets.length} images`;

  return (
    <section class="export-card" aria-label="Export image">
      <PreviewArea state={state} assets={assets} />

      <ButtonGroup
        ariaLabel="Output mode"
        variant="segmented"
        options={modeOptions}
        value={state.mode}
        onChange={(v) => dispatch({ type: 'MODE_CHANGED', mode: v })}
      />

      <div class="option-row option-row-combined">
        <ButtonGroup
          ariaLabel="Size"
          variant="chip"
          options={scaleOptions}
          value={String(state.scale)}
          onChange={(v) => dispatch({ type: 'SCALE_CHANGED', scale: Number(v) })}
        />
        <span class="chip-divider" aria-hidden="true" />
        <ButtonGroup
          ariaLabel="Format"
          variant="chip"
          options={FORMAT_OPTIONS}
          value={state.format}
          onChange={(v) => dispatch({ type: 'FORMAT_CHANGED', format: v })}
        />
      </div>

      {/* Re-key on selection so a new frame starts collapsed (matches user expectation). */}
      <details key={state.data.id} class="names-row">
        <summary class="names-toggle">
          <span>{namesToggleText}</span>
        </summary>
        <div class="names-list">
          <RenamesList state={state} assets={assets} dispatch={dispatch} />
        </div>
      </details>

      <DownloadButton state={state} />
    </section>
  );
}
