import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaptureReferenceDataMessage, UISerializedNode } from '../src/shared/types';
import { createDesignCaptureBundle, requestCaptureReference } from '../src/ui/designCapture';
import { buildPrompt } from '../src/ui/prompt';

const protocolRoot = resolve('protocol/design-capture-bundle');
const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const outlinedSvg = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0H10V10Z"/></svg>',
).toString('base64')}`;
const stableReference = {
  renderCount: 2,
  width: 1,
  height: 1,
  differentPixels: 0,
  maxChannelDelta: 0,
} as const;

function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixtureBytes(file: { encoding: 'utf8' | 'base64'; data: string }): Buffer {
  return Buffer.from(file.data, file.encoding);
}

describe('Design Capture Bundle protocol', () => {
  it('builds a package when the Figma iframe has no Web Crypto subtle API', async () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => 'runtime-without-subtle' },
    });
    const root: UISerializedNode = {
      id: '1:23',
      name: 'Card',
      type: 'FRAME',
      layout: { width: 1, height: 1 },
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-no-subtle',
      rootId: root.id,
      nodeIds: [root.id],
      fileKey: null,
      sourceUrl: null,
      references: { [root.id]: pixel },
      assets: {},
      renderedFallbacks: {},
      warnings: [],
    };

    try {
      const bundle = await createDesignCaptureBundle({
        root,
        capture,
        prompt: '# Rebuild',
        producerVersion: '0.2.0',
        referenceStability: stableReference,
      });
      expect(bundle.blob.size).toBeGreaterThan(0);
      expect(bundle.manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    } finally {
      if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it('can request only the live reference for fast in-plugin visual comparison', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const originalParent = Object.getOwnPropertyDescriptor(globalThis, 'parent');
    const messageTarget = new EventTarget() as EventTarget & {
      setTimeout: typeof setTimeout;
      clearTimeout: typeof clearTimeout;
    };
    messageTarget.setTimeout = setTimeout;
    messageTarget.clearTimeout = clearTimeout;
    let posted: { pluginMessage: { requestId: string; includeAssets?: boolean } } | undefined;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: messageTarget });
    Object.defineProperty(globalThis, 'parent', {
      configurable: true,
      value: { postMessage: (message: typeof posted) => { posted = message; } },
    });

    try {
      const root: UISerializedNode = { id: '1:23', name: 'Card', type: 'FRAME' };
      const pending = requestCaptureReference(root, { includeAssets: false, timeoutMs: 1_000 });
      if (!posted) throw new Error('Capture request was not posted.');
      messageTarget.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: {
        type: 'capture-reference-data',
        protocolVersion: 1,
        requestId: posted.pluginMessage.requestId,
        rootId: root.id,
        nodeIds: [root.id],
        fileKey: null,
        sourceUrl: null,
        references: { [root.id]: pixel },
        assets: {},
        warnings: [],
      } } }));

      await expect(pending).resolves.toEqual(expect.objectContaining({ rootId: root.id }));
      expect(posted.pluginMessage.includeAssets).toBe(false);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (originalParent) Object.defineProperty(globalThis, 'parent', originalParent);
      else Reflect.deleteProperty(globalThis, 'parent');
    }
  });

  it('pins the mirrored schema and golden file digests', () => {
    const schema = readFileSync(resolve(protocolRoot, '1.0.schema.json'));
    const expected = readFileSync(resolve(protocolRoot, '1.0.schema.sha256'), 'utf8')
      .trim()
      .split(/\s+/)[0];
    expect(digest(schema)).toBe(expected);

    for (const name of ['valid-minimal.json', 'valid-multi-selection.json']) {
      const fixture = JSON.parse(
        readFileSync(resolve(protocolRoot, 'golden', name), 'utf8'),
      ) as {
        manifest: { files: Array<{ path: string; size: number; sha256: string }> };
        files: Record<string, { encoding: 'utf8' | 'base64'; data: string }>;
      };
      for (const declaration of fixture.manifest.files) {
        const bytes = fixtureBytes(fixture.files[declaration.path]);
        expect(bytes.byteLength).toBe(declaration.size);
        expect(digest(bytes)).toBe(declaration.sha256);
      }
    }
  });

  it('builds a native multi-selection bundle with real node IDs and assets', async () => {
    const root: UISerializedNode = {
      id: '__multi_selection__',
      name: 'Selection',
      type: 'FRAME',
      layout: { width: 1, height: 1, mode: 'none' },
      children: [
        {
          id: '1:23',
          name: 'Header',
          type: 'FRAME',
          layout: { width: 1, height: 1, x: 0, y: 0 },
          children: [{ id: '4:56', name: 'Title', type: 'TEXT', text: 'Exact' }],
        },
        { id: '2:34', name: 'Footer', type: 'FRAME', layout: { width: 1, height: 1, x: 0, y: 0 }, children: [] },
      ],
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-1',
      rootId: root.id,
      nodeIds: ['1:23', '2:34'],
      fileKey: 'file-key',
      sourceUrl: 'https://www.figma.com/design/file-key/figma-to-prompt-capture?node-id=1-23',
      references: { '1:23': pixel, '2:34': pixel },
      assets: { '9:10': pixel },
      renderedFallbacks: {
        '4:56': {
          pngDataUrl: pixel,
          svgDataUrl: outlinedSvg,
          reasons: ['text-rendering'],
        },
      },
      warnings: [],
    };

    const bundle = await createDesignCaptureBundle({
      root,
      capture,
      compositeReferenceDataUrl: pixel,
      prompt: '# Pixel-perfect Figma rebuild\n\nUse the bundled references.',
      producerVersion: '0.2.0',
      referenceStability: stableReference,
      capturedAt: new Date('2026-07-15T00:00:00.000Z'),
    });

    expect(bundle.filename).toBe('Selection.figmacapture.zip');
    expect(bundle.blob.size).toBeGreaterThan(0);
    expect(bundle.manifest.producer).toEqual({
      name: 'runkids/figma-to-prompt',
      version: '0.2.0',
      protocolVersion: 1,
    });
    expect(bundle.manifest.source.nodeIds).toEqual(['1:23', '2:34']);
    expect(bundle.manifest.source.locatorPath).toBe('mcp/figma-locator.json');
    expect(bundle.manifest.root.primaryReferencePath).toBe('references/selection.png');
    expect(bundle.manifest.root.targetViewport).toEqual({
      width: 1,
      height: 1,
      referencePath: 'references/selection.png',
    });
    expect(bundle.manifest.root.referencePaths).toHaveLength(3);
    expect(bundle.manifest.root.fallbackPaths).toEqual([
      'fallbacks/001-4_56.png',
      'fallbacks/001-4_56.svg',
    ]);
    expect(bundle.manifest.root.promptPath).toBe('prompt.md');
    expect(bundle.manifest.fidelity).toEqual({
      policy: 'fail-closed',
      coveragePath: 'fidelity/coverage.json',
      candidateNodeCount: 1,
      coveredNodeCount: 1,
      unresolvedNodeIds: [],
      exactVerification: {
        required: true,
        method: 'rgba-pixel-equality',
        referencePath: 'references/selection.png',
        referenceStability: stableReference,
      },
    });
    expect(bundle.manifest.files.map((file) => file.path)).toEqual([
      'assets/001-9_10.png',
      'design/nodes.json',
      'fallbacks/001-4_56.png',
      'fallbacks/001-4_56.svg',
      'fidelity/coverage.json',
      'mcp/figma-locator.json',
      'prompt.md',
      'references/001-1_23.png',
      'references/002-2_34.png',
      'references/selection.png',
    ]);
    expect(bundle.manifest.files).toContainEqual(expect.objectContaining({
      path: 'references/selection.png',
      role: 'reference-render',
      mediaType: 'image/png',
      nodeId: root.id,
      pixelDimensions: { width: 1, height: 1 },
    }));
    expect(bundle.manifest.files).toContainEqual(expect.objectContaining({
      path: 'prompt.md',
      role: 'derived-prompt',
      mediaType: 'text/markdown',
      nodeId: root.id,
    }));
    expect(bundle.manifest.files).toContainEqual(expect.objectContaining({
      path: 'fallbacks/001-4_56.png',
      role: 'design-asset',
      mediaType: 'image/png',
      nodeId: '4:56',
      purpose: 'rendered-fallback',
      fallbackVariant: 'pixel',
      fallbackReasons: ['text-rendering'],
    }));
    expect(bundle.manifest.files).toContainEqual(expect.objectContaining({
      path: 'fallbacks/001-4_56.svg',
      role: 'design-asset',
      mediaType: 'image/svg+xml',
      nodeId: '4:56',
      purpose: 'rendered-fallback',
      fallbackVariant: 'vector',
      fallbackReasons: ['text-rendering'],
    }));
    const zipText = new TextDecoder().decode(await bundle.blob.arrayBuffer());
    expect(zipText).toContain('# Pixel-perfect Figma rebuild');
    expect(zipText).toContain('## Capture Bundle Inputs (Authoritative)');
    expect(zipText).toContain('references/001-1_23.png');
    expect(zipText).toContain('Authoritative target: `references/selection.png` at exactly 1×1 CSS pixels');
    expect(zipText).toContain('assets/001-9_10.png');
    expect(zipText).toContain('fallbacks/001-4_56.png');
    expect(zipText).toContain('fallbacks/001-4_56.svg');
    expect(zipText).toContain('"policy":"fail-closed"');
    expect(zipText).toContain('"nodeId":"4:56"');
    expect(zipText).toContain('"pixelPath":"fallbacks/001-4_56.png"');
    expect(zipText).toContain('"selectedNodeIds":["1:23","2:34"]');
    expect(zipText).toContain('"nodeId":"4:56","name":"Title","type":"TEXT"');
    expect(zipText).toContain('"fileKey":"file-key","nodeId":"1:23"');
    expect(zipText).toContain('https://www.figma.com/design/file-key/figma-to-prompt-capture?node-id=4-56');
    expect(zipText).toContain('Review `mcp/figma-locator.json` before calling a Figma MCP tool');
    expect(zipText).toContain('Review `fidelity/coverage.json` before implementation');
    expect(zipText).toContain('Use the PNG variant for the exact 1× target');
    expect(zipText).toContain('built-in `Verify AI screenshot` checker');
    expect(bundle.manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(bundle.manifest.warnings).toContain(
      'Figma file version is unavailable in the plugin sandbox.',
    );
  });

  it('carries non-visual Figma behavior and developer contracts through the AI package', async () => {
    const root: UISerializedNode = {
      id: '1:23',
      name: 'Checkout Overlay',
      type: 'FRAME',
      layout: { width: 1, height: 1 },
      prototype: {
        overflowDirection: 'vertical',
        fixedChildIds: ['1:24'],
        overlayPositionType: 'bottom-center',
        overlayBackgroundInteraction: 'close-on-click-outside',
      },
      annotations: [{ labelMarkdown: '**Keep checkout visible**', properties: ['fills'] }],
      variableBindings: { opacity: { id: 'VariableID:opacity', name: 'Opacity/Overlay' } },
      explicitVariableModes: [{
        collectionId: 'VariableCollectionId:theme',
        collectionName: 'Theme',
        modeId: 'VariableModeId:dark',
        modeName: 'Dark',
      }],
      referencedVariables: [{
        id: 'VariableID:opacity',
        name: 'Opacity/Overlay',
        collectionId: 'VariableCollectionId:theme',
        collectionName: 'Theme',
        resolvedType: 'FLOAT',
        codeSyntax: { WEB: '--opacity-overlay' },
        valuesByMode: {
          'VariableModeId:dark': { modeName: 'Dark', value: 0.8 },
        },
      }],
      children: [{
        id: '1:24',
        name: 'Pay now',
        type: 'FRAME',
        reactions: [{
          trigger: { type: 'ON_CLICK' },
          actions: [{ type: 'URL', url: 'https://example.com/pay' }],
        }],
      }],
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-behavior',
      rootId: root.id,
      nodeIds: [root.id],
      fileKey: null,
      sourceUrl: null,
      references: { [root.id]: pixel },
      assets: {},
      renderedFallbacks: {},
      warnings: [],
    };

    const bundle = await createDesignCaptureBundle({
      root,
      capture,
      prompt: buildPrompt(root, { promptDetail: 'compact' }),
      producerVersion: '0.2.0',
      referenceStability: stableReference,
    });
    const zipText = new TextDecoder().decode(await bundle.blob.arrayBuffer());

    expect(zipText).toContain('## Interaction Contract');
    expect(zipText).toContain('## Component API Contract');
    expect(zipText).toContain('"fixedChildIds":["1:24"]');
    expect(zipText).toContain('"type":"ON_CLICK"');
    expect(zipText).toContain('**Keep checkout visible**');
    expect(zipText).toContain('"modeName":"Dark"');
    expect(zipText).toContain('"name":"Opacity/Overlay"');
    expect(zipText).toContain('"WEB":"--opacity-overlay"');
    expect(zipText).toContain('"value":0.8');
  });

  it('refuses to relabel a capture response from a different selection', async () => {
    const root: UISerializedNode = { id: '1:23', name: 'Header', type: 'FRAME' };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-1',
      rootId: '2:34',
      nodeIds: ['2:34'],
      fileKey: null,
      sourceUrl: null,
      references: { '2:34': pixel },
      assets: {},
      warnings: [],
    };

    await expect(
      createDesignCaptureBundle({ root, capture, prompt: '# Rebuild', producerVersion: '0.2.0', referenceStability: stableReference }),
    ).rejects.toThrow('does not match');
  });

  it('refuses an AI package when a precision-risk node is missing its pixel fallback', async () => {
    const root: UISerializedNode = {
      id: '1:23',
      name: 'Card',
      type: 'FRAME',
      children: [{ id: '1:24', name: 'Title', type: 'TEXT', text: 'Exact text' }],
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-1',
      rootId: root.id,
      nodeIds: [root.id],
      fileKey: null,
      sourceUrl: null,
      references: { [root.id]: pixel },
      assets: {},
      renderedFallbacks: {},
      warnings: ['Unable to render pixel fallback 1:24.'],
    };

    await expect(
      createDesignCaptureBundle({ root, capture, prompt: '# Rebuild', producerVersion: '0.2.0', referenceStability: stableReference }),
    ).rejects.toThrow('missing pixel fallbacks for node 1:24');
  });

  it('refuses an AI package when a required image asset is missing', async () => {
    const root: UISerializedNode = {
      id: '1:23',
      name: 'Card',
      type: 'FRAME',
      children: [{
        id: '1:25',
        name: 'Hero image',
        type: 'RECTANGLE',
        layout: { width: 320, height: 180 },
        style: { imageFillHash: 'image-hash', imageFillScaleMode: 'crop' },
      }],
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-1',
      rootId: root.id,
      nodeIds: [root.id],
      fileKey: null,
      sourceUrl: null,
      references: { [root.id]: pixel },
      assets: {},
      renderedFallbacks: {},
      warnings: ['Unable to render design asset 1:25.'],
    };

    await expect(
      createDesignCaptureBundle({ root, capture, prompt: '# Rebuild', producerVersion: '0.2.0', referenceStability: stableReference }),
    ).rejects.toThrow('missing design assets for node 1:25');
  });

  it('refuses a multi-selection package when any selected reference is missing', async () => {
    const root: UISerializedNode = {
      id: '__multi_selection__',
      name: 'Selection',
      type: 'FRAME',
      children: [
        { id: '1:23', name: 'Header', type: 'FRAME' },
        { id: '2:34', name: 'Footer', type: 'FRAME' },
      ],
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-1',
      rootId: root.id,
      nodeIds: ['1:23', '2:34'],
      fileKey: null,
      sourceUrl: null,
      references: { '1:23': pixel },
      assets: {},
      renderedFallbacks: {},
      warnings: ['Unable to render reference 2:34.'],
    };

    await expect(
      createDesignCaptureBundle({ root, capture, prompt: '# Rebuild', producerVersion: '0.2.0', referenceStability: stableReference }),
    ).rejects.toThrow('missing reference renders for node 2:34');
  });

  it('refuses a multi-selection package without one authoritative composite reference', async () => {
    const root: UISerializedNode = {
      id: '__multi_selection__',
      name: 'Selection',
      type: 'FRAME',
      layout: { width: 1, height: 1, mode: 'none' },
      children: [
        { id: '1:23', name: 'Header', type: 'FRAME', layout: { width: 1, height: 1, x: 0, y: 0 } },
        { id: '2:34', name: 'Footer', type: 'FRAME', layout: { width: 1, height: 1, x: 0, y: 0 } },
      ],
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-1',
      rootId: root.id,
      nodeIds: ['1:23', '2:34'],
      fileKey: null,
      sourceUrl: null,
      references: { '1:23': pixel, '2:34': pixel },
      assets: {},
      renderedFallbacks: {},
      warnings: [],
    };

    await expect(
      createDesignCaptureBundle({ root, capture, prompt: '# Rebuild', producerVersion: '0.2.0', referenceStability: stableReference }),
    ).rejects.toThrow('missing its authoritative composite reference');
  });

  it('refuses determinism evidence that does not match the target viewport', async () => {
    const root: UISerializedNode = { id: '1:23', name: 'Header', type: 'FRAME' };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-1',
      rootId: root.id,
      nodeIds: [root.id],
      fileKey: null,
      sourceUrl: null,
      references: { [root.id]: pixel },
      assets: {},
      warnings: [],
    };

    await expect(createDesignCaptureBundle({
      root,
      capture,
      prompt: '# Rebuild',
      producerVersion: '0.2.0',
      referenceStability: { ...stableReference, width: 2 },
    })).rejects.toThrow('two pixel-identical Figma reference renders');
  });
});
