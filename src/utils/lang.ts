/**
 * 语言检测与语言码工具（纯函数）
 */

/**
 * 基于字符分布的粗粒度语言检测：
 * zh（含中日韩统一表意文字）、ja（假名）、ko（谚文）、en（拉丁）、auto（无法判断）
 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000);
  if (!sample) return "auto";

  let cjk = 0;
  let kana = 0;
  let hangul = 0;
  let latin = 0;
  let total = 0;

  for (const ch of sample) {
    const code = ch.codePointAt(0)!;
    if (/[\p{Script=Han}]/u.test(ch)) cjk++;
    else if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) kana++;
    else if (/[\p{Script=Hangul}]/u.test(ch)) hangul++;
    else if (/[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(ch)) latin++;
    else continue;
    total++;
  }
  if (total === 0) return "auto";

  const zhRatio = cjk / total;
  const kanaRatio = kana / total;
  const hangulRatio = hangul / total;
  const latinRatio = latin / total;

  if (kanaRatio >= 0.2) return "ja";
  if (hangulRatio >= 0.2) return "ko";
  if (zhRatio >= 0.3) return "zh";
  if (latinRatio >= 0.5) return "en";
  return "auto";
}

/**
 * 语言码适配：转换为目标渠道接受的格式。
 * bing: zh-CN → zh-Hans, zh-TW → zh-Hant, en → en
 */
export function normalizeLangCode(code: string, channel: "bing" | "llm"): string {
  if (!code || code === "auto") return "auto";
  if (channel === "bing") {
    const lower = code.toLowerCase();
    if (lower === "zh-cn" || lower === "zh-hans" || lower === "zh") return "zh-Hans";
    if (lower === "zh-tw" || lower === "zh-hant") return "zh-Hant";
    if (lower === "en" || lower === "en-us" || lower === "en-gb") return "en";
    return lower;
  }
  return code;
}
