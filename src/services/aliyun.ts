/**
 * 阿里云机器翻译通用版（TranslateGeneral RPC）。
 * @see https://help.aliyun.com/zh/machine-translation/developer-reference/api-overview-1
 *
 * - POST https://mt.aliyuncs.com/
 * - HMAC-SHA1 签名
 * - 约 100 万字符/月免费额度
 */

import { prefs } from "../prefs";
import { requestJson } from "../utils/network";
import { signAliyunTranslateGeneral } from "../utils/aliyun-sign";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

/** 单次请求建议上限（留余量） */
export const ALIYUN_MAX_CHARS = 5000;

interface AliyunResponse {
  Code?: string;
  Message?: string;
  Data?: {
    Translated?: string;
  };
}

export class AliyunService implements TranslateService {
  readonly id: TranslateChannelId = "aliyun";
  readonly name = "Aliyun MT";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  isConfigured(): boolean {
    return Boolean(prefs.aliyunAccessKeyId && prefs.aliyunAccessKeySecret);
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    const { url, body } = await signAliyunTranslateGeneral({
      accessKeyId: prefs.aliyunAccessKeyId,
      accessKeySecret: prefs.aliyunAccessKeySecret,
      endpoint: prefs.aliyunEndpoint,
      sourceText: task.sourceText,
      targetLang: task.targetLang,
      action: prefs.aliyunAction,
      scene: prefs.aliyunScene,
    });

    const data = await requestJson<AliyunResponse>({
      url,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    if (data?.Code && data.Code !== "200") {
      throw new Error(`Aliyun MT ${data.Code}: ${data.Message ?? "error"}`);
    }

    const translated = data?.Data?.Translated ?? "";
    if (!translated) {
      throw new Error("Aliyun MT empty response");
    }

    onChunk?.({ index: 0, total: 1, text: translated });
    return { text: translated };
  }
}
