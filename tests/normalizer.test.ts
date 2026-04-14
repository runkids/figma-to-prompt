import { describe, it, expect } from 'vitest';
import { rgbaToHex, normalizeLineHeight, normalizeNode, roundNum } from '../src/sandbox/normalizer';
import type { UISerializedNode } from '../src/shared/types';

describe('rgbaToHex', () => {
  it('converts RGBA {0-1} to hex string', () => {
    expect(rgbaToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe('#FF0000');
  });

  it('converts fractional RGBA values', () => {
    expect(rgbaToHex({ r: 0.067, g: 0.094, b: 0.153, a: 1 })).toBe('#111827');
  });

  it('handles black', () => {
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
  });

  it('handles white', () => {
    expect(rgbaToHex({ r: 1, g: 1, b: 1, a: 1 })).toBe('#FFFFFF');
  });
});

describe('normalizeLineHeight', () => {
  it('returns px value for PIXELS unit', () => {
    expect(normalizeLineHeight({ unit: 'PIXELS', value: 24 }, 16)).toBe(24);
  });

  it('calculates px from PERCENT unit', () => {
    expect(normalizeLineHeight({ unit: 'PERCENT', value: 150 }, 16)).toBe(24);
  });

  it('returns undefined for AUTO', () => {
    expect(normalizeLineHeight({ unit: 'AUTO' }, 16)).toBeUndefined();
  });
});

describe('normalizeNode', () => {
  it('removes empty children array', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Empty Frame',
      type: 'FRAME',
      children: [],
      layout: { width: 100, height: 100 },
    };
    const result = normalizeNode(node);
    expect(result.children).toBeUndefined();
  });

  it('omits visible field when true', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Visible Frame',
      type: 'FRAME',
      visible: true,
      layout: { width: 100, height: 100 },
    };
    const result = normalizeNode(node);
    expect(result.visible).toBeUndefined();
  });

  it('keeps visible field when false', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Hidden Frame',
      type: 'FRAME',
      visible: false,
      layout: { width: 100, height: 100 },
    };
    const result = normalizeNode(node);
    expect(result.visible).toBe(false);
  });

  it('normalizes children recursively', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Parent',
      type: 'FRAME',
      layout: { width: 200, height: 200 },
      children: [
        {
          id: '2',
          name: 'Child',
          type: 'FRAME',
          visible: true,
          children: [],
          layout: { width: 100, height: 100 },
        },
      ],
    };
    const result = normalizeNode(node);
    expect(result.children).toHaveLength(1);
    expect(result.children![0].visible).toBeUndefined();
    expect(result.children![0].children).toBeUndefined();
  });

  it('removes padding when all values are 0', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'No Padding',
      type: 'FRAME',
      layout: {
        width: 100,
        height: 100,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
    };
    const result = normalizeNode(node);
    expect(result.layout?.padding).toBeUndefined();
  });

  it('keeps padding when any value is non-zero', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'With Padding',
      type: 'FRAME',
      layout: {
        width: 100,
        height: 100,
        padding: { top: 16, right: 0, bottom: 0, left: 0 },
      },
    };
    const result = normalizeNode(node);
    expect(result.layout?.padding).toEqual({ top: 16, right: 0, bottom: 0, left: 0 });
  });

  it('rounds float noise in layout values', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Float Frame',
      type: 'FRAME',
      layout: {
        width: 280.79998779296875,
        height: 192,
        gap: 19.200000762939453,
        padding: {
          top: 9.600000381469727,
          right: 9.600000381469727,
          bottom: 9.600000381469727,
          left: 9.600000381469727,
        },
      },
    };
    const result = normalizeNode(node);
    expect(result.layout?.width).toBe(280.8);
    expect(result.layout?.height).toBe(192);
    expect(result.layout?.gap).toBe(19.2);
    expect(result.layout?.padding).toEqual({ top: 9.6, right: 9.6, bottom: 9.6, left: 9.6 });
  });

  it('rounds float noise in style values', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Float Style',
      type: 'FRAME',
      layout: { width: 300, height: 410.3999938964844 },
      style: {
        borderRadius: 19.200000762939453,
        borderWidth: 1.2000000476837158,
        fontSize: 26.400001525878906,
        lineHeight: 32,
      },
    };
    const result = normalizeNode(node);
    expect(result.layout?.height).toBe(410.4);
    expect(result.style?.borderRadius).toBe(19.2);
    expect(result.style?.borderWidth).toBe(1.2);
    expect(result.style?.fontSize).toBe(26.4);
    expect(result.style?.lineHeight).toBe(32);
  });

  it('preserves string values in style during rounding', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Mixed',
      type: 'FRAME',
      layout: { width: 100, height: 100 },
      style: {
        backgroundColor: '#FFFFFF',
        borderRadius: 7.200000286102295,
      },
    };
    const result = normalizeNode(node);
    expect(result.style?.backgroundColor).toBe('#FFFFFF');
    expect(result.style?.borderRadius).toBe(7.2);
  });
});

describe('roundNum', () => {
  it('rounds Figma float noise', () => {
    expect(roundNum(9.600000381469727)).toBe(9.6);
    expect(roundNum(19.200000762939453)).toBe(19.2);
    expect(roundNum(280.79998779296875)).toBe(280.8);
    expect(roundNum(1.2000000476837158)).toBe(1.2);
  });

  it('keeps integers unchanged', () => {
    expect(roundNum(192)).toBe(192);
    expect(roundNum(0)).toBe(0);
  });

  it('respects custom decimal places', () => {
    expect(roundNum(3.14159, 3)).toBe(3.142);
    expect(roundNum(3.14159, 0)).toBe(3);
  });
});
