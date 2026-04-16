/**
 * Image download helpers — pure functions that produce Blobs and trigger browser
 * downloads. Extracted from the legacy main.ts so they can be unit-tested and
 * reused from any component.
 */

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convert a data URL to a Blob via the browser's native fetch pipeline. This is
 * dramatically faster than the hand-rolled `atob` + byte-copy loop for large
 * payloads (tens of MB): the decoding happens off the main thread, so the UI
 * stays responsive while Download is in flight. Previous sync implementation
 * blocked paint for 200ms–2s on big images, making the app appear to hang with
 * no loading indicator.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// ── Minimal dependency-free ZIP creator ──────────────────
// Stored entries only (no compression). Sufficient for our PNG/JPG payloads
// which are already compressed; keeps the bundle ~tiny.

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(files: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const entries: { nameBytes: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  const parts: BlobPart[] = [];
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
    parts.push(header as BlobPart, file.data as BlobPart);
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
    parts.push(cd as BlobPart);
    offset += cd.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, offset - cdStart, true);
  ev.setUint32(16, cdStart, true);
  parts.push(end as BlobPart);

  return new Blob(parts, { type: 'application/zip' });
}
