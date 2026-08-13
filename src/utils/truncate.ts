/**
 * 文本头尾摘要：超过 headLen + tailLen 时，显示「头 headLen 字符 + … + 尾 tailLen 字符」。
 * - 按 Unicode code point 截断（不切断代理对/emoji）
 * - 未超长时原样返回
 * - 纯逻辑、无依赖（可单测）
 */
export function headTail(text: string, headLen = 24, tailLen = 24): string {
  const chars = Array.from(text);
  if (chars.length <= headLen + tailLen) return text;
  return (
    chars.slice(0, headLen).join("") + "…" + chars.slice(-tailLen).join("")
  );
}
