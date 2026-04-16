import { buildPrompt, collectImageAssets, sanitizeFileName } from './prompt';
import type { ExportMode, ImageFormat, ImageNameOverrides, UISerializedNode } from '../shared/types';

export type Tab = 'json' | 'prompt';

export interface State {
  data: UISerializedNode | null;
  json: string;
  promptText: string;
  tab: Tab;
  images: Record<string, string>;
  mergedImage: string | null;
  scale: number; // 0 = original (getImageByHash), 1..4 = px multiplier
  format: ImageFormat;
  mode: ExportMode;
  nameOverrides: ImageNameOverrides;
  mergedImageName: string;
  /** Bumped whenever we need sandbox to re-export. Observed by an effect that postMessages. */
  exportRequestId: number;
  protocolMismatch: boolean;
  updateAvailable: { version: string; url: string } | null;
}

export const initialState: State = {
  data: null,
  json: '',
  promptText: '',
  tab: 'json',
  images: {},
  mergedImage: null,
  scale: 0,
  format: 'PNG',
  mode: 'per-image',
  nameOverrides: {},
  mergedImageName: '',
  exportRequestId: 0,
  protocolMismatch: false,
  updateAvailable: null,
};

export type Action =
  | { type: 'SELECTION_EMPTY' }
  | { type: 'SELECTION_RECEIVED'; data: UISerializedNode }
  | { type: 'IMAGES_RECEIVED'; images: Record<string, string>; merged?: string }
  | { type: 'TAB_CHANGED'; tab: Tab }
  | { type: 'MODE_CHANGED'; mode: ExportMode }
  | { type: 'SCALE_CHANGED'; scale: number }
  | { type: 'FORMAT_CHANGED'; format: ImageFormat }
  | { type: 'NAME_OVERRIDE_CHANGED'; id: string; value: string }
  | { type: 'MERGED_NAME_CHANGED'; value: string }
  | { type: 'PROTOCOL_MISMATCH' }
  | { type: 'UPDATE_AVAILABLE'; version: string; url: string };

/** Mirrors the original `reconcileScaleAvailability`:
 *  Orig (scale=0) only makes sense in per-image PNG mode. Anywhere else it would
 *  silently fall back to 1×, so we visibly bump it. */
function reconcileScale(scale: number, mode: ExportMode, format: ImageFormat): number {
  const origForbidden = mode === 'merged' || format !== 'PNG';
  return origForbidden && scale === 0 ? 1 : scale;
}

function computePrompt(
  data: UISerializedNode | null,
  mode: ExportMode,
  overrides: ImageNameOverrides,
  mergedName: string,
): string {
  if (!data) return '';
  const merged = mode === 'merged' && data.layout
    ? {
        name: mergedName.trim() || sanitizeFileName(data.name),
        width: Math.round(data.layout.width),
        height: Math.round(data.layout.height),
      }
    : undefined;
  return buildPrompt(data, { imageNameOverrides: overrides, merged });
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SELECTION_EMPTY':
      // Preserve user UI preferences across selections; reset only selection-bound state.
      return {
        ...initialState,
        tab: state.tab,
        scale: state.scale,
        format: state.format,
        mode: state.mode,
        protocolMismatch: state.protocolMismatch,
        updateAvailable: state.updateAvailable,
      };

    case 'SELECTION_RECEIVED': {
      const { data } = action;
      const json = JSON.stringify(data, null, 2);
      const hasImages = collectImageAssets(data).length > 0;
      // Per-image mode is meaningless without image fills — force merged.
      const mode: ExportMode = !hasImages && state.mode === 'per-image' ? 'merged' : state.mode;
      const scale = reconcileScale(state.scale, mode, state.format);
      const promptText = computePrompt(data, mode, {}, '');
      // Sandbox auto-triggers a per-image export on selection change. We only need to
      // re-request when our local mode is merged (or was just forced to merged).
      const needsRequest = mode === 'merged';
      return {
        ...state,
        data,
        json,
        promptText,
        images: {},
        mergedImage: null,
        nameOverrides: {},
        mergedImageName: '',
        mode,
        scale,
        exportRequestId: needsRequest ? state.exportRequestId + 1 : state.exportRequestId,
      };
    }

    case 'IMAGES_RECEIVED':
      return { ...state, images: action.images, mergedImage: action.merged ?? null };

    case 'TAB_CHANGED':
      return { ...state, tab: action.tab };

    case 'MODE_CHANGED': {
      const mode = action.mode;
      const scale = reconcileScale(state.scale, mode, state.format);
      const promptText = computePrompt(state.data, mode, state.nameOverrides, state.mergedImageName);
      return {
        ...state,
        mode,
        scale,
        promptText,
        images: {},
        mergedImage: null,
        exportRequestId: state.data ? state.exportRequestId + 1 : state.exportRequestId,
      };
    }

    case 'SCALE_CHANGED':
      return {
        ...state,
        scale: action.scale,
        images: {},
        mergedImage: null,
        exportRequestId: state.data ? state.exportRequestId + 1 : state.exportRequestId,
      };

    case 'FORMAT_CHANGED': {
      const format = action.format;
      const scale = reconcileScale(state.scale, state.mode, format);
      return {
        ...state,
        format,
        scale,
        images: {},
        mergedImage: null,
        exportRequestId: state.data ? state.exportRequestId + 1 : state.exportRequestId,
      };
    }

    case 'NAME_OVERRIDE_CHANGED': {
      const overrides = { ...state.nameOverrides };
      if (action.value === '') delete overrides[action.id];
      else overrides[action.id] = action.value;
      const promptText = computePrompt(state.data, state.mode, overrides, state.mergedImageName);
      return { ...state, nameOverrides: overrides, promptText };
    }

    case 'MERGED_NAME_CHANGED': {
      const promptText = computePrompt(state.data, state.mode, state.nameOverrides, action.value);
      return { ...state, mergedImageName: action.value, promptText };
    }

    case 'PROTOCOL_MISMATCH':
      return { ...state, protocolMismatch: true };

    case 'UPDATE_AVAILABLE':
      return { ...state, updateAvailable: { version: action.version, url: action.url } };
  }
}
