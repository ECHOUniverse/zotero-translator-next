/**
 * 腾讯交互翻译 Transmart 网页渠道（免费、无需 key）。
 *
 * - POST https://transmart.qq.com/api/imt
 * - 2026-09-06 实测 200 OK（en→zh →「你好」）
 * - ⚠️ client_key 为网页端硬编码，可能失效；失效时走回退链
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

const TRANSMART_API = "https://transmart.qq.com/api/imt";

/** 与 zotero-pdf-translate 相同 */
const CLIENT_KEY =
  "browser-chrome-110.0.0-Mac OS-df4bd4c5-a65d-44b2-a40f-42f34f3535f2-1677486696487";

interface TransmartResponse {
  auto_translation?: string[];
  header?: { ret_code?: string };
}

/** Transmart 只接受主语言码 */
export function toTransmartLang(code: string): string {
  const c = code.trim();
  if (!c || c === "auto") return "auto";
  return c.split("-")[0];
}

export class TransmartService implements TranslateService {
  readonly id: TranslateChannelId = "transmart";
  readonly name = "Tencent Transmart";
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

    const from = toTransmartLang(sourceLang);
    const to = toTransmartLang(task.targetLang);

    const payload = {
      header: {
        fn: "auto_translation",
        client_key: CLIENT_KEY,
      },
      type: "plain",
      model_category: "normal",
      source: {
        lang: from,
        text_list: [task.sourceText],
      },
      target: {
        lang: to,
      },
    };

    const data = await requestJson<TransmartResponse>({
      url: TRANSMART_API,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://transmart.qq.com/zh-CN/index",
      },
      json: payload,
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    const parts = data?.auto_translation ?? [];
    const translated = parts.join("\n").trim();
    if (!translated) {
      const ret = data?.header?.ret_code ?? "unknown";
      throw new Error(`Transmart empty response (${ret})`);
    }

    onChunk?.({ index: 0, total: 1, text: translated });
    return { text: translated, detectedLang: sourceLang };
  }
}
