/**
 * 分块策略（纯函数）：段落 → 句子边界 → 硬切兜底
 * 规则渠道单块上限默认 10000 字符；LLM 渠道按 token 估算。
 */

const SENTENCE_END =
  /(?<=[。！？；.!?;…][)\]"'”’」』）]?\s*)(?=[A-Z0-9\u4e00-\u9fff])/;

/**
 * 按段落与句子边界切分文本，每块不超过 maxChars。
 * 拼接规则：块之间用 " " 连接可还原原文（段落空行在段落切分时即丢失，属预期）。
 */
export function chunkText(text: string, maxChars: number): string[] {
  if (!text || !text.trim()) return [];
  const limit = Math.max(1, Math.floor(maxChars));

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= limit) {
      chunks.push(para);
      continue;
    }
    // 句子边界切分
    const sentences = para
      .split(SENTENCE_END)
      .map((s) => s.trim())
      .filter(Boolean);
    let current = "";
    for (const sent of sentences) {
      if (!current) {
        current = sent;
      } else if ((current + " " + sent).length <= limit) {
        current += " " + sent;
      } else {
        // 当前块已满；若句子本身超长则硬切
        chunks.push(current);
        current = sent;
      }
      if (current.length > limit) {
        // 硬切兜底
        let rest = current;
        while (rest.length > limit) {
          chunks.push(rest.slice(0, limit));
          rest = rest.slice(limit);
        }
        current = rest;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}
