/**
 * OpenAI 兼容渠道（DeepSeek 预置 + 用户自定义）
 * 走 /chat/completions，SSE 流式解析，支持 AbortSignal 取消。
 */
import {
  TranslateService,
  TranslateTask,
  TranslateResult,
  fetchWithTimeout,
  errorMessage,
} from "./base";
import { parseSSE } from "../utils/sse";
import { detectLanguage } from "../utils/lang";
import { getPref } from "../utils/prefs";

export interface OpenAIConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  /** 翻译提示词，支持 {sourceLang} / {targetLang} 占位符 */
  prompt: string;
}

export class OpenAIService implements TranslateService {
  readonly kind = "llm" as const;
  readonly supportsStreaming = true;

  constructor(public readonly cfg: OpenAIConfig) {}

  get id(): string {
    return this.cfg.id;
  }

  get name(): string {
    return this.cfg.name;
  }

  async translate(
    task: TranslateTask,
    onChunk?: (text: string) => void,
  ): Promise<TranslateResult> {
    const srcLabel =
      task.sourceLang === "auto"
        ? "the auto-detected source language"
        : task.sourceLang;
    const system = this.cfg.prompt
      .replace(/\{sourceLang\}/g, srcLabel)
      .replace(/\{targetLang\}/g, task.targetLang);
    const user = task.context
      ? `[Context]\n${task.context}\n\n[Text to translate]\n${task.sourceText}`
      : task.sourceText;

    const text = await this.chat(
      { system, user, signal: task.signal },
      onChunk,
    );
    return { text, detectedLang: detectLanguage(task.sourceText) };
  }

  /** 通用 chat 调用（总结等复用） */
  async chat(
    params: {
      system: string;
      user: string;
      model?: string;
      signal?: AbortSignal;
    },
    onChunk?: (text: string) => void,
  ): Promise<string> {
    const { baseURL, apiKey, model } = this.cfg;
    const useModel = params.model || model;
    if (!apiKey) throw new Error(`${this.name} API key 未配置`);

    const timeout = this.timeout();
    let resp: Response;
    try {
      resp = await fetchWithTimeout(
        `${baseURL.replace(/\/+$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: useModel,
            messages: [
              { role: "system", content: params.system },
              { role: "user", content: params.user },
            ],
            stream: true,
            temperature: 0.3,
          }),
          signal: params.signal,
        },
        timeout,
      );
    } catch (e) {
      throw new Error(`${this.name} 请求失败: ${errorMessage(e)}`);
    }
    if (!resp.ok) {
      let detail = "";
      try {
        detail = (await resp.text()).slice(0, 300);
      } catch {
        /* ignore */
      }
      throw new Error(`${this.name} HTTP ${resp.status}: ${detail}`);
    }
    if (!resp.body) {
      throw new Error(`${this.name} 响应无流`);
    }

    const reader = resp.body.getReader() as ReadableStreamDefaultReader;
    const decoder = new TextDecoder();
    let buf = "";
    let acc = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const { events, rest } = parseSSE(buf);
      buf = rest;
      for (const ev of events) {
        if (ev.data === "[DONE]") continue;
        try {
          const json = JSON.parse(ev.data);
          const delta: string | undefined =
            json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.message?.content;
          if (delta) {
            acc += delta;
            onChunk?.(delta);
          }
        } catch {
          /* 非 JSON 数据块忽略 */
        }
      }
      if (params.signal?.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
    }
    if (!acc.trim()) {
      throw new Error(`${this.name} 返回空结果`);
    }
    return acc;
  }

  private timeout(): number {
    return getPref("translate.timeout");
  }
}
