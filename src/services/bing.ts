/**
 * 必应翻译渠道（Azure 官方模式）。
 *
 * ⚠️ 历史：Edge 匿名模式端点（edge.microsoft.com/translate/auth）已于 2026 年
 * 被微软关闭（HTTP 404，社区多项目证实），本渠道仅保留 Azure key 官方模式。
 * 免费开箱即用请使用 mymemory 渠道。
 *
 * Azure 模式：
 * - POST https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=...
 * - 头：Ocp-Apim-Subscription-Key（+ Ocp-Apim-Subscription-Region）
 * - 单请求上限 50,000 字符
 */

import { prefs } from "../prefs";
import { requestJson } from "../utils/network";
import type { CancelToken } from "../utils/cancel";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

const AZURE_API_URL = "https://api.cognitive.microsofttranslator.com/translate";

interface BingTranslateResponse {
  translations: Array<{
    text: string;
    to?: string;
  }>;
  detectedLanguage?: {
    language: string;
    score: number;
  };
}

export class BingService implements TranslateService {
  readonly id: TranslateChannelId = "bing";
  readonly name = "Bing (Azure)";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  isConfigured(): boolean {
    return Boolean(prefs.bingAzureKey);
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    const to = task.targetLang;
    const from =
      task.sourceLang && task.sourceLang !== "auto"
        ? task.sourceLang
        : undefined;

    const url = new URL(AZURE_API_URL);
    url.searchParams.set("api-version", "3.0");
    url.searchParams.set("to", to);
    if (from) url.searchParams.set("from", from);

    const headers: Record<string, string> = {
      "Ocp-Apim-Subscription-Key": prefs.bingAzureKey,
      "Content-Type": "application/json",
    };
    if (prefs.bingAzureRegion) {
      headers["Ocp-Apim-Subscription-Region"] = prefs.bingAzureRegion;
    }

    const data = await requestJson<BingTranslateResponse[]>({
      url: url.toString(),
      method: "POST",
      headers,
      json: [{ Text: task.sourceText }],
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    const translated = data?.[0]?.translations?.[0]?.text ?? "";
    if (!translated) {
      throw new Error("Bing empty response");
    }
    onChunk?.({ index: 0, total: 1, text: translated });
    return {
      text: translated,
      detectedLang: data?.[0]?.detectedLanguage?.language,
    };
  }
}
