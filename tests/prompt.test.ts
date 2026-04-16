import { describe, it, expect } from 'vitest';
import { buildPrompt, countNodes, collectTokens, collectComponentDeps, buildTreeOutline, buildNodeDetails, collectImageAssets } from '../src/ui/prompt';
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
  });

  it('omits dependencies section when no instances', () => {
    const prompt = buildPrompt(sampleNode);
    expect(prompt).not.toContain('## Component Dependencies');
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

    it('includes merged composite line when merged option provided', () => {
      const prompt = buildPrompt(nodeWithImage, {
        merged: { name: 'hero_frame', width: 1200, height: 800 },
      });
      expect(prompt).toContain('`hero_frame.png` → whole composite (1200×800)');
      // Individual image lines still present
      expect(prompt).toContain('`Hero_Section_Hero_Background.png`');
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
