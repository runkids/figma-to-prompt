import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaptureReferenceDataMessage, UISerializedNode } from '../src/shared/types';
import { createDesignCaptureBundle } from '../src/ui/designCapture';

const protocolRoot = resolve('protocol/design-capture-bundle');
const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixtureBytes(file: { encoding: 'utf8' | 'base64'; data: string }): Buffer {
  return Buffer.from(file.data, file.encoding);
}

describe('Design Capture Bundle protocol', () => {
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
      children: [
        { id: '1:23', name: 'Header', type: 'FRAME', children: [] },
        { id: '2:34', name: 'Footer', type: 'FRAME', children: [] },
      ],
    };
    const capture: CaptureReferenceDataMessage = {
      type: 'capture-reference-data',
      protocolVersion: 1,
      requestId: 'request-1',
      rootId: root.id,
      nodeIds: ['1:23', '2:34'],
      fileKey: 'file-key',
      sourceUrl: 'https://www.figma.com/file/file-key?node-id=1%3A23',
      references: { '1:23': pixel, '2:34': pixel },
      assets: { '9:10': pixel },
      warnings: [],
    };

    const bundle = await createDesignCaptureBundle({
      root,
      capture,
      producerVersion: '0.2.0',
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
    expect(bundle.manifest.root.referencePaths).toHaveLength(2);
    expect(bundle.manifest.files.map((file) => file.path)).toEqual([
      'assets/001-9_10.png',
      'design/nodes.json',
      'references/001-1_23.png',
      'references/002-2_34.png',
    ]);
    expect(bundle.manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(bundle.manifest.warnings).toContain(
      'Figma file version is unavailable in the plugin sandbox.',
    );
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
      createDesignCaptureBundle({ root, capture, producerVersion: '0.2.0' }),
    ).rejects.toThrow('does not match');
  });
});
