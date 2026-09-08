export const AUTOMATION_BATCH_SIZE = 5;
export const AUTOMATION_MAX_RETRIES = 2;

export function createBatches<T>(
  items: T[],
  batchSize: number
): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  return batches;
}