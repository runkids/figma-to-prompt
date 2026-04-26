import type {
  UISerializedNode,
  ImageNameOverrides,
  UILayout,
  UIImageFilters,
  UITransform,
  PromptDetailLevel,
} from '../shared/types';
import { getImageAssetKey, hasRenderSpecificImagePaint } from '../shared/imageAssets';

const DEFAULT_GEOMETRY_LIMIT = 80;

/** Sanitize user-supplied filename fragments to the same character class used by auto-naming */
export function sanitizeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/**
 * Recursively counts a node and all its children.
 */
export function countNodes(node: UISerializedNode): number {
  let count = 1;
  if (node.children && node.children.length > 0) {
    count += node.children.reduce((acc, child) => acc + countNodes(child), 0);
  }
  return count;
}

/** Convert a Figma variable/token path to a CSS custom property name */
function toCssVar(name: string): string {
  return name.replace(/\//g, '-').replace(/\s+/g, '-');
}

// ── Token Collection ──────────────────────────────────────

interface ColorEntry {
  hex: string;
  opacity?: number;
  variable?: string;
  styleName?: string;
  usage: 'background' | 'text' | 'border';
}

interface TypoEntry {
  styleName?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  letterSpacingUnit?: 'px' | 'percent';
}

interface ShadowEntry {
  type: 'drop' | 'inner';
  color: string;
  opacity?: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

interface DesignTokens {
  colors: ColorEntry[];
  typography: TypoEntry[];
  spacingValues: number[];
  borderRadii: number[];
  shadows: ShadowEntry[];
  gradients: string[];
}

export function collectTokens(node: UISerializedNode): DesignTokens {
  const colors = new Map<string, ColorEntry>();
  const typo = new Map<string, TypoEntry>();
  const spacing = new Set<number>();
  const radii = new Set<number>();
  const shadowMap = new Map<string, ShadowEntry>();
  const gradientSet = new Set<string>();

  function walk(n: UISerializedNode): void {
    if (n.visible === false) return;

    const s = n.style;
    if (s) {
      if (s.backgroundColor) {
        const key = `${s.backgroundColor}|${s.backgroundOpacity ?? ''}|bg`;
        if (!colors.has(key)) {
          colors.set(key, {
            hex: s.backgroundColor,
            opacity: s.backgroundOpacity,
            variable: s.variables?.backgroundColor,
            styleName: s.fillStyleName,
            usage: 'background',
          });
        }
      }
      if (s.color) {
        const key = `${s.color}|${s.colorOpacity ?? ''}|text`;
        if (!colors.has(key)) {
          colors.set(key, {
            hex: s.color,
            opacity: s.colorOpacity,
            variable: s.variables?.color,
            styleName: s.fillStyleName,
            usage: 'text',
          });
        }
      }
      if (s.borderColor) {
        const key = `${s.borderColor}|${s.borderOpacity ?? ''}|border`;
        if (!colors.has(key)) {
          colors.set(key, {
            hex: s.borderColor,
            opacity: s.borderOpacity,
            variable: s.variables?.borderColor,
            styleName: s.strokeStyleName,
            usage: 'border',
          });
        }
      }
      if (s.fills) {
        const usage = n.type === 'TEXT' ? 'text' : 'background';
        for (const paint of s.fills) {
          if (paint.visible === false) continue;
          if (paint.type === 'solid' && paint.color) {
            const key = `${paint.color}|${paint.opacity ?? ''}|${usage}|${paint.variable ?? ''}`;
            if (!colors.has(key)) {
              colors.set(key, {
                hex: paint.color,
                opacity: paint.opacity,
                variable: paint.variable,
                usage,
              });
            }
          }
          if (paint.type === 'gradient' && paint.css) {
            gradientSet.add(paint.css);
          }
        }
      }
      if (s.strokes) {
        for (const paint of s.strokes) {
          if (paint.visible === false) continue;
          if (paint.type === 'solid' && paint.color) {
            const key = `${paint.color}|${paint.opacity ?? ''}|border|${paint.variable ?? ''}`;
            if (!colors.has(key)) {
              colors.set(key, {
                hex: paint.color,
                opacity: paint.opacity,
                variable: paint.variable,
                usage: 'border',
              });
            }
          }
        }
      }

      if (s.fontFamily || s.fontSize) {
        const key = `${s.fontFamily ?? ''}|${s.fontSize ?? ''}|${s.fontWeight ?? ''}`;
        if (!typo.has(key)) {
          typo.set(key, {
            styleName: s.textStyleName,
            fontFamily: s.fontFamily,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
            lineHeight: s.lineHeight,
            letterSpacing: s.letterSpacing,
            letterSpacingUnit: s.letterSpacingUnit,
          });
        }
      }

      if (s.borderRadius) radii.add(s.borderRadius);

      // Shadows
      if (s.shadows) {
        for (const sh of s.shadows) {
          const key = `${sh.type}|${sh.color}|${sh.opacity ?? ''}|${sh.offsetX}|${sh.offsetY}|${sh.blur}|${sh.spread}`;
          if (!shadowMap.has(key)) shadowMap.set(key, sh);
        }
      }

      if (s.backgroundGradient) {
        gradientSet.add(s.backgroundGradient);
      }
    }

    const l = n.layout;
    if (l) {
      if (l.gap !== undefined && l.gap > 0) spacing.add(l.gap);
      if (l.padding) {
        const { top, right, bottom, left } = l.padding;
        for (const v of [top, right, bottom, left]) {
          if (v > 0) spacing.add(v);
        }
      }
    }

    n.children?.forEach(walk);
  }

  walk(node);

  return {
    colors: [...colors.values()],
    typography: [...typo.values()],
    spacingValues: [...spacing].sort((a, b) => a - b),
    borderRadii: [...radii].sort((a, b) => a - b),
    shadows: [...shadowMap.values()],
    gradients: [...gradientSet],
  };
}

// ── Component Dependencies ────────────────────────────────

export function collectComponentDeps(node: UISerializedNode): string[] {
  const deps = new Set<string>();

  function walk(n: UISerializedNode): void {
    if (n.visible === false) return;
    if (n.type === 'INSTANCE' && n.componentName) {
      deps.add(n.componentName);
    }
    n.children?.forEach(walk);
  }

  walk(node);
  return [...deps].sort();
}

// ── Fidelity Risk Summary ────────────────────────────────

interface FidelityRiskStats {
  totalNodes: number;
  maxDepth: number;
  absoluteCount: number;
  clippedCount: number;
  offCanvasCount: number;
  imageCount: number;
  renderSpecificImageCount: number;
  repeatedImageVariantGroups: number;
  vectorCount: number;
  vectorWithoutGeometryCount: number;
  gradientCount: number;
  shadowCount: number;
  detailedStrokeCount: number;
  blurCount: number;
  blendModeCount: number;
  maskCount: number;
  constraintCount: number;
  aspectRatioCount: number;
}

function summarizeFidelityRisk(node: UISerializedNode): FidelityRiskStats {
  const stats: FidelityRiskStats = {
    totalNodes: 0,
    maxDepth: 0,
    absoluteCount: 0,
    clippedCount: 0,
    offCanvasCount: 0,
    imageCount: 0,
    renderSpecificImageCount: 0,
    repeatedImageVariantGroups: 0,
    vectorCount: 0,
    vectorWithoutGeometryCount: 0,
    gradientCount: 0,
    shadowCount: 0,
    detailedStrokeCount: 0,
    blurCount: 0,
    blendModeCount: 0,
    maskCount: 0,
    constraintCount: 0,
    aspectRatioCount: 0,
  };
  const imageKeysByHash = new Map<string, Set<string>>();
  const rootWidth = node.layout?.width ?? 0;
  const rootHeight = node.layout?.height ?? 0;

  function walk(n: UISerializedNode, parentLeft: number, parentTop: number, depth: number, isRoot: boolean): void {
    if (n.visible === false) return;
    stats.totalNodes += 1;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    const layout = n.layout;
    const left = parentLeft + (isRoot ? 0 : layout?.x ?? 0);
    const top = parentTop + (isRoot ? 0 : layout?.y ?? 0);
    if (layout && !isRoot && rootWidth > 0 && rootHeight > 0) {
      const right = left + layout.width;
      const bottom = top + layout.height;
      if (left < 0 || top < 0 || right > rootWidth || bottom > rootHeight) {
        stats.offCanvasCount += 1;
      }
    }

    if (layout?.layoutPositioning === 'absolute') stats.absoluteCount += 1;
    if (layout?.overflow === 'hidden') stats.clippedCount += 1;
    if (layout?.constraints) stats.constraintCount += 1;
    if (layout?.targetAspectRatio) stats.aspectRatioCount += 1;

    const style = n.style;
    if (style?.blendMode) stats.blendModeCount += 1;
    if (style?.isMask) stats.maskCount += 1;
    if (style?.imageFillHash) {
      stats.imageCount += 1;
      if (hasRenderSpecificImagePaint(n)) stats.renderSpecificImageCount += 1;
      const key = getImageAssetKey(n);
      if (key) {
        const keys = imageKeysByHash.get(style.imageFillHash) ?? new Set<string>();
        keys.add(key);
        imageKeysByHash.set(style.imageFillHash, keys);
      }
    }
    if (style?.backgroundGradient) stats.gradientCount += 1;
    if (style?.shadows && style.shadows.length > 0) stats.shadowCount += 1;
    if (style?.blurEffects && style.blurEffects.length > 0) stats.blurCount += 1;
    if (
      style?.strokeAlign ||
      style?.strokeCap ||
      style?.strokeJoin ||
      style?.strokeMiterLimit !== undefined ||
      style?.strokeDashPattern ||
      style?.strokeWeights
    ) {
      stats.detailedStrokeCount += 1;
    }

    if (n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION') {
      stats.vectorCount += 1;
      if (!n.vectorPaths && !n.fillGeometry && !n.strokeGeometry) {
        stats.vectorWithoutGeometryCount += 1;
      }
    }

    n.children?.forEach((child) => walk(child, left, top, depth + 1, false));
  }

  walk(node, 0, 0, 0, true);
  stats.repeatedImageVariantGroups = [...imageKeysByHash.values()].filter((keys) => keys.size > 1).length;
  return stats;
}

function fidelityRiskLevel(stats: FidelityRiskStats): 'low' | 'medium' | 'high' {
  let score = 0;
  if (stats.totalNodes > 120) score += 3;
  else if (stats.totalNodes > 60) score += 2;
  else if (stats.totalNodes > 30) score += 1;
  if (stats.maxDepth > 7) score += 2;
  if (stats.absoluteCount > 0) score += Math.min(3, stats.absoluteCount);
  if (stats.clippedCount > 0) score += Math.min(3, stats.clippedCount);
  if (stats.offCanvasCount > 0) score += Math.min(3, stats.offCanvasCount);
  if (stats.renderSpecificImageCount > 0) score += Math.min(3, stats.renderSpecificImageCount);
  if (stats.repeatedImageVariantGroups > 0) score += 2;
  if (stats.vectorWithoutGeometryCount > 0) score += 2;
  if (stats.gradientCount > 0) score += 1;
  if (stats.shadowCount > 0) score += 1;
  if (stats.detailedStrokeCount > 0) score += 1;
  if (stats.blurCount > 0) score += 1;
  if (stats.blendModeCount > 0) score += 1;
  if (stats.maskCount > 0) score += 2;
  if (stats.constraintCount > 0 || stats.aspectRatioCount > 0) score += 1;
  if (score >= 7) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

export function buildFidelityRiskSummary(node: UISerializedNode): string {
  const stats = summarizeFidelityRisk(node);
  const lines: string[] = [
    '## Fidelity Risk Summary',
    `- Estimated risk: ${fidelityRiskLevel(stats)} (${stats.totalNodes} visible nodes, max depth ${stats.maxDepth})`,
  ];

  const layoutSignals: string[] = [];
  if (stats.absoluteCount > 0) layoutSignals.push(`${stats.absoluteCount} absolute-positioned auto-layout children`);
  if (stats.clippedCount > 0) layoutSignals.push(`${stats.clippedCount} clipped containers`);
  if (stats.offCanvasCount > 0) layoutSignals.push(`${stats.offCanvasCount} boxes extend outside the root viewport`);
  if (stats.constraintCount > 0) layoutSignals.push(`${stats.constraintCount} nodes with constraints`);
  if (stats.aspectRatioCount > 0) layoutSignals.push(`${stats.aspectRatioCount} nodes with target aspect ratio`);
  if (layoutSignals.length > 0) lines.push(`- Layout risks: ${layoutSignals.join(', ')}`);

  const assetSignals: string[] = [];
  if (stats.imageCount > 0) assetSignals.push(`${stats.imageCount} image fills`);
  if (stats.renderSpecificImageCount > 0) assetSignals.push(`${stats.renderSpecificImageCount} image fills with crop/filter/opacity metadata`);
  if (stats.repeatedImageVariantGroups > 0) assetSignals.push(`${stats.repeatedImageVariantGroups} reused image hashes with distinct rendered variants`);
  if (stats.vectorCount > 0) assetSignals.push(`${stats.vectorCount} vector-like nodes`);
  if (stats.vectorWithoutGeometryCount > 0) assetSignals.push(`${stats.vectorWithoutGeometryCount} vector-like nodes without path geometry`);
  if (assetSignals.length > 0) lines.push(`- Asset risks: ${assetSignals.join(', ')}`);

  const paintSignals: string[] = [];
  if (stats.gradientCount > 0) paintSignals.push(`${stats.gradientCount} gradients`);
  if (stats.shadowCount > 0) paintSignals.push(`${stats.shadowCount} shadowed nodes`);
  if (stats.blurCount > 0) paintSignals.push(`${stats.blurCount} blur effect nodes`);
  if (stats.blendModeCount > 0) paintSignals.push(`${stats.blendModeCount} nodes with layer blend mode`);
  if (stats.maskCount > 0) paintSignals.push(`${stats.maskCount} mask nodes`);
  if (stats.detailedStrokeCount > 0) paintSignals.push(`${stats.detailedStrokeCount} nodes with detailed stroke metadata`);
  if (paintSignals.length > 0) lines.push(`- Paint risks: ${paintSignals.join(', ')}`);

  if (lines.length <= 2 && stats.totalNodes <= 20) return '';
  return lines.join('\n');
}

interface FidelityWarningEntry {
  path: string;
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

function collectFidelityWarnings(node: UISerializedNode): FidelityWarningEntry[] {
  const entries: FidelityWarningEntry[] = [];

  function walk(n: UISerializedNode, path: string[]): void {
    if (n.visible === false) return;
    const nextPath = [...path, formatPathSegment(n.name)];
    if (n.fidelityWarnings) {
      for (const warning of n.fidelityWarnings) {
        entries.push({
          path: nextPath.join(' > '),
          code: warning.code,
          message: warning.message,
          severity: warning.severity ?? 'warning',
        });
      }
    }
    n.children?.forEach((child) => walk(child, nextPath));
  }

  walk(node, []);
  return entries;
}

export function buildFidelityWarningsSection(node: UISerializedNode): string {
  const warnings = collectFidelityWarnings(node);
  if (warnings.length === 0) return '';

  const lines = [
    '## Fidelity Warnings',
    'These are extracted from the JSON and mark places where the convenience fields may not be enough.',
  ];
  for (const warning of warnings) {
    lines.push(`- [${warning.severity}] ${warning.path}: ${warning.code} - ${warning.message}`);
  }
  return lines.join('\n');
}

// ── Image Assets ─────────────────────────────────────────

export interface ImageAsset {
  hash: string;
  nodeId: string;
  fileName: string;
  nodeName: string;
  width: number;
  height: number;
  scaleMode?: string;
  opacity?: number;
  transform?: UITransform;
  scalingFactor?: number;
  rotation?: number;
  filters?: UIImageFilters;
}

export function collectImageAssets(
  node: UISerializedNode,
  overrides?: ImageNameOverrides,
): ImageAsset[] {
  const assets = new Map<string, ImageAsset>();

  function walk(n: UISerializedNode, parentName?: string): void {
    if (n.visible === false) return;
    const imageAssetKey = getImageAssetKey(n);
    if (n.style?.imageFillHash && imageAssetKey && !assets.has(imageAssetKey)) {
      // User override takes precedence; fall back to "Parent_Child" auto-naming
      const override = overrides?.[n.id]?.trim();
      const safeName = override
        ? sanitizeFileName(override)
        : sanitizeFileName(parentName && parentName !== n.name ? `${parentName}_${n.name}` : n.name);
      assets.set(imageAssetKey, {
        hash: n.style.imageFillHash,
        nodeId: n.id,
        fileName: `${safeName}.png`,
        nodeName: n.name,
        width: Math.round(n.layout?.width ?? 0),
        height: Math.round(n.layout?.height ?? 0),
        scaleMode: n.style.imageFillScaleMode,
        opacity: n.style.imageFillOpacity,
        transform: n.style.imageFillTransform,
        scalingFactor: n.style.imageFillScalingFactor,
        rotation: n.style.imageFillRotation,
        filters: n.style.imageFillFilters,
      });
    }
    n.children?.forEach((child) => walk(child, n.name));
  }

  walk(node);

  // Disambiguate any remaining duplicate fileNames with index suffix
  const result = [...assets.values()];
  const nameCount = new Map<string, number>();
  for (const a of result) nameCount.set(a.fileName, (nameCount.get(a.fileName) ?? 0) + 1);
  const nameIdx = new Map<string, number>();
  for (const a of result) {
    if ((nameCount.get(a.fileName) ?? 0) > 1) {
      const idx = (nameIdx.get(a.fileName) ?? 0) + 1;
      nameIdx.set(a.fileName, idx);
      a.fileName = a.fileName.replace(/\.png$/, `_${idx}.png`);
    }
  }
  return result;
}

// ── Tree Outline ──────────────────────────────────────────

export function buildTreeOutline(node: UISerializedNode): string {
  const lines: string[] = [];

  function nodeLabel(n: UISerializedNode): string {
    let label = n.name;

    if (n.type === 'INSTANCE' && n.componentName) {
      const variantStr = n.componentProperties
        ? ' ' + Object.entries(n.componentProperties).map(([k, v]) => `${k}=${v}`).join(', ')
        : '';
      label += ` (INSTANCE → ${n.componentName}${variantStr})`;
    } else {
      const parts: string[] = [n.type];
      if (n.layout?.mode && n.layout.mode !== 'none') parts.push(n.layout.mode);
      if (n.layout?.sizing) parts.push(`${n.layout.sizing.horizontal}×${n.layout.sizing.vertical}`);
      label += ` (${parts.join(', ')})`;
    }

    if (n.text) {
      const t = n.text.length > 40 ? n.text.slice(0, 40) + '…' : n.text;
      label += ` "${t}"`;
    }

    return label;
  }

  function walk(n: UISerializedNode, prefix: string, isLast: boolean, isRoot: boolean): void {
    if (isRoot) {
      lines.push(nodeLabel(n));
    } else {
      lines.push(prefix + (isLast ? '└── ' : '├── ') + nodeLabel(n));
    }

    if (n.children) {
      const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
      n.children.forEach((child, i) => {
        walk(child, childPrefix, i === n.children!.length - 1, false);
      });
    }
  }

  walk(node, '', true, true);
  return lines.join('\n');
}

// ── Node Details (single-line JSON) ──────────────────────

/**
 * Returns the node tree as a single-line JSON string.
 * No conversion, no custom format — raw data the AI can parse natively.
 */
export function buildNodeDetails(node: UISerializedNode): string {
  return JSON.stringify(node);
}

// ── Geometry Checklist ───────────────────────────────────

export interface GeometryChecklistItem {
  id: string;
  path: string;
  type: UISerializedNode['type'];
  positioning?: UILayout['layoutPositioning'];
  signals: string[];
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GeometryChecklist {
  items: GeometryChecklistItem[];
  totalCount: number;
  omittedCount: number;
  usedPrioritySelection: boolean;
  rootHadCanvasOffset: boolean;
}

function formatNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function formatPathSegment(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean) return '(unnamed)';
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}

function geometrySignals(n: UISerializedNode, isRoot: boolean, depth: number): string[] {
  const signals: string[] = [];
  if (isRoot) signals.push('root');
  else if (depth === 1) signals.push('top-level');
  if (n.layout?.layoutPositioning === 'absolute') signals.push('absolute');
  if (n.layout?.overflow === 'hidden') signals.push('clips');
  if (n.style?.imageFillHash) signals.push('image');
  if (n.vectorPaths || n.fillGeometry || n.strokeGeometry) signals.push('vector');
  if (n.type === 'INSTANCE' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') signals.push('component');
  return signals;
}

function geometryPriority(item: GeometryChecklistItem, order: number, rootArea: number): number {
  const signalWeights: Record<string, number> = {
    root: 10000,
    'top-level': 8000,
    absolute: 7000,
    clips: 5000,
    image: 4200,
    vector: 3600,
    component: 3000,
  };
  const signalScore = item.signals.reduce((sum, signal) => sum + (signalWeights[signal] ?? 0), 0);
  const area = item.width * item.height;
  const areaScore = rootArea > 0 ? Math.min(1000, (area / rootArea) * 1000) : 0;
  // Later siblings paint above earlier ones, so give slightly more weight to later nodes.
  const paintOrderScore = Math.min(250, order / 10);
  return signalScore + areaScore + paintOrderScore;
}

function collectGeometryChecklist(node: UISerializedNode, maxItems = DEFAULT_GEOMETRY_LIMIT): GeometryChecklist {
  const allItems: Array<GeometryChecklistItem & { order: number }> = [];
  let order = 0;
  const rootArea = (node.layout?.width ?? 0) * (node.layout?.height ?? 0);

  function walk(
    n: UISerializedNode,
    parentLeft: number,
    parentTop: number,
    path: string[],
    isRoot: boolean,
    depth: number,
  ): void {
    if (n.visible === false) return;

    const layout = n.layout;
    const left = parentLeft + (isRoot ? 0 : layout?.x ?? 0);
    const top = parentTop + (isRoot ? 0 : layout?.y ?? 0);
    const nextPath = [...path, formatPathSegment(n.name)];

    if (layout) {
      allItems.push({
        id: n.id,
        path: nextPath.join(' > '),
        type: n.type,
        positioning: layout.layoutPositioning,
        signals: geometrySignals(n, isRoot, depth),
        left,
        top,
        width: layout.width,
        height: layout.height,
        order: order++,
      });
    }

    n.children?.forEach((child) => walk(child, left, top, nextPath, false, depth + 1));
  }

  walk(node, 0, 0, [], true, 0);

  const normalizedMax = Math.max(1, maxItems);
  const usedPrioritySelection = allItems.length > normalizedMax;
  const selected = usedPrioritySelection
    ? [...allItems]
        .sort((a, b) => geometryPriority(b, b.order, rootArea) - geometryPriority(a, a.order, rootArea))
        .slice(0, normalizedMax)
        .sort((a, b) => a.order - b.order)
    : allItems;

  return {
    items: selected.map(({ order: _order, ...item }) => item),
    totalCount: allItems.length,
    omittedCount: Math.max(0, allItems.length - selected.length),
    usedPrioritySelection,
    rootHadCanvasOffset: Boolean(node.layout?.x || node.layout?.y),
  };
}

export function buildGeometryChecklist(node: UISerializedNode, maxItems = DEFAULT_GEOMETRY_LIMIT): string {
  const checklist = collectGeometryChecklist(node, maxItems);
  if (checklist.items.length === 0) return '';

  const lines: string[] = [
    '## Geometry Checklist',
    'Use these absolute boxes after normalizing the selected root to left 0, top 0. They are derived from `layout.x/y` and help catch drift before styling polish.',
  ];

  if (checklist.rootHadCanvasOffset) {
    lines.push('- Root `layout.x/y` is the Figma canvas position; do not offset the rendered component by it.');
  }
  if (checklist.usedPrioritySelection) {
    lines.push(`- Large tree: showing ${checklist.items.length} priority boxes out of ${checklist.totalCount}; full geometry remains in the JSON.`);
  }

  lines.push('### Bounding Boxes');
  for (const item of checklist.items) {
    const positioning = item.positioning ? `, positioning ${item.positioning}` : '';
    const signals = item.signals.length > 0 ? `, signals: ${item.signals.join('/')}` : '';
    lines.push(
      `- ${item.path} [${item.type}]: left ${formatNumber(item.left)}, top ${formatNumber(item.top)}, width ${formatNumber(item.width)}, height ${formatNumber(item.height)}${positioning}${signals}`,
    );
  }

  if (checklist.omittedCount > 0) {
    lines.push(`- (${checklist.omittedCount} additional visible nodes omitted; use the JSON for the remaining descendants.)`);
  }

  return lines.join('\n');
}

// ── Prompt Formatting Helpers ─────────────────────────────

function formatColorLine(c: ColorEntry): string {
  let line = `- \`${c.hex}\``;
  if (c.variable) {
    line += ` → \`var(--${toCssVar(c.variable)})\``;
  } else if (c.styleName) {
    line += ` → style "${c.styleName}"`;
  }
  line += ` (${c.usage})`;
  if (c.opacity !== undefined) line += `, opacity: ${c.opacity}`;
  return line;
}

function formatTypoLine(t: TypoEntry): string {
  let line = '- ';
  if (t.styleName) line += `"${t.styleName}" → `;

  const parts: string[] = [];
  if (t.fontFamily) parts.push(t.fontFamily);
  if (t.fontWeight) parts.push(String(t.fontWeight));
  if (t.fontSize) {
    let size = `${t.fontSize}px`;
    if (t.lineHeight) size += `/${t.lineHeight}px`;
    parts.push(size);
  }
  line += parts.join(' ');

  if (t.letterSpacing) {
    const unit = t.letterSpacingUnit === 'percent' ? '%' : 'px';
    line += `, letter-spacing: ${t.letterSpacing}${unit}`;
  }
  return line;
}

function buildVisualVerificationSection(node: UISerializedNode, hasMergedAsset: boolean): string {
  const size = node.layout
    ? `${formatNumber(node.layout.width)}×${formatNumber(node.layout.height)}`
    : 'the extracted root size';
  const lines = [
    '## Implementation Checks',
    `- Build against one exact ${size} viewport with \`html, body { margin: 0; }\` and global \`box-sizing: border-box\`.`,
    '- Use the Geometry Checklist as a lightweight self-check before styling polish; screenshot diff tooling is optional for complex frames.',
    '- For text, set explicit `font-size`, `font-weight`, `line-height`, and CSS `letter-spacing`; convert percent letter spacing to px from the font size.',
    '- For mixed text, use `textStyleRanges` to split spans and preserve range-level fills, styles, links, and paragraph/list metadata.',
    '- For `layout.mode: none`, position children from their `layout.x/y` offsets relative to the parent.',
    '- For `layout.layoutPositioning: absolute`, remove that node from the parent flex flow and position it by `layout.x/y` even when the parent uses auto layout.',
    '- Preserve paint metadata such as fill opacity, image crop transforms, image filters, and gradient transforms when present in `style`.',
    '- Preserve stroke metadata such as stroke alignment, caps, joins, dash pattern, miter limit, and side-specific stroke weights when present in `style`.',
    '- Render exact SVG paths from `vectorPaths`, `fillGeometry`, or `strokeGeometry` when present; do not replace them with approximate icons.',
  ];

  if (hasMergedAsset) {
    lines.push('- Use the attached composite image as visual reference only; do not crop it into runtime assets.');
  }

  return lines.join('\n');
}

// ── Main Prompt Builder ───────────────────────────────────

export interface BuildPromptOptions {
  /** Per-node filename overrides applied to the Assets section */
  imageNameOverrides?: ImageNameOverrides;
  /** Merged composite reference — shown as a single whole-frame asset line */
  merged?: { name: string; width: number; height: number };
  /** Output depth: compact omits helper sections, full expands geometry. */
  promptDetail?: PromptDetailLevel;
}

/**
 * Generates a structured prompt from a UISerializedNode tree,
 * designed to let an AI reproduce the component at 99% fidelity.
 */
export function buildPrompt(node: UISerializedNode, options?: BuildPromptOptions): string {
  const promptDetail = options?.promptDetail ?? 'detailed';
  const tokens = collectTokens(node);
  const deps = collectComponentDeps(node);
  const details = buildNodeDetails(node);

  const sections: string[] = [];

  // Header
  sections.push(`# Component: ${node.name}`);

  // Guidelines
  sections.push(`## Guidelines
- Reproduce this component with **99% fidelity** using the JSON spec below
- Use semantic HTML elements
- The JSON contains the full node tree with layout, style, and children
- Preserve JSON child order as paint order; later siblings render above earlier siblings
- Preserve \`style.fills\` and \`style.strokes\` paint-stack order when present; convenience fields like \`backgroundColor\` and \`imageFillHash\` only summarize the first renderable paints
- Preserve \`textStyleRanges\` when present; node-level text style is only the common/default style
- \`layout.mode\`: horizontal → flex row, vertical → flex column
- \`layout.mode: none\` → position children by \`layout.x/y\` relative to the parent
- \`layout.layoutPositioning: absolute\` → remove from parent flex flow and position by \`layout.x/y\`
- \`layout.sizing\`: hug → auto, fill → 100%/flex:1, fixed → explicit px
- Normalize the selected root frame to left: 0, top: 0; root \`layout.x/y\` is Figma canvas position
- Use \`box-sizing: border-box\` so width/height include padding and borders
- \`style.variables\` → use as CSS custom properties
- INSTANCE nodes → reusable sub-components, import or stub them`);

  // Design Tokens
  const tokenParts: string[] = ['## Design Tokens'];

  if (tokens.colors.length > 0) {
    tokenParts.push('### Colors');
    tokenParts.push(...tokens.colors.map(formatColorLine));
  }

  if (tokens.typography.length > 0) {
    tokenParts.push('### Typography');
    tokenParts.push(...tokens.typography.map(formatTypoLine));
  }

  if (tokens.shadows.length > 0) {
    tokenParts.push('### Shadows');
    for (const sh of tokens.shadows) {
      const opacity = sh.opacity !== undefined ? `, opacity: ${sh.opacity}` : '';
      tokenParts.push(`- ${sh.type}-shadow: ${sh.offsetX}px ${sh.offsetY}px ${sh.blur}px ${sh.spread}px ${sh.color}${opacity}`);
    }
  }

  if (tokens.gradients.length > 0) {
    tokenParts.push('### Gradients');
    for (const g of tokens.gradients) {
      tokenParts.push(`- \`${g}\``);
    }
  }

  if (tokens.spacingValues.length > 0 || tokens.borderRadii.length > 0) {
    tokenParts.push('### Spacing & Radii');
    if (tokens.spacingValues.length > 0) {
      tokenParts.push(`- Spacing scale: ${tokens.spacingValues.map((v) => `${v}px`).join(', ')}`);
    }
    if (tokens.borderRadii.length > 0) {
      tokenParts.push(`- Border radii: ${tokens.borderRadii.map((v) => `${v}px`).join(', ')}`);
    }
  }

  if (tokenParts.length > 1) {
    sections.push(tokenParts.join('\n'));
  }

  // Component Dependencies
  if (deps.length > 0) {
    sections.push(
      `## Component Dependencies\nThese INSTANCE nodes must be implemented or imported:\n${deps.map((d) => `- \`${d}\``).join('\n')}`,
    );
  }

  if (promptDetail !== 'compact') {
    const fidelityRiskSummary = buildFidelityRiskSummary(node);
    if (fidelityRiskSummary) {
      sections.push(fidelityRiskSummary);
    }
    const fidelityWarnings = buildFidelityWarningsSection(node);
    if (fidelityWarnings) {
      sections.push(fidelityWarnings);
    }
  }

  if (promptDetail !== 'compact') {
    const geometryChecklist = buildGeometryChecklist(
      node,
      promptDetail === 'full' ? Number.MAX_SAFE_INTEGER : DEFAULT_GEOMETRY_LIMIT,
    );
    if (geometryChecklist) {
      sections.push(geometryChecklist);
    }
  }

  // Image Assets
  // Merged mode: only the composite is attached; individual image fills are already
  // rasterized into it and MUST NOT be referenced as separate files (they don't exist
  // as attachments). Per-image mode lists each image-fill node as its own asset.
  const merged = options?.merged;
  if (merged) {
    const mergedSafe = sanitizeFileName(merged.name);
    sections.push(
      `## Assets\nA single rendered composite image is attached — use it as a visual reference for the whole frame. Do NOT reference any individual image files; they are already baked into this composite:\n- \`${mergedSafe}.png\` → whole composite (${merged.width}×${merged.height})`,
    );
  } else {
    const imageAssets = collectImageAssets(node, options?.imageNameOverrides);
    if (imageAssets.length > 0) {
      const assetLines = imageAssets.map((a) => {
        let line = `- \`${a.fileName}\` → ${a.nodeName} (${a.width}×${a.height}`;
        if (a.scaleMode) line += `, ${a.scaleMode}`;
        if (a.opacity !== undefined) line += `, opacity ${a.opacity}`;
        if (a.rotation !== undefined) line += `, rotation ${a.rotation}deg`;
        if (a.scalingFactor !== undefined) line += `, scaling ${a.scalingFactor}`;
        if (a.transform) line += `, transform ${JSON.stringify(a.transform)}`;
        if (a.filters) line += `, filters ${JSON.stringify(a.filters)}`;
        line += ')';
        return line;
      });
      sections.push(
        `## Assets\nImage files included with this spec — use as \`<img>\` or CSS \`background-image\`:\n${assetLines.join('\n')}`,
      );
    }
  }

  if (promptDetail !== 'compact') {
    sections.push(buildVisualVerificationSection(node, Boolean(merged)));
  }

  if (promptDetail === 'full') {
    sections.push(`## Tree Outline\n\`\`\`\n${buildTreeOutline(node)}\n\`\`\``);
  }

  // Component Structure (replaces separate Node Tree + Full JSON)
  sections.push(`## Component Structure\n\`\`\`\n${details}\n\`\`\``);

  return sections.join('\n\n') + '\n';
}
