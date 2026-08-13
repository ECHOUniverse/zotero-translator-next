/**
 * 分块策略（纯函数）。
 * @see PLAN.md §6.4
 * - 规则渠道：按段落 → 句子边界切分，单块 ≤ maxChars
 * - LLM 渠道：按估算 token 窗口分块（约 4 字符/token）
 */

export interface ChunkOptions {
  maxChars: number;
  maxTokens?: number;
}

/**
 * 常见英文缩写（保护句点，避免被误判为句子边界）。
 * 覆盖 No./Fig./e.g./i.e./et al./单字母缩写（如 C. Chen）等论文高频写法。
 */
const ABBREVIATION =
  /(?:^|[\s(])(?:[A-Za-z]\.|(?:No|Fig|Figs|Eq|Eqs|e\.g|i\.e|vs|etc|cf|al|Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Co|Corp|St|Mt|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.)(?=[\s)\d]|$)/g;

/** 缩写句点占位符（私有区字符，切分完成后还原） */
const ABBREV_PLACEHOLDER = "\uE000";

/**
 * 按句子边界切分一个段落（不破坏 URL/数字小数点/缩写）。
 * - 只认 . ! ? 。 ！ ？ 为句子结束符（分号/冒号不是句子边界，避免从中切开语义单元）
 * - 先保护缩写句点（如 No. 68 的 No.），防止块边界落在缩写中间
 */
function splitSentences(paragraph: string): string[] {
  const protectedText = paragraph.replace(ABBREVIATION, (m) =>
    m.replace(/\./g, ABBREV_PLACEHOLDER),
  );
  const sentences = protectedText.match(/[^.!?。！？]+[.!?。！？]*/g);
  if (!sentences || sentences.length === 0) {
    return [paragraph];
  }
  return sentences
    .map((s) => s.replaceAll(ABBREV_PLACEHOLDER, "."))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 单句超限硬切：优先在切点附近（最多回退 maxChars/2）找空白或软标点回退，
 * 避免把单词/短语拦腰切开导致译文断裂。
 */
function hardSplit(sentence: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = sentence;
  const window = Math.max(Math.floor(maxChars / 2), 1);
  while (rest.length > maxChars) {
    let cut = maxChars;
    for (let i = maxChars; i >= Math.max(maxChars - window, 1); i--) {
      const ch = rest[i - 1];
      if (/\s/.test(ch) || /[,.、;；:：()（）]/.test(ch)) {
        cut = i;
        break;
      }
    }
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/**
 * 通用分块：优先按段落，再按句子边界，最后硬切。
 */
export function chunkText(text: string, options: ChunkOptions): string[] {
  const maxChars = options.maxChars > 0 ? options.maxChars : 10000;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  const push = (chunk: string) => {
    if (chunk.length > 0) chunks.push(chunk);
  };

  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      if (current && current.length + para.length + 2 > maxChars) {
        push(current);
        current = para;
      } else {
        current = current ? current + "\n\n" + para : para;
      }
      continue;
    }
    // 超长段落：按句子切
    push(current);
    current = "";
    let sentenceBuf = "";
    for (const sentence of splitSentences(para)) {
      if (sentence.length > maxChars) {
        // 单句超限：优先边界回退，避免切开单词
        if (sentenceBuf) {
          push(sentenceBuf);
          sentenceBuf = "";
        }
        for (const piece of hardSplit(sentence, maxChars)) {
          push(piece);
        }
      } else if (sentenceBuf.length + sentence.length + 1 > maxChars) {
        push(sentenceBuf);
        sentenceBuf = sentence;
      } else {
        sentenceBuf = sentenceBuf ? sentenceBuf + " " + sentence : sentence;
      }
    }
    push(sentenceBuf);
    sentenceBuf = "";
  }
  push(current);
  return chunks;
}

/** LLM 渠道分块：按 token 估算（字符数 / 4） */
export function chunkTextByTokens(text: string, maxTokens: number): string[] {
  const maxChars = Math.max(maxTokens * 4, 500);
  return chunkText(text, { maxChars });
}

/** 估算 token 数（粗略：英文 ~4 字符/token，CJK ~1.5 字符/token） */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) || [])
    .length;
  const other = text.length - cjk;
  return Math.ceil(cjk / 1.5 + other / 4);
}
