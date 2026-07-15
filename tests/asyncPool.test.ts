import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/shared/asyncPool';

describe('mapWithConcurrency', () => {
  it('preserves result order while running independent work concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const results = await mapWithConcurrency([30, 10, 20, 5], 3, async (delay) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return delay * 2;
    });

    expect(results).toEqual([60, 20, 40, 10]);
    expect(maxActive).toBe(3);
  });

  it('never starts more work than the configured limit', async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, index) => index), 4, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    });

    expect(maxActive).toBe(4);
  });

  it('rejects invalid limits instead of silently running unbounded', async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value))
      .rejects.toThrow('positive integer');
  });
});
