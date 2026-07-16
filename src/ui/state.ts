import { collectImageAssets } from './prompt';
import { MIN_SHARP_RASTER_SCALE } from '../shared/rasterScale';
import type { ExportMode, ImageFormat, ImageNameOverrides, ImageSourceRasterEvidence, PromptDetailLevel, PromptTemplate, UISerializedNode } from '../shared/types';

export type Tab = 'json' | 'prompt';
type LossyImageFormat = Extract<ImageFormat, 'JPG' | 'WEBP' | 'AVIF'>;

/** Fidelity-first defaults. Lossy formats still cannot guarantee exact pixels,
 *  but they should not silently start with additional quality reduction. */
export const DEFAULT_QUALITY = 1;
export const AVIF_DEFAULT_QUALITY = 1;

export interface State {
  data: UISerializedNode | null;
  tab: Tab;
  promptTemplate: PromptTemplate;
  promptDetail: PromptDetailLevel;
  /** Truncate the extracted tree to this many levels deep. null = unlimited. */
  extractDepth: number | null;
  /** Preview images mirrored from the sandbox source. Download encoding is
   *  deferred until the user clicks Download so quality changes stay cheap. */
  images: Record<string, string>;
  mergedImage: string | null;
  /** Raw sandbox output kept around so quality / format tweaks can re-transcode
   *  without a sandbox round-trip. App.tsx mirrors this into preview state;
   *  ExportCard reads it again for download-time encoding. */
  rawImages: Record<string, string>;
  rawMerged: string | null;
  sourceRasterEvidence: Record<string, ImageSourceRasterEvidence>;
  imageExportPending: boolean;
  scale: number; // 0 = original (getImageByHash), 1..4 = px multiplier
  format: ImageFormat;
  /** Active canvas.toBlob quality for lossy formats. Ignored for PNG and SVG. */
  quality: number;
  /** Per-format quality memory so AVIF can default lower without overwriting
   *  a user's JPG/WebP preference or a custom AVIF value. */
  qualityByFormat: Partial<Record<LossyImageFormat, number>>;
  mode: ExportMode;
  nameOverrides: ImageNameOverrides;
  mockImagePaths: ImageNameOverrides;
  mergedImageName: string;
  /** Bumped whenever we need sandbox to re-export. Observed by an effect that postMessages. */
  exportRequestId: number;
  protocolMismatch: boolean;
}

export const initialState: State = {
  data: null,
  tab: 'prompt',
  promptTemplate: 'pixel-perfect',
  promptDetail: 'full',
  extractDepth: null,
  images: {},
  mergedImage: null,
  rawImages: {},
  rawMerged: null,
  sourceRasterEvidence: {},
  imageExportPending: false,
  scale: 2,
  format: 'PNG',
  quality: DEFAULT_QUALITY,
  qualityByFormat: {},
  mode: 'merged',
  nameOverrides: {},
  mockImagePaths: {},
  mergedImageName: '',
  exportRequestId: 0,
  protocolMismatch: false,
};

export type Action =
  | { type: 'SELECTION_EMPTY' }
  | { type: 'SELECTION_RECEIVED'; data: UISerializedNode }
  /** Sandbox delivered fresh PNG / SVG source data. App.tsx mirrors this into
   *  preview state; download-time encoding still reads the raw copy. */
  | {
      type: 'RAW_IMAGES_RECEIVED';
      images: Record<string, string>;
      merged?: string | null;
      sourceRasterEvidence?: Record<string, ImageSourceRasterEvidence>;
    }
  /** Preview images ready for display. */
  | { type: 'IMAGES_RECEIVED'; images: Record<string, string>; merged?: string | null }
  | { type: 'TAB_CHANGED'; tab: Tab }
  | { type: 'PROMPT_TEMPLATE_CHANGED'; promptTemplate: PromptTemplate }
  | { type: 'PROMPT_DETAIL_CHANGED'; promptDetail: PromptDetailLevel }
  | { type: 'EXTRACT_DEPTH_CHANGED'; extractDepth: number | null }
  | { type: 'MODE_CHANGED'; mode: ExportMode }
  | { type: 'SCALE_CHANGED'; scale: number }
  | { type: 'FORMAT_CHANGED'; format: ImageFormat }
  | { type: 'QUALITY_CHANGED'; value: number }
  | { type: 'NAME_OVERRIDE_CHANGED'; id: string; value: string }
  | { type: 'MOCK_IMAGE_PATH_CHANGED'; id: string; value: string }
  | { type: 'MERGED_NAME_CHANGED'; value: string }
  | { type: 'PROTOCOL_MISMATCH' };

/** Orig (scale=0) returns uploaded pixels when possible and a source-aware PNG
 *  render for paint-specific variants. It is meaningless for merged exports
 *  and SVG, so those transitions use the sharp raster default instead. */
function reconcileScale(scale: number, mode: ExportMode, format: ImageFormat): number {
  const origForbidden = mode === 'merged' || mode === 'per-selection' || format === 'SVG';
  return origForbidden && scale === 0 ? MIN_SHARP_RASTER_SCALE : scale;
}

/** Sandbox re-export is only required when the Figma-native format actually
 *  changes (SVG vs raster). Swapping between raster output targets is a
 *  client-side re-transcode, so we keep the existing rawImages. */
function needsSandboxRefetch(prev: ImageFormat, next: ImageFormat): boolean {
  return (prev === 'SVG') !== (next === 'SVG');
}

function isLossyFormat(format: ImageFormat): format is LossyImageFormat {
  return format === 'JPG' || format === 'WEBP' || format === 'AVIF';
}

function defaultQualityForFormat(format: ImageFormat): number {
  return format === 'AVIF' ? AVIF_DEFAULT_QUALITY : DEFAULT_QUALITY;
}

function qualityForFormat(
  format: ImageFormat,
  qualityByFormat: Partial<Record<LossyImageFormat, number>>,
): number {
  return isLossyFormat(format)
    ? qualityByFormat[format] ?? defaultQualityForFormat(format)
    : DEFAULT_QUALITY;
}

function clampQuality(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_QUALITY;
  if (v < 0.1) return 0.1;
  if (v > 1) return 1;
  return v;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SELECTION_EMPTY':
      // Preserve user UI preferences across selections; reset only selection-bound state.
      return {
        ...initialState,
        tab: state.tab,
        promptTemplate: state.promptTemplate,
        promptDetail: state.promptDetail,
        extractDepth: state.extractDepth,
        scale: state.scale,
        format: state.format,
        quality: state.quality,
        qualityByFormat: state.qualityByFormat,
        mode: state.mode,
        protocolMismatch: state.protocolMismatch,
      };

    case 'SELECTION_RECEIVED': {
      const { data } = action;
      const hasImages = collectImageAssets(data).length > 0;
      // Per-image mode is meaningless without image fills — force merged.
      // Per-selection stays as-is regardless of image fills.
      const mode: ExportMode = !hasImages && state.mode === 'per-image' ? 'merged' : state.mode;
      const scale = reconcileScale(state.scale, mode, state.format);
      // Sandbox auto-triggers a per-image export on selection change. We only need to
      // re-request when our local mode needs a different export strategy.
      const needsRequest = mode === 'merged' || mode === 'per-selection';
      // JSON / prompt text are derived lazily by CodePanel via useMemo so rapid
      // selection changes don't pay both JSON.stringify + buildPrompt eagerly
      // on every click. Only the active tab's string is ever computed.
      return {
        ...state,
        data,
        images: {},
        mergedImage: null,
        rawImages: {},
        rawMerged: null,
        sourceRasterEvidence: {},
        imageExportPending: true,
        nameOverrides: {},
        mockImagePaths: {},
        mergedImageName: '',
        mode,
        scale,
        exportRequestId: needsRequest ? state.exportRequestId + 1 : state.exportRequestId,
      };
    }

    case 'RAW_IMAGES_RECEIVED':
      // Sandbox delivered the Figma-native source. App.tsx mirrors this into
      // display state; ExportCard handles expensive lossy encoding on Download.
      return {
        ...state,
        rawImages: action.images,
        rawMerged: action.merged ?? null,
        sourceRasterEvidence: action.sourceRasterEvidence ?? {},
        imageExportPending: false,
      };

    case 'IMAGES_RECEIVED':
      return { ...state, images: action.images, mergedImage: action.merged ?? null };

    case 'TAB_CHANGED':
      return { ...state, tab: action.tab };

    case 'PROMPT_TEMPLATE_CHANGED':
      return { ...state, promptTemplate: action.promptTemplate };

    case 'PROMPT_DETAIL_CHANGED':
      return { ...state, promptDetail: action.promptDetail };

    case 'EXTRACT_DEPTH_CHANGED':
      return { ...state, extractDepth: action.extractDepth };

    case 'MODE_CHANGED': {
      const mode = action.mode;
      const scale = reconcileScale(state.scale, mode, state.format);
      // Intentionally keep the previous preview (images / mergedImage) visible
      // until the new export lands — avoids a flash of blank "No images to
      // export" between toggles. The StatusBar still shows "loading…" via the
      // exportRequestId round-trip so users know something is in flight.
      return {
        ...state,
        mode,
        scale,
        imageExportPending: Boolean(state.data),
        exportRequestId: state.data ? state.exportRequestId + 1 : state.exportRequestId,
      };
    }

    case 'SCALE_CHANGED':
      // Same rationale as MODE_CHANGED — keep stale preview around so the UI
      // doesn't flicker while the new render is in flight.
      return {
        ...state,
        scale: action.scale,
        imageExportPending: Boolean(state.data),
        exportRequestId: state.data ? state.exportRequestId + 1 : state.exportRequestId,
      };

    case 'FORMAT_CHANGED': {
      const format = action.format;
      const scale = reconcileScale(state.scale, state.mode, format);
      // Raster → raster swaps (PNG ↔ JPG ↔ WEBP ↔ AVIF) reuse the existing
      // PNG source. The selected format only affects filenames and download-time
      // encoding, so no sandbox round-trip is needed.
      const refetch = needsSandboxRefetch(state.format, format);
      return {
        ...state,
        format,
        scale,
        quality: qualityForFormat(format, state.qualityByFormat),
        imageExportPending: refetch && state.data ? true : state.imageExportPending,
        exportRequestId:
          refetch && state.data ? state.exportRequestId + 1 : state.exportRequestId,
      };
    }

    case 'QUALITY_CHANGED': {
      // Quality only affects download-time encoding, so no sandbox re-export
      // and no preview transcode are needed.
      const quality = clampQuality(action.value);
      const qualityByFormat = isLossyFormat(state.format)
        ? { ...state.qualityByFormat, [state.format]: quality }
        : state.qualityByFormat;
      return { ...state, quality, qualityByFormat };
    }

    case 'NAME_OVERRIDE_CHANGED': {
      const overrides = { ...state.nameOverrides };
      if (action.value === '') delete overrides[action.id];
      else overrides[action.id] = action.value;
      return { ...state, nameOverrides: overrides };
    }

    case 'MOCK_IMAGE_PATH_CHANGED': {
      const mockImagePaths = { ...state.mockImagePaths };
      if (action.value.trim() === '') delete mockImagePaths[action.id];
      else mockImagePaths[action.id] = action.value.trim();
      return { ...state, mockImagePaths };
    }

    case 'MERGED_NAME_CHANGED':
      return { ...state, mergedImageName: action.value };

    case 'PROTOCOL_MISMATCH':
      return { ...state, protocolMismatch: true };
  }
}
