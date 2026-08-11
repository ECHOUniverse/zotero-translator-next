/**
 * MyMemory 翻译渠道（免费、无需 key、中文网络可达）。
 * @see https://mymemory.translated.net/doc/spec.php
 *
 * 限制：
 * - 匿名免费层单请求 ≤ 500 字符（分块按 450 字符切，留余量）
 * - 有配额限制（quotaFinished 字段），超限失败走回退链
 * - 语言对格式：`<ISO639-1>|<ISO639-1>` 或带国家码（en|zh-CN）
 */

import { requestJson } from "../utils/network";
import { detectLang } from "../utils/lang";
import type { CancelToken } from "../utils/cancel";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

const MYMEMORY_API = "https://api.mymemory.translated.net/get";

/** MyMemory 单请求硬上限（500 字符），留余量取 450 */
export const MYMEMORY_MAX_CHARS = 450;

interface MyMemoryResponse {
  responseStatus: number;
  responseDetails?: string;
  responseData?: {
    translatedText: string;
    match?: number;
  };
  quotaFinished?: boolean;
}

/** 语言码 → MyMemory 格式（zh-CN → zh-CN，en → en，ja → ja） */
function toMyMemoryLang(code: string): string {
  const c = code.trim().toLowerCase();
  // MyMemory 接受 zh-CN / zh-TW；其余直接用小写码
  return c;
}

export class MyMemoryService implements TranslateService {
  readonly id: TranslateChannelId = "mymemory";
  readonly name = "MyMemory";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  isConfigured(): boolean {
    return true; // 免费匿名，无需配置
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    const text = task.sourceText;
    // 源语言：auto 时用本地检测（MyMemory 不支持 auto）
    let sourceLang = task.sourceLang;
    if (!sourceLang || sourceLang === "auto") {
      sourceLang = detectLang(text);
    }
    const langpair = `${toMyMemoryLang(sourceLang)}|${toMyMemoryLang(task.targetLang)}`;

    const url = new URL(MYMEMORY_API);
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", langpair);

    const data = await requestJson<MyMemoryResponse>({
      url: url.toString(),
      method: "GET",
      token: task.token,
      timeoutMs: 15000,
    });

    if (!data || data.responseStatus !== 200) {
      const detail = data?.responseDetails ?? "unknown error";
      throw new Error(`MyMemory ${data?.responseStatus ?? "error"}: ${detail}`);
    }
    if (data.quotaFinished) {
      throw new Error("MyMemory quota finished");
    }

    const translated = data.responseData?.translatedText ?? "";
    if (!translated) {
      throw new Error("MyMemory empty response");
    }
    onChunk?.({ index: 0, total: 1, text: translated });
    return { text: translated, detectedLang: sourceLang };
  }
}
