/**
 * 渠道抽象层：TranslateService 接口与任务类型定义
 */

import { createAbortController } from "../utils/abort";

export interface TranslateTask {
  id: string;
  sourceText: string;
  /** 上下文（仅 LLM 渠道使用，如条目标题/前后文） */
  context?: string;
  /** "auto" 或具体语言码（如 zh-CN） */
  sourceLang: string;
  targetLang: string;
  signal?: AbortSignal;
}

export interface TranslateResult {
  text: string;
  /** 检测到的源语言（如 zh） */
  detectedLang?: string;
}

export interface TranslateService {
  readonly id: string;
  readonly name: string;
  readonly kind: "rule" | "llm";
  readonly supportsStreaming: boolean;
  /**
   * 翻译单个文本块。
   * @param onChunk 流式回调（LLM 逐字；规则渠道整块回调一次）
   */
  translate(
    task: TranslateTask,
    onChunk?: (text: string) => void,
  ): Promise<TranslateResult>;
}

/** 带超时与外部取消的 fetch 包装（AbortController 缺失时自动降级） */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = createAbortController();
  if (!controller) {
    // Zotero 9 沙盒无 AbortController：无法真正取消底层请求，
    // 超时用 Promise.race 兜底（迟到的响应直接丢弃）。
    return await fetchWithTimeoutFallback(input, init, timeoutMs);
  }
  const timer = setTimeout(
    () => controller.abort(new Error("timeout")),
    timeoutMs,
  );
  const external = init.signal;
  const onAbort = () => controller.abort();
  external?.addEventListener("abort", onAbort);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

/** 无 AbortController 环境的超时降级：race 一个超时 Promise（不取消底层请求） */
async function fetchWithTimeoutFallback(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Request timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([fetch(input, init), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 提取错误信息（含 AbortError 判定） */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}
