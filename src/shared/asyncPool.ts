export async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  limit: number,
  worker: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Concurrency limit must be a positive integer.');
  }
  if (items.length === 0) return [];

  const results: Output[] = [];
  results.length = items.length;
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
