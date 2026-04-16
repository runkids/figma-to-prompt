export type UINodeType =
  | 'FRAME'
  | 'GROUP'
  | 'TEXT'
  | 'RECTANGLE'
  | 'INSTANCE'
  | 'COMPONENT'
  | 'SECTION'
  | 'COMPONENT_SET'
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
  componentName?: string;
  /** Variant properties — e.g. { State: "Active", Size: "Large" } */
  componentProperties?: Record<string, string>;
  children?: UISerializedNode[];
}

export interface UILayout {
  mode?: 'horizontal' | 'vertical' | 'none';
  width: number;
  height: number;
  x?: number;
  y?: number;
  rotation?: number;
  gap?: number;
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
  backgroundColor?: string;
  color?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
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
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
  }>;
  /** Gradient fill as CSS-like string — e.g. "linear-gradient(135deg, #F00 0%, #00F 100%)" */
  backgroundGradient?: string;
  /** Individual corner radii when not uniform */
  cornerRadii?: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  /** Image fill hash — present when node has an IMAGE type fill */
  imageFillHash?: string;
  /** Image scale mode */
  imageFillScaleMode?: 'fill' | 'fit' | 'crop' | 'tile';
  /** Variable/token bindings — e.g. { backgroundColor: "BG/BG Neutral 1" } */
  variables?: Record<string, string>;
}

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
  /** Map of imageHash → base64 data URL (e.g. "data:image/png;base64,...") */
  images: Record<string, string>;
}

export type SandboxMessage = ExportResultMessage | SelectionEmptyMessage | ImageDataMessage;

/** Messages sent from UI → Sandbox */
export interface ExportImagesMessage {
  type: 'export-images';
  scale: number;
  format: 'PNG' | 'JPG' | 'SVG';
}

export type UIMessage = ExportImagesMessage;
