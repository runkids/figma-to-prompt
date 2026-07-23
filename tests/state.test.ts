import { describe, expect, it } from 'vitest';
import { AVIF_DEFAULT_QUALITY, DEFAULT_QUALITY, initialState, reducer } from '../src/ui/state';

describe('export quality state', () => {
  it('defaults to the strongest visual-fidelity workflow', () => {
    expect(initialState.tab).toBe('prompt');
    expect(initialState.promptTemplate).toBe('pixel-perfect');
    expect(initialState.promptDetail).toBe('full');
    expect(initialState.extractDepth).toBeNull();
    expect(initialState.mode).toBe('per-selection');
    expect(initialState.scale).toBe(2);
    expect(initialState.format).toBe('PNG');
  });

  it('updates and preserves prompt template preference', () => {
    let state = reducer(initialState, { type: 'PROMPT_TEMPLATE_CHANGED', promptTemplate: 'pixel-perfect' });
    expect(state.promptTemplate).toBe('pixel-perfect');

    state = reducer(state, { type: 'SELECTION_EMPTY' });
    expect(state.promptTemplate).toBe('pixel-perfect');
  });

  it('updates and preserves prompt detail preference', () => {
    let state = reducer(initialState, { type: 'PROMPT_DETAIL_CHANGED', promptDetail: 'compact' });
    expect(state.promptDetail).toBe('compact');

    state = reducer(state, { type: 'SELECTION_EMPTY' });
    expect(state.promptDetail).toBe('compact');
  });

  it('defaults every lossy format to maximum quality', () => {
    const state = reducer(initialState, { type: 'FORMAT_CHANGED', format: 'AVIF' });

    expect(DEFAULT_QUALITY).toBe(1);
    expect(AVIF_DEFAULT_QUALITY).toBe(1);
    expect(state.format).toBe('AVIF');
    expect(state.quality).toBe(AVIF_DEFAULT_QUALITY);
    expect(reducer(initialState, { type: 'FORMAT_CHANGED', format: 'JPG' }).quality)
      .toBe(DEFAULT_QUALITY);
    expect(reducer(initialState, { type: 'FORMAT_CHANGED', format: 'WEBP' }).quality)
      .toBe(DEFAULT_QUALITY);
  });

  it('falls back from Orig to sharp 2x when the next export mode requires rendering', () => {
    const original = { ...initialState, scale: 0, mode: 'per-image' as const };

    expect(reducer(original, { type: 'MODE_CHANGED', mode: 'merged' }).scale).toBe(2);
    expect(reducer(original, { type: 'MODE_CHANGED', mode: 'per-selection' }).scale).toBe(2);
    expect(reducer(original, { type: 'FORMAT_CHANGED', format: 'SVG' }).scale).toBe(2);
  });

  it('remembers custom AVIF quality across format and selection changes', () => {
    let state = reducer(initialState, { type: 'FORMAT_CHANGED', format: 'AVIF' });
    state = reducer(state, { type: 'QUALITY_CHANGED', value: 0.66 });
    state = reducer(state, { type: 'FORMAT_CHANGED', format: 'JPG' });

    expect(state.quality).toBe(DEFAULT_QUALITY);

    state = reducer(state, { type: 'FORMAT_CHANGED', format: 'AVIF' });
    expect(state.quality).toBe(0.66);

    state = reducer(state, { type: 'SELECTION_EMPTY' });
    expect(state.format).toBe('AVIF');
    expect(state.quality).toBe(0.66);
  });

  it('does not invalidate preview data when quality changes', () => {
    const state = reducer({
      ...initialState,
      data: { id: '1', name: 'Frame', type: 'FRAME', layout: { width: 10, height: 10 } },
      format: 'AVIF',
      quality: AVIF_DEFAULT_QUALITY,
      qualityByFormat: { AVIF: AVIF_DEFAULT_QUALITY },
      images: { '1:2': 'data:image/png;base64,preview' },
      rawImages: { '1:2': 'data:image/png;base64,source' },
      exportRequestId: 3,
    }, { type: 'QUALITY_CHANGED', value: 0.5 });

    expect(state.quality).toBe(0.5);
    expect(state.qualityByFormat.AVIF).toBe(0.5);
    expect(state.images).toEqual({ '1:2': 'data:image/png;base64,preview' });
    expect(state.rawImages).toEqual({ '1:2': 'data:image/png;base64,source' });
    expect(state.exportRequestId).toBe(3);
  });

  it('updates mock image paths and clears them for a new selection', () => {
    let state = reducer(initialState, { type: 'MOCK_IMAGE_PATH_CHANGED', id: '2', value: ' /assets/mock/hero.png ' });
    expect(state.mockImagePaths).toEqual({ '2': '/assets/mock/hero.png' });

    state = reducer(state, {
      type: 'SELECTION_RECEIVED',
      data: { id: '1', name: 'Frame', type: 'FRAME', layout: { width: 10, height: 10 } },
    });
    expect(state.mockImagePaths).toEqual({});
  });

  it('blocks stale downloads while a new image export is pending and stores source evidence', () => {
    const selected = reducer(initialState, {
      type: 'SELECTION_RECEIVED',
      data: { id: '1', name: 'Frame', type: 'FRAME', layout: { width: 10, height: 10 } },
    });
    expect(selected.imageExportPending).toBe(true);

    const received = reducer(selected, {
      type: 'RAW_IMAGES_RECEIVED',
      images: { '1:2': 'data:image/png;base64,source' },
      sourceRasterEvidence: {
        '1:2': {
          verified: true,
          density: 1,
          method: 'fill',
          sourceWidth: 10,
          sourceHeight: 10,
          renderedWidth: 10,
          renderedHeight: 10,
        },
      },
    });
    expect(received.imageExportPending).toBe(false);
    expect(received.sourceRasterEvidence['1:2']?.density).toBe(1);

    expect(reducer(received, { type: 'SCALE_CHANGED', scale: 4 }).imageExportPending).toBe(true);
    expect(reducer(received, { type: 'MODE_CHANGED', mode: 'per-selection' }).imageExportPending).toBe(true);
  });
});
