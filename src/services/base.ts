/**
 * 渠道抽象层：TranslateService 接口与任务类型定义
 */

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

/** 带超时与外部取消的 fetch 包装 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
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

/** 提取错误信息（含 AbortError 判定） */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}
