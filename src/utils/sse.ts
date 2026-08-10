/**
 * SSE（Server-Sent Events）流式解析。
 * 从 fetch Response body（ReadableStream）按行读取，解析 `data:` 行。
 * 不依赖 AbortController：取消由调用方在循环中检查 token。
 */

import type { CancelToken } from "./cancel";

export interface SSECallback {
  (data: string): void;
}

/**
 * 逐块消费响应流，解析 SSE 事件并回调。
 * 标准 SSE：空行分隔事件，`data:` 行累积，`[DONE]` 结束。
 *
 * @param body 响应体（fetch 后 response.body）
 * @param onData 每收到一个完整事件的数据回调（多 data: 行以 \n 连接）
 * @param token 取消令牌（循环中检查，取消即抛 CancelError）
 */
export async function consumeSSE(
  body: ReadableStream<Uint8Array> | null,
  onData: SSECallback,
  token: CancelToken,
): Promise<void> {
  if (!body) return;
  const reader = body.getReader() as unknown as {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let dataBuffer = "";

  const flushData = () => {
    if (dataBuffer) {
      onData(dataBuffer);
      dataBuffer = "";
    }
  };

  const processLine = (line: string) => {
    // 注释行忽略
    if (line.startsWith(":")) return;
    if (line.startsWith("data:")) {
      const data = line.slice(5).trimStart();
      dataBuffer = dataBuffer ? dataBuffer + "\n" + data : data;
    } else if (line === "") {
      // 事件结束（空行）
      flushData();
    }
    // 其他字段（event:/id:/retry:）忽略
  };

  try {
    for (;;) {
      token.throwIfCancelled();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        processLine(line);
      }
    }
    // 流结束：flush 剩余行与未闭合事件
    if (buffer) {
      processLine(buffer.trimEnd());
    }
    flushData();
  } finally {
    reader.releaseLock();
  }
}
