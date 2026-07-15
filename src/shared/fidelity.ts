import type { RenderedFallbackReason, UISerializedNode } from './types';

export interface RenderedFallbackCandidate {
  nodeId: string;
  reasons: RenderedFallbackReason[];
}

const KNOWN_NODE_TYPES = new Set([
  'FRAME',
  'GROUP',
  'TRANSFORM_GROUP',
  'TEXT',
  'TEXT_PATH',
  'RECTANGLE',
  'INSTANCE',
  'COMPONENT',
  'SECTION',
  'COMPONENT_SET',
  'SLOT',
  'ELLIPSE',
  'LINE',
  'VECTOR',
  'POLYGON',
  'STAR',
  'BOOLEAN_OPERATION',
]);

const VECTOR_NODE_TYPES = new Set([
  'VECTOR',
  'LINE',
  'POLYGON',
  'STAR',
  'BOOLEAN_OPERATION',
  'TEXT_PATH',
]);

function hasContextDependentEffect(node: UISerializedNode): boolean {
  const style = node.style;
  const blendModes = [
    style?.blendMode,
    style?.backgroundGradientBlendMode,
    style?.imageFillBlendMode,
    ...(style?.fills?.map((paint) => paint.blendMode) ?? []),
    ...(style?.strokes?.map((paint) => paint.blendMode) ?? []),
    ...(style?.shadows?.map((shadow) => shadow.blendMode) ?? []),
    ...(style?.advancedEffects?.map((effect) =>
      effect.type === 'noise' ? effect.blendMode : undefined) ?? []),
  ];
  return Boolean(
    style?.isMask ||
      style?.blurEffects?.some((effect) => effect.type === 'background') ||
      blendModes.some((blendMode) =>
        Boolean(blendMode && blendMode !== 'normal' && blendMode !== 'pass-through')),
  );
}

function ownFallbackReasons(node: UISerializedNode): RenderedFallbackReason[] {
  const reasons: RenderedFallbackReason[] = [];
  if (node.type === 'TEXT' || node.type === 'TEXT_PATH') reasons.push('text-rendering');
  if (VECTOR_NODE_TYPES.has(node.type)) reasons.push('vector-geometry');
  if (node.arcData) reasons.push('arc-geometry');
  if (node.style?.cornerSmoothing) reasons.push('corner-smoothing');
  if (node.style?.shadows?.length) reasons.push('shadow-rendering');
  if (node.style?.blurEffects?.some((effect) => effect.type === 'layer')) {
    reasons.push('blur-rendering');
  }
  if (
    node.style?.backgroundGradientType ||
    node.style?.fills?.some((paint) => paint.type === 'gradient') ||
    node.style?.strokes?.some((paint) => paint.type === 'gradient')
  ) {
    reasons.push('paint-interpolation');
  }
  if (node.transformModifiers?.length) reasons.push('transform-modifier');
  if (node.fidelityWarnings?.some((warning) => warning.severity === 'critical')) {
    reasons.push('critical-fidelity-warning');
  }
  if (!KNOWN_NODE_TYPES.has(node.type)) reasons.push('unsupported-node');
  if (hasContextDependentEffect(node)) reasons.push('context-dependent-effect');
  return reasons;
}

export function collectRenderedFallbackCandidates(
  root: UISerializedNode,
): RenderedFallbackCandidate[] {
  const candidates: RenderedFallbackCandidate[] = [];

  function visit(node: UISerializedNode): void {
    if (node.visible === false) return;
    const reasons = ownFallbackReasons(node);
    if (node.children?.some(hasContextDependentEffect)) {
      reasons.push('context-dependent-effect');
    }
    if (reasons.length > 0) {
      candidates.push({ nodeId: node.id, reasons: [...new Set(reasons)] });
      if (reasons.includes('context-dependent-effect')) return;
    }
    node.children?.forEach(visit);
  }

  visit(root);
  return candidates;
}
