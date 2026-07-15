import type { UISerializedNode } from './types';
import type { VisualDiffRegion } from './visualDiff';

export interface DiffRegionNode {
  nodeId: string;
  name: string;
  type: string;
  overlapRatio: number;
}

export interface AttributedDiffRegion extends VisualDiffRegion {
  nodes: DiffRegionNode[];
}

interface NodeBounds {
  node: UISerializedNode;
  depth: number;
  path: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

function collectNodeBounds(root: UISerializedNode): NodeBounds[] {
  const result: NodeBounds[] = [];

  function visit(
    node: UISerializedNode,
    parentX: number,
    parentY: number,
    depth: number,
    path: string[],
  ): void {
    if (node.visible === false) return;
    const layout = node.layout;
    const nodeX = depth === 0 ? 0 : parentX + (layout?.x ?? 0);
    const nodeY = depth === 0 ? 0 : parentY + (layout?.y ?? 0);
    const nodePath = [...path, node.id];
    if (layout) {
      const bounds = layout.renderBounds;
      result.push({
        node,
        depth,
        path: nodePath,
        x: nodeX + (bounds?.x ?? 0),
        y: nodeY + (bounds?.y ?? 0),
        width: bounds?.width ?? layout.width,
        height: bounds?.height ?? layout.height,
      });
    }
    node.children?.forEach((child) => visit(child, nodeX, nodeY, depth + 1, nodePath));
  }

  visit(root, 0, 0, 0, []);
  return result;
}

function isDescendant(candidate: NodeBounds, ancestor: NodeBounds): boolean {
  return candidate.path.length > ancestor.path.length
    && ancestor.path.every((id, index) => candidate.path[index] === id);
}

export function attributeDiffRegions(
  root: UISerializedNode,
  regions: VisualDiffRegion[],
): AttributedDiffRegion[] {
  const bounds = collectNodeBounds(root);
  return regions.map((region) => {
    const regionArea = region.width * region.height;
    const overlapping = bounds.flatMap((entry) => {
      const width = Math.max(0, Math.min(region.x + region.width, entry.x + entry.width) - Math.max(region.x, entry.x));
      const height = Math.max(0, Math.min(region.y + region.height, entry.y + entry.height) - Math.max(region.y, entry.y));
      const area = width * height;
      return area > 0 ? [{ entry, overlapRatio: area / regionArea }] : [];
    });
    const deepest = overlapping.filter(({ entry }) =>
      !overlapping.some(({ entry: other }) => isDescendant(other, entry)));
    deepest.sort((left, right) =>
      right.overlapRatio - left.overlapRatio
      || right.entry.depth - left.entry.depth
      || left.entry.node.id.localeCompare(right.entry.node.id));

    return {
      ...region,
      nodes: deepest.slice(0, 5).map(({ entry, overlapRatio }) => ({
        nodeId: entry.node.id,
        name: entry.node.name,
        type: entry.node.type,
        overlapRatio,
      })),
    };
  });
}
