/**
 * 有道网页 demo 翻译渠道（免费、无需 key）。
 * @see https://github.com/windingwind/zotero-pdf-translate/blob/main/src/modules/services/youdao.ts
 *
 * - POST https://aidemo.youdao.com/trans（旧 fanyi.youdao.com/translate 已 302 失效）
 * - 2026-09-06 实测 200 OK（en→zh-CHS →「你好」）
 * - ⚠️ 未文档化 demo 端点，失效时走回退链
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

const YOUDAO_API = "https://aidemo.youdao.com/trans";

const LANG_MAP: Record<string, string> = {
  "zh-CN": "zh-CHS",
  "zh-TW": "zh-CHT",
  "zh-HK": "zh-CHT",
  "zh-MO": "zh-CHT",
};

interface YoudaoResponse {
  errorCode?: string;
  translation?: string[];
}

export function toYoudaoLang(code: string): string {
  const c = code.trim();
  if (!c || c === "auto") return "auto";
  return LANG_MAP[c] ?? c.split("-")[0];
}

export class YoudaoService implements TranslateService {
  readonly id: TranslateChannelId = "youdao";
  readonly name = "Youdao";
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

    const body = new URLSearchParams({
      from: toYoudaoLang(sourceLang),
      to: toYoudaoLang(task.targetLang),
      q: task.sourceText,
    });

    const data = await requestJson<YoudaoResponse>({
      url: YOUDAO_API,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    if (data?.errorCode && data.errorCode !== "0") {
      throw new Error(`Youdao error ${data.errorCode}`);
    }

    const parts = data?.translation ?? [];
    const translated = parts.join("\n").trim();
    if (!translated) {
      throw new Error("Youdao empty response");
    }

    onChunk?.({ index: 0, total: 1, text: translated });
    return { text: translated, detectedLang: sourceLang };
  }
}
