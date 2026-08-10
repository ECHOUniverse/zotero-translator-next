/**
 * 规则化格式化管线（纯函数，可单测）。
 * @see PLAN.md §7
 *
 * 处理顺序（每规则可单独开关）：
 * 1. 合并硬换行（行尾无标点 + 下一个小写字母开头 → 空格）
 * 2. 修复连字符断词（word-⏎word → wordword，仅英文；保留真实连字符）
 * 3. 统一引号（英文弯引号/«» → 中文引号，面向 zh；孤引号修复）
 * 4. 破折号/连字符正常化（-- / – → — 按语境；- 保留）
 * 5. 全半角统一（标点按语言语境）
 * 6. 压缩空白（多空格/空行 → 单；去零宽字符、BOM）
 * 7. 数学/特殊符号正常化（× − · 等）
 *
 * 保护清单：URL、DOI、邮箱、代码片段、LaTeX 公式、文献引用标记 [12] 不参与改写。
 */

export interface FormatterOptions {
  mergeLineBreaks: boolean;
  fixHyphenation: boolean;
  normalizeQuotes: boolean;
  normalizeDashes: boolean;
  normalizeWidth: boolean;
  collapseWhitespace: boolean;
  normalizeSymbols: boolean;
}

export const defaultFormatterOptions: FormatterOptions = {
  mergeLineBreaks: true,
  fixHyphenation: true,
  normalizeQuotes: true,
  normalizeDashes: true,
  normalizeWidth: true,
  collapseWhitespace: true,
  normalizeSymbols: true,
};

// ---- 保护清单：这些片段整体占位，不参与任何改写 ----

const PROTECT_PATTERNS: Array<[RegExp, string]> = [
  // URL / DOI / 邮箱
  [/(https?:\/\/[^\s<>"']+)/g, "\u0001URL\u0001"],
  [/(doi:\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi, "\u0001DOI\u0001"],
  [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, "\u0001EMAIL\u0001"],
  // 文献引用标记 [12] / [12,34] / [1-3]
  [/(\[[0-9,\-\s]+\])/g, "\u0001CITE\u0001"],
  // LaTeX 行内公式 $...$
  [/(\$[^$\n]+\$)/g, "\u0001LATEX\u0001"],
  // 代码片段（行首缩进 + 等号/分号特征，粗略）
  [/(?:^|\n)((?: {2,}|\t)[^\n]*[=;{}][^\n]*)(?=\n|$)/g, "\n\u0001CODE\u0001"],
];

const PROTECT_TOKENS: Record<string, string> = {
  "\u0001URL\u0001": "\u0001URL\u0001",
  "\u0001DOI\u0001": "\u0001DOI\u0001",
  "\u0001EMAIL\u0001": "\u0001EMAIL\u0001",
  "\u0001CITE\u0001": "\u0001CITE\u0001",
  "\u0001LATEX\u0001": "\u0001LATEX\u0001",
  "\u0001CODE\u0001": "\u0001CODE\u0001",
};

interface ProtectedText {
  text: string;
  map: Map<string, string>;
}

/** 保护敏感片段，返回占位文本 + 还原映射 */
function protect(text: string): ProtectedText {
  const map = new Map<string, string>();
  let t = text;
  for (const [pattern, token] of PROTECT_PATTERNS) {
    t = t.replace(pattern, (match) => {
      const key = `${token}${map.size}`;
      map.set(key, match);
      return key;
    });
  }
  return { text: t, map };
}

function restore(text: string, map: Map<string, string>): string {
  let t = text;
  for (const [key, value] of map) {
    t = t.split(key).join(value);
  }
  return t;
}

// ---- 各阶段规则 ----

/** 1. 合并硬换行：行尾无标点且下行以小写字母/数字开头 → 空格 */
export function mergeLineBreaks(text: string): string {
  return text.replace(
    /([^\n.!?;:。！？；：…%）」』"')\u201d\u2019-])\n(?=[a-z0-9([{"'\u201c\u2018])/g,
    "$1 ",
  );
}

/** 2. 修复连字符断词：字母-⏎字母 → 字母字母（英文词内连字符断行） */
export function fixHyphenation(text: string): string {
  return text.replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1$2");
}

/** 3. 统一引号（目标中文语境）：成对弯引号 → 中文引号；孤引号修复 */
export function normalizeQuotes(text: string): string {
  let t = text;
  // 英文双弯引号对 → “”
  t = t.replace(/\u201c([^\u201d]*)\u201d/g, "“$1”");
  // 英文单弯引号对 → ‘’
  t = t.replace(/\u2018([^\u2019]*)\u2019/g, "‘$1’");
  // «» → “”
  t = t.replace(/«([^»]*)»/g, "“$1”");
  // 直双引号对（成对出现）→ “”
  t = t.replace(/"([^"\n]*)"/g, "“$1”");
  // 孤引号（剩余无法配对的）→ 中文引号
  t = t.replace(/\u201c/g, "“").replace(/\u201d/g, "”");
  t = t.replace(/\u2018/g, "‘").replace(/\u2019/g, "’");
  return t;
}

/** 4. 破折号/连字符正常化：-- → —；–（en dash）→ —（语境：数字范围除外） */
export function normalizeDashes(text: string): string {
  let t = text;
  // 双连字符 → em dash
  t = t.replace(/--+/g, "—");
  // en dash：数字范围（1990–2000）保留，其余 → em dash
  t = t.replace(/(?<!\d)\u2013(?!\d)/g, "—");
  return t;
}

/** 5. 全半角统一：中文语境下半角标点 → 全角（避免破坏 URL/代码，已保护） */
export function normalizeWidth(text: string): string {
  let t = text;
  // 逗号/句号/问号/感叹号/冒号/分号：半角→全角（仅当两侧含 CJK 或位于中文句内）
  const cjkNeighbor = (m: string, before: string, after: string) =>
    /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(before) ||
    /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(after);
  t = t.replace(
    /([\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])\s*,(\s*[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])/g,
    "$1，$2",
  );
  t = t.replace(
    /([\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])\s*\.(\s*[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])/g,
    "$1。$2",
  );
  t = t.replace(
    /([\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])\s*\?(\s*[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])/g,
    "$1？$2",
  );
  t = t.replace(
    /([\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])\s*!(\s*[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])/g,
    "$1！$2",
  );
  t = t.replace(
    /([\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])\s*:(\s*[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])/g,
    "$1：$2",
  );
  t = t.replace(
    /([\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])\s*;(\s*[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])/g,
    "$1；$2",
  );
  // 括号：中文语境 （）
  t = t.replace(
    /([\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF])\(([^()\n]{1,80})\)/g,
    "$1（$2）",
  );
  void cjkNeighbor;
  return t;
}

/** 6. 压缩空白：多空格/空行 → 单；去零宽字符、BOM */
export function collapseWhitespace(text: string): string {
  let t = text;
  // 去 BOM 与零宽字符（\uFEFF、零宽系列、\u2060 词连接符）
  for (const ch of ["\uFEFF", "\u200B", "\u200C", "\u200D", "\u2060"]) {
    t = t.split(ch).join("");
  }
  // 制表符 → 空格
  t = t.replace(/\t/g, " ");
  // 行内多空格 → 单空格
  t = t.replace(/[ ]{2,}/g, " ");
  // 空格+换行 → 换行；多个空行 → 单空行
  t = t.replace(/[ \t]*\n[ \t]*/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  // 行首行尾空白
  t = t.replace(/^[ \t]+/gm, "").replace(/[ \t]+$/gm, "");
  return t.trim();
}

/** 7. 数学/特殊符号正常化 */
export function normalizeSymbols(text: string): string {
  let t = text;
  // 乘号 ×；减号 −；中点 ·（保留上下文）；度数 °
  t = t.replace(/[✕✖Ⅹ×]/g, "×");
  t = t.replace(/\u2212/g, "−");
  t = t.replace(/•/g, "·");
  // 上标/下标数字保留（Unicode 本身）
  return t;
}

/**
 * 完整格式化管线：保护 → 按序规则 → 还原。
 */
export function formatText(
  input: string,
  options: FormatterOptions = defaultFormatterOptions,
): string {
  let text = input ?? "";
  const { text: protectedText, map } = protect(text);
  text = protectedText;

  if (options.mergeLineBreaks) text = mergeLineBreaks(text);
  if (options.fixHyphenation) text = fixHyphenation(text);
  if (options.normalizeQuotes) text = normalizeQuotes(text);
  if (options.normalizeDashes) text = normalizeDashes(text);
  if (options.normalizeWidth) text = normalizeWidth(text);
  if (options.collapseWhitespace) text = collapseWhitespace(text);
  if (options.normalizeSymbols) text = normalizeSymbols(text);

  return restore(text, map);
}
