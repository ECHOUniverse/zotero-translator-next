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

/** 按句子边界切分一个段落（不破坏 URL/数字小数点） */
function splitSentences(paragraph: string): string[] {
  const sentences = paragraph.match(/[^.!?。！？;；:：]+[.!?。！？;；:：]*/g);
  if (!sentences || sentences.length === 0) {
    return [paragraph];
  }
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
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
        // 单句超限：硬切
        if (sentenceBuf) {
          push(sentenceBuf);
          sentenceBuf = "";
        }
        for (let i = 0; i < sentence.length; i += maxChars) {
          push(sentence.slice(i, i + maxChars));
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
