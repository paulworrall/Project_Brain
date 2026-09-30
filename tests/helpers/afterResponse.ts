type Task = () => Promise<void>;

const globalQueue = globalThis as typeof globalThis & { __afterResponseQueue?: Task[] };

/** The tasks the app deferred with runAfterResponse, in order (see tests/setup.ts). */
export function afterResponseQueue(): Task[] {
  globalQueue.__afterResponseQueue ??= [];
  return globalQueue.__afterResponseQueue;
}

/** Runs every deferred task, as the platform would once the response is sent. */
export async function flushAfterResponse(): Promise<void> {
  const queue = afterResponseQueue();
  while (queue.length > 0) {
    await queue.shift()!();
  }
}
