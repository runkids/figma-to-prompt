import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Action, State } from '../state';
import type { ExportMode, ImageFormat } from '../../shared/types';
import { type ImageAsset, collectImageAssets, sanitizeFileName } from '../prompt';
import { mergedExt, perImageExt, useDebouncedCallback, useFeedback } from '../utils';
import { createZip, dataUrlToBlob, downloadBlob } from '../download';
import { transcodeDataUrl } from '../transcode';
import {
  type FsaDirectoryHandle,
  ensurePermission,
  isFsaSupported,
  pickDirectory,
  writeFileToDir,
} from '../folder';
import { loadDirHandle, saveDirHandle } from '../storage';
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
  { value: 'WEBP', label: 'WebP' },
  { value: 'AVIF', label: 'AVIF' },
  { value: 'SVG', label: 'SVG' },
];

/** Formats with a download-time quality knob. Matches the `isLossy` predicate
 *  in transcode.ts — duplicated here to keep rendering decisions local. */
const LOSSY_FORMATS = new Set<ImageFormat>(['JPG', 'WEBP', 'AVIF']);

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

  // Loading must be judged by the CURRENT mode's data: the reducer now preserves
  // the other mode's preview across MODE_CHANGED (to avoid a blank flash when
  // toggling export settings on the same frame), so a stale `images` map from
  // per-image mode must not mask the "waiting for merged" state.
  const hasCurrentModeData =
    state.mode === 'merged' ? !!state.mergedImage : Object.keys(state.images).length > 0;
  const willExport = state.mode === 'merged' || assets.length > 0;
  const stillLoading = willExport && !hasCurrentModeData;

  if (stillLoading) {
    return (
      <div class="preview-area" aria-live="polite">
        <div class="preview-loading">Generating preview…</div>
      </div>
    );
  }

  if (state.mode === 'merged') {
    return (
      <div class="preview-area preview-area--merged" aria-live="polite">
        {state.mergedImage ? (
          <img
            class="preview-merged"
            src={state.mergedImage}
            alt={`Merged preview of ${state.data.name}`}
            decoding="async"
          />
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
      <div class="preview-area preview-area--strip" aria-live="polite">
        <div class="preview-placeholder">No images to export</div>
      </div>
    );
  }

  // `preview-area--strip` lets CSS collapse this block when the rename panel
  // is open (the inline thumbs in each row take over as the per-image map).
  return (
    <div class="preview-area preview-area--strip" aria-live="polite">
      <div class="preview-strip">
        {thumbs.map((t) => (
          <img
            key={t.asset.nodeId}
            class="preview-thumb"
            src={t.url}
            alt={t.asset.nodeName}
            title={t.asset.nodeName}
            decoding="async"
          />
        ))}
      </div>
    </div>
  );
}

// ── QualityRow ──────────────────────────────────────────
interface QualityRowProps {
  quality: number;
  onChange: (value: number) => void;
}

/** Handy compression presets. Each maps to a `canvas.toBlob` quality value —
 *  the usual "small / balanced / recommended / max" spread for lossy images. */
const QUALITY_PRESETS = [0.6, 0.75, 0.9, 1];

/** Slider + preset chips for lossy-format encode quality.
 *  - Chips: one-click common values (60 / 75 / 90 / 100 %).
 *  - Slider: fine-grained 30–100 % for pixel-peeping.
 *  Every change dispatches QUALITY_CHANGED; the transcode effect in App.tsx
 *  races its own generations so only the last value wins during a drag. */
function QualityRow({ quality, onChange }: QualityRowProps) {
  function handleInput(e: JSX.TargetedEvent<HTMLInputElement>) {
    const v = Number(e.currentTarget.value);
    if (!Number.isFinite(v)) return;
    onChange(v);
  }
  const pct = Math.round(quality * 100);
  // Preset active only when the slider is close enough — tolerance avoids
  // flicker when the user stops mid-drag near a preset value.
  const activePreset = QUALITY_PRESETS.find((p) => Math.abs(p - quality) < 0.025);
  return (
    <div class="quality-row">
      <div class="quality-row-line">
        <span class="quality-label">Quality</span>
        <div class="quality-presets" role="group" aria-label="Quality presets">
          {QUALITY_PRESETS.map((p) => {
            const active = p === activePreset;
            return (
              <button
                type="button"
                class={active ? 'quality-preset active' : 'quality-preset'}
                aria-pressed={active}
                onClick={() => onChange(p)}
              >
                {Math.round(p * 100)}
              </button>
            );
          })}
        </div>
        <span class="quality-value" aria-live="polite">{pct}%</span>
      </div>
      <input
        type="range"
        class="quality-slider"
        min="0.3"
        max="1"
        step="0.01"
        value={quality}
        aria-label="Encode quality"
        onInput={handleInput}
      />
    </div>
  );
}

// ── NameRow ─────────────────────────────────────────────
interface NameRowProps {
  label: string;
  placeholder: string;
  initialValue: string;
  ext: string;
  /** Inline thumbnail — when present, replaces the text label as the primary
   *  identifier so users can tell at a glance which image they're renaming. */
  thumbUrl?: string;
  onCommit: (value: string) => void;
}

/** Uncontrolled input — keystrokes only fire the debounced commit, so the
 *  reducer (which rebuilds the whole prompt) doesn't run per keystroke. */
function NameRow({ label, placeholder, initialValue, ext, thumbUrl, onCommit }: NameRowProps) {
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
      {thumbUrl ? (
        <img class="name-row-thumb" src={thumbUrl} alt={label} title={label} decoding="async" />
      ) : (
        <span class="name-row-label" title={label}>
          {label}
        </span>
      )}
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

  return (
    <>
      {assets.map((a) => (
        <NameRow
          key={a.nodeId}
          label={a.nodeName}
          placeholder={a.fileName.replace(/\.png$/, '')}
          initialValue={state.nameOverrides[a.nodeId] ?? ''}
          ext={perImageExt(state.scale, state.format)}
          thumbUrl={state.images[a.nodeId]}
          onCommit={(v) => dispatch({ type: 'NAME_OVERRIDE_CHANGED', id: a.nodeId, value: v })}
        />
      ))}
    </>
  );
}

// ── FolderPickerRow ─────────────────────────────────────
/**
 * Shows the remembered download folder (or a "choose" prompt if none), with a
 * link-styled button to open the native picker. Only renders when the File
 * System Access API is available — otherwise the whole row is hidden and the
 * DownloadButton silently falls back to `<a download>`.
 */
interface FolderPickerRowProps {
  dir: FsaDirectoryHandle | null;
  onPick: () => void;
}

function FolderPickerRow({ dir, onPick }: FolderPickerRowProps) {
  return (
    <div class="folder-picker-row">
      <span class="folder-picker-icon" aria-hidden="true">📁</span>
      {dir ? (
        <>
          <span class="folder-picker-name" title={dir.name}>
            {dir.name}
          </span>
          <button type="button" class="folder-picker-change" onClick={onPick}>
            Change
          </button>
        </>
      ) : (
        <button type="button" class="folder-picker-change" onClick={onPick}>
          Choose download folder…
        </button>
      )}
    </div>
  );
}

// ── DownloadButton ──────────────────────────────────────
interface DownloadButtonProps {
  state: State;
  dirHandle: FsaDirectoryHandle | null;
  fsaSupported: boolean;
}

function DownloadButton({ state, dirHandle, fsaSupported }: DownloadButtonProps) {
  const [feedback, flash] = useFeedback<number>();
  // Track the in-flight save so the button can show a loading state for large
  // images — previously the whole path (data URL → Blob → FSA write) ran
  // synchronously-looking, leaving the button label unchanged for up to
  // several seconds on big exports. Users perceived this as a hang.
  const [saving, setSaving] = useState(false);

  const loadedCount = state.mode === 'merged'
    ? (state.mergedImage ? 1 : 0)
    : Object.keys(state.images).length;
  const disabled = !state.data || loadedCount === 0 || saving;

  async function handleClick() {
    if (!state.data || saving) return;

    setSaving(true);
    // Yield one frame so the "Saving…" label & disabled state paint before we
    // start anything CPU-heavy. Without this, the first heavy task can start
    // before the browser repaints, so the loading state is invisible.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));

    try {
      // 1. Build outputs. In merged mode: one composite file.
      //    In per-image mode: individual files if writing to a chosen folder
      //    (user picked a folder → they want files, not a zip), or the legacy
      //    zip-or-single behavior for the browser-download fallback path.
      const outputs: { name: string; blob: Blob }[] = [];
      let feedbackCount = 0;

      if (state.mode === 'merged') {
        const source = state.rawMerged ?? state.mergedImage;
        if (!source) return;
        const base = state.mergedImageName.trim() || sanitizeFileName(state.data.name);
        const dataUrl = await transcodeDataUrl(source, state.format, state.quality);
        const blob = await dataUrlToBlob(dataUrl);
        outputs.push({
          name: `${base}.${mergedExt(state.format, dataUrl)}`,
          blob,
        });
        feedbackCount = 1;
      } else {
        if (Object.keys(state.images).length === 0) return;
        const namedAssets = collectImageAssets(state.data, state.nameOverrides);
        const perFile: { name: string; data: Uint8Array }[] = [];

        for (const asset of namedAssets) {
          const source = state.rawImages[asset.nodeId] ?? state.images[asset.nodeId];
          if (!source) continue;
          const dataUrl = await transcodeDataUrl(source, state.format, state.quality);
          const ext = perImageExt(state.scale, state.format, dataUrl);
          const blob = await dataUrlToBlob(dataUrl);
          const buffer = await blob.arrayBuffer();
          perFile.push({
            name: asset.fileName.replace(/\.png$/, `.${ext}`),
            data: new Uint8Array(buffer),
          });
        }
        if (perFile.length === 0) return;
        feedbackCount = perFile.length;

        if (fsaSupported && dirHandle) {
          // FSA path: one Blob per file, no zip wrapper.
          for (const f of perFile) {
            outputs.push({ name: f.name, blob: new Blob([f.data as BlobPart]) });
          }
        } else if (perFile.length === 1) {
          outputs.push({ name: perFile[0].name, blob: new Blob([perFile[0].data as BlobPart]) });
        } else {
          // Fallback: bundle into one zip so the user only sees one download prompt.
          outputs.push({
            name: `${sanitizeFileName(state.data.name)}_images.zip`,
            blob: createZip(perFile),
          });
        }
      }

      // 2. Write. `ensurePermission` must be awaited inside this user-gesture
      //    handler so the re-grant prompt (on a stale handle) is permitted.
      const fsaReady = fsaSupported && !!dirHandle && (await ensurePermission(dirHandle));
      if (fsaReady && dirHandle) {
        try {
          for (const o of outputs) await writeFileToDir(dirHandle, o.name, o.blob);
        } catch {
          // Mid-stream failure: fall back so the user still gets their files
          // rather than losing whatever was queued.
          for (const o of outputs) downloadBlob(o.name, o.blob);
        }
      } else {
        for (const o of outputs) downloadBlob(o.name, o.blob);
      }
      flash(feedbackCount);
    } finally {
      setSaving(false);
    }
  }

  const label = saving
    ? 'Saving…'
    : feedback != null
      ? `${feedback} saved!`
      : 'Download image';
  const cls = saving
    ? 'btn-candy btn-candy-sm saving'
    : feedback != null
      ? 'btn-candy btn-candy-sm saved'
      : 'btn-candy btn-candy-sm';

  return (
    <button class={cls} disabled={disabled} onClick={handleClick}>
      {saving && <span class="btn-spinner" aria-hidden="true" />}
      {label}
    </button>
  );
}

// ── ExportCard root ────────────────────────────────────
export function ExportCard({ state, dispatch }: Props) {
  // One tree walk per selection, shared with PreviewArea / RenamesList / DownloadButton.
  const assets = useMemo(() => (state.data ? collectImageAssets(state.data) : []), [state.data]);

  // Folder-picker state is local to this card — the reducer doesn't care where
  // files land. `useMemo` pins the capability check (stable for the session).
  const fsaSupported = useMemo(() => isFsaSupported(), []);
  const [dirHandle, setDirHandle] = useState<FsaDirectoryHandle | null>(null);

  useEffect(() => {
    if (!fsaSupported) return;
    let cancelled = false;
    loadDirHandle<FsaDirectoryHandle>().then((h) => {
      if (!cancelled) setDirHandle(h);
    });
    return () => {
      cancelled = true;
    };
  }, [fsaSupported]);

  async function handlePickDirectory() {
    const h = await pickDirectory();
    if (!h) return; // user cancelled or API blew up — keep whatever we had
    await saveDirHandle(h);
    setDirHandle(h);
  }

  if (!state.data) return null;

  // "Orig" disabled in merged or SVG (mirrors reconcileScale in state.ts). JPG /
  // WebP / AVIF CAN use Orig now because the sandbox still delivers a PNG
  // raster via getImageByHash and the UI transcodes it client-side.
  const origForbidden = state.mode === 'merged' || state.format === 'SVG';
  const scaleOptions = SCALE_OPTIONS.map((o) => ({ ...o, disabled: o.value === '0' && origForbidden }));
  const modeOptions = MODE_OPTIONS.map((o) => ({ ...o, disabled: o.value === 'per-image' && assets.length === 0 }));
  const showQuality = LOSSY_FORMATS.has(state.format);

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

      <div class="option-stack">
        <ButtonGroup
          ariaLabel="Size"
          variant="chip"
          options={scaleOptions}
          value={String(state.scale)}
          onChange={(v) => dispatch({ type: 'SCALE_CHANGED', scale: Number(v) })}
        />
        <ButtonGroup
          ariaLabel="Format"
          variant="chip"
          options={FORMAT_OPTIONS}
          value={state.format}
          onChange={(v) => dispatch({ type: 'FORMAT_CHANGED', format: v })}
        />
      </div>

      {/* Quality slider only surfaces for lossy formats. Hidden (not disabled)
          when irrelevant so the card stays compact for PNG / SVG flows. */}
      {showQuality && (
        <QualityRow
          quality={state.quality}
          onChange={(v) => dispatch({ type: 'QUALITY_CHANGED', value: v })}
        />
      )}

      {/* Re-key on selection so a new frame starts collapsed (matches user expectation). */}
      <details key={state.data.id} class="names-row">
        <summary class="names-toggle">
          <span>{namesToggleText}</span>
        </summary>
        <div class="names-list">
          <RenamesList state={state} assets={assets} dispatch={dispatch} />
        </div>
      </details>

      {fsaSupported && <FolderPickerRow dir={dirHandle} onPick={handlePickDirectory} />}

      <DownloadButton state={state} dirHandle={dirHandle} fsaSupported={fsaSupported} />
    </section>
  );
}
