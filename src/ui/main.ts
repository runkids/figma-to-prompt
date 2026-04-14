import type { SandboxMessage, UISerializedNode, UIMessage } from '../shared/types';
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
let currentScale = 0; // 0 = original quality via getImageByHash
let currentFormat: 'PNG' | 'JPG' | 'SVG' = 'PNG';

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
const selectScale = document.getElementById('select-scale') as HTMLSelectElement;
const selectFormat = document.getElementById('select-format') as HTMLSelectElement;
const statusText = document.getElementById('status-text')!;
const statusDot = document.getElementById('status-dot')!;
const emptyJson = document.getElementById('empty-json')!;
const emptyPrompt = document.getElementById('empty-prompt')!;
const exportRow = document.getElementById('export-row')!;

function sendToSandbox(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
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
  btnDownloadImages.disabled = true;
  statusText.textContent = (statusText.textContent ?? '')
    .replace(/\d+ images [✓]/, (m) => m.replace('✓', '(loading…)'))
    .replace(/images failed/, 'images (loading…)');
  setStatusDot('loading');
  statusDot.classList.add('loading');
  sendToSandbox({ type: 'export-images', scale: currentScale, format: currentFormat });
}

selectScale.addEventListener('change', () => {
  currentScale = Number(selectScale.value);
  if (currentData && collectImageAssets(currentData).length > 0) requestImageExport();
});

selectFormat.addEventListener('change', () => {
  currentFormat = selectFormat.value as 'PNG' | 'JPG' | 'SVG';
  if (currentData && collectImageAssets(currentData).length > 0) requestImageExport();
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
  if (!currentData || Object.keys(currentImages).length === 0) return;
  const assets = collectImageAssets(currentData);
  // SVG for IMAGE fills falls back to original PNG (Figma SVG export bug);
  // Original mode (scale=0) also produces PNG
  const ext = currentScale === 0 || currentFormat === 'SVG' ? 'png' : currentFormat.toLowerCase();
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

// Handle messages from sandbox
window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as SandboxMessage;
  if (!msg) return;

  if (msg.type === 'selection-empty') {
    currentData = null;
    currentJson = '';
    currentPromptText = '';
    currentImages = {};
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
    currentPromptText = buildPrompt(msg.data);
    currentImages = {}; // reset — images arrive later via image-data

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
    // Progressive disclosure: show export options only when images exist
    exportRow.classList.toggle('hidden', imageCount === 0);

    let status = `Selected: ${msg.data.name} (${msg.data.type}) — ${msg.meta.nodeCount} nodes`;
    if (imageCount > 0) status += ` · ${imageCount} images (loading…)`;
    statusText.textContent = status;
    setStatusDot(imageCount > 0 ? 'loading' : 'active');
    if (imageCount > 0) statusDot.classList.add('loading');
    return;
  }

  if (msg.type === 'image-data') {
    currentImages = msg.images;
    const loaded = Object.keys(currentImages).length;
    btnDownloadImages.disabled = loaded === 0;
    statusText.textContent = loaded > 0
      ? (statusText.textContent ?? '').replace(/\d+ images \(loading…\)/, `${loaded} images ✓`)
      : (statusText.textContent ?? '').replace(/\d+ images \(loading…\)/, 'images failed');
    setStatusDot(loaded > 0 ? 'active' : 'error');
    statusDot.classList.remove('loading');
    return;
  }
};
