const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function asUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError('Expected PNG bytes as Uint8Array or ArrayBuffer.');
}

function concatBytes(parts) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function bytesEqual(left, right) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

async function transformBytes(bytes, format, mode) {
  const stream = mode === 'compress'
    ? new CompressionStream(format)
    : new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  const output = new Response(stream.readable).arrayBuffer();
  await writer.write(bytes);
  await writer.close();
  return new Uint8Array(await output);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanlines(data, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (data.length !== expectedLength) {
    throw new Error(`Unexpected PNG scanline length: expected ${expectedLength}, received ${data.length}.`);
  }

  const output = new Uint8Array(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = data[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    const previousRowOffset = rowOffset - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = data[sourceOffset + x];
      const left = x >= bytesPerPixel ? output[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? output[previousRowOffset + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? output[previousRowOffset + x - bytesPerPixel]
        : 0;

      switch (filter) {
        case 0:
          output[rowOffset + x] = raw;
          break;
        case 1:
          output[rowOffset + x] = (raw + left) & 0xff;
          break;
        case 2:
          output[rowOffset + x] = (raw + up) & 0xff;
          break;
        case 3:
          output[rowOffset + x] = (raw + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4:
          output[rowOffset + x] = (raw + paethPredictor(left, up, upperLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter type ${filter}.`);
      }
    }
    sourceOffset += stride;
  }
  return output;
}

function colorChannels(colorType) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type ${colorType}; expected grayscale, RGB, grayscale-alpha, or RGBA.`);
}

export async function decodePng(input) {
  const bytes = asUint8Array(input);
  if (!bytesEqual(bytes.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE)) {
    throw new Error('Input is not a PNG file.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('ascii');
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let compression = -1;
  let filterMethod = -1;
  let interlace = -1;
  const idat = [];

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error(`Truncated PNG chunk ${type}.`);
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      if (length !== 13) throw new Error('Invalid PNG IHDR length.');
      const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = header.getUint32(0, false);
      height = header.getUint32(4, false);
      bitDepth = data[8];
      colorType = data[9];
      compression = data[10];
      filterMethod = data[11];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (width < 1 || height < 1 || idat.length === 0) throw new Error('PNG is missing required image data.');
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}; expected 8-bit channels.`);
  if (compression !== 0 || filterMethod !== 0 || interlace !== 0) {
    throw new Error('Unsupported PNG encoding; expected deflate, adaptive filtering, and no interlace.');
  }

  const channels = colorChannels(colorType);
  const inflated = await transformBytes(concatBytes(idat), 'deflate', 'decompress');
  const pixels = unfilterScanlines(inflated, width, height, channels);
  const rgba = new Uint8Array(width * height * 4);

  for (let source = 0, target = 0; source < pixels.length; source += channels, target += 4) {
    if (colorType === 0) {
      rgba[target] = pixels[source];
      rgba[target + 1] = pixels[source];
      rgba[target + 2] = pixels[source];
      rgba[target + 3] = 255;
    } else if (colorType === 2) {
      rgba[target] = pixels[source];
      rgba[target + 1] = pixels[source + 1];
      rgba[target + 2] = pixels[source + 2];
      rgba[target + 3] = 255;
    } else if (colorType === 4) {
      rgba[target] = pixels[source];
      rgba[target + 1] = pixels[source];
      rgba[target + 2] = pixels[source];
      rgba[target + 3] = pixels[source + 1];
    } else {
      rgba.set(pixels.subarray(source, source + 4), target);
    }
  }

  return { width, height, rgba };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatBytes([typeBytes, data])), false);
  return chunk;
}

export async function encodeRgbaPng(width, height, rgbaInput) {
  const rgba = asUint8Array(rgbaInput);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('PNG dimensions must be positive integers.');
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, received ${rgba.length}.`);
  }

  const scanlines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    scanlines[target] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), target + 1);
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width, false);
  headerView.setUint32(4, height, false);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const compressed = await transformBytes(scanlines, 'deflate', 'compress');
  return concatBytes([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

export async function comparePngBuffers(referenceInput, implementationInput, options = {}) {
  const pixelThreshold = options.pixelThreshold ?? 0;
  if (!Number.isFinite(pixelThreshold) || pixelThreshold < 0 || pixelThreshold > 1) {
    throw new Error('pixelThreshold must be between 0 and 1.');
  }

  const [reference, implementation] = await Promise.all([
    decodePng(referenceInput),
    decodePng(implementationInput),
  ]);
  if (reference.width !== implementation.width || reference.height !== implementation.height) {
    throw new Error(
      `PNG dimensions differ: reference is ${reference.width}x${reference.height}, implementation is ${implementation.width}x${implementation.height}.`,
    );
  }

  const pixelCount = reference.width * reference.height;
  const diffRgba = new Uint8Array(pixelCount * 4);
  const threshold = pixelThreshold * 255;
  let differentPixels = 0;
  let totalDelta = 0;
  let maxChannelDelta = 0;

  for (let offset = 0; offset < reference.rgba.length; offset += 4) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(reference.rgba[offset + channel] - implementation.rgba[offset + channel]);
      totalDelta += delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      pixelDelta = Math.max(pixelDelta, delta);
    }
    if (pixelDelta > threshold) {
      differentPixels += 1;
      diffRgba.set([255, 0, 255, 255], offset);
    } else {
      const gray = Math.round(
        reference.rgba[offset] * 0.299 +
        reference.rgba[offset + 1] * 0.587 +
        reference.rgba[offset + 2] * 0.114,
      );
      diffRgba.set([gray, gray, gray, 96], offset);
    }
  }

  return {
    width: reference.width,
    height: reference.height,
    pixelCount,
    differentPixels,
    diffRatio: differentPixels / pixelCount,
    meanAbsoluteError: totalDelta / (pixelCount * 4 * 255),
    maxChannelDelta,
    diffRgba,
  };
}
