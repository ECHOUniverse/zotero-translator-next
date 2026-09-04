/**
 * 必应翻译渠道（Edge 免费模式 / Azure 官方模式，双模式）。
 *
 * Edge 免费模式（默认，对齐 windingwind/zotero-pdf-translate 的 bing 服务）：
 * - POST https://edge.microsoft.com/translate/translatetext
 *   ?from=..&to=..&isEnterpriseClient=false（单步、匿名、无需 token）
 * - body 为裸字符串数组 `["text"]`，响应取 `[0].translations[0].text`
 * - 限制：from 不接受 auto（400），auto 时本地 detectLang 启发式兜底；
 *   请求须带 User-Agent 头（服务端不校验内容，fetch 自带 Gecko UA 即可，
 *   无需伪造 Edge UA）
 * - ⚠️ 未文档化端点：旧两步接口（GET /translate/auth 拿 token）已于 2026 年
 *   被微软关闭（404）；新单步端点 2026-09 实测可用。失效时失败走回退链。
 *
 * Azure 官方模式：
 * - POST https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=...
 * - 头：Ocp-Apim-Subscription-Key（+ Ocp-Apim-Subscription-Region）
 * - 单请求上限 50,000 字符
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

const EDGE_API_URL = "https://edge.microsoft.com/translate/translatetext";
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

  isConfigured(): boolean {
    if (prefs.bingMode === "azure") {
      return Boolean(prefs.bingAzureKey);
    }
    return true; // Edge 免费模式无需配置
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    if (prefs.bingMode === "azure") {
      return this.translateAzure(task, onChunk);
    }
    return this.translateEdge(task, onChunk);
  }

  // ---- Edge 免费模式（匿名，单步，无 token） ----

  private async translateEdge(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    // Edge 端点不接受 from=auto（400），auto 时用本地启发式检测兜底
    const sourceLang =
      task.sourceLang && task.sourceLang !== "auto"
        ? task.sourceLang
        : detectLang(task.sourceText);

    const url = new URL(EDGE_API_URL);
    url.searchParams.set("from", sourceLang);
    url.searchParams.set("to", task.targetLang);
    url.searchParams.set("isEnterpriseClient", "false");

    const data = await requestJson<BingTranslateResponse[]>({
      url: url.toString(),
      method: "POST",
      // 注意：裸字符串数组，不是 Azure 的 [{ Text }] 对象数组
      json: [task.sourceText],
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    const translated = data?.[0]?.translations?.[0]?.text ?? "";
    if (!translated) {
      throw new Error("Bing empty response");
    }
    onChunk?.({ index: 0, total: 1, text: translated });
    // Edge 响应无 detectedLanguage 字段，回填本地检测的源语言
    return { text: translated, detectedLang: sourceLang };
  }

  // ---- Azure 官方模式 ----

  private async translateAzure(
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
