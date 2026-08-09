/**
 * 规则化格式化管线（纯函数，无 Zotero 依赖，可单测）
 *
 * 处理顺序：保护 → 合并换行 → 连字符断词修复 → 引号正常化 → 破折号正常化
 *          → 全半角统一 → 空白压缩 → 特殊符号 → 还原保护
 */

export interface FormatOptions {
  /** 段落内硬换行合并为空格 */
  mergeLineBreaks: boolean;
  /** 修复连字符断词（行尾 - + 词首小写 → 连写） */
  fixHyphenation: boolean;
  /** 引号正常化（英文/«» → 中文成对引号，撇号修复） */
  normalizeQuotes: boolean;
  /** 破折号正常化（-- / – → —） */
  normalizeDashes: boolean;
  /** 全半角统一（全角字母/数字 → 半角） */
  normalizeWidth: boolean;
  /** 空白压缩（多空格/多空行/零宽字符） */
  collapseWhitespace: boolean;
  /** 特殊符号正常化（数学减号/全角连字符/省略号变体） */
  normalizeSymbols: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  mergeLineBreaks: true,
  fixHyphenation: true,
  normalizeQuotes: true,
  normalizeDashes: true,
  normalizeWidth: true,
  collapseWhitespace: true,
  normalizeSymbols: true,
};

export function mergeFormatOptions(
  options?: Partial<FormatOptions>,
): FormatOptions {
  return { ...DEFAULT_FORMAT_OPTIONS, ...options };
}

// 保护清单：URL / DOI / 邮箱 / LaTeX 行内公式与公式块
const PROTECT_PATTERNS = [
  /https?:\/\/[^\s<>"'，。；]+/g,
  /doi:\s*10\.\d{4,9}\/[^\s<>"'，。；]+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\$[^$\n]+\$/g,
  /\\\[[\s\S]*?\\\]/g,
];
const PLACEHOLDER_PREFIX = "\u0001";

function protect(input: string): { text: string; map: string[] } {
  const map: string[] = [];
  let text = input;
  for (const re of PROTECT_PATTERNS) {
    text = text.replace(re, (m) => {
      map.push(m);
      return `${PLACEHOLDER_PREFIX}${map.length - 1}${PLACEHOLDER_PREFIX}`;
    });
  }
  return { text, map };
}

function restore(text: string, map: string[]): string {
  return text.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_PREFIX}`, "g"),
    (_, idx: string) => map[Number(idx)] ?? "",
  );
}

/** 合并段落内硬换行（CRLF 归一化 + 段落边界保留） */
function mergeLineBreaks(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{2,}/g, "__ZTR_PARA__") // 段落边界临时标记
    .replace(/\n/g, " ")
    .replace(/__ZTR_PARA__/g, "\n\n");
}

/** 修复连字符断词：word- 换行 word → wordword
 *  - 两侧均为数字 → 保留（数字区间 10-20）
 *  - 前缀本身含连字符 → 保留（state-of- the-art → state-of-the-art）
 *  - 其余 → 移除断词连字符（inter- national → international）
 */
function fixHyphenation(text: string): string {
  return text.replace(/(\w[-\w]*)-\s+(\w+)/g, (m, a: string, b: string) => {
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) return `${a}-${b}`;
    if (a.includes("-")) return `${a}-${b}`;
    return `${a}${b}`;
  });
}

/**
 * 引号正常化：英文弯引号/ASCII 引号/«» → 中文成对引号（“ ” / ‘ ’）
 * 启发式：
 *  - 双引号：成对交替；孤闭引号修复为开引号
 *  - 单引号：前后均为字母 → 撇号（don't）；词内前一字符为字母且栈非空 → 闭引号；
 *            前字符为字母且栈空 → 撇号/闭引号（dogs'）；其余按栈配对
 */
function normalizeQuotes(text: string): string {
  const chars = Array.from(text);
  const out: string[] = [];
  const dq: boolean[] = [];
  const sq: boolean[] = [];
  const isLetter = (c: string) => /[\p{L}\p{N}]/u.test(c);

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const prev = i > 0 ? chars[i - 1] : "";
    const next = i < chars.length - 1 ? chars[i + 1] : "";

    if (c === '"' || c === "\u201C" || c === "\u201E" || c === "\u00AB") {
      if (dq.length % 2 === 0) {
        out.push("\u201C");
        dq.push(true);
      } else {
        out.push("\u201D");
        dq.push(true);
      }
    } else if (c === "\u201D" || c === "\u00BB") {
      if (dq.length > 0) {
        out.push("\u201D");
        dq.pop();
      } else {
        // 孤闭引号修复为开引号
        out.push("\u201C");
        dq.push(true);
      }
    } else if (c === "'" || c === "\u2018" || c === "\u2019") {
      if (isLetter(prev) && isLetter(next)) {
        // 词内撇号：don't / it's / can't
        out.push("\u2019");
      } else if (isLetter(prev) && sq.length > 0) {
        out.push("\u2019");
        sq.pop();
      } else if (isLetter(prev) && !isLetter(next)) {
        // 所有格或孤闭：dogs' → 撇号
        out.push("\u2019");
      } else if (sq.length % 2 === 0) {
        out.push("\u2018");
        sq.push(true);
      } else {
        out.push("\u2019");
        sq.pop();
      }
    } else {
      out.push(c);
    }
  }
  return out.join("");
}

/** 破折号正常化：-- / – → — */
function normalizeDashes(text: string): string {
  return text.replace(/--/g, "\u2014").replace(/\u2013/g, "\u2014");
}

/** 全半角统一：全角字母/数字 → 半角，全角空格 → 半角 */
function normalizeWidth(text: string): string {
  return text
    .replace(/[\uFF21-\uFF3A]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[\uFF41-\uFF5A]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[\uFF10-\uFF19]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ");
}

/** 空白压缩 + 去除零宽字符 */
function collapseWhitespace(text: string): string {
  return text
    .replace(/\u200B|\u200C|\u200D|\u200E|\u200F|\uFEFF|\u00AD/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 特殊符号正常化 */
function normalizeSymbols(text: string): string {
  return text
    .replace(/\u2212/g, "-") // 数学减号
    .replace(/\uFF0D/g, "-") // 全角连字符
    .replace(/\u22EE/g, "\u2026") // ⋮ → …
    .replace(/\u22EF/g, "\u2026"); // ⋯ → …
}

/**
 * 格式化主入口：按选项顺序执行规则管线
 */
export function formatText(
  input: string,
  options?: Partial<FormatOptions>,
): string {
  const opts = mergeFormatOptions(options);
  if (!input) return input;

  const { text, map } = protect(input);
  let out = text;

  if (opts.mergeLineBreaks) out = mergeLineBreaks(out);
  if (opts.fixHyphenation) out = fixHyphenation(out);
  if (opts.normalizeQuotes) out = normalizeQuotes(out);
  if (opts.normalizeDashes) out = normalizeDashes(out);
  if (opts.normalizeWidth) out = normalizeWidth(out);
  if (opts.collapseWhitespace) out = collapseWhitespace(out);
  if (opts.normalizeSymbols) out = normalizeSymbols(out);

  return restore(out, map);
}
