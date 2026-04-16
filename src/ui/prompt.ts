import type { UISerializedNode, ImageNameOverrides } from '../shared/types';

/** Sanitize user-supplied filename fragments to the same character class used by auto-naming */
function sanitizeFileName(s: string): string {
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
        const key = `${s.backgroundColor}|bg`;
        if (!colors.has(key)) {
          colors.set(key, {
            hex: s.backgroundColor,
            variable: s.variables?.backgroundColor,
            styleName: s.fillStyleName,
            usage: 'background',
          });
        }
      }
      if (s.color) {
        const key = `${s.color}|text`;
        if (!colors.has(key)) {
          colors.set(key, {
            hex: s.color,
            variable: s.variables?.color,
            styleName: s.fillStyleName,
            usage: 'text',
          });
        }
      }
      if (s.borderColor) {
        const key = `${s.borderColor}|border`;
        if (!colors.has(key)) {
          colors.set(key, {
            hex: s.borderColor,
            variable: s.variables?.borderColor,
            styleName: s.strokeStyleName,
            usage: 'border',
          });
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
          const key = `${sh.type}|${sh.color}|${sh.offsetX}|${sh.offsetY}|${sh.blur}|${sh.spread}`;
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

// ── Image Assets ─────────────────────────────────────────

export interface ImageAsset {
  hash: string;
  nodeId: string;
  fileName: string;
  nodeName: string;
  width: number;
  height: number;
  scaleMode?: string;
}

export function collectImageAssets(
  node: UISerializedNode,
  overrides?: ImageNameOverrides,
): ImageAsset[] {
  const assets = new Map<string, ImageAsset>();

  function walk(n: UISerializedNode, parentName?: string): void {
    if (n.visible === false) return;
    if (n.style?.imageFillHash && !assets.has(n.style.imageFillHash)) {
      // User override takes precedence; fall back to "Parent_Child" auto-naming
      const override = overrides?.[n.id]?.trim();
      const safeName = override
        ? sanitizeFileName(override)
        : sanitizeFileName(parentName && parentName !== n.name ? `${parentName}_${n.name}` : n.name);
      assets.set(n.style.imageFillHash, {
        hash: n.style.imageFillHash,
        nodeId: n.id,
        fileName: `${safeName}.png`,
        nodeName: n.name,
        width: Math.round(n.layout?.width ?? 0),
        height: Math.round(n.layout?.height ?? 0),
        scaleMode: n.style.imageFillScaleMode,
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

// ── Prompt Formatting Helpers ─────────────────────────────

function formatColorLine(c: ColorEntry): string {
  let line = `- \`${c.hex}\``;
  if (c.variable) {
    line += ` → \`var(--${toCssVar(c.variable)})\``;
  } else if (c.styleName) {
    line += ` → style "${c.styleName}"`;
  }
  line += ` (${c.usage})`;
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

// ── Main Prompt Builder ───────────────────────────────────

export interface BuildPromptOptions {
  /** Per-node filename overrides applied to the Assets section */
  imageNameOverrides?: ImageNameOverrides;
  /** Merged composite reference — shown as a single whole-frame asset line */
  merged?: { name: string; width: number; height: number };
}

/**
 * Generates a structured prompt from a UISerializedNode tree,
 * designed to let an AI reproduce the component at 99% fidelity.
 */
export function buildPrompt(node: UISerializedNode, options?: BuildPromptOptions): string {
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
- \`layout.mode\`: horizontal → flex row, vertical → flex column
- \`layout.sizing\`: hug → auto, fill → 100%/flex:1, fixed → explicit px
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
      tokenParts.push(`- ${sh.type}-shadow: ${sh.offsetX}px ${sh.offsetY}px ${sh.blur}px ${sh.spread}px ${sh.color}`);
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

  // Image Assets
  const imageAssets = collectImageAssets(node, options?.imageNameOverrides);
  const merged = options?.merged;
  if (imageAssets.length > 0 || merged) {
    const assetLines: string[] = [];
    if (merged) {
      const mergedSafe = sanitizeFileName(merged.name);
      assetLines.push(
        `- \`${mergedSafe}.png\` → whole composite (${merged.width}×${merged.height}) — use as visual reference for the entire frame`,
      );
    }
    for (const a of imageAssets) {
      let line = `- \`${a.fileName}\` → ${a.nodeName} (${a.width}×${a.height}`;
      if (a.scaleMode) line += `, ${a.scaleMode}`;
      line += ')';
      assetLines.push(line);
    }
    sections.push(`## Assets\nImage files included with this spec — use as \`<img>\` or CSS \`background-image\`:\n${assetLines.join('\n')}`);
  }

  // Component Structure (replaces separate Node Tree + Full JSON)
  sections.push(`## Component Structure\n\`\`\`\n${details}\n\`\`\``);

  return sections.join('\n\n') + '\n';
}
