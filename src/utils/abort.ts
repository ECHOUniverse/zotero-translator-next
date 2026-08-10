/**
 * AbortController 安全工厂。
 *
 * Zotero 9 插件沙盒环境实证缺失全局 AbortController（用户日志：
 * ReferenceError: AbortController is not defined），因此所有"取消"能力
 * 必须可降级：有则用，无则返回 null，调用方走无取消路径。
 */

export function createAbortController(): AbortController | null {
  try {
    const C = (globalThis as any).AbortController;
    if (typeof C === "function") return new C();
  } catch (e) {
    // 环境异常（如沙盒禁用）一律降级
  }
  return null;
}

/** 取 controller 的 signal；无 controller 时返回 undefined（fetch 可接受） */
export function abortSignalOf(
  controller: AbortController | null,
): AbortSignal | undefined {
  return controller?.signal;
}

/** 任务是否被取消（无 controller 时恒 false） */
export function isAborted(controller: AbortController | null): boolean {
  return Boolean(controller?.signal.aborted);
}
