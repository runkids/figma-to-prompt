import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const code = readFileSync(new URL('../dist/code.js', import.meta.url), 'utf8');
const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const exportCalls = [];
const messages = [];
const listeners = new Map();
let activeExports = 0;
let maxActiveExports = 0;

async function exportAsync(options) {
  exportCalls.push({ nodeId: this.id, options });
  activeExports += 1;
  maxActiveExports = Math.max(maxActiveExports, activeExports);
  await new Promise((resolve) => setTimeout(resolve, 2));
  activeExports -= 1;
  return pngBytes;
}

const variant = {
  id: '1:2',
  name: 'Variant',
  type: 'COMPONENT',
  visible: true,
  width: 100,
  height: 50,
  x: 0,
  y: 0,
  children: [],
  fills: [],
  strokes: [],
  effects: [],
};
Object.defineProperty(variant, 'componentPropertyDefinitions', {
  get() {
    throw new Error('Can only get component property definitions of a component set or non-variant component');
  },
});

const imageNode = {
  id: '1:3',
  name: 'Hero',
  type: 'RECTANGLE',
  visible: true,
  width: 100,
  height: 50,
  x: 0,
  y: 0,
  absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
  fills: [{ type: 'IMAGE', visible: true, imageHash: 'image-hash', scaleMode: 'FILL' }],
  strokes: [],
  effects: [],
  exportAsync,
};

function createTextNode(id, name, characters, y) {
  return {
    id,
    name,
    type: 'TEXT',
    visible: true,
    width: 100,
    height: 20,
    x: 0,
    y,
    absoluteBoundingBox: { x: 0, y, width: 100, height: 20 },
    characters,
    fills: [],
    strokes: [],
    effects: [],
    exportAsync,
  };
}

const headingText = createTextNode('1:4', 'Heading', 'Fidelity smoke', 55);
const bodyText = createTextNode('1:5', 'Body', 'Rendered fallback', 80);

const root = {
  id: '1:1',
  name: 'Smoke Frame',
  type: 'FRAME',
  visible: true,
  width: 100,
  height: 50,
  x: 0,
  y: 0,
  absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
  children: [variant, imageNode, headingText, bodyText],
  fills: [],
  strokes: [],
  effects: [],
  exportAsync,
};

const nodes = new Map([
  [root.id, root],
  [variant.id, variant],
  [imageNode.id, imageNode],
  [headingText.id, headingText],
  [bodyText.id, bodyText],
]);
const image = {
  getSizeAsync: async () => ({ width: 400, height: 200 }),
  getBytesAsync: async () => pngBytes,
};
let shownUi = null;
const figma = {
  mixed: Symbol('mixed'),
  fileKey: 'smoke-file-key',
  currentPage: { selection: [root] },
  ui: {
    postMessage(message) {
      messages.push(message);
    },
    onmessage: null,
  },
  showUI(html, options) {
    shownUi = { html, options };
  },
  on(event, handler) {
    listeners.set(event, handler);
  },
  getNodeById(id) {
    return nodes.get(id) ?? null;
  },
  getImageByHash(hash) {
    return hash === 'image-hash' ? image : null;
  },
  getStyleById() {
    return null;
  },
};

runInNewContext(code, {
  __html__: '<main>plugin smoke</main>',
  console,
  encodeURIComponent,
  figma,
  Math,
  Number,
  Object,
  Promise,
  Set,
  Map,
  String,
  Symbol,
  Uint8Array,
});

async function waitForMessage(type, after = 0) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = messages.slice(after).find((message) => message.type === type);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

assert.equal(shownUi?.options.width, 480);
assert.equal(shownUi?.options.height, 560);
assert.equal(typeof figma.ui.onmessage, 'function');
assert.equal(typeof listeners.get('selectionchange'), 'function');
const selectionMessage = messages.find((message) => message.type === 'export-result');
assert.equal(selectionMessage?.data.id, root.id);
assert.equal(selectionMessage?.data.children?.[0]?.id, variant.id);

const initialImageData = await waitForMessage('image-data');
assert.match(initialImageData.images[imageNode.id], /^data:image\/png;base64,/);

async function requestExport(mode, scale) {
  const start = messages.length;
  figma.ui.onmessage({ type: 'export-images', mode, scale, format: 'PNG' });
  return waitForMessage('image-data', start);
}

exportCalls.length = 0;
const perImage = await requestExport('per-image', 2);
assert.equal(exportCalls.at(-1)?.nodeId, imageNode.id);
assert.equal(exportCalls.at(-1)?.options.constraint.value, 2);
assert.equal(perImage.sourceRasterEvidence[imageNode.id].density, 4);

exportCalls.length = 0;
const merged = await requestExport('merged', 4);
assert.equal(exportCalls.at(-1)?.nodeId, root.id);
assert.equal(exportCalls.at(-1)?.options.constraint.value, 4);
assert.equal(merged.sourceRasterEvidence[imageNode.id].density, 4);

exportCalls.length = 0;
const perSelection = await requestExport('per-selection', 3);
assert.equal(exportCalls.at(-1)?.nodeId, root.id);
assert.equal(exportCalls.at(-1)?.options.constraint.value, 3);
assert.equal(perSelection.sourceRasterEvidence[imageNode.id].density, 4);

const captureStart = messages.length;
exportCalls.length = 0;
maxActiveExports = 0;
figma.ui.onmessage({
  type: 'export-capture',
  requestId: 'smoke-capture',
  rootId: root.id,
  nodeIds: [root.id],
  includeAssets: true,
});
const capture = await waitForMessage('capture-reference-data', captureStart);
assert.equal(capture.fileKey, 'smoke-file-key');
assert.equal(capture.nodeIds[0], root.id);
assert.equal(
  capture.sourceUrl,
  'https://www.figma.com/design/smoke-file-key/figma-to-prompt-capture?node-id=1-1',
);
assert.match(capture.assets[imageNode.id], /^data:image\/png;base64,/);
const capturedAssetExport = exportCalls.find((call) => call.nodeId === imageNode.id);
assert.equal(capturedAssetExport?.options.constraint.value, 4);
assert.match(capture.renderedFallbacks[headingText.id].pngDataUrl, /^data:image\/png;base64,/);
assert.match(capture.renderedFallbacks[bodyText.id].svgDataUrl, /^data:image\/svg\+xml;base64,/);
assert.ok(
  maxActiveExports >= 4,
  `Expected capture fallbacks to export concurrently, observed ${maxActiveExports}`,
);

const futureNode = {
  id: '9:9',
  name: 'Future media node',
  type: 'FUTURE_MEDIA',
  visible: true,
  width: 80,
  height: 40,
  x: 0,
  y: 0,
  absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 40 },
  exportAsync,
};
for (const property of ['blendMode', 'fills', 'reactions']) {
  Object.defineProperty(futureNode, property, {
    get() {
      throw new Error(`${property} is not available on FUTURE_MEDIA`);
    },
  });
}
nodes.set(futureNode.id, futureNode);
figma.currentPage.selection = [futureNode];
const futureStart = messages.length;
listeners.get('selectionchange')();
const futureSelection = messages.slice(futureStart).find((message) => message.type === 'export-result');
assert.equal(futureSelection?.data.id, futureNode.id);
assert.equal(futureSelection?.data.type, 'FUTURE_MEDIA');

console.log('Plugin bundle smoke passed: guarded extraction, concurrent capture, and all raster export modes.');
