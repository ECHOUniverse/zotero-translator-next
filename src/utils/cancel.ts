/**
 * 取消令牌：不依赖全局 AbortController（Zotero 9 插件作用域实证缺失，
 * 见旧版 v0.1.4 死锁根因）。
 *
 * 语义：
 * - `cancelled`：同步检查是否已取消
 * - `cancel()`：触发取消（幂等）
 * - `promise`：可 `Promise.race` 做超时/取消竞速
 * - `throwIfCancelled()`：异步流程中抛错中断
 */

export class CancelError extends Error {
  constructor(message = "Task cancelled") {
    super(message);
    this.name = "CancelError";
  }
}

export interface CancelToken {
  readonly cancelled: boolean;
  readonly promise: Promise<never>;
  cancel(): void;
  throwIfCancelled(): void;
}

export function createCancelToken(): CancelToken {
  let cancelled = false;
  let resolveCancel!: (err: CancelError) => void;
  const promise = new Promise<never>((_resolve, reject) => {
    resolveCancel = reject;
  });
  return {
    get cancelled() {
      return cancelled;
    },
    promise,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      resolveCancel(new CancelError());
    },
    throwIfCancelled() {
      if (cancelled) {
        throw new CancelError();
      }
    },
  };
}

/**
 * 竞速辅助：promise 与取消/超时赛跑。
 * 超时或取消时 reject（取消优先）。
 */
export function raceWithCancel<T>(
  promise: Promise<T>,
  token: CancelToken,
  timeoutMs?: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timeoutResolve!: (err: Error) => void;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutResolve = reject;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        timeoutResolve(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }
  });
  return Promise.race([promise, token.promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
