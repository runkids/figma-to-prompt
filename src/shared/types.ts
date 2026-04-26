export type UINodeType =
  | 'FRAME'
  | 'GROUP'
  | 'TEXT'
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
  /** SVG-compatible vector path data when Figma exposes it for vector-like nodes */
  vectorPaths?: UIVectorPath[];
  fillGeometry?: UIVectorPath[];
  strokeGeometry?: UIVectorPath[];
  /** Node-level caveats for Figma features that need special handling downstream */
  fidelityWarnings?: UIFidelityWarning[];
  children?: UISerializedNode[];
}

export interface UIVectorPath {
  windingRule: 'NONZERO' | 'EVENODD' | 'NONE';
  data: string;
}

export interface UILayout {
  mode?: 'horizontal' | 'vertical' | 'none';
  width: number;
  height: number;
  x?: number;
  y?: number;
  rotation?: number;
  constraints?: {
    horizontal: 'min' | 'center' | 'max' | 'stretch' | 'scale';
    vertical: 'min' | 'center' | 'max' | 'stretch' | 'scale';
  };
  targetAspectRatio?: { x: number; y: number };
  layoutPositioning?: 'auto' | 'absolute';
  layoutAlign?: 'min' | 'center' | 'max' | 'stretch' | 'inherit';
  layoutGrow?: number;
  gap?: number;
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
  overflow?: 'hidden';
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
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  letterSpacingUnit?: 'px' | 'percent';
  textAlign?: 'left' | 'center' | 'right' | 'justified';
  textDecoration?: 'underline' | 'strikethrough';
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

export type UITransform = [[number, number, number], [number, number, number]];

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

export interface ImageDataMessage {
  type: 'image-data';
  /** Map of nodeId → base64 data URL (e.g. "data:image/png;base64,..."). Empty in merged mode. */
  images: Record<string, string>;
  /** Merged composite image (whole selected node rendered as one image). Only set in merged mode. */
  merged?: string;
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

export type SandboxMessage = ExportResultMessage | SelectionEmptyMessage | ImageDataMessage;

/** Export mode: per-image splits each image-fill node; merged renders the whole selection as one composite image */
export type ExportMode = 'per-image' | 'merged';

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

export type UIMessage = ExportImagesMessage;
