import { PROTOCOL_VERSION } from '../shared/types';
import type { SandboxMessage, UISerializedNode, UIMessage, ExportMode, ImageNameOverrides } from '../shared/types';
import { buildPrompt, collectImageAssets } from './prompt';

declare const __APP_VERSION__: string;

const CURRENT_VERSION = __APP_VERSION__;
const REPO = 'runkids/figma-to-prompt';

// State
let currentData: UISerializedNode | null = null;
let currentJson = '';
let currentPromptText = '';
let currentTab: 'json' | 'prompt' = 'json';
let currentImages: Record<string, string> = {};
let currentMergedImage: string | null = null;
let currentScale = 0; // 0 = original quality via getImageByHash
let currentFormat: 'PNG' | 'JPG' | 'SVG' = 'PNG';
let currentMode: ExportMode = 'per-image';
let imageNameOverrides: ImageNameOverrides = {};
let mergedImageName = ''; // filename without extension; empty = fall back to frame name

// DOM elements
const tabJson = document.getElementById('tab-json')!;
const tabPrompt = document.getElementById('tab-prompt')!;
const contentJson = document.getElementById('content-json')!;
const contentPrompt = document.getElementById('content-prompt')!;
const jsonOutput = document.getElementById('json-output')!;
const promptOutput = document.getElementById('prompt-output')!;
const btnCopyPrompt = document.getElementById('btn-copy-prompt') as HTMLButtonElement;
const btnDownloadJson = document.getElementById('btn-download-json') as HTMLButtonElement;
const btnDownloadMd = document.getElementById('btn-download-md') as HTMLButtonElement;
const btnDownloadImages = document.getElementById('btn-download-images') as HTMLButtonElement;
const selectMode = document.getElementById('select-mode') as HTMLSelectElement;
const selectScale = document.getElementById('select-scale') as HTMLSelectElement;
const selectFormat = document.getElementById('select-format') as HTMLSelectElement;
const statusText = document.getElementById('status-text')!;
const statusDot = document.getElementById('status-dot')!;
const emptyJson = document.getElementById('empty-json')!;
const emptyPrompt = document.getElementById('empty-prompt')!;
const exportRow = document.getElementById('export-row')!;
const namesRow = document.getElementById('names-row')!;
const namesList = document.getElementById('names-list')!;

function sendToSandbox(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

/** Match the character class used by auto-naming in prompt.ts */
function sanitizeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/** Extension to use for per-image downloads based on current scale/format.
 *  scale=0 uses getImageByHash → always PNG regardless of format selection.
 *  Any other scale honors the user's format choice. */
function perImageExt(): string {
  return currentScale === 0 ? 'png' : currentFormat.toLowerCase();
}

/** Rebuild the prompt text from currentData + overrides and refresh the DOM. */
function rebuildPromptText(): void {
  if (!currentData) return;
  const merged = currentMode === 'merged' && currentData.layout
    ? {
        name: mergedImageName.trim() || sanitizeName(currentData.name),
        width: Math.round(currentData.layout.width),
        height: Math.round(currentData.layout.height),
      }
    : undefined;
  currentPromptText = buildPrompt(currentData, { imageNameOverrides, merged });
  if (currentTab === 'prompt') promptOutput.textContent = currentPromptText;
}

let nameInputDebounce: ReturnType<typeof setTimeout> | null = null;

function scheduleRebuild(): void {
  if (nameInputDebounce) clearTimeout(nameInputDebounce);
  nameInputDebounce = setTimeout(rebuildPromptText, 80);
}

/** Build one input row (label + input + `.png`/ext hint) */
function makeNameRow(labelText: string, placeholder: string, value: string, onChange: (v: string) => void): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'name-row';

  const label = document.createElement('span');
  label.className = 'name-row-label';
  label.title = labelText;
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-input';
  input.placeholder = placeholder;
  input.value = value;
  input.spellcheck = false;
  input.addEventListener('input', () => {
    const sanitized = sanitizeName(input.value);
    if (sanitized !== input.value) input.value = sanitized;
    onChange(sanitized);
    scheduleRebuild();
  });

  const ext = document.createElement('span');
  ext.className = 'name-ext';
  ext.textContent = currentMode === 'merged'
    ? `.${currentFormat === 'JPG' ? 'jpg' : currentFormat === 'SVG' ? 'svg' : 'png'}`
    : `.${perImageExt()}`;

  row.append(label, input, ext);
  return row;
}

/** (Re)populate the names list for the current selection + mode */
function renderNameInputs(): void {
  namesList.replaceChildren();
  if (!currentData) return;

  if (currentMode === 'merged') {
    const placeholder = sanitizeName(currentData.name);
    namesList.append(
      makeNameRow('(composite)', placeholder, mergedImageName, (v) => {
        mergedImageName = v;
      }),
    );
    return;
  }

  // Per-image: one row per image-fill node (auto-name used as placeholder)
  const assets = collectImageAssets(currentData);
  for (const a of assets) {
    const autoName = a.fileName.replace(/\.png$/, '');
    namesList.append(
      makeNameRow(a.nodeName, autoName, imageNameOverrides[a.nodeId] ?? '', (v) => {
        if (v === '') delete imageNameOverrides[a.nodeId];
        else imageNameOverrides[a.nodeId] = v;
      }),
    );
  }
}

// Status dot color helper
function setStatusDot(state: 'idle' | 'active' | 'loading' | 'error'): void {
  const colors: Record<string, string> = {
    idle: 'var(--muted-fg)',
    active: 'var(--quaternary)',
    loading: 'var(--tertiary)',
    error: 'var(--secondary)',
  };
  statusDot.style.background = colors[state];
}

function requestImageExport(): void {
  currentImages = {};
  currentMergedImage = null;
  btnDownloadImages.disabled = true;
  statusText.textContent = (statusText.textContent ?? '')
    .replace(/\d+ images [✓]/, (m) => m.replace('✓', '(loading…)'))
    .replace(/merged ✓/, 'merged (loading…)')
    .replace(/images failed/, 'images (loading…)');
  setStatusDot('loading');
  statusDot.classList.add('loading');
  sendToSandbox({
    type: 'export-images',
    scale: currentScale,
    format: currentFormat,
    mode: currentMode,
  });
}

/** Scale=0 means "original raster via getImageByHash" — only valid for per-image mode.
 *  Auto-bump to 1x when switching to merged so the render has a sensible size. */
function reconcileScaleForMode(): void {
  if (currentMode === 'merged' && currentScale === 0) {
    currentScale = 1;
    selectScale.value = '1';
  }
}

/** Scale=0 (Original) always returns PNG via getImageByHash — JPG/SVG cannot be honored.
 *  If the user picks a non-PNG format, auto-bump to 1x so the format choice actually applies. */
function reconcileScaleForFormat(): void {
  if (currentScale === 0 && currentFormat !== 'PNG') {
    currentScale = 1;
    selectScale.value = '1';
  }
}

selectMode.addEventListener('change', () => {
  currentMode = selectMode.value as ExportMode;
  reconcileScaleForMode();
  renderNameInputs();
  rebuildPromptText();
  if (currentData) requestImageExport();
});

selectScale.addEventListener('change', () => {
  currentScale = Number(selectScale.value);
  renderNameInputs(); // ext label depends on scale/format
  if (currentData) requestImageExport();
});

selectFormat.addEventListener('change', () => {
  currentFormat = selectFormat.value as 'PNG' | 'JPG' | 'SVG';
  reconcileScaleForFormat();
  renderNameInputs();
  if (currentData) requestImageExport();
});

// Tab switching — pill style with active class
function switchTab(tab: 'json' | 'prompt'): void {
  currentTab = tab;
  const isJson = tab === 'json';

  tabJson.classList.toggle('active', isJson);
  tabPrompt.classList.toggle('active', !isJson);
  tabJson.setAttribute('aria-selected', String(isJson));
  tabPrompt.setAttribute('aria-selected', String(!isJson));

  contentJson.classList.toggle('hidden', !isJson);
  contentPrompt.classList.toggle('hidden', isJson);

  // Crossfade: trigger fade-in on the newly visible panel
  const visible = isJson ? contentJson : contentPrompt;
  visible.classList.remove('fade-in');
  void visible.offsetWidth; // force reflow to restart animation
  visible.classList.add('fade-in');

  btnCopyPrompt.textContent = isJson ? 'Copy JSON' : 'Copy Prompt';
}

tabJson.addEventListener('click', () => switchTab('json'));
tabPrompt.addEventListener('click', () => switchTab('prompt'));

// Download helper
function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

btnDownloadJson.addEventListener('click', () => {
  if (!currentData) return;
  const safeName = currentData.name.replace(/[^a-zA-Z0-9-_]/g, '_');
  downloadFile(`${safeName}.json`, currentJson, 'application/json');
});

btnDownloadMd.addEventListener('click', () => {
  if (!currentData) return;
  const safeName = currentData.name.replace(/[^a-zA-Z0-9-_]/g, '_');
  downloadFile(`${safeName}.md`, currentPromptText, 'text/markdown');
});

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── Minimal ZIP creator (no dependencies) ────────────────

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const entries: { nameBytes: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const header = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(8, 0, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, file.data.length, true);
    v.setUint32(22, file.data.length, true);
    v.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    entries.push({ nameBytes, data: file.data, crc, offset });
    parts.push(header, file.data);
    offset += header.length + file.data.length;
  }

  const cdStart = offset;
  for (const e of entries) {
    const cd = new Uint8Array(46 + e.nameBytes.length);
    const v = new DataView(cd.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint32(16, e.crc, true);
    v.setUint32(20, e.data.length, true);
    v.setUint32(24, e.data.length, true);
    v.setUint16(28, e.nameBytes.length, true);
    v.setUint32(42, e.offset, true);
    cd.set(e.nameBytes, 46);
    parts.push(cd);
    offset += cd.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, offset - cdStart, true);
  ev.setUint32(16, cdStart, true);
  parts.push(end);

  return new Blob(parts, { type: 'application/zip' });
}

// ── Image Download ───────────────────────────────────────

function showImageDownloadFeedback(count: number): void {
  const original = btnDownloadImages.textContent;
  btnDownloadImages.textContent = `${count} saved!`;
  btnDownloadImages.classList.add('saved');
  setTimeout(() => {
    btnDownloadImages.textContent = original;
    btnDownloadImages.classList.remove('saved');
  }, 1500);
}

btnDownloadImages.addEventListener('click', async () => {
  if (!currentData) return;

  // Merged mode: single composite image, no zip
  if (currentMode === 'merged') {
    if (!currentMergedImage) return;
    const base = mergedImageName.trim() || sanitizeName(currentData.name);
    const ext = currentFormat === 'JPG' ? 'jpg' : currentFormat === 'SVG' ? 'svg' : 'png';
    downloadBlob(`${base}.${ext}`, dataUrlToBlob(currentMergedImage));
    showImageDownloadFeedback(1);
    return;
  }

  if (Object.keys(currentImages).length === 0) return;
  // Apply user overrides + collision-safe auto naming
  const assets = collectImageAssets(currentData, imageNameOverrides);
  const ext = perImageExt();
  const files: { name: string; data: Uint8Array }[] = [];

  for (const asset of assets) {
    const dataUrl = currentImages[asset.nodeId];
    if (!dataUrl) continue;
    const blob = dataUrlToBlob(dataUrl);
    const buffer = await blob.arrayBuffer();
    files.push({
      name: asset.fileName.replace(/\.png$/, `.${ext}`),
      data: new Uint8Array(buffer),
    });
  }

  if (files.length === 0) return;
  if (files.length === 1) {
    downloadBlob(files[0].name, new Blob([files[0].data]));
  } else {
    const safeName = currentData.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    downloadBlob(`${safeName}_images.zip`, createZip(files));
  }
  showImageDownloadFeedback(files.length);
});

// Copy using fallback for Figma plugin iframe (clipboard API may be blocked)
function copyToClipboard(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(textarea);
  return ok;
}

function showCopyFeedback(success: boolean): void {
  const original = btnCopyPrompt.textContent;
  btnCopyPrompt.textContent = success ? 'Copied!' : 'Copy failed';
  btnCopyPrompt.classList.add(success ? 'copied' : 'copy-failed');
  setTimeout(() => {
    btnCopyPrompt.textContent = original;
    btnCopyPrompt.classList.remove('copied', 'copy-failed');
  }, 1500);
}

btnCopyPrompt.addEventListener('click', () => {
  const text = currentTab === 'json' ? currentJson : currentPromptText;
  if (!text) return;
  // Try modern API first, fallback to execCommand
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showCopyFeedback(true))
      .catch(() => showCopyFeedback(copyToClipboard(text)));
  } else {
    showCopyFeedback(copyToClipboard(text));
  }
});

// ── Version display & update check ──────────────────────
const versionLabel = document.getElementById('version-label')!;
const updateBanner = document.getElementById('update-banner')!;
const updateText = document.getElementById('update-text')!;
const updateLink = document.getElementById('update-link') as HTMLAnchorElement;

versionLabel.textContent = `v${CURRENT_VERSION}`;

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
  }
  return 0;
}

async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return;
    const data = await res.json();
    const latest = (data.tag_name as string).replace(/^v/, '');
    if (compareVersions(CURRENT_VERSION, latest) < 0) {
      updateText.textContent = `v${latest} available!`;
      updateLink.href = data.html_url as string;
      updateBanner.classList.remove('hidden');
    }
  } catch {
    // Silently ignore — offline or rate-limited
  }
}

checkForUpdate();

// ── Protocol version check ──────────────────────────────
const protocolBanner = document.getElementById('protocol-banner')!;
let protocolChecked = false;

function checkProtocol(msg: SandboxMessage): void {
  if (protocolChecked) return;
  if (msg.type === 'export-result' && msg.protocolVersion !== PROTOCOL_VERSION) {
    protocolBanner.classList.remove('hidden');
  }
  protocolChecked = true;
}

// Handle messages from sandbox
window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as SandboxMessage;
  if (!msg) return;

  checkProtocol(msg);

  if (msg.type === 'selection-empty') {
    currentData = null;
    currentJson = '';
    currentPromptText = '';
    currentImages = {};
    currentMergedImage = null;
    imageNameOverrides = {};
    mergedImageName = '';
    namesList.replaceChildren();
    namesRow.classList.add('hidden');
    // Show empty states, hide content
    jsonOutput.textContent = '';
    jsonOutput.classList.add('hidden');
    emptyJson.classList.remove('hidden');
    promptOutput.textContent = '';
    promptOutput.classList.add('hidden');
    emptyPrompt.classList.remove('hidden');
    // Disable all actions
    btnCopyPrompt.disabled = true;
    btnDownloadJson.disabled = true;
    btnDownloadMd.disabled = true;
    btnDownloadImages.disabled = true;
    exportRow.classList.add('hidden');
    statusText.textContent = 'No selection';
    setStatusDot('idle');
    statusDot.classList.remove('loading');
    return;
  }

  if (msg.type === 'export-result') {
    currentData = msg.data;
    currentJson = JSON.stringify(msg.data, null, 2);
    currentImages = {}; // reset — images arrive later via image-data
    currentMergedImage = null;
    // New selection → clear per-node overrides (nodeIds don't carry across frames)
    imageNameOverrides = {};
    mergedImageName = '';
    // Build prompt with current mode (so merged composite line shows up immediately in merged mode)
    const mergedInit = currentMode === 'merged' && msg.data.layout
      ? {
          name: sanitizeName(msg.data.name),
          width: Math.round(msg.data.layout.width),
          height: Math.round(msg.data.layout.height),
        }
      : undefined;
    currentPromptText = buildPrompt(msg.data, { imageNameOverrides, merged: mergedInit });

    // Hide empty states, show content
    emptyJson.classList.add('hidden');
    jsonOutput.textContent = currentJson;
    jsonOutput.classList.remove('hidden');
    emptyPrompt.classList.add('hidden');
    promptOutput.textContent = currentPromptText;
    promptOutput.classList.remove('hidden');

    btnCopyPrompt.disabled = false;
    btnDownloadJson.disabled = false;
    btnDownloadMd.disabled = false;
    btnDownloadImages.disabled = true; // enabled when images arrive

    const imageCount = currentData ? collectImageAssets(currentData).length : 0;
    // Export-row is useful for any exportable selection (Merged mode works even
    // without image fills — e.g. a pure-vector icon frame). Only hide on empty selection.
    exportRow.classList.remove('hidden');

    // Per-image mode requires image fills; disable it (and force Merged) when there are none.
    const perImageOption = selectMode.querySelector('option[value="per-image"]') as HTMLOptionElement | null;
    if (perImageOption) perImageOption.disabled = imageCount === 0;
    if (imageCount === 0 && currentMode === 'per-image') {
      currentMode = 'merged';
      selectMode.value = 'merged';
      reconcileScaleForMode();
    }

    // names-row: shown in merged mode always (composite input) or per-image with fills
    const showNames = currentMode === 'merged' || imageCount > 0;
    namesRow.classList.toggle('hidden', !showNames);
    if (showNames) renderNameInputs();

    let status = `Selected: ${msg.data.name} (${msg.data.type}) — ${msg.meta.nodeCount} nodes`;
    const willExport = currentMode === 'merged' || imageCount > 0;
    if (willExport) {
      status += currentMode === 'merged' ? ' · merged (loading…)' : ` · ${imageCount} images (loading…)`;
    }
    statusText.textContent = status;
    setStatusDot(willExport ? 'loading' : 'active');
    if (willExport) statusDot.classList.add('loading');

    // Sandbox auto-triggers per-image export on selection change. Override with a merged
    // request when we're in (or have been forced into) merged mode.
    if (currentMode === 'merged') {
      requestImageExport();
    }
    return;
  }

  if (msg.type === 'image-data') {
    currentImages = msg.images;
    currentMergedImage = msg.merged ?? null;
    const loaded = currentMergedImage ? 1 : Object.keys(currentImages).length;
    btnDownloadImages.disabled = loaded === 0;

    const prevStatus = statusText.textContent ?? '';
    if (currentMergedImage) {
      statusText.textContent = prevStatus
        .replace(/\d+ images \(loading…\)/, 'merged ✓')
        .replace(/merged \(loading…\)/, 'merged ✓');
    } else {
      statusText.textContent = loaded > 0
        ? prevStatus.replace(/\d+ images \(loading…\)/, `${loaded} images ✓`)
        : prevStatus
            .replace(/\d+ images \(loading…\)/, 'images failed')
            .replace(/merged \(loading…\)/, 'merged failed');
    }
    setStatusDot(loaded > 0 ? 'active' : 'error');
    statusDot.classList.remove('loading');
    return;
  }
};
