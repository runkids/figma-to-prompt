import type {
  UIFidelityWarning,
  UIImageFilters,
  UIJsonValue,
  UILayout,
  UINodeType,
  UIPaint,
  UIPrototypeAction,
  UIPrototypeReaction,
  UIPrototypeTrigger,
  UISerializedNode,
  UIStyle,
  UITextStyleRange,
  UITransform,
  UIVariableBinding,
  UIVariableDefinition,
  UIVariableMode,
  UIVariableReference,
  UIVectorPath,
} from '@shared/types';
import { rgbaToHex, normalizeLineHeight } from './normalizer';

// Types that we know how to fully extract
const CONTAINER_TYPES = new Set<string>(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION', 'BOOLEAN_OPERATION']);
const LEAF_TYPES = new Set<string>(['TEXT', 'RECTANGLE', 'ELLIPSE', 'LINE', 'VECTOR', 'POLYGON', 'STAR']);
const GROUP_TYPES = new Set<string>(['GROUP', 'TRANSFORM_GROUP']);
const INSTANCE_TYPE = 'INSTANCE';

// Only emit raw path data for nodes whose shape cannot be reconstructed from
// other properties. Rectangles/frames are described by layout + cornerRadii;
// text is described by content + typography; ellipses by their bounding box.
const VECTOR_GEOMETRY_TYPES = new Set<string>([
  'VECTOR',
  'BOOLEAN_OPERATION',
  'STAR',
  'POLYGON',
  'LINE',
  'TEXT_PATH',
]);

interface FillPaint {
  type: string;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
  boundVariables?: { color?: { id?: string } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = Record<string, any>;

/**
 * Figma host nodes throw when a property is not implemented by that node type.
 * Extraction intentionally probes a broad cross-node surface, so expose those
 * unsupported getters as `undefined` while preserving method receivers.
 */
function safelyReadableNode(source: AnyNode): AnyNode {
  return new Proxy(source, {
    get(target, property) {
      try {
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } catch {
        return undefined;
      }
    },
  });
}

function firstSolidFill(fills: FillPaint[]): FillPaint | undefined {
  if (!Array.isArray(fills)) return undefined;
  return fills.find((f) => f.type === 'SOLID' && f.visible !== false);
}

function paintOpacity(paint: FillPaint | AnyNode): number | undefined {
  return typeof paint.opacity === 'number' && paint.opacity < 1 ? paint.opacity : undefined;
}

function paintBlendMode(paint: FillPaint | AnyNode): string | undefined {
  return typeof paint.blendMode === 'string' && paint.blendMode !== 'NORMAL'
    ? paint.blendMode.toLowerCase()
    : undefined;
}

function extractTransform(value: unknown): UITransform | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const rows = value as unknown[];
  if (!rows.every((row) => Array.isArray(row) && row.length === 3 && row.every((v) => typeof v === 'number'))) {
    return undefined;
  }
  const r0 = rows[0] as number[];
  const r1 = rows[1] as number[];
  return [
    [r0[0], r0[1], r0[2]],
    [r1[0], r1[1], r1[2]],
  ];
}

function extractImageFilters(value: unknown): UIImageFilters | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const result: UIImageFilters = {};
  for (const key of ['exposure', 'contrast', 'saturation', 'temperature', 'tint', 'highlights', 'shadows'] as const) {
    const val = source[key];
    if (typeof val === 'number' && val !== 0) {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractVectorPaths(value: unknown): UIVectorPath[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paths = value
    .map((path) => {
      const p = path as Record<string, unknown>;
      if (typeof p.data !== 'string') return null;
      const windingRule = p.windingRule;
      if (windingRule !== 'NONZERO' && windingRule !== 'EVENODD' && windingRule !== 'NONE') return null;
      return { windingRule, data: p.data };
    })
    .filter((path): path is UIVectorPath => path !== null);
  return paths.length > 0 ? paths : undefined;
}

function extractVectorData(node: AnyNode): Pick<UISerializedNode, 'vectorPaths' | 'fillGeometry' | 'strokeGeometry'> {
  const vectorData: Pick<UISerializedNode, 'vectorPaths' | 'fillGeometry' | 'strokeGeometry'> = {};
  if (!VECTOR_GEOMETRY_TYPES.has(node.type)) return vectorData;
  const vectorPaths = extractVectorPaths(node.vectorPaths);
  if (vectorPaths) vectorData.vectorPaths = vectorPaths;
  const fillGeometry = extractVectorPaths(node.fillGeometry);
  if (fillGeometry) vectorData.fillGeometry = fillGeometry;
  const strokeGeometry = extractVectorPaths(node.strokeGeometry);
  if (strokeGeometry) vectorData.strokeGeometry = strokeGeometry;
  return vectorData;
}

function extractArcData(value: unknown): UISerializedNode['arcData'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const arc = value as Record<string, unknown>;
  if (
    typeof arc.startingAngle !== 'number' ||
    typeof arc.endingAngle !== 'number' ||
    typeof arc.innerRadius !== 'number'
  ) {
    return undefined;
  }
  return {
    startingAngle: arc.startingAngle,
    endingAngle: arc.endingAngle,
    innerRadius: arc.innerRadius,
  };
}

function extractTextPathStartData(
  value: unknown,
): UISerializedNode['textPathStartData'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const start = value as Record<string, unknown>;
  if (typeof start.segment !== 'number' || typeof start.position !== 'number') return undefined;
  return { segment: start.segment, position: start.position };
}

function extractTransformModifiers(
  value: unknown,
): UISerializedNode['transformModifiers'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const modifiers = value.flatMap((item) => {
    const modifier = item as Record<string, unknown>;
    if (
      modifier.type !== 'REPEAT' ||
      (modifier.repeatType !== 'LINEAR' && modifier.repeatType !== 'RADIAL') ||
      typeof modifier.count !== 'number' ||
      typeof modifier.offset !== 'number'
    ) return [];
    const unitType = modifier.unitType === 'PIXELS'
      ? 'px' as const
      : modifier.unitType === 'RELATIVE'
        ? 'relative' as const
        : undefined;
    if (!unitType) return [];
    const axis = modifier.axis === 'HORIZONTAL'
      ? 'horizontal' as const
      : modifier.axis === 'VERTICAL'
        ? 'vertical' as const
        : undefined;
    return [{
      type: 'repeat' as const,
      repeatType: modifier.repeatType.toLowerCase() as 'linear' | 'radial',
      count: modifier.count,
      unitType,
      offset: modifier.offset,
      ...(axis ? { axis } : {}),
    }];
  });
  return modifiers.length > 0 ? modifiers : undefined;
}

function normalizeEnumValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toLowerCase().replace(/_/g, '-') : undefined;
}

function normalizeConstraint(value: unknown): NonNullable<UILayout['constraints']>['horizontal'] | undefined {
  const normalized = normalizeEnumValue(value);
  if (
    normalized === 'min' ||
    normalized === 'center' ||
    normalized === 'max' ||
    normalized === 'stretch' ||
    normalized === 'scale'
  ) {
    return normalized;
  }
  return undefined;
}

/* ── Dynamic-page compat ─────────────────────────────────
   Under documentAccess "dynamic-page" the sync by-ID lookups throw.
   extractNode stays sync, so lookups try the sync API first (tests and
   plugins without the manifest flag), and on throw fall back to a cache
   that warmExtractorCaches() fills between a dry run and the real run. */
const warmCache = {
  variables: new Map<string, Variable | null>(),
  collections: new Map<string, VariableCollection | null>(),
  styles: new Map<string, BaseStyle | null>(),
  mainComponentNames: new Map<string, string | undefined>(),
};
const pending = {
  variableIds: new Set<string>(),
  collectionIds: new Set<string>(),
  styleIds: new Set<string>(),
  instances: new Map<string, InstanceNode>(),
};

function lookupVariable(id: string): Variable | null {
  try {
    return figma.variables.getVariableById(id);
  } catch {
    if (warmCache.variables.has(id)) return warmCache.variables.get(id) ?? null;
    pending.variableIds.add(id);
    return null;
  }
}

function lookupCollection(id: string): VariableCollection | null {
  try {
    return figma.variables.getVariableCollectionById(id);
  } catch {
    if (warmCache.collections.has(id)) return warmCache.collections.get(id) ?? null;
    pending.collectionIds.add(id);
    return null;
  }
}

function lookupStyle(id: string): BaseStyle | null {
  try {
    return figma.getStyleById(id);
  } catch {
    if (warmCache.styles.has(id)) return warmCache.styles.get(id) ?? null;
    pending.styleIds.add(id);
    return null;
  }
}

function resolveMainComponentName(n: Record<string, unknown>): string | undefined {
  try {
    return (n as { mainComponent?: { name?: string } }).mainComponent?.name;
  } catch {
    const id = n.id as string;
    if (warmCache.mainComponentNames.has(id)) return warmCache.mainComponentNames.get(id);
    pending.instances.set(id, n as unknown as InstanceNode);
    return undefined;
  }
}

/** Run before extractNode under dynamic-page: a dry extraction records every
 *  by-ID lookup the sync walk needs, then the allowed async APIs fill the
 *  cache so the real extraction resolves names without touching sync APIs. */
export async function warmExtractorCaches(nodes: ReadonlyArray<SceneNode>): Promise<void> {
  if (typeof figma === 'undefined') return;
  for (let round = 0; round < 2; round++) {
    pending.variableIds.clear();
    pending.collectionIds.clear();
    pending.styleIds.clear();
    pending.instances.clear();
    for (const node of nodes) extractNode(node);
    if (
      pending.variableIds.size === 0
      && pending.collectionIds.size === 0
      && pending.styleIds.size === 0
      && pending.instances.size === 0
    ) return;
    for (const id of pending.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(id).catch(() => null);
      warmCache.variables.set(id, variable);
      if (variable) pending.collectionIds.add(variable.variableCollectionId);
    }
    for (const id of pending.collectionIds) {
      warmCache.collections.set(
        id,
        await figma.variables.getVariableCollectionByIdAsync(id).catch(() => null),
      );
    }
    for (const id of pending.styleIds) {
      warmCache.styles.set(id, await figma.getStyleByIdAsync(id).catch(() => null));
    }
    for (const [id, instance] of pending.instances) {
      const main = typeof instance.getMainComponentAsync === 'function'
        ? await instance.getMainComponentAsync().catch(() => null)
        : null;
      warmCache.mainComponentNames.set(id, main?.name);
    }
  }
}

/** Resolve a Figma variable ID to its token name */
function resolveVariableName(variableId: string): string | undefined {
  if (typeof figma === 'undefined' || !figma.variables) return undefined;
  return lookupVariable(variableId)?.name;
}

function resolveVariableAliasName(alias: unknown): string | undefined {
  const variableId = (alias as { id?: unknown } | undefined)?.id;
  return typeof variableId === 'string' ? resolveVariableName(variableId) : undefined;
}

function extractVariableReference(value: unknown): UIVariableReference | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const id = (value as Record<string, unknown>).id;
  if (typeof id !== 'string') return undefined;
  const name = resolveVariableName(id);
  return { id, ...(name ? { name } : {}) };
}

function extractVariableBindings(value: unknown): Record<string, UIVariableBinding> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const bindings: Record<string, UIVariableBinding> = {};

  for (const [field, rawBinding] of Object.entries(value)) {
    const single = extractVariableReference(rawBinding);
    if (single) {
      bindings[field] = single;
      continue;
    }

    if (Array.isArray(rawBinding)) {
      const references = rawBinding.flatMap((item) => {
        const reference = extractVariableReference(item);
        return reference ? [reference] : [];
      });
      if (references.length > 0) bindings[field] = references;
      continue;
    }

    if (rawBinding && typeof rawBinding === 'object') {
      const references: Record<string, UIVariableReference> = {};
      for (const [key, nestedBinding] of Object.entries(rawBinding)) {
        const reference = extractVariableReference(nestedBinding);
        if (reference) references[cleanComponentPropertyName(key)] = reference;
      }
      if (Object.keys(references).length > 0) bindings[field] = references;
    }
  }

  return Object.keys(bindings).length > 0 ? bindings : undefined;
}

function extractExplicitVariableModes(value: unknown): UIVariableMode[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const modes = Object.entries(value).flatMap(([collectionId, modeId]): UIVariableMode[] => {
    if (typeof modeId !== 'string') return [];
    let collectionName: string | undefined;
    let modeName: string | undefined;
    if (typeof figma !== 'undefined' && figma.variables) {
      const collection = lookupCollection(collectionId);
      collectionName = collection?.name;
      modeName = collection?.modes.find((mode) => mode.modeId === modeId)?.name;
    }
    return [{
      collectionId,
      ...(collectionName ? { collectionName } : {}),
      modeId,
      ...(modeName ? { modeName } : {}),
    }];
  });
  return modes.length > 0 ? modes : undefined;
}

/** Resolve a Figma style ID to its style name */
function resolveStyleName(styleId: unknown): string | undefined {
  if (typeof figma === 'undefined') return undefined;
  if (!styleId || styleId === figma.mixed) return undefined;
  return lookupStyle(styleId as string)?.name;
}

function normalizeScaleMode(value: unknown): UIPaint['scaleMode'] | undefined {
  const normalized = normalizeEnumValue(value);
  if (normalized === 'fill' || normalized === 'fit' || normalized === 'crop' || normalized === 'tile') {
    return normalized;
  }
  return undefined;
}

function gradientTypeFromFigma(value: unknown): UIPaint['gradientType'] | undefined {
  if (value === 'GRADIENT_LINEAR') return 'linear';
  if (value === 'GRADIENT_RADIAL') return 'radial';
  if (value === 'GRADIENT_ANGULAR') return 'angular';
  if (value === 'GRADIENT_DIAMOND') return 'diamond';
  return undefined;
}

function gradientCssType(value: unknown): 'linear-gradient' | 'radial-gradient' {
  return value === 'GRADIENT_RADIAL' ? 'radial-gradient' : 'linear-gradient';
}

function gradientStopsFromPaint(paint: AnyNode): NonNullable<UIPaint['gradientStops']> {
  const stops: AnyNode[] = Array.isArray(paint.gradientStops) ? paint.gradientStops : [];
  return stops
    .map((stop) => {
      const color = stop.color;
      if (!color || typeof color.r !== 'number' || typeof color.g !== 'number' || typeof color.b !== 'number') {
        return null;
      }
      const variable = resolveVariableAliasName(stop.boundVariables?.color);
      return {
        color: rgbaToHex({ r: color.r, g: color.g, b: color.b, a: color.a ?? 1 }),
        position: typeof stop.position === 'number' ? stop.position : 0,
        ...(typeof color.a === 'number' && color.a < 1 ? { opacity: color.a } : {}),
        ...(variable ? { variable } : {}),
      };
    })
    .filter((stop): stop is NonNullable<UIPaint['gradientStops']>[number] => stop !== null);
}

function gradientCssFromPaint(paint: AnyNode, stops = gradientStopsFromPaint(paint)): string | undefined {
  if (stops.length === 0) return undefined;
  const stopStrs = stops.map((stop) => `${stop.color} ${Math.round(stop.position * 100)}%`);
  return `${gradientCssType(paint.type)}(${stopStrs.join(', ')})`;
}

function extractPaintStack(value: unknown): UIPaint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paints = value
    .map((paint): UIPaint | null => {
      const p = paint as AnyNode;
      if (typeof p.type !== 'string') return null;
      const base: UIPaint = {
        type: 'unknown',
        sourceType: p.type,
        ...(p.visible === false ? { visible: false } : {}),
        ...(paintOpacity(p) !== undefined ? { opacity: paintOpacity(p) } : {}),
        ...(paintBlendMode(p) ? { blendMode: paintBlendMode(p) } : {}),
      };

      if (p.type === 'SOLID') {
        const color = p.color;
        const variable = resolveVariableAliasName(p.boundVariables?.color);
        return {
          ...base,
          type: 'solid',
          ...(color ? { color: rgbaToHex({ r: color.r, g: color.g, b: color.b, a: p.opacity ?? 1 }) } : {}),
          ...(variable ? { variable } : {}),
        };
      }

      if (p.type.includes('GRADIENT')) {
        const stops = gradientStopsFromPaint(p);
        const transform = extractTransform(p.gradientTransform);
        const css = gradientCssFromPaint(p, stops);
        return {
          ...base,
          type: 'gradient',
          ...(gradientTypeFromFigma(p.type) ? { gradientType: gradientTypeFromFigma(p.type) } : {}),
          ...(css ? { css } : {}),
          ...(stops.length > 0 ? { gradientStops: stops } : {}),
          ...(transform ? { transform } : {}),
        };
      }

      if (p.type === 'IMAGE') {
        const transform = extractTransform(p.imageTransform);
        const filters = extractImageFilters(p.filters);
        return {
          ...base,
          type: 'image',
          ...(p.imageHash ? { imageHash: p.imageHash } : {}),
          ...(normalizeScaleMode(p.scaleMode) ? { scaleMode: normalizeScaleMode(p.scaleMode) } : {}),
          ...(transform ? { transform } : {}),
          ...(typeof p.scalingFactor === 'number' ? { scalingFactor: p.scalingFactor } : {}),
          ...(typeof p.rotation === 'number' && p.rotation !== 0 ? { rotation: p.rotation } : {}),
          ...(filters ? { filters } : {}),
        };
      }

      if (p.type === 'VIDEO') {
        const transform = extractTransform(p.videoTransform);
        const filters = extractImageFilters(p.filters);
        return {
          ...base,
          type: 'video',
          ...(p.videoHash ? { videoHash: p.videoHash } : {}),
          ...(normalizeScaleMode(p.scaleMode) ? { scaleMode: normalizeScaleMode(p.scaleMode) } : {}),
          ...(transform ? { transform } : {}),
          ...(typeof p.scalingFactor === 'number' ? { scalingFactor: p.scalingFactor } : {}),
          ...(typeof p.rotation === 'number' && p.rotation !== 0 ? { rotation: p.rotation } : {}),
          ...(filters ? { filters } : {}),
        };
      }

      if (p.type === 'PATTERN') {
        const spacing = p.spacing && typeof p.spacing.x === 'number' && typeof p.spacing.y === 'number'
          ? { x: p.spacing.x, y: p.spacing.y }
          : undefined;
        const horizontalAlignment = normalizeEnumValue(p.horizontalAlignment);
        return {
          ...base,
          type: 'pattern',
          ...(typeof p.sourceNodeId === 'string' ? { sourceNodeId: p.sourceNodeId } : {}),
          ...(typeof p.tileType === 'string' ? { tileType: p.tileType.toLowerCase().replace(/_/g, '-') } : {}),
          ...(typeof p.scalingFactor === 'number' ? { scalingFactor: p.scalingFactor } : {}),
          ...(spacing ? { spacing } : {}),
          ...(horizontalAlignment === 'start' || horizontalAlignment === 'center' || horizontalAlignment === 'end'
            ? { horizontalAlignment }
            : {}),
        };
      }

      return base;
    })
    .filter((paint): paint is UIPaint => paint !== null);
  return paints.length > 0 ? paints : undefined;
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

  const nodeBlendMode = paintBlendMode(node);
  if (nodeBlendMode) style.blendMode = nodeBlendMode;
  if (node.isMask === true) {
    style.isMask = true;
    const maskType = normalizeEnumValue(node.maskType);
    if (maskType === 'alpha' || maskType === 'vector' || maskType === 'luminance') {
      style.maskType = maskType;
    }
  }

  // Background / fill color
  const fills: FillPaint[] = node.fills ?? [];
  const fillStack = extractPaintStack(fills);
  if (fillStack) style.fills = fillStack;
  const fill = firstSolidFill(fills);
  if (fill?.color) {
    const hex = rgbaToHex({ r: fill.color.r, g: fill.color.g, b: fill.color.b, a: fill.opacity ?? 1 });
    if (isText) {
      style.color = hex;
      const opacity = paintOpacity(fill);
      if (opacity !== undefined) style.colorOpacity = opacity;
    } else {
      style.backgroundColor = hex;
      const opacity = paintOpacity(fill);
      if (opacity !== undefined) style.backgroundOpacity = opacity;
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
  if (typeof node.cornerSmoothing === 'number' && node.cornerSmoothing > 0) {
    style.cornerSmoothing = node.cornerSmoothing;
  }

  // Strokes
  const strokes: FillPaint[] = node.strokes ?? [];
  const strokeStack = extractPaintStack(strokes);
  if (strokeStack) style.strokes = strokeStack;
  const stroke = firstSolidFill(strokes);
  if (stroke?.color) {
    style.borderColor = rgbaToHex({ r: stroke.color.r, g: stroke.color.g, b: stroke.color.b, a: stroke.opacity ?? 1 });
    const opacity = paintOpacity(stroke);
    if (opacity !== undefined) style.borderOpacity = opacity;
    if (typeof node.strokeWeight === 'number') {
      style.borderWidth = node.strokeWeight;
    }
    const strokeAlign = normalizeEnumValue(node.strokeAlign);
    if (strokeAlign === 'center' || strokeAlign === 'inside' || strokeAlign === 'outside') {
      style.strokeAlign = strokeAlign;
    }
    const strokeCap = normalizeEnumValue(node.strokeCap);
    if (
      strokeCap === 'none' ||
      strokeCap === 'round' ||
      strokeCap === 'square' ||
      strokeCap === 'arrow-lines' ||
      strokeCap === 'arrow-equilateral' ||
      strokeCap === 'diamond-filled' ||
      strokeCap === 'triangle-filled' ||
      strokeCap === 'circle-filled'
    ) {
      style.strokeCap = strokeCap;
    }
    const strokeJoin = normalizeEnumValue(node.strokeJoin);
    if (strokeJoin === 'miter' || strokeJoin === 'bevel' || strokeJoin === 'round') {
      style.strokeJoin = strokeJoin;
    }
    if (typeof node.strokeMiterLimit === 'number') {
      style.strokeMiterLimit = node.strokeMiterLimit;
    }
    if (Array.isArray(node.dashPattern) && node.dashPattern.every((v: unknown) => typeof v === 'number')) {
      style.strokeDashPattern = [...node.dashPattern];
    }
    if (
      typeof node.strokeTopWeight === 'number' ||
      typeof node.strokeRightWeight === 'number' ||
      typeof node.strokeBottomWeight === 'number' ||
      typeof node.strokeLeftWeight === 'number'
    ) {
      style.strokeWeights = {
        top: typeof node.strokeTopWeight === 'number' ? node.strokeTopWeight : (typeof node.strokeWeight === 'number' ? node.strokeWeight : 0),
        right: typeof node.strokeRightWeight === 'number' ? node.strokeRightWeight : (typeof node.strokeWeight === 'number' ? node.strokeWeight : 0),
        bottom: typeof node.strokeBottomWeight === 'number' ? node.strokeBottomWeight : (typeof node.strokeWeight === 'number' ? node.strokeWeight : 0),
        left: typeof node.strokeLeftWeight === 'number' ? node.strokeLeftWeight : (typeof node.strokeWeight === 'number' ? node.strokeWeight : 0),
      };
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
    .map((e) => {
      const shadow = {
        type: (e.type === 'DROP_SHADOW' ? 'drop' : 'inner') as 'drop' | 'inner',
        color: rgbaToHex({ r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a ?? 1 }),
        ...(typeof e.color.a === 'number' && e.color.a < 1 ? { opacity: e.color.a } : {}),
        offsetX: e.offset?.x ?? 0,
        offsetY: e.offset?.y ?? 0,
        blur: e.radius ?? 0,
        spread: e.spread ?? 0,
        ...(paintBlendMode(e) ? { blendMode: paintBlendMode(e) } : {}),
        ...(e.showShadowBehindNode === true ? { showShadowBehindNode: true } : {}),
      };
      return shadow;
    });
  if (shadows.length > 0) style.shadows = shadows;

  const blurEffects = effects
    .filter((e) => (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') && e.visible !== false)
    .map((e) => ({
      type: (e.type === 'BACKGROUND_BLUR' ? 'background' : 'layer') as 'layer' | 'background',
      radius: e.radius ?? 0,
      ...(e.blurType === 'NORMAL' || e.blurType === 'PROGRESSIVE' ? { blurType: normalizeEnumValue(e.blurType) as 'normal' | 'progressive' } : {}),
      ...(typeof e.startRadius === 'number' ? { startRadius: e.startRadius } : {}),
      ...(e.startOffset && typeof e.startOffset.x === 'number' && typeof e.startOffset.y === 'number'
        ? { startOffset: { x: e.startOffset.x, y: e.startOffset.y } }
        : {}),
      ...(e.endOffset && typeof e.endOffset.x === 'number' && typeof e.endOffset.y === 'number'
        ? { endOffset: { x: e.endOffset.x, y: e.endOffset.y } }
        : {}),
    }));
  if (blurEffects.length > 0) style.blurEffects = blurEffects;

  const advancedEffects: NonNullable<UIStyle['advancedEffects']> = effects.flatMap(
    (effect): NonNullable<UIStyle['advancedEffects']> => {
    if (effect.visible === false) return [];
    if (effect.type === 'NOISE' && effect.color) {
      const noiseType = normalizeEnumValue(effect.noiseType);
      if (noiseType !== 'monotone' && noiseType !== 'duotone' && noiseType !== 'multitone') return [];
      return [{
        type: 'noise' as const,
        noiseType,
        color: rgbaToHex({ ...effect.color, a: effect.color.a ?? 1 }),
        ...(typeof effect.color.a === 'number' && effect.color.a < 1
          ? { colorOpacity: effect.color.a }
          : {}),
        ...(effect.secondaryColor
          ? { secondaryColor: rgbaToHex({ ...effect.secondaryColor, a: effect.secondaryColor.a ?? 1 }) }
          : {}),
        ...(typeof effect.secondaryColor?.a === 'number' && effect.secondaryColor.a < 1
          ? { secondaryColorOpacity: effect.secondaryColor.a }
          : {}),
        ...(typeof effect.opacity === 'number' ? { opacity: effect.opacity } : {}),
        ...(paintBlendMode(effect) ? { blendMode: paintBlendMode(effect) } : {}),
        noiseSize: effect.noiseSize ?? 0,
        density: effect.density ?? 0,
      }];
    }
    if (effect.type === 'TEXTURE') {
      return [{
        type: 'texture' as const,
        noiseSize: effect.noiseSize ?? 0,
        radius: effect.radius ?? 0,
        clipToShape: effect.clipToShape === true,
      }];
    }
    if (effect.type === 'GLASS') {
      return [{
        type: 'glass' as const,
        lightIntensity: effect.lightIntensity ?? 0,
        lightAngle: effect.lightAngle ?? 0,
        refraction: effect.refraction ?? 0,
        depth: effect.depth ?? 0,
        dispersion: effect.dispersion ?? 0,
        radius: effect.radius ?? 0,
      }];
    }
      return [];
    },
  );
  if (advancedEffects.length > 0) style.advancedEffects = advancedEffects;

  // Image fill
  if (!isText) {
    const imageFill = Array.isArray(fills)
      ? fills.find((f: FillPaint) => f.type === 'IMAGE' && f.visible !== false)
      : undefined;
    if (imageFill) {
      const imgNode = imageFill as AnyNode;
      if (imgNode.imageHash) style.imageFillHash = imgNode.imageHash;
      if (imgNode.scaleMode) style.imageFillScaleMode = (imgNode.scaleMode as string).toLowerCase() as UIStyle['imageFillScaleMode'];
      const transform = extractTransform(imgNode.imageTransform);
      if (transform) style.imageFillTransform = transform;
      if (typeof imgNode.scalingFactor === 'number') style.imageFillScalingFactor = imgNode.scalingFactor;
      if (typeof imgNode.rotation === 'number' && imgNode.rotation !== 0) style.imageFillRotation = imgNode.rotation;
      const filters = extractImageFilters(imgNode.filters);
      if (filters) style.imageFillFilters = filters;
      const opacity = paintOpacity(imgNode);
      if (opacity !== undefined) style.imageFillOpacity = opacity;
      const blendMode = paintBlendMode(imgNode);
      if (blendMode) style.imageFillBlendMode = blendMode;
    }
  }

  // Gradient fill (first gradient if no solid fill found)
  if (!fill) {
    const gradient = Array.isArray(fills)
      ? fills.find((f: FillPaint) => f.type?.includes('GRADIENT') && f.visible !== false)
      : undefined;
    if (gradient) {
      const gNode = gradient as AnyNode;
      const gradientStops = gradientStopsFromPaint(gNode);
      const css = gradientCssFromPaint(gNode, gradientStops);
      if (!isText) {
        if (css) style.backgroundGradient = css;
        const gradientType = gradientTypeFromFigma(gNode.type);
        if (gradientType) style.backgroundGradientType = gradientType;
        if (gradientStops.length > 0) style.backgroundGradientStops = gradientStops;
        const transform = extractTransform(gNode.gradientTransform);
        if (transform) style.backgroundGradientTransform = transform;
        const opacity = paintOpacity(gNode);
        if (opacity !== undefined) style.backgroundGradientOpacity = opacity;
        const blendMode = paintBlendMode(gNode);
        if (blendMode) style.backgroundGradientBlendMode = blendMode;
      }
    }
  }

  return style;
}

function normalizeHyperlink(value: unknown): UITextStyleRange['hyperlink'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const h = value as Record<string, unknown>;
  if (typeof h.type !== 'string') return undefined;
  const rawValue = h.value ?? h.url ?? h.nodeID ?? h.nodeId;
  return {
    type: h.type.toLowerCase(),
    ...(typeof rawValue === 'string' ? { value: rawValue } : {}),
  };
}

function normalizeListOptions(value: unknown): UITextStyleRange['listOptions'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const l = value as Record<string, unknown>;
  const out: NonNullable<UITextStyleRange['listOptions']> = {};
  if (typeof l.type === 'string') out.type = l.type.toLowerCase().replace(/_/g, '-');
  if (typeof l.ordered === 'boolean') out.ordered = l.ordered;
  return Object.keys(out).length > 0 ? out : undefined;
}

function rangeHasRichTextMetadata(range: UITextStyleRange): boolean {
  return Boolean(
    range.hyperlink ||
      range.listOptions ||
      range.listSpacing !== undefined ||
      range.indentation !== undefined ||
      range.paragraphIndent !== undefined ||
      range.paragraphSpacing !== undefined,
  );
}

function extractTextStyleRanges(node: AnyNode): UITextStyleRange[] | undefined {
  if (typeof node.getStyledTextSegments !== 'function') return undefined;
  try {
    const segments: AnyNode[] = node.getStyledTextSegments([
      'fontName',
      'fontSize',
      'fontWeight',
      'openTypeFeatures',
      'lineHeight',
      'leadingTrim',
      'letterSpacing',
      'fills',
      'textStyleId',
      'fillStyleId',
      'textDecoration',
      'textDecorationStyle',
      'textDecorationOffset',
      'textDecorationThickness',
      'textDecorationColor',
      'textDecorationSkipInk',
      'textCase',
      'hyperlink',
      'listOptions',
      'listSpacing',
      'indentation',
      'paragraphIndent',
      'paragraphSpacing',
    ]);
    const ranges = segments
      .map((segment): UITextStyleRange | null => {
        if (typeof segment.start !== 'number' || typeof segment.end !== 'number') return null;
        const range: UITextStyleRange = {
          start: segment.start,
          end: segment.end,
          text: typeof segment.characters === 'string' ? segment.characters : '',
          style: extractTextStyle(segment),
        };
        const hyperlink = normalizeHyperlink(segment.hyperlink);
        if (hyperlink) range.hyperlink = hyperlink;
        const listOptions = normalizeListOptions(segment.listOptions);
        if (listOptions) range.listOptions = listOptions;
        if (typeof segment.listSpacing === 'number') range.listSpacing = segment.listSpacing;
        if (typeof segment.indentation === 'number') range.indentation = segment.indentation;
        if (typeof segment.paragraphIndent === 'number') range.paragraphIndent = segment.paragraphIndent;
        if (typeof segment.paragraphSpacing === 'number') range.paragraphSpacing = segment.paragraphSpacing;
        return range;
      })
      .filter((range): range is UITextStyleRange => range !== null);

    if (ranges.length > 1 || ranges.some(rangeHasRichTextMetadata)) {
      return ranges;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function extractTextDecorationMeasurement(
  value: unknown,
): UIStyle['textDecorationOffset'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const measurement = value as Record<string, unknown>;
  if (measurement.unit === 'AUTO') return { unit: 'auto' };
  if (typeof measurement.value !== 'number') return undefined;
  if (measurement.unit === 'PIXELS') return { unit: 'px', value: measurement.value };
  if (measurement.unit === 'PERCENT') return { unit: 'percent', value: measurement.value };
  return undefined;
}

function extractTextDecorationColor(
  value: unknown,
): UIStyle['textDecorationColor'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const decoration = value as Record<string, unknown>;
  if (decoration.value === 'AUTO') return { auto: true };
  if (!decoration.value || typeof decoration.value !== 'object') return undefined;
  const paint = decoration.value as AnyNode;
  if (paint.type !== 'SOLID' || !paint.color) return undefined;
  const variable = resolveVariableAliasName(paint.boundVariables?.color);
  return {
    color: rgbaToHex({ r: paint.color.r, g: paint.color.g, b: paint.color.b, a: 1 }),
    ...(paintOpacity(paint) !== undefined ? { opacity: paintOpacity(paint) } : {}),
    ...(variable ? { variable } : {}),
  };
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
    if (typeof fontName.style === 'string') style.fontStyleName = fontName.style;
  }

  if (typeof node.fontSize === 'number') {
    style.fontSize = node.fontSize;
  }

  if (typeof node.fontWeight === 'number') {
    style.fontWeight = node.fontWeight;
  }

  if (node.openTypeFeatures && typeof node.openTypeFeatures === 'object') {
    const features = Object.fromEntries(
      Object.entries(node.openTypeFeatures)
        .filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
    );
    if (Object.keys(features).length > 0) style.openTypeFeatures = features;
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

  const alignVertical = normalizeEnumValue(node.textAlignVertical);
  if (alignVertical === 'top' || alignVertical === 'center' || alignVertical === 'bottom') {
    style.textAlignVertical = alignVertical;
  }

  const textAutoResize = normalizeEnumValue(node.textAutoResize);
  if (
    textAutoResize === 'none' ||
    textAutoResize === 'width-and-height' ||
    textAutoResize === 'height' ||
    textAutoResize === 'truncate'
  ) {
    style.textAutoResize = textAutoResize;
  }

  const textTruncation = normalizeEnumValue(node.textTruncation);
  if (textTruncation === 'disabled' || textTruncation === 'ending') {
    style.textTruncation = textTruncation;
  }
  if (typeof node.maxLines === 'number') style.maxLines = node.maxLines;
  if (typeof node.paragraphIndent === 'number' && node.paragraphIndent !== 0) {
    style.paragraphIndent = node.paragraphIndent;
  }
  if (typeof node.paragraphSpacing === 'number' && node.paragraphSpacing !== 0) {
    style.paragraphSpacing = node.paragraphSpacing;
  }
  if (typeof node.listSpacing === 'number' && node.listSpacing !== 0) {
    style.listSpacing = node.listSpacing;
  }
  if (node.hangingPunctuation === true) style.hangingPunctuation = true;
  if (node.hangingList === true) style.hangingList = true;
  const leadingTrim = normalizeEnumValue(node.leadingTrim);
  if (leadingTrim === 'cap-height' || leadingTrim === 'none') style.leadingTrim = leadingTrim;

  // Text decoration
  const decoration: string | undefined = node.textDecoration;
  if (decoration === 'UNDERLINE') style.textDecoration = 'underline';
  if (decoration === 'STRIKETHROUGH') style.textDecoration = 'strikethrough';
  const decorationStyle = normalizeEnumValue(node.textDecorationStyle);
  if (decorationStyle === 'solid' || decorationStyle === 'wavy' || decorationStyle === 'dotted') {
    style.textDecorationStyle = decorationStyle;
  }
  const decorationOffset = extractTextDecorationMeasurement(node.textDecorationOffset);
  if (decorationOffset) style.textDecorationOffset = decorationOffset;
  const decorationThickness = extractTextDecorationMeasurement(node.textDecorationThickness);
  if (decorationThickness) style.textDecorationThickness = decorationThickness;
  const decorationColor = extractTextDecorationColor(node.textDecorationColor);
  if (decorationColor) style.textDecorationColor = decorationColor;
  if (typeof node.textDecorationSkipInk === 'boolean') {
    style.textDecorationSkipInk = node.textDecorationSkipInk;
  }

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

function extractGridTrackSizes(value: unknown): NonNullable<UILayout['gridRowSizes']> | undefined {
  if (!Array.isArray(value)) return undefined;
  const tracks = value
    .map((item) => {
      const track = item as Record<string, unknown>;
      const type = normalizeEnumValue(track.type);
      if (type !== 'flex' && type !== 'fixed' && type !== 'hug') return null;
      return {
        type,
        ...(typeof track.value === 'number' ? { value: track.value } : {}),
      };
    })
    .filter((track): track is NonNullable<UILayout['gridRowSizes']>[number] => track !== null);
  return tracks.length > 0 ? tracks : undefined;
}

function extractLayout(node: AnyNode): UILayout {
  const layout: UILayout = {
    width: node.width,
    height: node.height,
  };

  const toSizing = (m: string | undefined): 'hug' | 'fill' | 'fixed' | undefined => {
    if (m === 'AUTO' || m === 'HUG') return 'hug';
    if (m === 'FILL') return 'fill';
    if (m === 'FIXED') return 'fixed';
    return undefined;
  };

  // Position relative to parent
  if (typeof node.x === 'number' && node.x !== 0) layout.x = node.x;
  if (typeof node.y === 'number' && node.y !== 0) layout.y = node.y;
  const relativeTransform = extractTransform(node.relativeTransform);
  if (relativeTransform) layout.relativeTransform = relativeTransform;
  const boundingBox = node.absoluteBoundingBox;
  const renderBounds = node.absoluteRenderBounds;
  if (
    boundingBox && renderBounds &&
    typeof boundingBox.x === 'number' && typeof boundingBox.y === 'number' &&
    typeof renderBounds.x === 'number' && typeof renderBounds.y === 'number' &&
    typeof renderBounds.width === 'number' && typeof renderBounds.height === 'number'
  ) {
    layout.renderBounds = {
      x: renderBounds.x - boundingBox.x,
      y: renderBounds.y - boundingBox.y,
      width: renderBounds.width,
      height: renderBounds.height,
    };
  }

  for (const key of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) {
    if (typeof node[key] === 'number') layout[key] = node[key];
  }
  for (const key of ['gridRowAnchorIndex', 'gridColumnAnchorIndex', 'gridRowSpan', 'gridColumnSpan'] as const) {
    if (typeof node[key] === 'number') layout[key] = node[key];
  }
  const gridHorizontalAlign = normalizeEnumValue(node.gridChildHorizontalAlign);
  if (gridHorizontalAlign === 'min' || gridHorizontalAlign === 'center' || gridHorizontalAlign === 'max' || gridHorizontalAlign === 'auto') {
    layout.gridChildHorizontalAlign = gridHorizontalAlign;
  }
  const gridVerticalAlign = normalizeEnumValue(node.gridChildVerticalAlign);
  if (gridVerticalAlign === 'min' || gridVerticalAlign === 'center' || gridVerticalAlign === 'max' || gridVerticalAlign === 'auto') {
    layout.gridChildVerticalAlign = gridVerticalAlign;
  }

  // Auto-layout child behavior. `ABSOLUTE` children keep x/y but are removed
  // from the parent's flex flow, which is critical for decorative overlaps.
  if (node.layoutPositioning === 'ABSOLUTE') {
    layout.layoutPositioning = 'absolute';
  }
  const layoutAlignMap: Record<string, UILayout['layoutAlign']> = {
    MIN: 'min',
    CENTER: 'center',
    MAX: 'max',
    STRETCH: 'stretch',
    INHERIT: 'inherit',
  };
  if (typeof node.layoutAlign === 'string' && layoutAlignMap[node.layoutAlign]) {
    layout.layoutAlign = layoutAlignMap[node.layoutAlign];
  }
  if (typeof node.layoutGrow === 'number' && node.layoutGrow !== 0) {
    layout.layoutGrow = node.layoutGrow;
  }

  // Rotation
  if (typeof node.rotation === 'number' && node.rotation !== 0) {
    layout.rotation = Math.round(node.rotation * 100) / 100;
  }

  if (node.constraints && typeof node.constraints === 'object') {
    const horizontal = normalizeConstraint(node.constraints.horizontal);
    const vertical = normalizeConstraint(node.constraints.vertical);
    if (horizontal && vertical) {
      layout.constraints = { horizontal, vertical };
    }
  }

  if (node.targetAspectRatio && typeof node.targetAspectRatio.x === 'number' && typeof node.targetAspectRatio.y === 'number') {
    layout.targetAspectRatio = { x: node.targetAspectRatio.x, y: node.targetAspectRatio.y };
  }

  // Overflow / clip content
  if (node.clipsContent === true) layout.overflow = 'hidden';

  const layoutMode: string = node.layoutMode ?? 'NONE';
  const layoutModeMap: Record<string, UILayout['mode']> = {
    NONE: 'none',
    HORIZONTAL: 'horizontal',
    VERTICAL: 'vertical',
    GRID: 'grid',
  };
  layout.mode = layoutModeMap[layoutMode] ?? 'none';

  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
    layout.gap = node.itemSpacing;
    if (node.layoutWrap === 'WRAP') {
      layout.wrap = 'wrap';
      if (typeof node.counterAxisSpacing === 'number') {
        layout.counterAxisSpacing = node.counterAxisSpacing;
      }
      if (node.counterAxisAlignContent === 'AUTO') layout.counterAxisAlignContent = 'auto';
      if (node.counterAxisAlignContent === 'SPACE_BETWEEN') layout.counterAxisAlignContent = 'space-between';
    }
    if (node.itemReverseZIndex === true) layout.itemReverseZIndex = true;
    if (typeof node.strokesIncludedInLayout === 'boolean') {
      layout.strokesIncludedInLayout = node.strokesIncludedInLayout;
    }
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

    if (layoutMode === 'HORIZONTAL') {
      layout.sizing = {
        horizontal: toSizing(primaryMode) ?? 'fixed',
        vertical: toSizing(counterMode) ?? 'fixed',
      };
    } else {
      layout.sizing = {
        horizontal: toSizing(counterMode) ?? 'fixed',
        vertical: toSizing(primaryMode) ?? 'fixed',
      };
    }
  }

  if (layoutMode === 'GRID') {
    layout.padding = {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    };
    if (typeof node.strokesIncludedInLayout === 'boolean') {
      layout.strokesIncludedInLayout = node.strokesIncludedInLayout;
    }
    if (node.itemReverseZIndex === true) layout.itemReverseZIndex = true;
    for (const key of ['gridRowCount', 'gridColumnCount', 'gridRowGap', 'gridColumnGap'] as const) {
      if (typeof node[key] === 'number') layout[key] = node[key];
    }
    const gridRowSizes = extractGridTrackSizes(node.gridRowSizes);
    if (gridRowSizes) layout.gridRowSizes = gridRowSizes;
    const gridColumnSizes = extractGridTrackSizes(node.gridColumnSizes);
    if (gridColumnSizes) layout.gridColumnSizes = gridColumnSizes;
  }

  // Newer Figma layout sizing fields apply to children too. Prefer them when
  // available because they preserve fill/hug intent for non-auto-layout nodes.
  const horizontalSizing = toSizing(node.layoutSizingHorizontal);
  const verticalSizing = toSizing(node.layoutSizingVertical);
  if (horizontalSizing || verticalSizing) {
    layout.sizing = {
      horizontal: horizontalSizing ?? layout.sizing?.horizontal ?? 'fixed',
      vertical: verticalSizing ?? layout.sizing?.vertical ?? 'fixed',
    };
  }

  return layout;
}

function visiblePaintCount(value: unknown): number {
  return Array.isArray(value) ? value.filter((p: AnyNode) => p.visible !== false).length : 0;
}

function unsupportedPaintTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const knownPaintTypes = new Set([
    'SOLID',
    'GRADIENT_LINEAR',
    'GRADIENT_RADIAL',
    'GRADIENT_ANGULAR',
    'GRADIENT_DIAMOND',
    'IMAGE',
    'VIDEO',
    'PATTERN',
  ]);
  return [
    ...new Set(
      value
        .filter((p: AnyNode) =>
          p.visible !== false &&
          typeof p.type === 'string' &&
          (p.type === 'VIDEO' || p.type === 'PATTERN' || !knownPaintTypes.has(p.type)))
        .map((p: AnyNode) => p.type.toLowerCase().replace(/_/g, '-')),
    ),
  ];
}

function unsupportedEffectTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cssMappedEffects = new Set([
    'DROP_SHADOW',
    'INNER_SHADOW',
    'LAYER_BLUR',
    'BACKGROUND_BLUR',
  ]);
  return [
    ...new Set(
      value
        .filter((effect: AnyNode) =>
          effect.visible !== false &&
          typeof effect.type === 'string' &&
          !cssMappedEffects.has(effect.type))
        .map((effect: AnyNode) => effect.type.toLowerCase().replace(/_/g, '-')),
    ),
  ];
}

function nonCssBlendModes(node: AnyNode): string[] {
  const sources = [
    node,
    ...(Array.isArray(node.fills) ? node.fills : []),
    ...(Array.isArray(node.strokes) ? node.strokes : []),
    ...(Array.isArray(node.effects) ? node.effects : []),
  ];
  return [
    ...new Set(
      sources
        .map((source: AnyNode) => source?.blendMode)
        .filter((blendMode: unknown): blendMode is string =>
          blendMode === 'LINEAR_BURN' || blendMode === 'LINEAR_DODGE')
        .map((blendMode) => blendMode.toLowerCase().replace(/_/g, '-')),
    ),
  ];
}

function isMixedValue(value: unknown): boolean {
  return typeof figma !== 'undefined' && value === figma.mixed;
}

function extractFidelityWarnings(node: AnyNode, textStyleRanges?: UITextStyleRange[]): UIFidelityWarning[] | undefined {
  const warnings: UIFidelityWarning[] = [];
  const hasVariableWidthStroke =
    node.variableWidthStrokeProperties &&
    node.variableWidthStrokeProperties.widthProfile !== 'UNIFORM';
  const hasComplexStroke =
    node.complexStrokeProperties &&
    node.complexStrokeProperties.type !== 'BASIC';
  if (hasVariableWidthStroke || hasComplexStroke) {
    warnings.push({
      code: 'complex-stroke',
      severity: 'critical',
      message: 'Variable-width, brush, or dynamic stroke requires the Figma-rendered fallback for exact fidelity.',
    });
  }
  const hasNonCssGradient = [...(Array.isArray(node.fills) ? node.fills : []), ...(Array.isArray(node.strokes) ? node.strokes : [])]
    .some((paint: AnyNode) =>
      paint.visible !== false &&
      (paint.type === 'GRADIENT_ANGULAR' || paint.type === 'GRADIENT_DIAMOND'));
  if (hasNonCssGradient) {
    warnings.push({
      code: 'non-css-gradient',
      severity: 'critical',
      message: 'Angular or diamond gradient requires the Figma-rendered fallback for exact transform and interpolation fidelity.',
    });
  }
  const hasProgressiveBlur = Array.isArray(node.effects) && node.effects.some(
    (effect: AnyNode) => effect.visible !== false && effect.blurType === 'PROGRESSIVE',
  );
  if (hasProgressiveBlur) {
    warnings.push({
      code: 'progressive-blur',
      severity: 'critical',
      message: 'Progressive blur has no exact CSS equivalent and requires the Figma-rendered fallback.',
    });
  }
  for (const blendMode of nonCssBlendModes(node)) {
    warnings.push({
      code: `non-css-blend-mode-${blendMode}`,
      severity: 'critical',
      message: `${blendMode} is a Figma compositing mode without an exact portable CSS equivalent; use the rendered fallback.`,
    });
  }
  const fillCount = visiblePaintCount(node.fills);
  const strokeCount = visiblePaintCount(node.strokes);
  if (fillCount > 1) {
    warnings.push({
      code: 'multiple-fills',
      severity: 'critical',
      message: `${fillCount} visible fills require the Figma-rendered fallback for exact paint order, clipping, and blend fidelity; style.fills remains implementation metadata.`,
    });
  }
  if (strokeCount > 1) {
    warnings.push({
      code: 'multiple-strokes',
      severity: 'critical',
      message: `${strokeCount} visible strokes require the Figma-rendered fallback for exact geometry, paint order, and blend fidelity; style.strokes remains implementation metadata.`,
    });
  }
  for (const type of unsupportedPaintTypes(node.fills)) {
    warnings.push({
      code: `unsupported-fill-${type}`,
      severity: 'critical',
      message: `${type} fill metadata is captured but cannot be faithfully converted to plain CSS/HTML without a rendered asset or custom renderer.`,
    });
  }
  for (const type of unsupportedPaintTypes(node.strokes)) {
    warnings.push({
      code: `unsupported-stroke-${type}`,
      severity: 'critical',
      message: `${type} stroke metadata is captured but cannot be faithfully converted to plain CSS/HTML without a rendered asset or custom renderer.`,
    });
  }
  for (const type of unsupportedEffectTypes(node.effects)) {
    warnings.push({
      code: `unsupported-effect-${type}`,
      severity: 'critical',
      message: `${type} effect metadata is captured when available, but exact rendering requires the Figma-rendered fallback.`,
    });
  }
  const isTextNode = node.type === 'TEXT' || node.type === 'TEXT_PATH';
  if (isTextNode && textStyleRanges && textStyleRanges.length > 1) {
    warnings.push({
      code: 'mixed-text-styles',
      severity: 'warning',
      message: `${textStyleRanges.length} text style ranges detected; use textStyleRanges for per-character styling instead of only node-level style.`,
    });
  }
  if (isTextNode && (isMixedValue(node.fontName) || isMixedValue(node.fills)) && !textStyleRanges) {
    warnings.push({
      code: 'unresolved-mixed-text-style',
      severity: 'warning',
      message: 'Text node reports mixed style values, but styled text ranges were not available.',
    });
  }
  return warnings.length > 0 ? warnings : undefined;
}

function toJsonValue(value: unknown, seen = new WeakSet<object>()): UIJsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.flatMap((item) => {
      const normalized = toJsonValue(item, seen);
      return normalized === undefined ? [] : [normalized];
    });
    seen.delete(value);
    return result;
  }
  const result: Record<string, UIJsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = toJsonValue(item, seen);
    if (normalized !== undefined) result[key] = normalized;
  }
  seen.delete(value);
  return result;
}

function jsonObject(value: unknown): Record<string, UIJsonValue> | undefined {
  const normalized = toJsonValue(value);
  return normalized && !Array.isArray(normalized) && typeof normalized === 'object'
    ? normalized
    : undefined;
}

function extractReactions(value: unknown): UIPrototypeReaction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const reactions = value.flatMap((reaction): UIPrototypeReaction[] => {
    const source = reaction as AnyNode;
    const triggerObject = source.trigger === null ? null : jsonObject(source.trigger);
    const trigger = triggerObject && typeof triggerObject.type === 'string'
      ? triggerObject as UIPrototypeTrigger
      : null;
    const rawActions = Array.isArray(source.actions)
      ? source.actions
      : source.action ? [source.action] : [];
    const actions = rawActions.flatMap((action: unknown): UIPrototypeAction[] => {
      const normalized = jsonObject(action);
      return normalized && typeof normalized.type === 'string'
        ? [normalized as UIPrototypeAction]
        : [];
    });
    return trigger || actions.length > 0 ? [{ trigger, actions }] : [];
  });
  return reactions.length > 0 ? reactions : undefined;
}

function collectReferencedVariableIds(value: unknown, result = new Set<string>(), field?: string): Set<string> {
  if (typeof value === 'string' && field === 'variableId') {
    result.add(value);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferencedVariableIds(item, result));
    return result;
  }
  const source = value as Record<string, unknown>;
  if (source.type === 'VARIABLE_ALIAS' && typeof source.id === 'string') {
    result.add(source.id);
  }
  for (const [key, nested] of Object.entries(source)) {
    collectReferencedVariableIds(nested, result, key);
  }
  return result;
}

function extractReferencedVariables(...sources: unknown[]): UIVariableDefinition[] | undefined {
  if (typeof figma === 'undefined' || !figma.variables) return undefined;
  const ids = new Set<string>();
  sources.forEach((source) => collectReferencedVariableIds(source, ids));
  const definitions: UIVariableDefinition[] = [];

  for (const id of [...ids].sort()) {
    try {
      const variable = lookupVariable(id);
      if (!variable) continue;
      const collection = lookupCollection(variable.variableCollectionId);
      const modeNames = new Map(collection?.modes.map((mode) => [mode.modeId, mode.name]) ?? []);
      const valuesByMode: NonNullable<UIVariableDefinition['valuesByMode']> = {};
      for (const [modeId, rawValue] of Object.entries(variable.valuesByMode ?? {})) {
        const value = toJsonValue(rawValue);
        if (value === undefined) continue;
        const modeName = modeNames.get(modeId);
        valuesByMode[modeId] = {
          ...(modeName ? { modeName } : {}),
          value,
        };
      }
      const codeSyntax = variable.codeSyntax && typeof variable.codeSyntax === 'object'
        ? Object.fromEntries(Object.entries(variable.codeSyntax)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0))
        : undefined;
      definitions.push({
        id,
        name: variable.name,
        collectionId: variable.variableCollectionId,
        ...(collection?.name ? { collectionName: collection.name } : {}),
        ...(typeof variable.resolvedType === 'string' ? { resolvedType: variable.resolvedType } : {}),
        ...(typeof variable.description === 'string' && variable.description.length > 0
          ? { description: variable.description }
          : {}),
        ...(Array.isArray(variable.scopes)
          ? { scopes: variable.scopes.filter((scope: unknown): scope is string => typeof scope === 'string') }
          : {}),
        ...(codeSyntax && Object.keys(codeSyntax).length > 0 ? { codeSyntax } : {}),
        ...(Object.keys(valuesByMode).length > 0 ? { valuesByMode } : {}),
      });
    } catch { /* omit variables unavailable to this file or plan */ }
  }
  return definitions.length > 0 ? definitions : undefined;
}

function cleanComponentPropertyName(name: string): string {
  return name.replace(/#\d+:\d+$/, '');
}

function safelyReadProperty(source: AnyNode, property: string): unknown {
  try {
    return source[property];
  } catch {
    return undefined;
  }
}

function applySemanticMetadata(result: UISerializedNode, source: AnyNode): void {
  const reactions = extractReactions(source.reactions);
  if (reactions) result.reactions = reactions;
  if (typeof source.description === 'string' && source.description.length > 0) {
    result.description = source.description;
  }
  if (typeof source.descriptionMarkdown === 'string' && source.descriptionMarkdown.length > 0) {
    result.descriptionMarkdown = source.descriptionMarkdown;
  }
  if (Array.isArray(source.documentationLinks)) {
    const links = source.documentationLinks.flatMap((link: AnyNode) =>
      typeof link?.uri === 'string' && link.uri.length > 0 ? [link.uri] : []);
    if (links.length > 0) result.documentationLinks = links;
  }
  const rawComponentPropertyDefinitions = safelyReadProperty(source, 'componentPropertyDefinitions');
  if (rawComponentPropertyDefinitions && typeof rawComponentPropertyDefinitions === 'object') {
    const definitions: NonNullable<UISerializedNode['componentPropertyDefinitions']> = {};
    for (const [key, rawDefinition] of Object.entries(rawComponentPropertyDefinitions)) {
      const definition = rawDefinition as AnyNode;
      if (
        typeof definition.type !== 'string'
        || (typeof definition.defaultValue !== 'string' && typeof definition.defaultValue !== 'boolean')
      ) continue;
      const preferredValues = Array.isArray(definition.preferredValues)
        ? definition.preferredValues.flatMap((value: AnyNode) =>
            typeof value?.type === 'string' && typeof value?.key === 'string'
              ? [{ type: value.type, key: value.key }]
              : [])
        : undefined;
      const variantOptions = Array.isArray(definition.variantOptions)
        ? definition.variantOptions.filter((value: unknown): value is string => typeof value === 'string')
        : undefined;
      definitions[cleanComponentPropertyName(key)] = {
        type: definition.type,
        defaultValue: definition.defaultValue,
        ...(preferredValues?.length ? { preferredValues } : {}),
        ...(variantOptions?.length ? { variantOptions } : {}),
        ...(typeof definition.description === 'string' && definition.description.length > 0
          ? { description: definition.description }
          : {}),
      };
    }
    if (Object.keys(definitions).length > 0) result.componentPropertyDefinitions = definitions;
  }

  const prototype: NonNullable<UISerializedNode['prototype']> = {};
  const overflowDirection = normalizeEnumValue(source.overflowDirection);
  if (overflowDirection === 'none' || overflowDirection === 'horizontal' || overflowDirection === 'vertical' || overflowDirection === 'both') {
    prototype.overflowDirection = overflowDirection;
  }
  if (
    typeof source.numberOfFixedChildren === 'number'
    && source.numberOfFixedChildren > 0
    && Array.isArray(source.children)
  ) {
    prototype.fixedChildIds = source.children
      .slice(-source.numberOfFixedChildren)
      .flatMap((child: AnyNode) => typeof child?.id === 'string' ? [child.id] : []);
  }
  const overlayPositionType = normalizeEnumValue(source.overlayPositionType);
  if (
    overlayPositionType === 'center'
    || overlayPositionType === 'top-left'
    || overlayPositionType === 'top-center'
    || overlayPositionType === 'top-right'
    || overlayPositionType === 'bottom-left'
    || overlayPositionType === 'bottom-center'
    || overlayPositionType === 'bottom-right'
    || overlayPositionType === 'manual'
  ) {
    prototype.overlayPositionType = overlayPositionType;
  }
  const overlayBackground = toJsonValue(source.overlayBackground);
  if (overlayBackground !== undefined) prototype.overlayBackground = overlayBackground;
  const overlayBackgroundInteraction = normalizeEnumValue(source.overlayBackgroundInteraction);
  if (overlayBackgroundInteraction === 'none' || overlayBackgroundInteraction === 'close-on-click-outside') {
    prototype.overlayBackgroundInteraction = overlayBackgroundInteraction;
  }
  if (Object.keys(prototype).length > 0) result.prototype = prototype;

  if (Array.isArray(source.annotations)) {
    const annotations = source.annotations.flatMap((rawAnnotation: unknown) => {
      if (!rawAnnotation || typeof rawAnnotation !== 'object') return [];
      const annotation = rawAnnotation as Record<string, unknown>;
      const properties = Array.isArray(annotation.properties)
        ? annotation.properties.flatMap((property: unknown) => {
            if (!property || typeof property !== 'object') return [];
            const type = (property as Record<string, unknown>).type;
            return typeof type === 'string' ? [type] : [];
          })
        : undefined;
      const normalized = {
        ...(typeof annotation.label === 'string' && annotation.label.length > 0 ? { label: annotation.label } : {}),
        ...(typeof annotation.labelMarkdown === 'string' && annotation.labelMarkdown.length > 0
          ? { labelMarkdown: annotation.labelMarkdown }
          : {}),
        ...(properties?.length ? { properties } : {}),
        ...(typeof annotation.categoryId === 'string' && annotation.categoryId.length > 0
          ? { categoryId: annotation.categoryId }
          : {}),
      };
      return Object.keys(normalized).length > 0 ? [normalized] : [];
    });
    if (annotations.length > 0) result.annotations = annotations;
  }

  if (source.componentPropertyReferences && typeof source.componentPropertyReferences === 'object') {
    const references: NonNullable<UISerializedNode['componentPropertyReferences']> = {};
    for (const field of ['visible', 'characters', 'mainComponent'] as const) {
      const propertyName = source.componentPropertyReferences[field];
      if (typeof propertyName === 'string') references[field] = cleanComponentPropertyName(propertyName);
    }
    if (Object.keys(references).length > 0) result.componentPropertyReferences = references;
  }
  const variableBindings = extractVariableBindings(source.boundVariables);
  if (variableBindings) result.variableBindings = variableBindings;
  const explicitVariableModes = extractExplicitVariableModes(source.explicitVariableModes);
  if (explicitVariableModes) result.explicitVariableModes = explicitVariableModes;
  const referencedVariables = extractReferencedVariables(source.boundVariables, source.reactions);
  if (referencedVariables) result.referencedVariables = referencedVariables;
}

function finalizeNode(
  result: UISerializedNode,
  source: AnyNode,
  textStyleRanges?: UITextStyleRange[],
): UISerializedNode {
  if (textStyleRanges) result.textStyleRanges = textStyleRanges;
  applySemanticMetadata(result, source);
  const warnings = extractFidelityWarnings(source, textStyleRanges);
  if (warnings) result.fidelityWarnings = warnings;
  return result;
}

function recurseChildren(node: AnyNode): UISerializedNode[] | undefined {
  const children: AnyNode[] = node.children ?? [];
  const extracted = children
    .map((child) => extractNode(child as SceneNode))
    .filter((n): n is UISerializedNode => n !== null);
  return extracted.length > 0 ? extracted : undefined;
}

export function extractNode(node: SceneNode): UISerializedNode | null {
  const n = safelyReadableNode(node as AnyNode);
  const nodeType: string = n.type;
  const arcData = nodeType === 'ELLIPSE' ? extractArcData(n.arcData) : undefined;
  const transformModifiers = nodeType === 'TRANSFORM_GROUP'
    ? extractTransformModifiers(n.transformModifiers)
    : undefined;

  const base = {
    id: n.id as string,
    name: n.name as string,
    type: nodeType as UINodeType,
    visible: n.visible as boolean,
    ...extractVectorData(n),
    ...(arcData ? { arcData } : {}),
    ...(transformModifiers ? { transformModifiers } : {}),
  };

  // TEXT — special: extract text content + typography
  if (nodeType === 'TEXT' || nodeType === 'TEXT_PATH') {
    const textStyleRanges = extractTextStyleRanges(n);
    const textPathStartData = nodeType === 'TEXT_PATH'
      ? extractTextPathStartData(n.textPathStartData)
      : undefined;
    return finalizeNode({
      ...base,
      text: n.characters as string,
      style: extractTextStyle(n),
      layout: extractLayout(n),
      ...(textPathStartData ? { textPathStartData } : {}),
    }, n, textStyleRanges);
  }

  // INSTANCE — extract componentName, variant properties, style, and children
  if (nodeType === INSTANCE_TYPE) {
    const result: UISerializedNode = {
      ...base,
      componentName: resolveMainComponentName(n),
      layout: extractLayout(n),
      style: extractStyle(n),
    };

    // Extract variant / component properties (e.g. { State: "Active", Size: "Large" })
    const props = n.componentProperties;
    if (props && typeof props === 'object') {
      const mapped: Record<string, string> = {};
      const details: NonNullable<UISerializedNode['componentPropertyDetails']> = {};
      for (const [key, val] of Object.entries(props)) {
        const v = val as { type?: unknown; value?: unknown };
        if (v.value !== undefined) {
          // Strip internal hash suffix from key (e.g. "State#123:0" → "State")
          const cleanKey = cleanComponentPropertyName(key);
          mapped[cleanKey] = String(v.value);
          if (
            typeof v.type === 'string'
            && (typeof v.value === 'string' || typeof v.value === 'boolean')
          ) {
            details[cleanKey] = { type: v.type, value: v.value };
          }
        }
      }
      if (Object.keys(mapped).length > 0) result.componentProperties = mapped;
      if (Object.keys(details).length > 0) result.componentPropertyDetails = details;
    }

    // Expand children so active/inactive styles are visible
    const children = recurseChildren(n);
    if (children) result.children = children;
    return finalizeNode(result, n);
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
    return finalizeNode(result, n);
  }

  // GROUP — group-level opacity, blend mode, and effects change every child.
  if (GROUP_TYPES.has(nodeType)) {
    const result: UISerializedNode = {
      ...base,
      layout: extractLayout(n),
      style: extractStyle(n),
    };
    const children = recurseChildren(n);
    if (children) result.children = children;
    return finalizeNode(result, n);
  }

  // Known LEAF types — layout + style, no children
  if (LEAF_TYPES.has(nodeType)) {
    return finalizeNode({
      ...base,
      layout: extractLayout(n),
      style: extractStyle(n),
    }, n);
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
    return finalizeNode(result, n);
  }

  // Unknown leaf — still extract basic info instead of returning null
  return finalizeNode({
    ...base,
    layout: extractLayout(n),
    style: extractStyle(n),
  }, n);
}
