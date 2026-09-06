/**
 * 火山引擎网页翻译渠道（免费、无需 key）。
 *
 * - POST https://translate.volcengine.com/crx/translate/v1/
 * - 2026-09-06 实测 200 OK（en→zh →「你好」）
 * - ⚠️ 未文档化 crx 端点，失效时走回退链
 */

import { prefs } from "../prefs";
import { requestJson } from "../utils/network";
import { detectLang } from "../utils/lang";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

const VOLCENGINE_API = "https://translate.volcengine.com/crx/translate/v1/";

interface VolcengineResponse {
  translation?: string;
  detected_language?: string;
}

/** 火山网页 API 使用主语言码 */
export function toVolcengineLang(code: string): string {
  const c = code.trim();
  if (!c || c === "auto") return "auto";
  return c.split("-")[0];
}

export class VolcengineService implements TranslateService {
  readonly id: TranslateChannelId = "volcengine";
  readonly name = "Volcengine Web";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  isConfigured(): boolean {
    return true;
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    let sourceLang = task.sourceLang;
    if (!sourceLang || sourceLang === "auto") {
      sourceLang = detectLang(task.sourceText);
    }

    const data = await requestJson<VolcengineResponse>({
      url: VOLCENGINE_API,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      json: {
        source_language: toVolcengineLang(sourceLang),
        target_language: toVolcengineLang(task.targetLang),
        text: task.sourceText,
      },
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    const translated = data?.translation?.trim() ?? "";
    if (!translated) {
      throw new Error("Volcengine empty response");
    }

    onChunk?.({ index: 0, total: 1, text: translated });
    return {
      text: translated,
      detectedLang: data?.detected_language ?? sourceLang,
    };
  }
}
