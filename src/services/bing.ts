/**
 * 必应翻译渠道（默认）。
 * @see PLAN.md §6.2
 *
 * 双模式：
 * - Edge 匿名模式（默认）：edge.microsoft.com/translate/auth 拿 token →
 *   api-edge.cognitive.microsofttranslator.com 翻译。未文档化端点，可能
 *   401/429/失效 → 失败走回退链。
 * - Azure key 模式：官方认知服务端点 + Ocp-Apim-Subscription-Key。
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

const EDGE_AUTH_URL = "https://edge.microsoft.com/translate/auth";
const EDGE_API_URL =
  "https://api-edge.cognitive.microsofttranslator.com/translate";
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
  readonly name = "Bing";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  private tokenCache: { token: string; expiresAt: number } | null = null;

  isConfigured(): boolean {
    if (prefs.bingMode === "azure") {
      return Boolean(prefs.bingAzureKey);
    }
    return true; // Edge 匿名模式无需配置
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    const text = task.sourceText;
    const to = task.targetLang;
    const from =
      task.sourceLang && task.sourceLang !== "auto"
        ? task.sourceLang
        : undefined;

    if (prefs.bingMode === "azure") {
      return this.translateAzure(text, to, from, task.token, onChunk);
    }
    return this.translateEdge(text, to, from, task.token, onChunk);
  }

  // ---- Edge 匿名模式 ----

  private async getEdgeToken(cancelToken: CancelToken): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token;
    }
    const token = await requestJson<string>({
      url: EDGE_AUTH_URL,
      method: "GET",
      token: cancelToken,
      timeoutMs: 15_000,
    });
    // token 约 5 分钟有效，缓存 4 分钟
    this.tokenCache = { token, expiresAt: now + 240_000 };
    return token;
  }

  private async translateEdge(
    text: string,
    to: string,
    from: string | undefined,
    cancelToken: CancelToken,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    const authToken = await this.getEdgeToken(cancelToken);
    const url = new URL(EDGE_API_URL);
    url.searchParams.set("api-version", "3.0");
    url.searchParams.set("to", to);
    if (from) url.searchParams.set("from", from);

    const data = await requestJson<BingTranslateResponse[]>({
      url: url.toString(),
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      json: [{ Text: text }],
      token: cancelToken,
      timeoutMs: prefs.timeout,
    });

    const translated = data?.[0]?.translations?.[0]?.text ?? "";
    onChunk?.({ index: 0, total: 1, text: translated });
    return {
      text: translated,
      detectedLang: data?.[0]?.detectedLanguage?.language,
    };
  }

  // ---- Azure key 模式 ----

  private async translateAzure(
    text: string,
    to: string,
    from: string | undefined,
    cancelToken: CancelToken,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
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
      json: [{ Text: text }],
      token: cancelToken,
      timeoutMs: prefs.timeout,
    });

    const translated = data?.[0]?.translations?.[0]?.text ?? "";
    onChunk?.({ index: 0, total: 1, text: translated });
    return {
      text: translated,
      detectedLang: data?.[0]?.detectedLanguage?.language,
    };
  }
}
