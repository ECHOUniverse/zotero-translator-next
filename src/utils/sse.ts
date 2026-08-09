/**
 * SSE（Server-Sent Events）流解析器（纯函数）
 * 用于 OpenAI 兼容渠道的 /chat/completions 流式响应。
 */

export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * 解析 SSE 缓冲：按空行分隔事件，返回完整事件与未完成残留。
 * 支持 data: 多行合并、event: 字段、注释行（:）、CRLF。
 */
export function parseSSE(buffer: string): { events: SSEEvent[]; rest: string } {
  const events: SSEEvent[] = [];
  let rest = buffer;

  while (true) {
    const sep = rest.search(/\r?\n\r?\n/);
    if (sep === -1) break;
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + (rest.startsWith("\r\n", sep) ? 4 : 2));

    const ev: SSEEvent = { data: "" };
    let hasField = false;
    for (const rawLine of block.split(/\r?\n/)) {
      if (rawLine.startsWith(":")) continue; // 注释
      const colon = rawLine.indexOf(":");
      const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
      const value = colon === -1 ? "" : rawLine.slice(colon + 1).replace(/^ /, "");
      if (field === "data") {
        ev.data = ev.data ? ev.data + "\n" + value : value;
        hasField = true;
      } else if (field === "event") {
        ev.event = value;
        hasField = true;
      }
    }
    if (hasField) events.push(ev);
  }

  return { events, rest };
}
