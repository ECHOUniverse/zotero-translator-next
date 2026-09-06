/**
 * 百度翻译开放平台（通用翻译 API）。
 * @see https://fanyi-api.baidu.com/doc/21
 *
 * - GET https://api.fanyi.baidu.com/api/trans/vip/translate
 * - 签名：MD5(appid + q + salt + secretKey)
 * - 标准版约 5 万字符/月、QPS=1；个人认证高级版约 100 万字符/月
 * - 单请求 ≤1000 字符（分块按 900 留余量）
 */

import { prefs } from "../prefs";
import { requestJson } from "../utils/network";
import { md5Hex } from "../utils/md5";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

const BAIDU_API = "https://api.fanyi.baidu.com/api/trans/vip/translate";

/** 标准版单请求硬上限 1000 字符，留余量 */
export const BAIDU_MAX_CHARS = 900;

interface BaiduResponse {
  error_code?: string;
  error_msg?: string;
  trans_result?: Array<{ dst?: string }>;
}

/** 插件语言码 → 百度 API 语言码 */
export function toBaiduLang(code: string): string {
  const c = code.trim().toLowerCase();
  if (!c || c === "auto") return "auto";
  if (c === "zh-cn" || c === "zh-hans" || c === "zh") return "zh";
  if (c === "zh-tw" || c === "zh-hant" || c === "zh-hk") return "cht";
  return c.split("-")[0];
}

export function computeBaiduSign(
  appId: string,
  q: string,
  salt: number,
  secretKey: string,
): string {
  return md5Hex(`${appId}${q}${salt}${secretKey}`);
}

export class BaiduService implements TranslateService {
  readonly id: TranslateChannelId = "baidu";
  readonly name = "Baidu";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  isConfigured(): boolean {
    return Boolean(prefs.baiduAppId && prefs.baiduAppKey);
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    const appId = prefs.baiduAppId;
    const secretKey = prefs.baiduAppKey;
    const salt = Date.now();
    const sign = computeBaiduSign(appId, task.sourceText, salt, secretKey);

    const url = new URL(BAIDU_API);
    url.searchParams.set("q", task.sourceText);
    url.searchParams.set("appid", appId);
    url.searchParams.set("from", toBaiduLang(task.sourceLang));
    url.searchParams.set("to", toBaiduLang(task.targetLang));
    url.searchParams.set("salt", String(salt));
    url.searchParams.set("sign", sign);
    url.searchParams.set("action", prefs.baiduAction || "0");
    url.searchParams.set("needIntervene", "1");

    const data = await requestJson<BaiduResponse>({
      url: url.toString(),
      method: "GET",
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    if (data?.error_code) {
      const e = new Error(
        `Baidu ${data.error_code}: ${data.error_msg ?? "error"}`,
      ) as Error & { status?: number };
      if (data.error_code === "54003") e.status = 429;
      throw e;
    }

    const parts = data?.trans_result ?? [];
    const translated = parts.map((r) => r.dst ?? "").join("");
    if (!translated) {
      throw new Error("Baidu empty response");
    }

    onChunk?.({ index: 0, total: 1, text: translated });
    return { text: translated };
  }
}
