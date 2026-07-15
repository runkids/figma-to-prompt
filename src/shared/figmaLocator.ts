const MCP_URL_SLUG = 'figma-to-prompt-capture';

/** Figma browser URLs encode node separators as hyphens; API/MCP arguments use colons. */
export function figmaNodeIdToUrlParam(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}

/** Build the canonical `/design/` URL shape accepted by Figma MCP URL parsers. */
export function buildFigmaNodeUrl(
  fileKey: string | null,
  nodeId: string,
  sourceUrl: string | null = null,
): string | null {
  const urlNodeId = figmaNodeIdToUrlParam(nodeId);
  if (fileKey) {
    return `https://www.figma.com/design/${encodeURIComponent(fileKey)}/${MCP_URL_SLUG}?node-id=${encodeURIComponent(urlNodeId)}`;
  }
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    url.searchParams.set('node-id', urlNodeId);
    return url.toString();
  } catch {
    return null;
  }
}
