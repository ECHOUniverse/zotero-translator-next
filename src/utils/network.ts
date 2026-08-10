/**
 * 网络请求封装（基于原生 fetch；Zotero 9 特权作用域可用）。
 * 取消/超时通过 CancelToken + Promise.race 实现，不依赖 AbortController。
 */

import { createCancelToken, raceWithCancel, type CancelToken } from "./cancel";

export class HttpError extends Error {
  status: number;
  statusText: string;
  body?: string;

  constructor(status: number, statusText: string, body?: string) {
    super(`HTTP ${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export interface JsonRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  body?: string;
  token?: CancelToken;
  timeoutMs?: number;
}

function buildFetchInit(options: JsonRequestOptions): {
  url: string;
  init: RequestInit;
} {
  const { url, method = "GET", headers = {}, json, body } = options;
  const init: RequestInit = { method, headers };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers = {
      "Content-Type": "application/json",
      ...headers,
    };
  } else if (body !== undefined) {
    init.body = body;
  }
  return { url, init };
}

/** JSON 请求：2xx 解析 JSON，其余抛 HttpError */
export async function requestJson<T>(options: JsonRequestOptions): Promise<T> {
  const { url, init } = buildFetchInit(options);
  const { token, timeoutMs } = options;
  const effectiveToken = token ?? createCancelToken();
  const response = await raceWithCancel(
    fetch(url, init),
    effectiveToken,
    timeoutMs,
  );
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, text);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(response.status, "Invalid JSON response", text);
  }
}

/** 流式请求：返回 Response，由调用方消费 body（SSE 等） */
export async function requestStream(
  options: JsonRequestOptions,
): Promise<Response> {
  const { url, init } = buildFetchInit(options);
  const { token, timeoutMs } = options;
  const effectiveToken = token ?? createCancelToken();
  const response = await raceWithCancel(
    fetch(url, init),
    effectiveToken,
    timeoutMs,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(response.status, response.statusText, text);
  }
  return response;
}
