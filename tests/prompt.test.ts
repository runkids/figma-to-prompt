import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  countNodes,
  collectTokens,
  collectComponentDeps,
  buildTreeOutline,
  buildNodeDetails,
  collectImageAssets,
  buildGeometryChecklist,
  buildFidelityRiskSummary,
  buildFidelityWarningsSection,
} from '../src/ui/prompt';
import type { UISerializedNode } from '../src/shared/types';

const sampleNode: UISerializedNode = {
  id: '1',
  name: 'Login Card',
  type: 'FRAME',
  layout: { mode: 'vertical', width: 360, height: 240, gap: 16 },
  style: { backgroundColor: '#FFFFFF', borderRadius: 16 },
  children: [
    {
      id: '2',
      name: 'Title',
      type: 'TEXT',
      text: 'Welcome back',
      layout: { width: 312, height: 32 },
      style: { fontFamily: 'Inter', fontSize: 24, fontWeight: 700, color: '#111827' },
    },
  ],
};

const richNode: UISerializedNode = {
  id: '10',
  name: 'Card',
  type: 'COMPONENT',
  layout: { mode: 'vertical', width: 400, height: 300, gap: 12, sizing: { horizontal: 'fill', vertical: 'hug' } },
  style: {
    backgroundColor: '#F9FAFB',
    fillStyleName: 'BG/Surface',
    borderRadius: 8,
    variables: { backgroundColor: 'BG/Surface' },
  },
  children: [
    {
      id: '11',
      name: 'Heading',
      type: 'TEXT',
      text: 'Dashboard',
      layout: { width: 376, height: 28 },
      style: {
        fontFamily: 'Inter',
        fontSize: 20,
        fontWeight: 600,
        lineHeight: 28,
        color: '#111827',
        textStyleName: 'Heading/H3',
        variables: { color: 'Text/Primary' },
      },
    },
    {
      id: '12',
      name: 'Submit',
      type: 'INSTANCE',
      componentName: 'Button/Primary',
      layout: { width: 120, height: 40 },
      style: { backgroundColor: '#2563EB', variables: { backgroundColor: 'Brand/Primary' } },
    },
    {
      id: '13',
      name: 'Icon',
      type: 'INSTANCE',
      componentName: 'Icon/Arrow',
      layout: { width: 24, height: 24 },
      style: {},
    },
  ],
};

describe('countNodes', () => {
  it('counts root + children', () => {
    expect(countNodes(sampleNode)).toBe(2);
  });

  it('counts single node', () => {
    expect(countNodes({ id: '1', name: 'Solo', type: 'TEXT', layout: { width: 10, height: 10 } })).toBe(1);
  });
});

describe('collectTokens', () => {
  it('collects unique colors with variables', () => {
    const tokens = collectTokens(richNode);
    expect(tokens.colors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hex: '#F9FAFB', variable: 'BG/Surface', usage: 'background' }),
        expect.objectContaining({ hex: '#111827', variable: 'Text/Primary', usage: 'text' }),
        expect.objectContaining({ hex: '#2563EB', variable: 'Brand/Primary', usage: 'background' }),
      ]),
    );
  });

  it('collects typography with style names', () => {
    const tokens = collectTokens(richNode);
    expect(tokens.typography).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ styleName: 'Heading/H3', fontFamily: 'Inter', fontSize: 20 }),
      ]),
    );
  });

  it('collects spacing and border radii', () => {
    const tokens = collectTokens(richNode);
    expect(tokens.spacingValues).toContain(12);
    expect(tokens.borderRadii).toContain(8);
  });

  it('deduplicates identical colors', () => {
    const node: UISerializedNode = {
      id: '1', name: 'Wrapper', type: 'FRAME',
      layout: { width: 100, height: 100 },
      style: { backgroundColor: '#FFF' },
      children: [
        { id: '2', name: 'A', type: 'RECTANGLE', layout: { width: 50, height: 50 }, style: { backgroundColor: '#FFF' } },
      ],
    };
    const tokens = collectTokens(node);
    const bgTokens = tokens.colors.filter((c) => c.hex === '#FFF' && c.usage === 'background');
    expect(bgTokens).toHaveLength(1);
  });

  it('collects additional colors from full paint stacks', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Layered',
      type: 'RECTANGLE',
      layout: { width: 100, height: 100 },
      style: {
        fills: [
          { type: 'solid', sourceType: 'SOLID', color: '#FFFFFF' },
          { type: 'solid', sourceType: 'SOLID', color: '#FF0000', opacity: 0.4, variable: 'Brand/Overlay' },
          { type: 'gradient', sourceType: 'GRADIENT_LINEAR', css: 'linear-gradient(#000000 0%, #FFFFFF 100%)' },
        ],
      },
    };
    const tokens = collectTokens(node);
    expect(tokens.colors).toEqual(expect.arrayContaining([
      expect.objectContaining({ hex: '#FFFFFF', usage: 'background' }),
      expect.objectContaining({ hex: '#FF0000', opacity: 0.4, variable: 'Brand/Overlay', usage: 'background' }),
    ]));
    expect(tokens.gradients).toContain('linear-gradient(#000000 0%, #FFFFFF 100%)');
  });
});

describe('collectComponentDeps', () => {
  it('collects unique INSTANCE componentNames sorted', () => {
    const deps = collectComponentDeps(richNode);
    expect(deps).toEqual(['Button/Primary', 'Icon/Arrow']);
  });

  it('returns empty array when no instances', () => {
    const deps = collectComponentDeps(sampleNode);
    expect(deps).toEqual([]);
  });
});

describe('buildTreeOutline', () => {
  it('renders root without prefix', () => {
    const tree = buildTreeOutline(sampleNode);
    expect(tree).toMatch(/^Login Card \(FRAME, vertical\)/);
  });

  it('renders children with connectors', () => {
    const tree = buildTreeOutline(sampleNode);
    expect(tree).toContain('└── Title (TEXT) "Welcome back"');
  });

  it('shows INSTANCE componentName', () => {
    const tree = buildTreeOutline(richNode);
    expect(tree).toContain('(INSTANCE → Button/Primary)');
  });

  it('shows sizing info', () => {
    const tree = buildTreeOutline(richNode);
    expect(tree).toContain('fill×hug');
  });
});

describe('buildPrompt', () => {
  it('includes component name in header', () => {
    const prompt = buildPrompt(sampleNode);
    expect(prompt).toContain('# Component: Login Card');
  });

  it('includes 99% fidelity guideline', () => {
    const prompt = buildPrompt(sampleNode);
    expect(prompt).toContain('99% fidelity');
    expect(prompt).toContain('semantic HTML');
  });

  it('includes design tokens section with colors', () => {
    const prompt = buildPrompt(richNode);
    expect(prompt).toContain('## Design Tokens');
    expect(prompt).toContain('`#F9FAFB`');
    expect(prompt).toContain('var(--BG-Surface)');
  });

  it('includes typography with style name', () => {
    const prompt = buildPrompt(richNode);
    expect(prompt).toContain('"Heading/H3"');
    expect(prompt).toContain('Inter 600 20px/28px');
  });

  it('includes component dependencies', () => {
    const prompt = buildPrompt(richNode);
    expect(prompt).toContain('## Component Dependencies');
    expect(prompt).toContain('`Button/Primary`');
    expect(prompt).toContain('`Icon/Arrow`');
  });

  it('includes component structure as single-line JSON', () => {
    const prompt = buildPrompt(richNode);
    expect(prompt).toContain('## Component Structure');
    // The JSON is inside a code block and contains node data
    expect(prompt).toContain('"name":"Card"');
    expect(prompt).toContain('"type":"COMPONENT"');
    expect(prompt).toContain('"componentName":"Button/Primary"');
  });

  it('includes JSON-based guidelines', () => {
    const prompt = buildPrompt(sampleNode);
    expect(prompt).toContain('JSON spec below');
    expect(prompt).toContain('layout.mode');
    expect(prompt).toContain('layout.sizing');
    expect(prompt).toContain('layout.layoutPositioning');
    expect(prompt).toContain('paint order');
    expect(prompt).toContain('style.fills');
    expect(prompt).toContain('textStyleRanges');
  });

  it('omits dependencies section when no instances', () => {
    const prompt = buildPrompt(sampleNode);
    expect(prompt).not.toContain('## Component Dependencies');
  });

  it('includes geometry and verification sections', () => {
    const prompt = buildPrompt(sampleNode);
    expect(prompt).toContain('## Geometry Checklist');
    expect(prompt).toContain('## Implementation Checks');
    expect(prompt).toContain('box-sizing: border-box');
    expect(prompt).toContain('vectorPaths');
  });

  it('includes fidelity risk summary for complex trees', () => {
    const node: UISerializedNode = {
      id: 'root',
      name: 'Complex',
      type: 'FRAME',
      layout: { width: 100, height: 100, mode: 'none', overflow: 'hidden' },
      children: [
        {
          id: 'photo',
          name: 'Photo',
          type: 'RECTANGLE',
          layout: { width: 120, height: 120, x: -10, y: -10, mode: 'none', layoutPositioning: 'absolute' },
          style: { imageFillHash: 'same', imageFillScaleMode: 'crop', imageFillTransform: [[1, 0, 0], [0, 1, 0]] },
        },
        {
          id: 'vector',
          name: 'Vector',
          type: 'VECTOR',
          layout: { width: 16, height: 16, x: 10, y: 10, mode: 'none' },
          style: {
            borderColor: '#000000',
            borderWidth: 1,
            strokeDashPattern: [2, 2],
            blendMode: 'multiply',
            isMask: true,
            blurEffects: [{ type: 'background', radius: 12, blurType: 'normal' }],
          },
        },
      ],
    };

    const summary = buildFidelityRiskSummary(node);
    expect(summary).toContain('## Fidelity Risk Summary');
    expect(summary).toContain('Estimated risk: high');
    expect(summary).toContain('absolute-positioned auto-layout children');
    expect(summary).toContain('boxes extend outside the root viewport');
    expect(summary).toContain('image fills with crop/filter/opacity metadata');
    expect(summary).toContain('vector-like nodes without path geometry');
    expect(summary).toContain('nodes with detailed stroke metadata');
    expect(summary).toContain('blur effect nodes');
    expect(summary).toContain('nodes with layer blend mode');
    expect(summary).toContain('mask nodes');
    expect(buildPrompt(node)).toContain('## Fidelity Risk Summary');
  });

  it('includes fidelity warnings when extracted JSON marks precision risks', () => {
    const node: UISerializedNode = {
      id: 'root',
      name: 'Root',
      type: 'FRAME',
      layout: { width: 100, height: 100, mode: 'none' },
      children: [
        {
          id: 'text',
          name: 'Label',
          type: 'TEXT',
          text: 'Hello',
          layout: { width: 50, height: 20 },
          fidelityWarnings: [
            {
              code: 'mixed-text-styles',
              severity: 'warning',
              message: '2 text style ranges detected; use textStyleRanges for per-character styling instead of only node-level style.',
            },
          ],
        },
      ],
    };

    const section = buildFidelityWarningsSection(node);
    expect(section).toContain('## Fidelity Warnings');
    expect(section).toContain('Root > Label');
    expect(section).toContain('mixed-text-styles');
    expect(buildPrompt(node)).toContain('## Fidelity Warnings');
  });

  it('supports compact prompt detail by omitting helper sections', () => {
    const prompt = buildPrompt(sampleNode, { promptDetail: 'compact' });
    expect(prompt).not.toContain('## Geometry Checklist');
    expect(prompt).not.toContain('## Implementation Checks');
    expect(prompt).not.toContain('## Tree Outline');
    expect(prompt).toContain('## Component Structure');
  });

  it('supports full prompt detail with full geometry and tree outline', () => {
    const node: UISerializedNode = {
      id: 'root',
      name: 'Root',
      type: 'FRAME',
      layout: { width: 100, height: 100, mode: 'none' },
      children: Array.from({ length: 6 }, (_, i) => ({
        id: `child-${i}`,
        name: `Child ${i}`,
        type: 'RECTANGLE' as const,
        layout: { width: 10, height: 10, x: i * 10, y: i * 10, mode: 'none' as const },
      })),
    };
    const prompt = buildPrompt(node, { promptDetail: 'full' });
    expect(prompt).toContain('## Tree Outline');
    expect(prompt).not.toContain('Large tree: showing');
    expect(prompt).toContain('Root > Child 5 [RECTANGLE]');
  });
});

describe('buildGeometryChecklist', () => {
  it('normalizes root canvas position and accumulates child offsets', () => {
    const node: UISerializedNode = {
      id: 'screen',
      name: 'Screen',
      type: 'FRAME',
      layout: { width: 360, height: 800, x: 100, y: 56, mode: 'none' },
      children: [
        {
          id: 'card',
          name: 'Card',
          type: 'FRAME',
          layout: { width: 344, height: 268, x: 8, y: 56, mode: 'vertical' },
          children: [
            {
              id: 'input',
              name: 'Input',
              type: 'FRAME',
              layout: { width: 312, height: 44, x: 16, y: 16, mode: 'none' },
            },
          ],
        },
      ],
    };

    const checklist = buildGeometryChecklist(node);
    expect(checklist).toContain('Root `layout.x/y` is the Figma canvas position');
    expect(checklist).toContain('Screen [FRAME]: left 0, top 0, width 360, height 800');
    expect(checklist).toContain('Screen > Card [FRAME]: left 8, top 56, width 344, height 268');
    expect(checklist).toContain('Screen > Card > Input [FRAME]: left 24, top 72, width 312, height 44');
  });

  it('marks absolute auto-layout children in the checklist', () => {
    const node: UISerializedNode = {
      id: 'card',
      name: 'Card',
      type: 'FRAME',
      layout: { width: 328, height: 215, x: 16, y: 263, mode: 'vertical' },
      children: [
        {
          id: 'art',
          name: 'image',
          type: 'FRAME',
          layout: { width: 122, height: 85, x: 206, y: -25, mode: 'none', layoutPositioning: 'absolute' },
        },
      ],
    };

    const checklist = buildGeometryChecklist(node);
    expect(checklist).toContain('Card > image [FRAME]: left 206, top -25, width 122, height 85, positioning absolute');
  });

  it('prioritizes high-risk geometry when the checklist is capped', () => {
    const node: UISerializedNode = {
      id: 'root',
      name: 'Root',
      type: 'FRAME',
      layout: { width: 400, height: 400, mode: 'none' },
      children: [
        {
          id: 'background',
          name: 'Background',
          type: 'RECTANGLE',
          layout: { width: 400, height: 400, mode: 'none' },
          style: { backgroundColor: '#FFFFFF' },
        },
        {
          id: 'card',
          name: 'Card',
          type: 'FRAME',
          layout: { width: 200, height: 200, x: 100, y: 100, mode: 'vertical', overflow: 'hidden' },
          children: [
            {
              id: 'decor',
              name: 'Decor',
              type: 'RECTANGLE',
              layout: { width: 40, height: 40, x: 140, y: -20, mode: 'none', layoutPositioning: 'absolute' },
              style: { imageFillHash: 'decor', imageFillScaleMode: 'crop' },
            },
            {
              id: 'label',
              name: 'Label',
              type: 'TEXT',
              text: 'Label',
              layout: { width: 40, height: 20, x: 16, y: 16, mode: 'none' },
            },
          ],
        },
      ],
    };

    const checklist = buildGeometryChecklist(node, 4);
    expect(checklist).toContain('Large tree: showing 4 priority boxes out of 5');
    expect(checklist).toContain('Root [FRAME]');
    expect(checklist).toContain('Root > Background [RECTANGLE]');
    expect(checklist).toContain('Root > Card [FRAME]');
    expect(checklist).toContain('Root > Card > Decor [RECTANGLE]');
    expect(checklist).not.toContain('Root > Card > Label [TEXT]');
  });
});

describe('buildNodeDetails', () => {
  it('returns valid single-line JSON', () => {
    const details = buildNodeDetails(sampleNode);
    const parsed = JSON.parse(details);
    expect(parsed.name).toBe('Login Card');
    expect(parsed.type).toBe('FRAME');
  });

  it('preserves all node data', () => {
    const details = buildNodeDetails(richNode);
    const parsed = JSON.parse(details);
    expect(parsed.style.backgroundColor).toBe('#F9FAFB');
    expect(parsed.layout.gap).toBe(12);
    expect(parsed.children).toHaveLength(3);
    expect(parsed.children[0].style.fontFamily).toBe('Inter');
  });

  it('includes component names and variant properties', () => {
    const details = buildNodeDetails(richNode);
    const parsed = JSON.parse(details);
    expect(parsed.children[1].componentName).toBe('Button/Primary');
    expect(parsed.children[2].componentName).toBe('Icon/Arrow');
  });

  it('preserves vector path data', () => {
    const node: UISerializedNode = {
      id: '1',
      name: 'Icon',
      type: 'VECTOR',
      layout: { width: 24, height: 24 },
      vectorPaths: [{ windingRule: 'NONZERO', data: 'M 7 4 L 17 12 L 7 20 Z' }],
    };
    const parsed = JSON.parse(buildNodeDetails(node));
    expect(parsed.vectorPaths).toEqual([{ windingRule: 'NONZERO', data: 'M 7 4 L 17 12 L 7 20 Z' }]);
  });

  it('is a single line (no newlines)', () => {
    const details = buildNodeDetails(richNode);
    expect(details).not.toContain('\n');
  });
});

describe('collectTokens gradients', () => {
  it('collects gradient tokens', () => {
    const node: UISerializedNode = {
      id: '1', name: 'Gradient Box', type: 'FRAME',
      layout: { width: 200, height: 200 },
      style: { backgroundGradient: 'linear-gradient(#FF0000 0%, #0000FF 100%)' },
    };
    const tokens = collectTokens(node);
    expect(tokens.gradients).toContain('linear-gradient(#FF0000 0%, #0000FF 100%)');
  });

  it('returns empty gradients when none present', () => {
    const tokens = collectTokens(sampleNode);
    expect(tokens.gradients).toEqual([]);
  });
});

describe('visible:false filtering', () => {
  const nodeWithHidden: UISerializedNode = {
    id: '1', name: 'Container', type: 'FRAME',
    layout: { width: 200, height: 100, mode: 'horizontal' },
    children: [
      {
        id: '2', name: 'Visible', type: 'TEXT', text: 'Hello',
        layout: { width: 50, height: 20 },
        style: { color: '#000000' },
      },
      {
        id: '3', name: 'Hidden', type: 'INSTANCE', visible: false,
        componentName: 'Icon/Close',
        layout: { width: 16, height: 16 },
        style: { backgroundColor: '#FF0000' },
      },
    ],
  };

  it('collectTokens skips visible:false node colors', () => {
    const tokens = collectTokens(nodeWithHidden);
    const bgColors = tokens.colors.filter((c) => c.hex === '#FF0000');
    expect(bgColors).toHaveLength(0);
  });

  it('collectComponentDeps skips visible:false instances', () => {
    const deps = collectComponentDeps(nodeWithHidden);
    expect(deps).not.toContain('Icon/Close');
  });
});

describe('image assets', () => {
  const nodeWithImage: UISerializedNode = {
    id: '1', name: 'Hero Section', type: 'FRAME',
    layout: { width: 1200, height: 400, mode: 'vertical' },
    style: {},
    children: [
      {
        id: '2', name: 'Hero Background', type: 'RECTANGLE',
        layout: { width: 1200, height: 400 },
        style: { imageFillHash: 'abc123', imageFillScaleMode: 'fill' },
      },
      {
        id: '3', name: 'Profile/Avatar', type: 'ELLIPSE',
        layout: { width: 48, height: 48 },
        style: { imageFillHash: 'def456', imageFillScaleMode: 'fit' },
      },
      {
        id: '4', name: 'Title', type: 'TEXT', text: 'Welcome',
        layout: { width: 200, height: 32 },
        style: { fontFamily: 'Inter', fontSize: 24, color: '#000000' },
      },
    ],
  };

  describe('collectImageAssets', () => {
    it('collects image assets with parent-context naming', () => {
      const assets = collectImageAssets(nodeWithImage);
      expect(assets).toHaveLength(2);
      expect(assets[0]).toEqual(expect.objectContaining({
        hash: 'abc123',
        fileName: 'Hero_Section_Hero_Background.png',
        nodeName: 'Hero Background',
        width: 1200,
        height: 400,
        scaleMode: 'fill',
      }));
      expect(assets[1]).toEqual(expect.objectContaining({
        fileName: 'Hero_Section_Profile_Avatar.png',
      }));
    });

    it('deduplicates by image hash', () => {
      const node: UISerializedNode = {
        id: '1', name: 'Wrapper', type: 'FRAME',
        layout: { width: 100, height: 100 },
        children: [
          { id: '2', name: 'A', type: 'RECTANGLE', layout: { width: 50, height: 50 }, style: { imageFillHash: 'same' } },
          { id: '3', name: 'B', type: 'RECTANGLE', layout: { width: 50, height: 50 }, style: { imageFillHash: 'same' } },
        ],
      };
      expect(collectImageAssets(node)).toHaveLength(1);
    });

    it('does not deduplicate the same image hash when rendered paint metadata differs', () => {
      const node: UISerializedNode = {
        id: '1', name: 'Wrapper', type: 'FRAME',
        layout: { width: 100, height: 100 },
        children: [
          {
            id: '2',
            name: 'A',
            type: 'RECTANGLE',
            layout: { width: 50, height: 50 },
            style: { imageFillHash: 'same', imageFillScaleMode: 'crop', imageFillTransform: [[1, 0, 0], [0, 1, 0]] },
          },
          {
            id: '3',
            name: 'B',
            type: 'RECTANGLE',
            layout: { width: 50, height: 50 },
            style: { imageFillHash: 'same', imageFillScaleMode: 'crop', imageFillTransform: [[0.5, 0, 0.25], [0, 0.5, 0.1]] },
          },
        ],
      };
      const assets = collectImageAssets(node);
      expect(assets).toHaveLength(2);
      expect(assets.map((a) => a.nodeId)).toEqual(['2', '3']);
    });

    it('returns empty array when no images', () => {
      expect(collectImageAssets(sampleNode)).toHaveLength(0);
    });

    it('skips visible:false nodes', () => {
      const node: UISerializedNode = {
        id: '1', name: 'Wrapper', type: 'FRAME',
        layout: { width: 100, height: 100 },
        children: [
          { id: '2', name: 'Hidden', type: 'RECTANGLE', visible: false, layout: { width: 50, height: 50 }, style: { imageFillHash: 'hidden1' } },
        ],
      };
      expect(collectImageAssets(node)).toHaveLength(0);
    });

    it('disambiguates duplicate fileNames with index suffix', () => {
      const node: UISerializedNode = {
        id: '1', name: 'Row', type: 'FRAME',
        layout: { width: 200, height: 50 },
        children: [
          { id: '2', name: 'Object', type: 'RECTANGLE', layout: { width: 24, height: 24 }, style: { imageFillHash: 'h1' } },
          { id: '3', name: 'Object', type: 'RECTANGLE', layout: { width: 24, height: 24 }, style: { imageFillHash: 'h2' } },
          { id: '4', name: 'Object', type: 'RECTANGLE', layout: { width: 24, height: 24 }, style: { imageFillHash: 'h3' } },
        ],
      };
      const assets = collectImageAssets(node);
      expect(assets).toHaveLength(3);
      const names = assets.map((a) => a.fileName);
      expect(names[0]).toBe('Row_Object_1.png');
      expect(names[1]).toBe('Row_Object_2.png');
      expect(names[2]).toBe('Row_Object_3.png');
    });

    it('applies filename overrides from user input', () => {
      const assets = collectImageAssets(nodeWithImage, { '2': 'hero_bg' });
      expect(assets[0].fileName).toBe('hero_bg.png');
      // Non-overridden node keeps auto naming
      expect(assets[1].fileName).toBe('Hero_Section_Profile_Avatar.png');
    });

    it('resolves override collisions with _N suffix', () => {
      const assets = collectImageAssets(nodeWithImage, { '2': 'dup', '3': 'dup' });
      expect(assets.map((a) => a.fileName)).toEqual(['dup_1.png', 'dup_2.png']);
    });

    it('sanitizes invalid chars in overrides', () => {
      const assets = collectImageAssets(nodeWithImage, { '2': 'my image!' });
      expect(assets[0].fileName).toBe('my_image_.png');
    });

    it('empty string override falls back to auto name', () => {
      const assets = collectImageAssets(nodeWithImage, { '2': '' });
      expect(assets[0].fileName).toBe('Hero_Section_Hero_Background.png');
    });

    it('includes image paint metadata used for crop and filter fidelity', () => {
      const node: UISerializedNode = {
        id: '1', name: 'Wrapper', type: 'FRAME',
        layout: { width: 100, height: 100 },
        children: [
          {
            id: '2',
            name: 'Photo',
            type: 'RECTANGLE',
            layout: { width: 50, height: 50 },
            style: {
              imageFillHash: 'photo',
              imageFillScaleMode: 'crop',
              imageFillTransform: [[0.5, 0, 0.25], [0, 0.5, 0.1]],
              imageFillRotation: 90,
              imageFillFilters: { exposure: 0.2 },
              imageFillOpacity: 0.8,
            },
          },
        ],
      };
      expect(collectImageAssets(node)[0]).toEqual(expect.objectContaining({
        scaleMode: 'crop',
        transform: [[0.5, 0, 0.25], [0, 0.5, 0.1]],
        rotation: 90,
        filters: { exposure: 0.2 },
        opacity: 0.8,
      }));
    });
  });

  describe('buildPrompt with images', () => {
    it('includes Assets section when images present', () => {
      const prompt = buildPrompt(nodeWithImage);
      expect(prompt).toContain('## Assets');
      expect(prompt).toContain('`Hero_Section_Hero_Background.png`');
      expect(prompt).toContain('1200×400, fill');
      expect(prompt).toContain('`Hero_Section_Profile_Avatar.png`');
    });

    it('omits Assets section when no images', () => {
      const prompt = buildPrompt(sampleNode);
      expect(prompt).not.toContain('## Assets');
    });

    it('reflects filename overrides in Assets section', () => {
      const prompt = buildPrompt(nodeWithImage, { imageNameOverrides: { '2': 'hero_bg' } });
      expect(prompt).toContain('`hero_bg.png`');
      expect(prompt).not.toContain('`Hero_Section_Hero_Background.png`');
    });

    it('reflects image paint metadata in Assets section', () => {
      const node: UISerializedNode = {
        id: '1', name: 'Wrapper', type: 'FRAME',
        layout: { width: 100, height: 100 },
        children: [
          {
            id: '2',
            name: 'Photo',
            type: 'RECTANGLE',
            layout: { width: 50, height: 50 },
            style: {
              imageFillHash: 'photo',
              imageFillScaleMode: 'crop',
              imageFillTransform: [[0.5, 0, 0.25], [0, 0.5, 0.1]],
              imageFillFilters: { exposure: 0.2 },
              imageFillOpacity: 0.8,
            },
          },
        ],
      };
      const prompt = buildPrompt(node);
      expect(prompt).toContain('crop, opacity 0.8');
      expect(prompt).toContain('transform [[0.5,0,0.25],[0,0.5,0.1]]');
      expect(prompt).toContain('filters {"exposure":0.2}');
    });

    it('in merged mode only lists composite, omits per-image fills to avoid misleading the AI', () => {
      const prompt = buildPrompt(nodeWithImage, {
        merged: { name: 'hero_frame', width: 1200, height: 800 },
      });
      expect(prompt).toContain('`hero_frame.png` → whole composite (1200×800)');
      // Individual per-image fills must NOT appear — those files are not attached in merged mode
      expect(prompt).not.toContain('Hero_Section_Hero_Background.png');
      expect(prompt).not.toContain('Hero_Section_Profile_Avatar.png');
      // Header should explicitly warn the AI not to reference individual image files
      expect(prompt).toContain('Do NOT reference any individual image files');
    });

    it('adds Assets section for merged even when per-image list is empty', () => {
      const prompt = buildPrompt(sampleNode, {
        merged: { name: 'frame', width: 100, height: 100 },
      });
      expect(prompt).toContain('## Assets');
      expect(prompt).toContain('`frame.png` → whole composite (100×100)');
    });
  });
});
