/**
 * 各渠道单请求字符上限（分块留余量）。
 * @see src/modules/tasks.ts chunkText
 */

import { MYMEMORY_MAX_CHARS } from "../services/mymemory";
import { TMT_MAX_CHARS } from "../services/tencent";
import { BAIDU_MAX_CHARS } from "../services/baidu";
import { ALIYUN_MAX_CHARS } from "../services/aliyun";
import { prefs } from "../prefs";

/** 通用网页端点单块上限（留余量） */
export const WEB_API_MAX_CHARS = 4500;

/** 按渠道 id 返回分块 maxChars */
export function channelMaxChars(channelId: string): number {
  switch (channelId) {
    case "mymemory":
      return MYMEMORY_MAX_CHARS;
    case "tencent":
      return TMT_MAX_CHARS;
    case "baidu":
      return BAIDU_MAX_CHARS;
    case "aliyun":
      return ALIYUN_MAX_CHARS;
    case "youdao":
    case "transmart":
    case "volcengine":
    case "google":
      return WEB_API_MAX_CHARS;
    default:
      return prefs.chunkMaxChars || 10000;
  }
}
