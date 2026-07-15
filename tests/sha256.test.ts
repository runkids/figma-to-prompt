import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/shared/sha256';

function nodeDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('sha256Hex', () => {
  it.each([
    new Uint8Array(),
    new TextEncoder().encode('abc'),
    Uint8Array.from({ length: 257 }, (_, index) => index % 256),
  ])('matches SHA-256 for %s bytes', (bytes) => {
    expect(sha256Hex(bytes)).toBe(nodeDigest(bytes));
  });
});
