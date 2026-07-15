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

  it('preserves wrapping auto-layout, size bounds, stacking, and transforms', () => {
    const result = extractNode(mockFrameNode({
      layoutMode: 'HORIZONTAL',
      layoutWrap: 'WRAP',
      counterAxisSpacing: 20,
      counterAxisAlignContent: 'SPACE_BETWEEN',
      itemReverseZIndex: true,
      minWidth: 240,
      maxWidth: 640,
      minHeight: 120,
      maxHeight: 480,
      relativeTransform: [[0.98, -0.17, 12], [0.17, 0.98, 24]],
    }) as SceneNode);

    expect(result!.layout).toEqual(expect.objectContaining({
      mode: 'horizontal',
      wrap: 'wrap',
      counterAxisSpacing: 20,
      counterAxisAlignContent: 'space-between',
      itemReverseZIndex: true,
      minWidth: 240,
      maxWidth: 640,
      minHeight: 120,
      maxHeight: 480,
      relativeTransform: [[0.98, -0.17, 12], [0.17, 0.98, 24]],
    }));
  });

  it('preserves Figma grid tracks and child placement', () => {
    const result = extractNode(mockFrameNode({
      layoutMode: 'GRID',
      gridRowCount: 2,
      gridColumnCount: 3,
      gridRowGap: 12,
      gridColumnGap: 16,
      gridRowSizes: [{ type: 'FIXED', value: 80 }, { type: 'FLEX', value: 1 }],
      gridColumnSizes: [{ type: 'HUG' }, { type: 'FLEX', value: 2 }, { type: 'FIXED', value: 120 }],
      children: [mockRectangleNode({
        gridRowAnchorIndex: 1,
        gridColumnAnchorIndex: 0,
        gridRowSpan: 1,
        gridColumnSpan: 2,
        gridChildHorizontalAlign: 'CENTER',
        gridChildVerticalAlign: 'MAX',
      })],
    }) as SceneNode);

    expect(result!.layout).toEqual(expect.objectContaining({
      mode: 'grid',
      gridRowCount: 2,
      gridColumnCount: 3,
      gridRowGap: 12,
      gridColumnGap: 16,
      gridRowSizes: [{ type: 'fixed', value: 80 }, { type: 'flex', value: 1 }],
      gridColumnSizes: [{ type: 'hug' }, { type: 'flex', value: 2 }, { type: 'fixed', value: 120 }],
    }));
    expect(result!.children![0].layout).toEqual(expect.objectContaining({
      gridRowAnchorIndex: 1,
      gridColumnAnchorIndex: 0,
      gridRowSpan: 1,
      gridColumnSpan: 2,
      gridChildHorizontalAlign: 'center',
      gridChildVerticalAlign: 'max',
    }));
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

  it('preserves text box resizing, vertical alignment, and truncation', () => {
    const result = extractNode(mockTextNode({
      textAlignVertical: 'CENTER',
      textAutoResize: 'HEIGHT',
      textTruncation: 'ENDING',
      maxLines: 2,
    }) as SceneNode);

    expect(result!.style).toEqual(expect.objectContaining({
      textAlignVertical: 'center',
      textAutoResize: 'height',
      textTruncation: 'ending',
      maxLines: 2,
    }));
  });

  it('preserves font face, OpenType, paragraph, and hanging text details', () => {
    const result = extractNode(mockTextNode({
      fontName: { family: 'Inter', style: 'Bold Italic' },
      openTypeFeatures: { LIGA: false, TNUM: true },
      paragraphIndent: 12,
      paragraphSpacing: 10,
      listSpacing: 6,
      hangingPunctuation: true,
      hangingList: true,
      leadingTrim: 'CAP_HEIGHT',
    }) as SceneNode);

    expect(result!.style).toEqual(expect.objectContaining({
      fontFamily: 'Inter',
      fontStyleName: 'Bold Italic',
      openTypeFeatures: { LIGA: false, TNUM: true },
      paragraphIndent: 12,
      paragraphSpacing: 10,
      listSpacing: 6,
      hangingPunctuation: true,
      hangingList: true,
      leadingTrim: 'cap-height',
    }));
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
    expect(result!.componentPropertyDetails).toEqual({
      State: { type: 'VARIANT', value: 'Active' },
      Size: { type: 'VARIANT', value: 'Large' },
    });
  });

  it('extracts prototype triggers and every JSON-safe action field', () => {
    const node = mockRectangleNode({
      reactions: [{
        trigger: { type: 'ON_CLICK' },
        actions: [
          { type: 'URL', url: 'https://example.com', openInNewTab: true },
          {
            type: 'NODE',
            destinationId: '9:9',
            navigation: 'OVERLAY',
            resetScrollPosition: true,
            transition: {
              type: 'SMART_ANIMATE',
              easing: { type: 'EASE_OUT' },
              duration: 0.2,
            },
          },
          {
            type: 'SET_VARIABLE',
            variableId: 'VariableID:1',
            variableValue: { type: 'BOOLEAN', resolvedType: 'BOOLEAN', value: true },
          },
        ],
      }, {
        trigger: { type: 'AFTER_TIMEOUT', timeout: 1.5 },
        action: { type: 'BACK' },
      }],
    });

    expect(extractNode(node as SceneNode)!.reactions).toEqual([
      {
        trigger: { type: 'ON_CLICK' },
        actions: [
          { type: 'URL', url: 'https://example.com', openInNewTab: true },
          {
            type: 'NODE',
            destinationId: '9:9',
            navigation: 'OVERLAY',
            resetScrollPosition: true,
            transition: {
              type: 'SMART_ANIMATE',
              easing: { type: 'EASE_OUT' },
              duration: 0.2,
            },
          },
          {
            type: 'SET_VARIABLE',
            variableId: 'VariableID:1',
            variableValue: { type: 'BOOLEAN', resolvedType: 'BOOLEAN', value: true },
          },
        ],
      },
      {
        trigger: { type: 'AFTER_TIMEOUT', timeout: 1.5 },
        actions: [{ type: 'BACK' }],
      },
    ]);
  });

  it('extracts component documentation and typed property definitions', () => {
    const component = mockFrameNode({
      id: 'component:1',
      type: 'COMPONENT',
      description: 'Primary purchase action',
      descriptionMarkdown: '**Primary** purchase action',
      documentationLinks: [{ uri: 'https://design.example.com/button' }],
      componentPropertyDefinitions: {
        'Disabled#1:2': {
          type: 'BOOLEAN',
          defaultValue: false,
          description: 'Disables interaction',
        },
        State: {
          type: 'VARIANT',
          defaultValue: 'Default',
          variantOptions: ['Default', 'Hover', 'Pressed'],
        },
      },
    });

    const result = extractNode(component as SceneNode)!;
    expect(result.description).toBe('Primary purchase action');
    expect(result.descriptionMarkdown).toBe('**Primary** purchase action');
    expect(result.documentationLinks).toEqual(['https://design.example.com/button']);
    expect(result.componentPropertyDefinitions).toEqual({
      Disabled: {
        type: 'BOOLEAN',
        defaultValue: false,
        description: 'Disables interaction',
      },
      State: {
        type: 'VARIANT',
        defaultValue: 'Default',
        variantOptions: ['Default', 'Hover', 'Pressed'],
      },
    });
  });

  it('does not crash when a variant component rejects componentPropertyDefinitions', () => {
    const variant = mockFrameNode({
      id: 'variant:1',
      type: 'COMPONENT',
      reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'BACK' }] }],
    }) as Record<string, unknown>;
    Object.defineProperty(variant, 'componentPropertyDefinitions', {
      configurable: true,
      get() {
        throw new Error(
          'Can only get component property definitions of a component set or non-variant component',
        );
      },
    });

    expect(() => extractNode(variant as unknown as SceneNode)).not.toThrow();
    expect(extractNode(variant as unknown as SceneNode)?.reactions).toEqual([{
      trigger: { type: 'ON_CLICK' },
      actions: [{ type: 'BACK' }],
    }]);
  });

  it('extracts scrolling, fixed children, and overlay presentation settings', () => {
    const result = extractNode(mockFrameNode({
      overflowDirection: 'VERTICAL',
      numberOfFixedChildren: 2,
      overlayPositionType: 'BOTTOM_CENTER',
      overlayBackground: {
        type: 'SOLID_COLOR',
        color: { r: 0, g: 0, b: 0, a: 0.45 },
      },
      overlayBackgroundInteraction: 'CLOSE_ON_CLICK_OUTSIDE',
      children: [
        mockRectangleNode({ id: 'content', name: 'Content' }),
        mockRectangleNode({ id: 'header', name: 'Header' }),
        mockRectangleNode({ id: 'footer', name: 'Footer' }),
      ],
    }) as SceneNode)!;

    expect(result.prototype).toEqual({
      overflowDirection: 'vertical',
      fixedChildIds: ['header', 'footer'],
      overlayPositionType: 'bottom-center',
      overlayBackground: {
        type: 'SOLID_COLOR',
        color: { r: 0, g: 0, b: 0, a: 0.45 },
      },
      overlayBackgroundInteraction: 'close-on-click-outside',
    });
  });

  it('extracts developer annotations, component references, variable bindings, and modes', () => {
    const result = extractNode(mockRectangleNode({
      annotations: [{
        label: 'Primary CTA',
        labelMarkdown: '**Primary CTA**',
        properties: [{ type: 'fills' }, { type: 'cornerRadius' }],
        categoryId: 'category:1',
      }],
      componentPropertyReferences: {
        visible: 'Disabled#12:34',
        characters: 'Label#12:35',
      },
      boundVariables: {
        opacity: { type: 'VARIABLE_ALIAS', id: 'VariableID:opacity' },
        fills: [
          { type: 'VARIABLE_ALIAS', id: 'VariableID:bg' },
          { type: 'VARIABLE_ALIAS', id: 'VariableID:accent' },
        ],
        componentProperties: {
          Disabled: { type: 'VARIABLE_ALIAS', id: 'VariableID:disabled' },
        },
      },
      explicitVariableModes: {
        'VariableCollectionId:theme': 'VariableModeId:dark',
      },
    }) as SceneNode)!;

    expect(result.annotations).toEqual([{
      label: 'Primary CTA',
      labelMarkdown: '**Primary CTA**',
      properties: ['fills', 'cornerRadius'],
      categoryId: 'category:1',
    }]);
    expect(result.componentPropertyReferences).toEqual({
      visible: 'Disabled',
      characters: 'Label',
    });
    expect(result.variableBindings).toEqual({
      opacity: { id: 'VariableID:opacity' },
      fills: [{ id: 'VariableID:bg' }, { id: 'VariableID:accent' }],
      componentProperties: {
        Disabled: { id: 'VariableID:disabled' },
      },
    });
    expect(result.explicitVariableModes).toEqual([{
      collectionId: 'VariableCollectionId:theme',
      modeId: 'VariableModeId:dark',
    }]);
  });

  it('resolves referenced prototype variables with collection modes and values', () => {
    const previousFigma = Object.getOwnPropertyDescriptor(globalThis, 'figma');
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        variables: {
          getVariableById: (id: string) => id === 'VariableID:visible' ? {
            id,
            name: 'State/Visible',
            variableCollectionId: 'VariableCollectionId:state',
            resolvedType: 'BOOLEAN',
            description: 'Controls checkout visibility',
            scopes: ['ALL_SCOPES'],
            codeSyntax: { WEB: '--state-visible' },
            valuesByMode: {
              'VariableModeId:on': true,
              'VariableModeId:off': false,
            },
          } : null,
          getVariableCollectionById: (id: string) => id === 'VariableCollectionId:state' ? {
            id,
            name: 'State',
            modes: [
              { modeId: 'VariableModeId:on', name: 'On' },
              { modeId: 'VariableModeId:off', name: 'Off' },
            ],
          } : null,
        },
      },
    });

    try {
      const result = extractNode(mockRectangleNode({
        boundVariables: {
          visible: { type: 'VARIABLE_ALIAS', id: 'VariableID:visible' },
        },
        reactions: [{
          trigger: { type: 'ON_CLICK' },
          actions: [{
            type: 'SET_VARIABLE',
            variableId: 'VariableID:visible',
            variableValue: { type: 'BOOLEAN', resolvedType: 'BOOLEAN', value: false },
          }],
        }],
      }) as SceneNode)!;

      expect(result.variableBindings).toEqual({
        visible: { id: 'VariableID:visible', name: 'State/Visible' },
      });
      expect(result.referencedVariables).toEqual([{
        id: 'VariableID:visible',
        name: 'State/Visible',
        collectionId: 'VariableCollectionId:state',
        collectionName: 'State',
        resolvedType: 'BOOLEAN',
        description: 'Controls checkout visibility',
        scopes: ['ALL_SCOPES'],
        codeSyntax: { WEB: '--state-visible' },
        valuesByMode: {
          'VariableModeId:on': { modeName: 'On', value: true },
          'VariableModeId:off': { modeName: 'Off', value: false },
        },
      }]);
    } finally {
      if (previousFigma) Object.defineProperty(globalThis, 'figma', previousFigma);
      else Reflect.deleteProperty(globalThis, 'figma');
    }
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

  it('preserves opacity, blend mode, and effects on groups', () => {
    const group = {
      id: 'group:1',
      name: 'Faded group',
      type: 'GROUP',
      visible: true,
      width: 200,
      height: 100,
      opacity: 0.5,
      blendMode: 'MULTIPLY',
      effects: [
        {
          type: 'DROP_SHADOW', visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.2 },
          offset: { x: 0, y: 4 }, radius: 8, spread: 0,
          blendMode: 'NORMAL',
          showShadowBehindNode: true,
        },
      ],
      children: [mockRectangleNode()],
    } as unknown as SceneNode;

    const result = extractNode(group);

    expect(result!.style?.opacity).toBe(0.5);
    expect(result!.style?.blendMode).toBe('multiply');
    expect(result!.style?.shadows).toEqual([
      expect.objectContaining({ type: 'drop', opacity: 0.2, offsetY: 4, blur: 8 }),
    ]);
    expect(result!.children).toHaveLength(1);
  });

  it('extracts linear and radial repeat metadata from transform groups', () => {
    const result = extractNode({
      id: '6:9',
      name: 'Repeated ornament',
      type: 'TRANSFORM_GROUP',
      visible: true,
      width: 240,
      height: 240,
      fills: [],
      strokes: [],
      opacity: 1,
      transformModifiers: [
        {
          type: 'REPEAT',
          repeatType: 'LINEAR',
          count: 5,
          unitType: 'PIXELS',
          offset: 12,
          axis: 'HORIZONTAL',
        },
        {
          type: 'REPEAT',
          repeatType: 'RADIAL',
          count: 8,
          unitType: 'RELATIVE',
          offset: 0.5,
        },
      ],
      children: [mockRectangleNode()],
    } as unknown as SceneNode);

    expect(result).toEqual(expect.objectContaining({
      type: 'TRANSFORM_GROUP',
      transformModifiers: [
        {
          type: 'repeat',
          repeatType: 'linear',
          count: 5,
          unitType: 'px',
          offset: 12,
          axis: 'horizontal',
        },
        {
          type: 'repeat',
          repeatType: 'radial',
          count: 8,
          unitType: 'relative',
          offset: 0.5,
        },
      ],
      children: [expect.objectContaining({ id: '3:1' })],
    }));
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

  it('extracts vector path data when available', () => {
    const vector = {
      id: '99',
      name: 'Arrow',
      type: 'VECTOR',
      visible: true,
      width: 24,
      height: 24,
      fills: [],
      strokes: [],
      opacity: 1,
      vectorPaths: [{ windingRule: 'NONZERO', data: 'M 7 4 L 17 12 L 7 20 Z' }],
      fillGeometry: [{ windingRule: 'EVENODD', data: 'M 0 0 L 10 0 L 10 10 Z' }],
      strokeGeometry: [{ windingRule: 'NONE', data: 'M 0 0 L 10 10' }],
    } as unknown as SceneNode;
    const result = extractNode(vector);
    expect(result!.vectorPaths).toEqual([{ windingRule: 'NONZERO', data: 'M 7 4 L 17 12 L 7 20 Z' }]);
    expect(result!.fillGeometry).toEqual([{ windingRule: 'EVENODD', data: 'M 0 0 L 10 0 L 10 10 Z' }]);
    expect(result!.strokeGeometry).toEqual([{ windingRule: 'NONE', data: 'M 0 0 L 10 10' }]);
  });

  it('drops fillGeometry on non-vector types (text, frame, rectangle)', () => {
    const path = [{ windingRule: 'NONZERO', data: 'M 0 0 L 10 0 L 10 10 Z' }];
    for (const type of ['TEXT', 'FRAME', 'RECTANGLE', 'ELLIPSE', 'INSTANCE'] as const) {
      const node = {
        id: `id-${type}`, name: type, type, visible: true,
        width: 100, height: 20, fills: [], strokes: [], opacity: 1,
        characters: type === 'TEXT' ? 'hello' : undefined,
        fillGeometry: path,
        strokeGeometry: path,
      } as unknown as SceneNode;
      const result = extractNode(node);
      expect(result!.fillGeometry, `${type} should not carry fillGeometry`).toBeUndefined();
      expect(result!.strokeGeometry, `${type} should not carry strokeGeometry`).toBeUndefined();
      expect(result!.vectorPaths, `${type} should not carry vectorPaths`).toBeUndefined();
    }
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

  it('keeps future node types when unsupported Figma host getters throw', () => {
    const futureNode = {
      id: 'future:1',
      name: 'Future media',
      type: 'FUTURE_MEDIA',
      visible: true,
      width: 80,
      height: 40,
    } as Record<string, unknown>;
    for (const property of ['blendMode', 'fills', 'reactions']) {
      Object.defineProperty(futureNode, property, {
        configurable: true,
        get() {
          throw new Error(`${property} is not implemented on FUTURE_MEDIA`);
        },
      });
    }

    expect(() => extractNode(futureNode as unknown as SceneNode)).not.toThrow();
    expect(extractNode(futureNode as unknown as SceneNode)).toEqual(expect.objectContaining({
      id: 'future:1',
      type: 'FUTURE_MEDIA',
      layout: expect.objectContaining({ width: 80, height: 40 }),
    }));
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

  it('extracts child auto-layout metadata', () => {
    const result = extractNode(mockRectangleNode({
      layoutPositioning: 'ABSOLUTE',
      layoutAlign: 'STRETCH',
      layoutGrow: 1,
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'HUG',
    }) as SceneNode);
    expect(result!.layout?.layoutPositioning).toBe('absolute');
    expect(result!.layout?.layoutAlign).toBe('stretch');
    expect(result!.layout?.layoutGrow).toBe(1);
    expect(result!.layout?.sizing).toEqual({
      horizontal: 'fill',
      vertical: 'hug',
    });
  });

  it('extracts constraints and target aspect ratio', () => {
    const result = extractNode(mockRectangleNode({
      constraints: { horizontal: 'STRETCH', vertical: 'SCALE' },
      targetAspectRatio: { x: 16, y: 9 },
    }) as SceneNode);
    expect(result!.layout?.constraints).toEqual({ horizontal: 'stretch', vertical: 'scale' });
    expect(result!.layout?.targetAspectRatio).toEqual({ x: 16, y: 9 });
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

  it('preserves exact text decoration style, geometry, color, and ink behavior', () => {
    const result = extractNode(mockTextNode({
      textDecoration: 'UNDERLINE',
      textDecorationStyle: 'WAVY',
      textDecorationOffset: { unit: 'PIXELS', value: 2 },
      textDecorationThickness: { unit: 'PERCENT', value: 12.5 },
      textDecorationColor: {
        value: {
          type: 'SOLID',
          color: { r: 1, g: 0.2, b: 0.4 },
          opacity: 0.75,
        },
      },
      textDecorationSkipInk: false,
    }) as SceneNode);

    expect(result!.style).toEqual(expect.objectContaining({
      textDecoration: 'underline',
      textDecorationStyle: 'wavy',
      textDecorationOffset: { unit: 'px', value: 2 },
      textDecorationThickness: { unit: 'percent', value: 12.5 },
      textDecorationColor: { color: '#FF3366', opacity: 0.75 },
      textDecorationSkipInk: false,
    }));
  });

  it('extracts text on a path with vector geometry and its exact start position', () => {
    const result = extractNode(mockTextNode({
      id: '2:9',
      name: 'Circular label',
      type: 'TEXT_PATH',
      characters: 'Around the curve',
      vectorPaths: [{ windingRule: 'NONZERO', data: 'M0 50 A50 50 0 1 1 100 50' }],
      fillGeometry: [{ windingRule: 'NONZERO', data: 'M0 48 A48 48 0 1 1 96 48' }],
      strokeGeometry: [],
      textPathStartData: { segment: 2, position: 0.375 },
    }) as SceneNode);

    expect(result).toEqual(expect.objectContaining({
      type: 'TEXT_PATH',
      text: 'Around the curve',
      vectorPaths: [{ windingRule: 'NONZERO', data: 'M0 50 A50 50 0 1 1 100 50' }],
      fillGeometry: [{ windingRule: 'NONZERO', data: 'M0 48 A48 48 0 1 1 96 48' }],
      textPathStartData: { segment: 2, position: 0.375 },
      style: expect.objectContaining({ fontFamily: 'Inter', fontWeight: 700 }),
    }));
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

  it('preserves squircle corner smoothing and ellipse arc geometry', () => {
    const rectangle = extractNode(mockRectangleNode({ cornerSmoothing: 0.6 }) as SceneNode);
    const ellipse = extractNode({
      id: 'arc',
      name: 'Progress ring',
      type: 'ELLIPSE',
      visible: true,
      width: 96,
      height: 96,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, visible: true }],
      strokes: [],
      opacity: 1,
      cornerSmoothing: 0.4,
      arcData: { startingAngle: 0, endingAngle: Math.PI * 1.5, innerRadius: 0.72 },
    } as unknown as SceneNode);

    expect(rectangle!.style?.cornerSmoothing).toBe(0.6);
    expect(ellipse!.style?.cornerSmoothing).toBe(0.4);
    expect(ellipse!.arcData).toEqual({
      startingAngle: 0,
      endingAngle: Math.PI * 1.5,
      innerRadius: 0.72,
    });
  });

  it('extracts drop shadow effects', () => {
    const frame = mockFrameNode({
      effects: [
        {
          type: 'DROP_SHADOW', visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: 4 }, radius: 8, spread: 0,
          blendMode: 'MULTIPLY',
          showShadowBehindNode: true,
        },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.style?.shadows).toHaveLength(1);
    expect(result!.style?.shadows![0]).toEqual({
      type: 'drop', color: '#000000', opacity: 0.25, blendMode: 'multiply', showShadowBehindNode: true, offsetX: 0, offsetY: 4, blur: 8, spread: 0,
    });
  });

  it('extracts layer blend mode, mask metadata, and blur effects', () => {
    const result = extractNode(mockRectangleNode({
      blendMode: 'OVERLAY',
      isMask: true,
      maskType: 'LUMINANCE',
      effects: [
        { type: 'LAYER_BLUR', visible: true, radius: 12, blurType: 'NORMAL' },
        {
          type: 'BACKGROUND_BLUR',
          visible: true,
          radius: 20,
          blurType: 'PROGRESSIVE',
          startRadius: 4,
          startOffset: { x: 0, y: 0 },
          endOffset: { x: 1, y: 1 },
        },
      ],
    }) as SceneNode);

    expect(result!.style?.blendMode).toBe('overlay');
    expect(result!.style?.isMask).toBe(true);
    expect(result!.style?.maskType).toBe('luminance');
    expect(result!.style?.blurEffects).toEqual([
      { type: 'layer', radius: 12, blurType: 'normal' },
      { type: 'background', radius: 20, blurType: 'progressive', startRadius: 4, startOffset: { x: 0, y: 0 }, endOffset: { x: 1, y: 1 } },
    ]);
    expect(result!.fidelityWarnings).toContainEqual(expect.objectContaining({
      code: 'progressive-blur',
      severity: 'critical',
    }));
  });

  it('captures noise, texture, and glass effects and forces an exact fallback', () => {
    const result = extractNode(mockFrameNode({
      effects: [
        {
          type: 'NOISE',
          noiseType: 'DUOTONE',
          color: { r: 0.1, g: 0.2, b: 0.3, a: 0.8 },
          secondaryColor: { r: 0.9, g: 0.8, b: 0.7, a: 0.6 },
          blendMode: 'OVERLAY',
          noiseSize: 0.35,
          density: 0.7,
          visible: true,
        },
        {
          type: 'TEXTURE',
          noiseSize: 0.25,
          radius: 4,
          clipToShape: true,
          visible: true,
        },
        {
          type: 'GLASS',
          lightIntensity: 0.8,
          lightAngle: 135,
          refraction: 0.4,
          depth: 12,
          dispersion: 0.2,
          radius: 18,
          visible: true,
        },
      ],
    }) as SceneNode);

    expect(result!.style?.advancedEffects).toEqual([
      {
        type: 'noise',
        noiseType: 'duotone',
        color: '#1A334D',
        colorOpacity: 0.8,
        secondaryColor: '#E6CCB3',
        secondaryColorOpacity: 0.6,
        blendMode: 'overlay',
        noiseSize: 0.35,
        density: 0.7,
      },
      { type: 'texture', noiseSize: 0.25, radius: 4, clipToShape: true },
      {
        type: 'glass',
        lightIntensity: 0.8,
        lightAngle: 135,
        refraction: 0.4,
        depth: 12,
        dispersion: 0.2,
        radius: 18,
      },
    ]);
    expect(result!.fidelityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported-effect-noise', severity: 'critical' }),
      expect.objectContaining({ code: 'unsupported-effect-texture', severity: 'critical' }),
      expect.objectContaining({ code: 'unsupported-effect-glass', severity: 'critical' }),
    ]));
  });

  it('fails closed for future unknown visible paint and effect types', () => {
    const result = extractNode(mockFrameNode({
      fills: [{ type: 'MESH_GRADIENT', visible: true }],
      effects: [{ type: 'HOLOGRAPHIC', visible: true }],
    }) as SceneNode);

    expect(result!.fidelityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported-fill-mesh-gradient', severity: 'critical' }),
      expect.objectContaining({ code: 'unsupported-effect-holographic', severity: 'critical' }),
    ]));
  });

  it('extracts paint opacity separately from node opacity', () => {
    const result = extractNode(mockRectangleNode({
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.6, visible: true }],
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.4, visible: true }],
    }) as SceneNode);
    expect(result!.style?.backgroundColor).toBe('#FFFFFF');
    expect(result!.style?.backgroundOpacity).toBe(0.6);
    expect(result!.style?.borderColor).toBe('#000000');
    expect(result!.style?.borderOpacity).toBe(0.4);
  });

  it('extracts detailed stroke metadata', () => {
    const result = extractNode(mockRectangleNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }],
      strokeWeight: 2,
      strokeAlign: 'INSIDE',
      strokeCap: 'ROUND',
      strokeJoin: 'BEVEL',
      strokeMiterLimit: 8,
      dashPattern: [4, 2],
      strokeTopWeight: 1,
      strokeRightWeight: 2,
      strokeBottomWeight: 3,
      strokeLeftWeight: 4,
    }) as SceneNode);

    expect(result!.style?.borderWidth).toBe(2);
    expect(result!.style?.strokeAlign).toBe('inside');
    expect(result!.style?.strokeCap).toBe('round');
    expect(result!.style?.strokeJoin).toBe('bevel');
    expect(result!.style?.strokeMiterLimit).toBe(8);
    expect(result!.style?.strokeDashPattern).toEqual([4, 2]);
    expect(result!.style?.strokeWeights).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
  });

  it('marks variable-width, brush, and dynamic strokes for an exact rendered fallback', () => {
    const result = extractNode(mockRectangleNode({
      variableWidthStrokeProperties: {
        widthProfile: 'CUSTOM',
        variableWidthPoints: [{ position: 0, width: 0.5 }, { position: 1, width: 2 }],
      },
      complexStrokeProperties: { type: 'DYNAMIC', frequency: 2, wiggle: 4, smoothen: 0.8 },
    }) as SceneNode);

    expect(result!.fidelityWarnings).toContainEqual(expect.objectContaining({
      code: 'complex-stroke',
      severity: 'critical',
    }));
  });

  it('extracts gradient fill when no solid fill', () => {
    const frame = mockFrameNode({
      fills: [
        {
          type: 'GRADIENT_LINEAR', visible: true,
          opacity: 0.75,
          gradientTransform: [[1, 0, 0], [0, 1, 0]],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } },
          ],
        },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.style?.backgroundGradient).toBe('linear-gradient(#FF0000 0%, #0000FF 100%)');
    expect(result!.style?.backgroundGradientType).toBe('linear');
    expect(result!.style?.backgroundGradientOpacity).toBe(0.75);
    expect(result!.style?.backgroundGradientTransform).toEqual([[1, 0, 0], [0, 1, 0]]);
    expect(result!.style?.backgroundGradientStops).toEqual([
      { color: '#FF0000', position: 0 },
      { color: '#0000FF', position: 1, opacity: 0.5 },
    ]);
    expect(result!.style?.backgroundColor).toBeUndefined();
  });

  it('marks angular and diamond gradients for an exact rendered fallback', () => {
    for (const type of ['GRADIENT_ANGULAR', 'GRADIENT_DIAMOND']) {
      const result = extractNode(mockRectangleNode({
        fills: [{
          type,
          visible: true,
          gradientTransform: [[1, 0, 0], [0, 1, 0]],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        }],
      }) as SceneNode);

      expect(result!.fidelityWarnings).toContainEqual(expect.objectContaining({
        code: 'non-css-gradient',
        severity: 'critical',
      }));
    }
  });

  it('preserves the full fill and stroke paint stacks', () => {
    const result = extractNode(mockRectangleNode({
      fills: [
        { type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.5, visible: true },
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
          gradientTransform: [[1, 0, 0], [0, 1, 0]],
          gradientStops: [
            { position: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 0, a: 0.25 } },
          ],
        },
        { type: 'IMAGE', visible: true, imageHash: 'img123', scaleMode: 'FILL' },
        { type: 'VIDEO', visible: true, videoHash: 'vid123', scaleMode: 'CROP' },
      ],
      strokes: [
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true },
        { type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.4, visible: true },
      ],
    }) as SceneNode);

    expect(result!.style?.backgroundColor).toBe('#FF0000');
    expect(result!.style?.backgroundOpacity).toBe(0.5);
    expect(result!.style?.imageFillHash).toBe('img123');
    expect(result!.style?.fills?.map((paint) => paint.type)).toEqual(['solid', 'gradient', 'image', 'video']);
    expect(result!.style?.fills?.[1]).toEqual(expect.objectContaining({
      type: 'gradient',
      gradientType: 'linear',
      css: 'linear-gradient(#FFFFFF 0%, #000000 100%)',
      gradientStops: [
        { color: '#FFFFFF', position: 0 },
        { color: '#000000', position: 1, opacity: 0.25 },
      ],
    }));
    expect(result!.style?.fills?.[2]).toEqual(expect.objectContaining({
      type: 'image',
      imageHash: 'img123',
      scaleMode: 'fill',
    }));
    expect(result!.style?.fills?.[3]).toEqual(expect.objectContaining({
      type: 'video',
      videoHash: 'vid123',
      scaleMode: 'crop',
    }));
    expect(result!.style?.strokes?.map((paint) => paint.color)).toEqual(['#000000', '#FFFFFF']);
    expect(result!.fidelityWarnings?.map((warning) => warning.code)).toEqual([
      'multiple-fills',
      'multiple-strokes',
      'unsupported-fill-video',
    ]);
    expect(result!.fidelityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'multiple-fills', severity: 'critical' }),
      expect.objectContaining({ code: 'multiple-strokes', severity: 'critical' }),
    ]));
  });

  it('marks Figma linear burn and linear dodge blend modes as non-CSS fidelity risks', () => {
    const result = extractNode(mockRectangleNode({
      blendMode: 'LINEAR_BURN',
      fills: [{
        type: 'SOLID',
        color: { r: 1, g: 0, b: 0 },
        visible: true,
        blendMode: 'LINEAR_DODGE',
      }],
    }) as SceneNode);

    expect(result!.fidelityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'non-css-blend-mode-linear-burn', severity: 'critical' }),
      expect.objectContaining({ code: 'non-css-blend-mode-linear-dodge', severity: 'critical' }),
    ]));
  });

  it('extracts position and rotation', () => {
    const rect = mockRectangleNode({ x: 24, y: 16, rotation: 45 });
    const result = extractNode(rect as SceneNode);
    expect(result!.layout?.x).toBe(24);
    expect(result!.layout?.y).toBe(16);
    expect(result!.layout?.rotation).toBe(45);
  });

  it('preserves effect-inclusive render bounds relative to the node box', () => {
    const result = extractNode(mockRectangleNode({
      absoluteBoundingBox: { x: 100, y: 200, width: 100, height: 50 },
      absoluteRenderBounds: { x: 94, y: 192, width: 112, height: 70 },
    }) as SceneNode);

    expect(result!.layout?.renderBounds).toEqual({
      x: -6,
      y: -8,
      width: 112,
      height: 70,
    });
  });

  it('extracts overflow hidden from clipsContent', () => {
    const frame = mockFrameNode({ clipsContent: true });
    const result = extractNode(frame as SceneNode);
    expect(result!.layout?.overflow).toBe('hidden');
  });

  it('extracts strokesIncludedInLayout for auto-layout frames', () => {
    const frame = mockFrameNode({ strokesIncludedInLayout: true });
    const result = extractNode(frame as SceneNode);
    expect(result!.layout?.strokesIncludedInLayout).toBe(true);
  });

  it('extracts image fill hash and scaleMode', () => {
    const frame = mockFrameNode({
      fills: [
        {
          type: 'IMAGE',
          visible: true,
          imageHash: 'abc123hash',
          scaleMode: 'CROP',
          imageTransform: [[0.5, 0, 0.25], [0, 0.5, 0.1]],
          scalingFactor: 0.5,
          rotation: 90,
          filters: { exposure: 0.2, contrast: 0 },
          opacity: 0.8,
          blendMode: 'MULTIPLY',
        },
      ],
    });
    const result = extractNode(frame as SceneNode);
    expect(result!.style?.imageFillHash).toBe('abc123hash');
    expect(result!.style?.imageFillScaleMode).toBe('crop');
    expect(result!.style?.imageFillTransform).toEqual([[0.5, 0, 0.25], [0, 0.5, 0.1]]);
    expect(result!.style?.imageFillScalingFactor).toBe(0.5);
    expect(result!.style?.imageFillRotation).toBe(90);
    expect(result!.style?.imageFillFilters).toEqual({ exposure: 0.2 });
    expect(result!.style?.imageFillOpacity).toBe(0.8);
    expect(result!.style?.imageFillBlendMode).toBe('multiply');
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

  it('extracts mixed text style ranges when available', () => {
    const result = extractNode(mockTextNode({
      characters: 'Hello link',
      getStyledTextSegments: (fields: string[]) => {
        expect(fields).toContain('openTypeFeatures');
        expect(fields).toContain('leadingTrim');
        return [
          {
            start: 0,
            end: 5,
            characters: 'Hello',
            fontName: { family: 'Inter', style: 'Regular' },
            fontSize: 16,
            fontWeight: 400,
            lineHeight: { unit: 'PIXELS', value: 24 },
            letterSpacing: { unit: 'PIXELS', value: 0 },
            fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }],
            textDecoration: 'NONE',
            textCase: 'ORIGINAL',
          },
          {
            start: 6,
            end: 10,
            characters: 'link',
            fontName: { family: 'Inter', style: 'Bold' },
            fontSize: 16,
            fontWeight: 700,
            lineHeight: { unit: 'PIXELS', value: 24 },
            letterSpacing: { unit: 'PIXELS', value: 0 },
            fills: [{ type: 'SOLID', color: { r: 0, g: 0.2, b: 1 }, opacity: 1, visible: true }],
            textDecoration: 'UNDERLINE',
            textCase: 'ORIGINAL',
            hyperlink: { type: 'URL', value: 'https://example.com' },
            paragraphSpacing: 8,
          },
        ];
      },
    }) as SceneNode);

    expect(result!.textStyleRanges).toHaveLength(2);
    expect(result!.textStyleRanges![0]).toEqual(expect.objectContaining({
      start: 0,
      end: 5,
      text: 'Hello',
      style: expect.objectContaining({ fontFamily: 'Inter', fontWeight: 400, color: '#000000' }),
    }));
    expect(result!.textStyleRanges![1]).toEqual(expect.objectContaining({
      start: 6,
      end: 10,
      text: 'link',
      hyperlink: { type: 'url', value: 'https://example.com' },
      paragraphSpacing: 8,
      style: expect.objectContaining({ fontWeight: 700, color: '#0033FF', textDecoration: 'underline' }),
    }));
    expect(result!.fidelityWarnings?.map((warning) => warning.code)).toContain('mixed-text-styles');
  });
});
