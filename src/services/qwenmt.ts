/**
 * 阿里云百炼 Qwen-MT 机器翻译（DashScope OpenAI 兼容）。
 * @see https://help.aliyun.com/zh/model-studio/qwen-mt-api
 *
 * - POST {baseURL}/v1/chat/completions
 * - 必须带顶层 translation_options（英文语言全称）
 * - kind 必须为 rule（不接受普通 LLM system prompt，不可用于 AI 总结）
 * - 新人约 90 天免费额度（华北2 北京地域）
 */

import { prefs } from "../prefs";
import { requestJson } from "../utils/network";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

/** Qwen-MT target_lang / source_lang 英文全称映射 */
const QWEN_MT_LANG: Record<string, string> = {
  en: "English",
  "en-US": "English",
  "en-GB": "English",
  zh: "Chinese",
  "zh-CN": "Chinese",
  "zh-SG": "Chinese",
  "zh-HK": "Traditional Chinese",
  "zh-MO": "Traditional Chinese",
  "zh-TW": "Traditional Chinese",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  ru: "Russian",
  ar: "Arabic",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
  ms: "Malay",
  hi: "Hindi",
  bn: "Bengali",
  ur: "Urdu",
  fa: "Persian",
  he: "Hebrew",
  pl: "Polish",
  ro: "Romanian",
  cs: "Czech",
  hu: "Hungarian",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  el: "Greek",
  no: "Norwegian",
  uk: "Ukrainian",
  km: "Khmer",
};

export function toQwenMtLang(code: string): string {
  const c = code.trim();
  if (!c || c === "auto") return "auto";
  if (QWEN_MT_LANG[c]) return QWEN_MT_LANG[c];
  const base = c.split("-")[0];
  return QWEN_MT_LANG[base] ?? base;
}

interface QwenMtResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message?: string };
}

export class QwenMtService implements TranslateService {
  readonly id: TranslateChannelId = "qwenmt";
  readonly name = "Qwen-MT";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  isConfigured(): boolean {
    return Boolean(prefs.qwenmtApiKey);
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    const baseURL = (
      prefs.qwenmtBaseURL || "https://dashscope.aliyuncs.com/compatible-mode"
    ).replace(/\/+$/, "");
    const model = prefs.qwenmtModel || "qwen-mt-flash";

    const data = await requestJson<QwenMtResponse>({
      url: `${baseURL}/v1/chat/completions`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${prefs.qwenmtApiKey}`,
      },
      json: {
        model,
        messages: [{ role: "user", content: task.sourceText }],
        translation_options: {
          source_lang: toQwenMtLang(task.sourceLang),
          target_lang: toQwenMtLang(task.targetLang),
          ...(prefs.qwenmtDomains.trim()
            ? { domains: prefs.qwenmtDomains.trim() }
            : {}),
        },
      },
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    if (data?.error?.message) {
      throw new Error(`Qwen-MT ${data.error.message}`);
    }

    const translated = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!translated) {
      throw new Error("Qwen-MT empty response");
    }

    onChunk?.({ index: 0, total: 1, text: translated });
    return { text: translated };
  }
}
