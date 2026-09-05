/**
 * 腾讯云机器翻译 TMT 渠道（TextTranslate API）。
 * @see https://cloud.tencent.com/document/product/551/15619
 *
 * - 端点：POST https://tmt.tencentcloudapi.com
 * - 单次 SourceText < 6000 字符（分块按 5500 留余量）
 * - 免费额度：每月约 500 万字符（开通机器翻译服务后自动发放）
 */

import { prefs } from "../prefs";
import { requestJson } from "../utils/network";
import { signTC3 } from "../utils/tc3";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

const TMT_HOST = "tmt.tencentcloudapi.com";
const TMT_URL = `https://${TMT_HOST}`;
const TMT_SERVICE = "tmt";
const TMT_ACTION = "TextTranslate";
const TMT_VERSION = "2018-03-21";

/** TMT 单请求硬上限 6000 字符，留余量 */
export const TMT_MAX_CHARS = 5500;

interface TmtResponse {
  Response: {
    TargetText?: string;
    Source?: string;
    Target?: string;
    RequestId?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
}

/** 插件语言码 → TMT API 语言码 */
export function toTmtLang(code: string): string {
  const c = code.trim().toLowerCase();
  if (!c || c === "auto") return "auto";
  if (c === "zh-cn" || c === "zh-hans" || c === "zh") return "zh";
  if (c === "zh-tw" || c === "zh-hant" || c === "zh-hk") return "zh-TW";
  return code.trim();
}

/** TMT 响应语言码 → 插件内部码 */
function fromTmtLang(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (code === "zh") return "zh-CN";
  return code;
}

export class TencentService implements TranslateService {
  readonly id: TranslateChannelId = "tencent";
  readonly name = "Tencent TMT";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  isConfigured(): boolean {
    return Boolean(prefs.tencentSecretId && prefs.tencentSecretKey);
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    const source = toTmtLang(task.sourceLang);
    const target = toTmtLang(task.targetLang);
    const payload = JSON.stringify({
      SourceText: task.sourceText,
      Source: source,
      Target: target,
      ProjectId: 0,
    });

    const { headers } = await signTC3({
      secretId: prefs.tencentSecretId,
      secretKey: prefs.tencentSecretKey,
      service: TMT_SERVICE,
      host: TMT_HOST,
      action: TMT_ACTION,
      version: TMT_VERSION,
      region: prefs.tencentRegion || "ap-guangzhou",
      payload,
    });

    const data = await requestJson<TmtResponse>({
      url: TMT_URL,
      method: "POST",
      headers,
      body: payload,
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    const err = data?.Response?.Error;
    if (err?.Code) {
      const message = err.Message ?? err.Code;
      const e = new Error(`Tencent TMT ${err.Code}: ${message}`) as Error & {
        status?: number;
      };
      if (
        err.Code === "RequestLimitExceeded" ||
        err.Code.includes("LimitExceeded")
      ) {
        e.status = 429;
      }
      throw e;
    }

    const translated = data?.Response?.TargetText ?? "";
    if (!translated) {
      throw new Error("Tencent TMT empty response");
    }

    onChunk?.({ index: 0, total: 1, text: translated });
    return {
      text: translated,
      detectedLang: fromTmtLang(data?.Response?.Source),
    };
  }
}
