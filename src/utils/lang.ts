/**
 * 语言检测（启发式，纯函数）与目标语言解析。
 * 策略：CJK 字符占比判断中文/日文/韩文；否则按常见脚本特征粗判，
 * 兜底返回 'en'。仅用于"自动检测"，精确检测交给翻译渠道（Bing from=auto）。
 */

export type LangCode =
  | "auto"
  | "zh-CN"
  | "zh-TW"
  | "en"
  | "ja"
  | "ko"
  | "de"
  | "fr"
  | "ru"
  | "es"
  | "it"
  | "pt"
  | "ar"
  | "other";

/** CJK 统一表意文字（含扩展）、假名、谚文 */
const CJK_RE =
  /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/;
const HAN_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/;
const KANA_RE = /[\u3040-\u30FF]/;
const HANGUL_RE = /[\uAC00-\uD7AF]/;
const CYRILLIC_RE = /[\u0400-\u04FF]/;
const ARABIC_RE = /[\u0600-\u06FF]/;

/**
 * 检测文本语言。返回 'zh-CN'（简体为主）、'zh-TW'（繁体为主）、'ja'、'ko'
 * 或常见拉丁语言/其他。
 */
export function detectLang(text: string): LangCode {
  if (!text) return "other";
  const sample = text.slice(0, 2000);
  const cjkCount = (sample.match(CJK_RE) || []).length;
  if (cjkCount === 0) {
    if (CYRILLIC_RE.test(sample)) return "ru";
    if (ARABIC_RE.test(sample)) return "ar";
    return "en"; // 默认拉丁文本按英文处理
  }
  const han = (sample.match(HAN_RE) || []).length;
  const kana = (sample.match(KANA_RE) || []).length;
  const hangul = (sample.match(HANGUL_RE) || []).length;
  if (kana > han) return "ja";
  if (hangul > han) return "ko";
  // 繁体特征：常用繁体字（如 與、為、這、們、國、學、會、後）
  const traditional = /[與為這們國學會後來時對說還進過問題點義體臺東長髮]/g;
  const tradCount = (sample.match(traditional) || []).length;
  const simplified = /[这们国学会后来时对说还进过问题点义体台东长]/g;
  const simpCount = (sample.match(simplified) || []).length;
  return tradCount > simpCount ? "zh-TW" : "zh-CN";
}

/** 规范化用户输入的语言码（'zh' → 'zh-CN'，'zh-hans' → 'zh-CN'） */
export function normalizeLangCode(code: string): string {
  const c = code.trim().toLowerCase();
  if (c === "zh" || c === "zh-hans" || c === "zh-cn") return "zh-CN";
  if (c === "zh-hant" || c === "zh-tw" || c === "zh-hk") return "zh-TW";
  if (c === "auto" || c === "auto-detect") return "auto";
  return code.trim();
}

/**
 * 将检测结果与目标语言结合，输出翻译渠道可用的 from 参数。
 * auto 或空 → 交给渠道自动检测。
 */
export function resolveSourceLang(
  detected: LangCode | string,
  manual: string,
): string {
  if (manual && manual !== "auto") return normalizeLangCode(manual);
  if (!detected || detected === "other") return "auto";
  return normalizeLangCode(detected);
}

/** 语言码 → 人类可读语言名（总结提示词 {targetLang} 插值用） */
const LANG_DISPLAY_NAMES: Record<string, string> = {
  "zh-CN": "中文",
  "zh-TW": "繁體中文",
  en: "English",
  "en-US": "English",
  "en-GB": "English",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  fr: "Français",
  ru: "Русский",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  ar: "العربية",
};

/** 语言名映射：zh-CN → 中文，en-US → English；映射缺失时回退原文代号 */
export function langDisplayName(code: string): string {
  const key = (code ?? "").trim();
  return LANG_DISPLAY_NAMES[key] ?? (key || "中文");
}
