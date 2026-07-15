export type UINodeType =
  | 'FRAME'
  | 'GROUP'
  | 'TRANSFORM_GROUP'
  | 'TEXT'
  | 'TEXT_PATH'
  | 'RECTANGLE'
  | 'INSTANCE'
  | 'COMPONENT'
  | 'SECTION'
  | 'COMPONENT_SET'
  | 'SLOT'
  | 'ELLIPSE'
  | 'LINE'
  | 'VECTOR'
  | 'POLYGON'
  | 'STAR'
  | 'BOOLEAN_OPERATION';

export interface UISerializedNode {
  id: string;
  name: string;
  type: UINodeType;
  visible?: boolean;
  layout?: UILayout;
  style?: UIStyle;
  text?: string;
  /** Character-level style ranges when a text node mixes fonts, fills, links, or paragraph metadata */
  textStyleRanges?: UITextStyleRange[];
  componentName?: string;
  /** Variant properties — e.g. { State: "Active", Size: "Large" } */
  componentProperties?: Record<string, string>;
  componentPropertyDetails?: Record<string, {
    type: string;
    value: string | boolean;
  }>;
  componentPropertyDefinitions?: Record<string, {
    type: string;
    defaultValue: string | boolean;
    preferredValues?: Array<{ type: string; key: string }>;
    variantOptions?: string[];
    description?: string;
  }>;
  description?: string;
  descriptionMarkdown?: string;
  documentationLinks?: string[];
  /** Prototype interactions that cannot be recovered reliably from a screenshot. */
  reactions?: UIPrototypeReaction[];
  /** Frame presentation behavior that affects scrolling, fixed layers, and overlays. */
  prototype?: UIPrototypeSettings;
  /** Dev Mode annotations authored on this node. */
  annotations?: UIAnnotation[];
  /** Links component sublayers back to their public component properties. */
  componentPropertyReferences?: {
    visible?: string;
    characters?: string;
    mainComponent?: string;
  };
  /** Complete node-level Figma variable bindings, beyond fill/stroke convenience tokens. */
  variableBindings?: Record<string, UIVariableBinding>;
  /** Variable collection modes explicitly selected on this node. */
  explicitVariableModes?: UIVariableMode[];
  /** Definitions and per-mode values for variables referenced by this node's bindings or reactions. */
  referencedVariables?: UIVariableDefinition[];
  /** SVG-compatible vector path data when Figma exposes it for vector-like nodes */
  vectorPaths?: UIVectorPath[];
  fillGeometry?: UIVectorPath[];
  strokeGeometry?: UIVectorPath[];
  /** Exact sweep and inner-radius geometry for ellipse arcs and donut shapes */
  arcData?: UIArcData;
  /** Exact start position for text flowing along `vectorPaths`. */
  textPathStartData?: { segment: number; position: number };
  /** Repeat transforms applied by a Figma transform group. */
  transformModifiers?: UITransformModifier[];
  /** Node-level caveats for Figma features that need special handling downstream */
  fidelityWarnings?: UIFidelityWarning[];
  children?: UISerializedNode[];
}

export type UIJsonValue = string | number | boolean | null | UIJsonValue[] | {
  [key: string]: UIJsonValue;
};

export interface UIPrototypeTrigger {
  type: string;
  [key: string]: UIJsonValue;
}

export interface UIPrototypeAction {
  type: string;
  [key: string]: UIJsonValue;
}

export interface UIPrototypeReaction {
  trigger: UIPrototypeTrigger | null;
  actions: UIPrototypeAction[];
}

export interface UIPrototypeSettings {
  overflowDirection?: 'none' | 'horizontal' | 'vertical' | 'both';
  fixedChildIds?: string[];
  overlayPositionType?:
    | 'center'
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
    | 'manual';
  overlayBackground?: UIJsonValue;
  overlayBackgroundInteraction?: 'none' | 'close-on-click-outside';
}

export interface UIAnnotation {
  label?: string;
  labelMarkdown?: string;
  properties?: string[];
  categoryId?: string;
}

export interface UIVariableReference {
  id: string;
  name?: string;
}

export type UIVariableBinding =
  | UIVariableReference
  | UIVariableReference[]
  | Record<string, UIVariableReference>;

export interface UIVariableMode {
  collectionId: string;
  collectionName?: string;
  modeId: string;
  modeName?: string;
}

export interface UIVariableDefinition {
  id: string;
  name: string;
  collectionId: string;
  collectionName?: string;
  resolvedType?: string;
  description?: string;
  scopes?: string[];
  codeSyntax?: Record<string, string>;
  valuesByMode?: Record<string, {
    modeName?: string;
    value: UIJsonValue;
  }>;
}

export interface UIVectorPath {
  windingRule: 'NONZERO' | 'EVENODD' | 'NONE';
  data: string;
}

export interface UIArcData {
  startingAngle: number;
  endingAngle: number;
  innerRadius: number;
}

export interface UILayout {
  mode?: 'horizontal' | 'vertical' | 'grid' | 'none';
  width: number;
  height: number;
  x?: number;
  y?: number;
  rotation?: number;
  relativeTransform?: UITransform;
  /** Effect/stroke-inclusive bounds relative to the node's regular bounding box. */
  renderBounds?: { x: number; y: number; width: number; height: number };
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  constraints?: {
    horizontal: 'min' | 'center' | 'max' | 'stretch' | 'scale';
    vertical: 'min' | 'center' | 'max' | 'stretch' | 'scale';
  };
  targetAspectRatio?: { x: number; y: number };
  layoutPositioning?: 'auto' | 'absolute';
  layoutAlign?: 'min' | 'center' | 'max' | 'stretch' | 'inherit';
  layoutGrow?: number;
  gap?: number;
  wrap?: 'wrap';
  counterAxisSpacing?: number;
  counterAxisAlignContent?: 'auto' | 'space-between';
  itemReverseZIndex?: boolean;
  strokesIncludedInLayout?: boolean;
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  primaryAxisAlign?: 'min' | 'max' | 'center' | 'space-between';
  counterAxisAlign?: 'min' | 'max' | 'center' | 'baseline';
  sizing?: {
    horizontal: 'fixed' | 'hug' | 'fill';
    vertical: 'fixed' | 'hug' | 'fill';
  };
  gridRowCount?: number;
  gridColumnCount?: number;
  gridRowGap?: number;
  gridColumnGap?: number;
  gridRowSizes?: UIGridTrackSize[];
  gridColumnSizes?: UIGridTrackSize[];
  gridRowAnchorIndex?: number;
  gridColumnAnchorIndex?: number;
  gridRowSpan?: number;
  gridColumnSpan?: number;
  gridChildHorizontalAlign?: 'min' | 'center' | 'max' | 'auto';
  gridChildVerticalAlign?: 'min' | 'center' | 'max' | 'auto';
  overflow?: 'hidden';
}

export interface UIGridTrackSize {
  type: 'flex' | 'fixed' | 'hug';
  value?: number;
}

export interface UIStyle {
  blendMode?: string;
  isMask?: boolean;
  maskType?: 'alpha' | 'vector' | 'luminance';
  /** Full Figma fill paint stack in paint order. Legacy convenience fields below still expose the first renderable paints. */
  fills?: UIPaint[];
  /** Full Figma stroke paint stack in paint order. */
  strokes?: UIPaint[];
  backgroundColor?: string;
  backgroundOpacity?: number;
  color?: string;
  colorOpacity?: number;
  borderRadius?: number;
  cornerSmoothing?: number;
  borderWidth?: number;
  borderColor?: string;
  borderOpacity?: number;
  strokeAlign?: 'center' | 'inside' | 'outside';
  strokeCap?:
    | 'none'
    | 'round'
    | 'square'
    | 'arrow-lines'
    | 'arrow-equilateral'
    | 'diamond-filled'
    | 'triangle-filled'
    | 'circle-filled';
  strokeJoin?: 'miter' | 'bevel' | 'round';
  strokeMiterLimit?: number;
  strokeDashPattern?: number[];
  strokeWeights?: { top: number; right: number; bottom: number; left: number };
  opacity?: number;
  fontFamily?: string;
  fontStyleName?: string;
  fontSize?: number;
  fontWeight?: number;
  openTypeFeatures?: Record<string, boolean>;
  lineHeight?: number;
  letterSpacing?: number;
  letterSpacingUnit?: 'px' | 'percent';
  textAlign?: 'left' | 'center' | 'right' | 'justified';
  textAlignVertical?: 'top' | 'center' | 'bottom';
  textAutoResize?: 'none' | 'width-and-height' | 'height' | 'truncate';
  textTruncation?: 'disabled' | 'ending';
  maxLines?: number;
  paragraphIndent?: number;
  paragraphSpacing?: number;
  listSpacing?: number;
  hangingPunctuation?: boolean;
  hangingList?: boolean;
  leadingTrim?: 'cap-height' | 'none';
  textDecoration?: 'underline' | 'strikethrough';
  textDecorationStyle?: 'solid' | 'wavy' | 'dotted';
  textDecorationOffset?: UITextDecorationMeasurement;
  textDecorationThickness?: UITextDecorationMeasurement;
  textDecorationColor?: { color?: string; opacity?: number; variable?: string; auto?: true };
  textDecorationSkipInk?: boolean;
  textCase?: 'upper' | 'lower' | 'title' | 'original';
  textStyleName?: string;
  fillStyleName?: string;
  strokeStyleName?: string;
  /** Shadow effects */
  shadows?: Array<{
    type: 'drop' | 'inner';
    color: string;
    opacity?: number;
    blendMode?: string;
    showShadowBehindNode?: boolean;
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
  }>;
  blurEffects?: Array<{
    type: 'layer' | 'background';
    radius: number;
    blurType?: 'normal' | 'progressive';
    startRadius?: number;
    startOffset?: { x: number; y: number };
    endOffset?: { x: number; y: number };
  }>;
  advancedEffects?: UIAdvancedEffect[];
  /** Gradient fill as CSS-like string — e.g. "linear-gradient(135deg, #F00 0%, #00F 100%)" */
  backgroundGradient?: string;
  backgroundGradientType?: 'linear' | 'radial' | 'angular' | 'diamond';
  backgroundGradientStops?: Array<{ color: string; position: number; opacity?: number }>;
  backgroundGradientTransform?: UITransform;
  backgroundGradientOpacity?: number;
  backgroundGradientBlendMode?: string;
  /** Individual corner radii when not uniform */
  cornerRadii?: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  /** Image fill hash — present when node has an IMAGE type fill */
  imageFillHash?: string;
  /** Image scale mode */
  imageFillScaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  imageFillTransform?: UITransform;
  imageFillScalingFactor?: number;
  imageFillRotation?: number;
  imageFillFilters?: UIImageFilters;
  imageFillOpacity?: number;
  imageFillBlendMode?: string;
  /** Variable/token bindings — e.g. { backgroundColor: "BG/BG Neutral 1" } */
  variables?: Record<string, string>;
}

export type UIAdvancedEffect =
  | {
      type: 'noise';
      noiseType: 'monotone' | 'duotone' | 'multitone';
      color: string;
      colorOpacity?: number;
      secondaryColor?: string;
      secondaryColorOpacity?: number;
      opacity?: number;
      blendMode?: string;
      noiseSize: number;
      density: number;
    }
  | {
      type: 'texture';
      noiseSize: number;
      radius: number;
      clipToShape: boolean;
    }
  | {
      type: 'glass';
      lightIntensity: number;
      lightAngle: number;
      refraction: number;
      depth: number;
      dispersion: number;
      radius: number;
    };

export type UITransform = [[number, number, number], [number, number, number]];

export interface UITextDecorationMeasurement {
  unit: 'px' | 'percent' | 'auto';
  value?: number;
}

export type UITransformModifier = {
  type: 'repeat';
  repeatType: 'linear' | 'radial';
  count: number;
  unitType: 'px' | 'relative';
  offset: number;
  axis?: 'horizontal' | 'vertical';
};

export interface UIPaint {
  type: 'solid' | 'gradient' | 'image' | 'video' | 'pattern' | 'unknown';
  /** Original Figma paint type, e.g. SOLID, GRADIENT_LINEAR, IMAGE */
  sourceType: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: string;
  color?: string;
  variable?: string;
  gradientType?: 'linear' | 'radial' | 'angular' | 'diamond';
  css?: string;
  gradientStops?: Array<{ color: string; position: number; opacity?: number; variable?: string }>;
  transform?: UITransform;
  imageHash?: string;
  videoHash?: string;
  scaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  scalingFactor?: number;
  rotation?: number;
  filters?: UIImageFilters;
  sourceNodeId?: string;
  tileType?: string;
  spacing?: { x: number; y: number };
  horizontalAlignment?: 'start' | 'center' | 'end';
}

export interface UITextStyleRange {
  start: number;
  end: number;
  text: string;
  style: UIStyle;
  hyperlink?: { type: string; value?: string };
  listOptions?: { type?: string; ordered?: boolean };
  listSpacing?: number;
  indentation?: number;
  paragraphIndent?: number;
  paragraphSpacing?: number;
}

export interface UIFidelityWarning {
  code: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
}

export type RenderedFallbackReason =
  | 'text-rendering'
  | 'vector-geometry'
  | 'arc-geometry'
  | 'corner-smoothing'
  | 'shadow-rendering'
  | 'blur-rendering'
  | 'paint-interpolation'
  | 'critical-fidelity-warning'
  | 'context-dependent-effect'
  | 'transform-modifier'
  | 'unsupported-node';

export interface UIImageFilters {
  exposure?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  highlights?: number;
  shadows?: number;
}

export type PromptDetailLevel = 'compact' | 'detailed' | 'full';
export type PromptTemplate = 'component' | 'pixel-perfect';

/**
 * Protocol version for sandbox ↔ UI compatibility.
 * Bump this when the message format changes in a breaking way.
 * UI (remote) checks this against its own version and warns if mismatched.
 */
export const PROTOCOL_VERSION = 1;

/** Message types for sandbox ↔ UI postMessage communication */
export interface ExportResultMessage {
  type: 'export-result';
  protocolVersion: number;
  data: UISerializedNode;
  meta: {
    nodeCount: number;
  };
}

export interface SelectionEmptyMessage {
  type: 'selection-empty';
}

export interface ImageSourceRasterEvidence {
  verified: boolean;
  density?: number;
  method?: 'fill' | 'fit' | 'crop-transform' | 'crop-fallback' | 'tile-scale';
  sourceWidth?: number;
  sourceHeight?: number;
  renderedWidth: number;
  renderedHeight: number;
}

export interface ImageDataMessage {
  type: 'image-data';
  /** Map of nodeId → base64 data URL (e.g. "data:image/png;base64,..."). Empty in merged mode. */
  images: Record<string, string>;
  /** Merged composite image (whole selected node rendered as one image). Only set in merged mode. */
  merged?: string;
  /** Real source-pixel evidence for render-specific Orig exports. This is
   *  measured before exportAsync can create interpolated pixels. */
  sourceRasterEvidence?: Record<string, ImageSourceRasterEvidence>;
  /** Multi-selection merged mode: per-node tiles the UI will composite into a single image.
   *  Sandbox can't render a multi-node selection as one image (no canvas), so it emits
   *  individually exported tiles plus absolute bbox metadata; the UI side assembles. */
  mergedTiles?: {
    tiles: Array<{ dataUrl: string; x: number; y: number; width: number; height: number }>;
    width: number;
    height: number;
    /** Sandbox only knows how to emit Figma-native formats. UI transcodes the
     *  composited result into the user's chosen ImageFormat afterwards. */
    format: SandboxImageFormat;
    scale: number;
  };
}

export interface CaptureReferenceDataMessage {
  type: 'capture-reference-data';
  protocolVersion: number;
  requestId: string;
  rootId: string;
  nodeIds: string[];
  fileKey: string | null;
  sourceUrl: string | null;
  references: Record<string, string>;
  assets: Record<string, string>;
  renderedFallbacks?: Record<string, {
    pngDataUrl?: string;
    svgDataUrl?: string;
    reasons: RenderedFallbackReason[];
  }>;
  warnings: string[];
}

export type SandboxMessage =
  | ExportResultMessage
  | SelectionEmptyMessage
  | ImageDataMessage
  | CaptureReferenceDataMessage;

/** Export mode: per-image splits each image-fill node; merged renders the whole
 *  selection as one composite image; per-selection renders each top-level
 *  selected layer as its own image. */
export type ExportMode = 'per-image' | 'merged' | 'per-selection';

/** User-supplied filename overrides. Key is node id, value is filename without extension.
 *  Empty string means "fall back to auto-generated name". */
export type ImageNameOverrides = Record<string, string>;

export type ImageFormat = 'PNG' | 'JPG' | 'SVG' | 'WEBP' | 'AVIF';

/** Subset of ImageFormat that Figma's exportAsync can produce natively.
 *  UI translates any JPG/WEBP/AVIF target to PNG at the sandbox boundary and
 *  re-encodes client-side (via canvas.toBlob) so we can control quality and
 *  support formats Figma doesn't understand. */
export type SandboxImageFormat = 'PNG' | 'JPG' | 'SVG';

/** Messages sent from UI → Sandbox */
export interface ExportImagesMessage {
  type: 'export-images';
  scale: number;
  /** Always a Figma-native format. UI is responsible for the translation so the
   *  sandbox stays ignorant of WebP / AVIF and of quality knobs. */
  format: SandboxImageFormat;
  mode: ExportMode;
}

export interface ExportCaptureMessage {
  type: 'export-capture';
  requestId: string;
  rootId: string;
  nodeIds: string[];
  includeAssets: boolean;
}

export type UIMessage = ExportImagesMessage | ExportCaptureMessage;
