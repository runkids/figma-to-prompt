import { describe, it, expect } from 'vitest';
import { extractNode } from '../src/sandbox/extractor';

/** Minimal mock helpers — only the properties extractNode reads */
function mockFrameNode(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: '1:1',
    name: 'Test Frame',
    type: 'FRAME',
    visible: true,
    width: 360,
    height: 240,
    layoutMode: 'VERTICAL',
    itemSpacing: 16,
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'FIXED',
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1, visible: true }],
    strokes: [],
    cornerRadius: 16,
    opacity: 1,
    children: [],
    ...overrides,
  };
}

function mockTextNode(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: '2:1',
    name: 'Title',
    type: 'TEXT',
    visible: true,
    width: 312,
    height: 32,
    characters: 'Welcome back',
    fontName: { family: 'Inter', style: 'Bold' },
    fontSize: 24,
    fontWeight: 700,
    lineHeight: { unit: 'PIXELS', value: 32 },
    letterSpacing: { unit: 'PIXELS', value: 0 },
    fills: [{ type: 'SOLID', color: { r: 0.067, g: 0.094, b: 0.153 }, opacity: 1, visible: true }],
    opacity: 1,
    ...overrides,
  };
}

function mockRectangleNode(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: '3:1',
    name: 'Background',
    type: 'RECTANGLE',
    visible: true,
    width: 100,
    height: 50,
    fills: [{ type: 'SOLID', color: { r: 0.9, g: 0.92, b: 0.94 }, opacity: 1, visible: true }],
    strokes: [{ type: 'SOLID', color: { r: 0.8, g: 0.82, b: 0.84 }, opacity: 1, visible: true }],
    strokeWeight: 1,
    cornerRadius: 8,
    opacity: 1,
    ...overrides,
  };
}

function mockInstanceNode(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: '4:1',
    name: 'Primary Button',
    type: 'INSTANCE',
    visible: true,
    width: 120,
    height: 40,
    mainComponent: { name: 'Button/Primary' },
    fills: [],
    strokes: [],
    opacity: 1,
    children: [{ id: '4:2', name: 'Label', type: 'TEXT', visible: true }],
    ...overrides,
  };
}

describe('extractNode', () => {
  it('extracts FRAME with layout', () => {
    const result = extractNode(mockFrameNode() as SceneNode);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('FRAME');
    expect(result!.layout?.mode).toBe('vertical');
    expect(result!.layout?.gap).toBe(16);
    expect(result!.layout?.padding).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });
    expect(result!.style?.backgroundColor).toBe('#FFFFFF');
    expect(result!.style?.borderRadius).toBe(16);
  });

  it('extracts TEXT with typography', () => {
    const result = extractNode(mockTextNode() as SceneNode);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('TEXT');
    expect(result!.text).toBe('Welcome back');
    expect(result!.style?.fontFamily).toBe('Inter');
    expect(result!.style?.fontSize).toBe(24);
    expect(result!.style?.fontWeight).toBe(700);
    expect(result!.style?.lineHeight).toBe(32);
    expect(result!.style?.color).toBe('#111827');
  });

  it('extracts RECTANGLE with style', () => {
    const result = extractNode(mockRectangleNode() as SceneNode);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('RECTANGLE');
    expect(result!.style?.backgroundColor).toMatch(/^#/);
    expect(result!.style?.borderRadius).toBe(8);
    expect(result!.style?.borderWidth).toBe(1);
    expect(result!.style?.borderColor).toMatch(/^#/);
  });

  it('extracts INSTANCE with componentName and expands children', () => {
    const instance = mockInstanceNode({
      children: [mockTextNode({ id: '4:2', name: 'Label', characters: 'Click me' })],
    });
    const result = extractNode(instance as SceneNode);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('INSTANCE');
    expect(result!.componentName).toBe('Button/Primary');
    expect(result!.children).toHaveLength(1);
    expect(result!.children![0].type).toBe('TEXT');
    expect(result!.children![0].text).toBe('Click me');
  });

  it('extracts INSTANCE componentProperties (variants)', () => {
    const instance = mockInstanceNode({
      componentProperties: {
        'State#123:0': { type: 'VARIANT', value: 'Active' },
        'Size#456:0': { type: 'VARIANT', value: 'Large' },
      },
      children: [],
    });
    const result = extractNode(instance as SceneNode);
    expect(result!.componentProperties).toEqual({ State: 'Active', Size: 'Large' });
  });

  it('recurses children of FRAME', () => {
    const frame = mockFrameNode({
      children: [mockTextNode(), mockRectangleNode()],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.children).toHaveLength(2);
    expect(result!.children![0].type).toBe('TEXT');
    expect(result!.children![1].type).toBe('RECTANGLE');
  });

  it('extracts previously unsupported types (VECTOR) via fallback', () => {
    const frame = mockFrameNode({
      children: [
        mockTextNode(),
        { id: '99', name: 'Arrow', type: 'VECTOR', visible: true, width: 24, height: 24, fills: [], strokes: [], opacity: 1 },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.children).toHaveLength(2);
    expect(result!.children![0].type).toBe('TEXT');
    expect(result!.children![1].type).toBe('VECTOR');
  });

  it('extracts unknown root node via fallback instead of returning null', () => {
    const vector = { id: '99', name: 'Arrow', type: 'VECTOR', visible: true, width: 24, height: 24, fills: [], strokes: [], opacity: 1 } as unknown as SceneNode;
    const result = extractNode(vector);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('VECTOR');
    expect(result!.layout?.width).toBe(24);
  });

  it('traverses children of unknown container types', () => {
    const unknown = {
      id: '50:1', name: 'Custom Container', type: 'STICKY', visible: true,
      width: 200, height: 100, fills: [], strokes: [], opacity: 1,
      children: [mockTextNode()],
    } as unknown as SceneNode;
    const result = extractNode(unknown);
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    expect(result!.children![0].type).toBe('TEXT');
  });

  it('extracts letter spacing with PERCENT unit', () => {
    const result = extractNode(mockTextNode({
      letterSpacing: { unit: 'PERCENT', value: -2 },
    }) as SceneNode);
    expect(result!.style?.letterSpacing).toBe(-2);
    expect(result!.style?.letterSpacingUnit).toBe('percent');
  });

  it('extracts letter spacing with PIXELS unit', () => {
    const result = extractNode(mockTextNode({
      letterSpacing: { unit: 'PIXELS', value: 1.5 },
    }) as SceneNode);
    expect(result!.style?.letterSpacing).toBe(1.5);
    expect(result!.style?.letterSpacingUnit).toBe('px');
  });

  it('extracts sizing (hug/fill/fixed)', () => {
    const frame = mockFrameNode({
      layoutMode: 'HORIZONTAL',
      primaryAxisSizingMode: 'AUTO',
      counterAxisSizingMode: 'FIXED',
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.layout?.sizing).toEqual({
      horizontal: 'hug',
      vertical: 'fixed',
    });
  });

  it('extracts text alignment', () => {
    const result = extractNode(mockTextNode({
      textAlignHorizontal: 'CENTER',
    }) as SceneNode);
    expect(result!.style?.textAlign).toBe('center');
  });

  it('omits text alignment when LEFT (default)', () => {
    const result = extractNode(mockTextNode({
      textAlignHorizontal: 'LEFT',
    }) as SceneNode);
    expect(result!.style?.textAlign).toBeUndefined();
  });

  it('extracts text decoration (underline)', () => {
    const result = extractNode(mockTextNode({
      textDecoration: 'UNDERLINE',
    }) as SceneNode);
    expect(result!.style?.textDecoration).toBe('underline');
  });

  it('extracts text case (upper)', () => {
    const result = extractNode(mockTextNode({
      textCase: 'UPPER',
    }) as SceneNode);
    expect(result!.style?.textCase).toBe('upper');
  });

  it('extracts SECTION type with children', () => {
    const section = {
      id: '60:1', name: 'My Section', type: 'SECTION', visible: true,
      width: 500, height: 300, layoutMode: 'VERTICAL', itemSpacing: 8,
      paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
      primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN',
      primaryAxisSizingMode: 'FIXED', counterAxisSizingMode: 'FIXED',
      fills: [], strokes: [], cornerRadius: 0, opacity: 1,
      children: [mockTextNode()],
    } as unknown as SceneNode;
    const result = extractNode(section);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('SECTION');
    expect(result!.children).toHaveLength(1);
    expect(result!.layout?.mode).toBe('vertical');
  });

  it('extracts ELLIPSE as leaf with style', () => {
    const ellipse = {
      id: '70:1', name: 'Circle', type: 'ELLIPSE', visible: true,
      width: 40, height: 40,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1, visible: true }],
      strokes: [], opacity: 1,
    } as unknown as SceneNode;
    const result = extractNode(ellipse);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('ELLIPSE');
    expect(result!.style?.backgroundColor).toBe('#FF0000');
  });

  it('extracts drop shadow effects', () => {
    const frame = mockFrameNode({
      effects: [
        {
          type: 'DROP_SHADOW', visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: 4 }, radius: 8, spread: 0,
        },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.style?.shadows).toHaveLength(1);
    expect(result!.style?.shadows![0]).toEqual({
      type: 'drop', color: '#000000', offsetX: 0, offsetY: 4, blur: 8, spread: 0,
    });
  });

  it('extracts gradient fill when no solid fill', () => {
    const frame = mockFrameNode({
      fills: [
        {
          type: 'GRADIENT_LINEAR', visible: true,
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.style?.backgroundGradient).toBe('linear-gradient(#FF0000 0%, #0000FF 100%)');
    expect(result!.style?.backgroundColor).toBeUndefined();
  });

  it('extracts position and rotation', () => {
    const rect = mockRectangleNode({ x: 24, y: 16, rotation: 45 });
    const result = extractNode(rect as SceneNode);
    expect(result!.layout?.x).toBe(24);
    expect(result!.layout?.y).toBe(16);
    expect(result!.layout?.rotation).toBe(45);
  });

  it('extracts overflow hidden from clipsContent', () => {
    const frame = mockFrameNode({ clipsContent: true });
    const result = extractNode(frame as SceneNode);
    expect(result!.layout?.overflow).toBe('hidden');
  });

  it('extracts image fill hash and scaleMode', () => {
    const frame = mockFrameNode({
      fills: [
        { type: 'IMAGE', visible: true, imageHash: 'abc123hash', scaleMode: 'FILL' },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.style?.imageFillHash).toBe('abc123hash');
    expect(result!.style?.imageFillScaleMode).toBe('fill');
  });

  it('ignores hidden image fills', () => {
    const frame = mockFrameNode({
      fills: [
        { type: 'IMAGE', visible: false, imageHash: 'hidden', scaleMode: 'FIT' },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.style?.imageFillHash).toBeUndefined();
  });

  it('extracts image fill alongside solid fill', () => {
    const frame = mockFrameNode({
      fills: [
        { type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1, visible: true },
        { type: 'IMAGE', visible: true, imageHash: 'overlay123', scaleMode: 'CROP' },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.style?.backgroundColor).toBe('#FFFFFF');
    expect(result!.style?.imageFillHash).toBe('overlay123');
    expect(result!.style?.imageFillScaleMode).toBe('crop');
  });
});
