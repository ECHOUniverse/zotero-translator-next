/**
 * 必应翻译渠道（默认渠道）
 * 双模式：
 *  - edge：Edge 匿名 token 流（未文档化内部端点，无需 key）
 *  - azure：官方 Azure Translator v3（需 Ocp-Apim-Subscription-Key，F0 免费层 2M 字符/月）
 */
import {
  TranslateService,
  TranslateTask,
  TranslateResult,
  fetchWithTimeout,
  errorMessage,
} from "./base";
import { getPref } from "../utils/prefs";
import { normalizeLangCode } from "../utils/lang";

const EDGE_TOKEN_URL = "https://edge.microsoft.com/translate/auth";
const EDGE_TRANSLATE_URL =
  "https://api-edge.cognitive.microsofttranslator.com/translate";
const AZURE_TRANSLATE_URL =
  "https://api.cognitive.microsofttranslator.com/translate";
const TOKEN_TTL_MS = 8 * 60 * 1000; // token 有效期约 10 分钟，留余量缓存 8 分钟

export class BingService implements TranslateService {
  readonly id = "bing";
  readonly name = "Bing";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  private tokenCache: { value: string; expires: number } | null = null;

  async translate(
    task: TranslateTask,
    onChunk?: (text: string) => void,
  ): Promise<TranslateResult> {
    const mode = getPref("bing.mode");
    const timeout = getPref("translate.timeout");
    const src = normalizeLangCode(task.sourceLang, "bing");
    const tgt = normalizeLangCode(task.targetLang, "bing");
    // from=auto 时省略该参数（服务端自动检测）
    const fromParam = src === "auto" ? "" : `&from=${src}`;

    let url = `${EDGE_TRANSLATE_URL}?api-version=3.0${fromParam}&to=${tgt}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (mode === "azure") {
      const key = getPref("bing.azureKey").trim();
      if (!key) throw new Error("Azure key 未配置（设置 → 必应 → Azure key）");
      headers["Ocp-Apim-Subscription-Key"] = key;
      const region = getPref("bing.azureRegion").trim();
      if (region) headers["Ocp-Apim-Subscription-Region"] = region;
      url = `${AZURE_TRANSLATE_URL}?api-version=3.0${fromParam}&to=${tgt}`;
    } else {
      headers["Authorization"] = `Bearer ${await this.getEdgeToken(timeout)}`;
    }

    let resp: Response;
    try {
      resp = await fetchWithBackoff(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify([{ Text: task.sourceText }]),
          signal: task.signal,
        },
        timeout,
      );
    } catch (e) {
      throw new Error(`Bing 请求失败: ${errorMessage(e)}`);
    }
    if (!resp.ok) {
      let detail = "";
      try {
        detail = (await resp.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      if (resp.status === 401 || resp.status === 403) {
        // token 失效 → 清除缓存
        this.tokenCache = null;
      }
      throw new Error(
        `Bing HTTP ${resp.status}: ${detail || "请求被拒绝（可能被限流）"}`,
      );
    }

    let data: Array<{
      detectedLanguage?: { language: string; score: number };
      translations?: Array<{ text: string; to: string }>;
    }>;
    try {
      data = (await resp.json()) as unknown as typeof data;
    } catch {
      throw new Error("Bing 响应解析失败");
    }
    const text = data?.[0]?.translations?.[0]?.text;
    if (!text) throw new Error("Bing 返回空结果");
    onChunk?.(text);
    return {
      text,
      detectedLang: data[0]?.detectedLanguage?.language,
    };
  }

  /** 获取 Edge 匿名 token（缓存 8 分钟） */
  private async getEdgeToken(timeout: number): Promise<string> {
    if (this.tokenCache && this.tokenCache.expires > Date.now()) {
      return this.tokenCache.value;
    }
    const resp = await fetchWithTimeout(
      EDGE_TOKEN_URL,
      { method: "POST" },
      timeout,
    );
    if (!resp.ok) {
      throw new Error(`Edge token HTTP ${resp.status}`);
    }
    const token = (await resp.text()).trim();
    if (!token) throw new Error("Edge token 为空");
    this.tokenCache = { value: token, expires: Date.now() + TOKEN_TTL_MS };
    return token;
  }
}

/**
 * 带 429 指数退避的 fetch（1s → 2s → 4s，最多 3 次重试）
 */
async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const delays = [1000, 2000, 4000];
  let resp = await fetchWithTimeout(url, init, timeoutMs);
  let attempt = 0;
  while (resp.status === 429 && attempt < delays.length) {
    const delay = delays[attempt];
    await new Promise((r) => setTimeout(r, delay));
    resp = await fetchWithTimeout(url, init, timeoutMs);
    attempt += 1;
  }
  return resp;
}
