import type { UISerializedNode, UINodeType, UILayout, UIStyle } from '@shared/types';
import { rgbaToHex, normalizeLineHeight } from './normalizer';

// Types that we know how to fully extract
const CONTAINER_TYPES = new Set<string>(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION', 'BOOLEAN_OPERATION']);
const LEAF_TYPES = new Set<string>(['TEXT', 'RECTANGLE', 'ELLIPSE', 'LINE', 'VECTOR', 'POLYGON', 'STAR']);
const GROUP_TYPES = new Set<string>(['GROUP']);
const INSTANCE_TYPE = 'INSTANCE';

interface FillPaint {
  type: string;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  visible?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = Record<string, any>;

function firstSolidFill(fills: FillPaint[]): FillPaint | undefined {
  if (!Array.isArray(fills)) return undefined;
  return fills.find((f) => f.type === 'SOLID' && f.visible !== false);
}

/** Resolve a Figma variable ID to its token name */
function resolveVariableName(variableId: string): string | undefined {
  if (typeof figma === 'undefined' || !figma.variables) return undefined;
  try {
    const variable = figma.variables.getVariableById(variableId);
    return variable?.name;
  } catch { return undefined; }
}

/** Resolve a Figma style ID to its style name */
function resolveStyleName(styleId: unknown): string | undefined {
  if (typeof figma === 'undefined') return undefined;
  if (!styleId || styleId === figma.mixed) return undefined;
  try {
    const style = figma.getStyleById(styleId as string);
    return style?.name;
  } catch { return undefined; }
}

/** Extract variable bindings from node.boundVariables */
function extractVariables(node: AnyNode, isText = false): Record<string, string> | undefined {
  const bound = node.boundVariables;
  if (!bound) return undefined;

  const vars: Record<string, string> = {};

  // Fill color variable
  const fillBindings = bound.fills;
  if (Array.isArray(fillBindings) && fillBindings.length > 0 && fillBindings[0]?.id) {
    const name = resolveVariableName(fillBindings[0].id);
    if (name) vars[isText ? 'color' : 'backgroundColor'] = name;
  }

  // Stroke color variable
  const strokeBindings = bound.strokes;
  if (Array.isArray(strokeBindings) && strokeBindings.length > 0 && strokeBindings[0]?.id) {
    const name = resolveVariableName(strokeBindings[0].id);
    if (name) vars.borderColor = name;
  }

  return Object.keys(vars).length > 0 ? vars : undefined;
}

function extractStyle(node: AnyNode, isText = false): UIStyle {
  const style: UIStyle = {};

  // Background / fill color
  const fills: FillPaint[] = node.fills ?? [];
  const fill = firstSolidFill(fills);
  if (fill?.color) {
    const hex = rgbaToHex({ r: fill.color.r, g: fill.color.g, b: fill.color.b, a: fill.opacity ?? 1 });
    if (isText) {
      style.color = hex;
    } else {
      style.backgroundColor = hex;
    }
  }

  // Fill style name (e.g. "BG/BG Neutral 1")
  const fillStyleName = resolveStyleName(node.fillStyleId);
  if (fillStyleName) style.fillStyleName = fillStyleName;

  // Stroke style name
  const strokeStyleName = resolveStyleName(node.strokeStyleId);
  if (strokeStyleName) style.strokeStyleName = strokeStyleName;

  // Variable bindings (design tokens)
  const variables = extractVariables(node, isText);
  if (variables) style.variables = variables;

  // Border radius
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    style.borderRadius = node.cornerRadius;
  }

  // Strokes
  const strokes: FillPaint[] = node.strokes ?? [];
  const stroke = firstSolidFill(strokes);
  if (stroke?.color) {
    style.borderColor = rgbaToHex({ r: stroke.color.r, g: stroke.color.g, b: stroke.color.b, a: stroke.opacity ?? 1 });
    if (typeof node.strokeWeight === 'number') {
      style.borderWidth = node.strokeWeight;
    }
  }

  // Opacity
  if (typeof node.opacity === 'number' && node.opacity < 1) {
    style.opacity = node.opacity;
  }

  // Individual corner radii (when not uniform)
  const isMixedRadius = typeof figma !== 'undefined' && node.cornerRadius === figma.mixed;
  if (isMixedRadius) {
    const tl = node.topLeftRadius ?? 0;
    const tr = node.topRightRadius ?? 0;
    const br = node.bottomRightRadius ?? 0;
    const bl = node.bottomLeftRadius ?? 0;
    if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
      style.cornerRadii = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
    }
  }

  // Shadow effects (drop shadow, inner shadow)
  const effects: AnyNode[] = node.effects ?? [];
  const shadows = effects
    .filter((e) => (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false)
    .map((e) => ({
      type: (e.type === 'DROP_SHADOW' ? 'drop' : 'inner') as 'drop' | 'inner',
      color: rgbaToHex({ r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a ?? 1 }),
      offsetX: e.offset?.x ?? 0,
      offsetY: e.offset?.y ?? 0,
      blur: e.radius ?? 0,
      spread: e.spread ?? 0,
    }));
  if (shadows.length > 0) style.shadows = shadows;

  // Image fill
  if (!isText) {
    const imageFill = Array.isArray(fills)
      ? fills.find((f: FillPaint) => f.type === 'IMAGE' && f.visible !== false)
      : undefined;
    if (imageFill) {
      const imgNode = imageFill as AnyNode;
      if (imgNode.imageHash) style.imageFillHash = imgNode.imageHash;
      if (imgNode.scaleMode) style.imageFillScaleMode = (imgNode.scaleMode as string).toLowerCase() as UIStyle['imageFillScaleMode'];
    }
  }

  // Gradient fill (first gradient if no solid fill found)
  if (!fill) {
    const gradient = Array.isArray(fills)
      ? fills.find((f: FillPaint) => f.type?.includes('GRADIENT') && f.visible !== false)
      : undefined;
    if (gradient) {
      const gNode = gradient as AnyNode;
      const stops: AnyNode[] = gNode.gradientStops ?? [];
      const stopStrs = stops.map(
        (s: AnyNode) =>
          `${rgbaToHex({ r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a ?? 1 })} ${Math.round(s.position * 100)}%`,
      );
      const type = gNode.type === 'GRADIENT_RADIAL' ? 'radial-gradient' : 'linear-gradient';
      if (!isText) {
        style.backgroundGradient = `${type}(${stopStrs.join(', ')})`;
      }
    }
  }

  return style;
}

function extractTextStyle(node: AnyNode): UIStyle {
  const style = extractStyle(node, true);

  // Text style name (e.g. "Body/Body 1 Strong")
  const textStyleName = resolveStyleName(node.textStyleId);
  if (textStyleName) style.textStyleName = textStyleName;

  // Font family — safe figma.mixed check
  const fontName = node.fontName;
  const isMixed = typeof figma !== 'undefined' && fontName === figma.mixed;
  if (fontName && !isMixed && typeof fontName === 'object') {
    style.fontFamily = fontName.family;
  }

  if (typeof node.fontSize === 'number') {
    style.fontSize = node.fontSize;
  }

  if (typeof node.fontWeight === 'number') {
    style.fontWeight = node.fontWeight;
  }

  if (node.lineHeight && typeof node.lineHeight === 'object') {
    const lh = normalizeLineHeight(node.lineHeight, node.fontSize ?? 16);
    if (lh !== undefined) {
      style.lineHeight = lh;
    }
  }

  if (node.letterSpacing && node.letterSpacing.value !== 0) {
    style.letterSpacing = node.letterSpacing.value;
    style.letterSpacingUnit = node.letterSpacing.unit === 'PERCENT' ? 'percent' : 'px';
  }

  // Text alignment
  const align: string | undefined = node.textAlignHorizontal;
  if (align && align !== 'LEFT') {
    const alignMap: Record<string, UIStyle['textAlign']> = {
      CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justified',
    };
    if (alignMap[align]) style.textAlign = alignMap[align];
  }

  // Text decoration
  const decoration: string | undefined = node.textDecoration;
  if (decoration === 'UNDERLINE') style.textDecoration = 'underline';
  if (decoration === 'STRIKETHROUGH') style.textDecoration = 'strikethrough';

  // Text case
  const textCase: string | undefined = node.textCase;
  const caseMap: Record<string, UIStyle['textCase']> = {
    UPPER: 'upper', LOWER: 'lower', TITLE: 'title', ORIGINAL: 'original',
  };
  if (textCase && textCase !== 'ORIGINAL' && caseMap[textCase]) {
    style.textCase = caseMap[textCase];
  }

  return style;
}

function extractLayout(node: AnyNode): UILayout {
  const layout: UILayout = {
    width: node.width,
    height: node.height,
  };

  // Position relative to parent
  if (typeof node.x === 'number' && node.x !== 0) layout.x = node.x;
  if (typeof node.y === 'number' && node.y !== 0) layout.y = node.y;

  // Rotation
  if (typeof node.rotation === 'number' && node.rotation !== 0) {
    layout.rotation = Math.round(node.rotation * 100) / 100;
  }

  // Overflow / clip content
  if (node.clipsContent === true) layout.overflow = 'hidden';

  const layoutMode: string = node.layoutMode ?? 'NONE';
  layout.mode = layoutMode.toLowerCase() as UILayout['mode'];

  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
    layout.gap = node.itemSpacing;
    layout.padding = {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    };

    // primaryAxisAlign
    const primary: string = node.primaryAxisAlignItems ?? '';
    layout.primaryAxisAlign = primary === 'SPACE_BETWEEN' ? 'space-between' : (primary.toLowerCase() as UILayout['primaryAxisAlign']);

    // counterAxisAlign
    const counter: string = node.counterAxisAlignItems ?? '';
    layout.counterAxisAlign = counter.toLowerCase() as UILayout['counterAxisAlign'];

    // Sizing
    const primaryMode: string = node.primaryAxisSizingMode ?? 'FIXED';
    const counterMode: string = node.counterAxisSizingMode ?? 'FIXED';
    const toSizing = (m: string): 'hug' | 'fill' | 'fixed' => {
      if (m === 'AUTO') return 'hug';
      if (m === 'FILL') return 'fill';
      return 'fixed';
    };

    if (layoutMode === 'HORIZONTAL') {
      layout.sizing = {
        horizontal: toSizing(primaryMode),
        vertical: toSizing(counterMode),
      };
    } else {
      layout.sizing = {
        horizontal: toSizing(counterMode),
        vertical: toSizing(primaryMode),
      };
    }
  }

  return layout;
}

function recurseChildren(node: AnyNode): UISerializedNode[] | undefined {
  const children: AnyNode[] = node.children ?? [];
  const extracted = children
    .map((child) => extractNode(child as SceneNode))
    .filter((n): n is UISerializedNode => n !== null);
  return extracted.length > 0 ? extracted : undefined;
}

export function extractNode(node: SceneNode): UISerializedNode | null {
  const n = node as AnyNode;
  const nodeType: string = n.type;

  const base = {
    id: n.id as string,
    name: n.name as string,
    type: nodeType as UINodeType,
    visible: n.visible as boolean,
  };

  // TEXT — special: extract text content + typography
  if (nodeType === 'TEXT') {
    return {
      ...base,
      text: n.characters as string,
      style: extractTextStyle(n),
      layout: extractLayout(n),
    };
  }

  // INSTANCE — extract componentName, variant properties, style, and children
  if (nodeType === INSTANCE_TYPE) {
    const result: UISerializedNode = {
      ...base,
      componentName: n.mainComponent?.name as string | undefined,
      layout: extractLayout(n),
      style: extractStyle(n),
    };

    // Extract variant / component properties (e.g. { State: "Active", Size: "Large" })
    const props = n.componentProperties;
    if (props && typeof props === 'object') {
      const mapped: Record<string, string> = {};
      for (const [key, val] of Object.entries(props)) {
        const v = val as { value?: unknown };
        if (v.value !== undefined) {
          // Strip internal hash suffix from key (e.g. "State#123:0" → "State")
          const cleanKey = key.replace(/#\d+:\d+$/, '');
          mapped[cleanKey] = String(v.value);
        }
      }
      if (Object.keys(mapped).length > 0) result.componentProperties = mapped;
    }

    // Expand children so active/inactive styles are visible
    const children = recurseChildren(n);
    if (children) result.children = children;
    return result;
  }

  // CONTAINER types — full layout + style + recurse children
  if (CONTAINER_TYPES.has(nodeType)) {
    const result: UISerializedNode = {
      ...base,
      layout: extractLayout(n),
      style: extractStyle(n),
    };
    const children = recurseChildren(n);
    if (children) result.children = children;
    return result;
  }

  // GROUP — basic layout + recurse children (no style of its own)
  if (GROUP_TYPES.has(nodeType)) {
    const result: UISerializedNode = {
      ...base,
      layout: extractLayout(n),
    };
    const children = recurseChildren(n);
    if (children) result.children = children;
    return result;
  }

  // Known LEAF types — layout + style, no children
  if (LEAF_TYPES.has(nodeType)) {
    return {
      ...base,
      layout: extractLayout(n),
      style: extractStyle(n),
    };
  }

  // FALLBACK: unknown type — traverse children if present, don't silently drop
  const hasChildren = Array.isArray(n.children) && n.children.length > 0;
  if (hasChildren) {
    const result: UISerializedNode = {
      ...base,
      layout: extractLayout(n),
      style: extractStyle(n),
    };
    const children = recurseChildren(n);
    if (children) result.children = children;
    return result;
  }

  // Unknown leaf — still extract basic info instead of returning null
  return {
    ...base,
    layout: extractLayout(n),
    style: extractStyle(n),
  };
}
