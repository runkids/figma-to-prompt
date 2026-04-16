import { describe, expect, it } from 'vitest';
import { AVIF_DEFAULT_QUALITY, DEFAULT_QUALITY, initialState, reducer } from '../src/ui/state';

describe('export quality state', () => {
  it('defaults AVIF quality to 80%', () => {
    const state = reducer(initialState, { type: 'FORMAT_CHANGED', format: 'AVIF' });

    expect(state.format).toBe('AVIF');
    expect(state.quality).toBe(AVIF_DEFAULT_QUALITY);
  });

  it('keeps the existing default quality for JPG and WebP', () => {
    expect(reducer(initialState, { type: 'FORMAT_CHANGED', format: 'JPG' }).quality)
      .toBe(DEFAULT_QUALITY);
    expect(reducer(initialState, { type: 'FORMAT_CHANGED', format: 'WEBP' }).quality)
      .toBe(DEFAULT_QUALITY);
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
});
