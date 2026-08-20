/**
 * OpenAI 兼容渠道（DeepSeek 预置 + 自定义渠道）。
 * @see PLAN.md §6.3
 * - POST {baseURL}/chat/completions，stream: true（SSE 逐字解析）
 * - 消息模板：system 翻译提示词 + user 上下文/待翻译内容
 * - 取消：不依赖 AbortController，消费循环检查 token
 */

import { prefs } from "../prefs";
import { consumeSSE } from "../utils/sse";
import { requestStream } from "../utils/network";
import { DEEPSEEK_DEFAULT_MODEL } from "./deepseek-admin";
import type { CancelToken } from "../utils/cancel";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

export interface OpenAIConfig {
  id: TranslateChannelId;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  /** 翻译提示词（含 {sourceLang} {targetLang} 变量） */
  prompt: string;
  kind?: "llm";
}

const DEFAULT_TRANSLATE_PROMPT = `You are a professional academic translator. Translate the user-provided text from {sourceLang} into {targetLang}. Keep technical terms accurate, preserve citation markers, formulas and formatting. Output only the translation.`;

export const DEEPSEEK_PRESET: Omit<OpenAIConfig, "apiKey"> = {
  id: "deepseek",
  name: "DeepSeek",
  baseURL: "https://api.deepseek.com",
  model: DEEPSEEK_DEFAULT_MODEL,
  prompt: DEFAULT_TRANSLATE_PROMPT,
};

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
}

export class OpenAIService implements TranslateService {
  readonly id: TranslateChannelId;
  readonly name: string;
  readonly kind = "llm" as const;
  readonly supportsStreaming = true;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
  }

  /** 工厂：构建 DeepSeek 预置实例（key 从偏好读取） */
  static createDeepSeek(): OpenAIService {
    return new OpenAIService({
      ...DEEPSEEK_PRESET,
      apiKey: prefs.deepseekApiKey,
      prompt: prefs.deepseekPrompt,
      baseURL: prefs.deepseekBaseURL,
      model: prefs.deepseekModel,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey) && Boolean(this.config.baseURL);
  }

  private get systemPrompt(): string {
    const p = this.config.prompt || DEFAULT_TRANSLATE_PROMPT;
    return p
      .replaceAll("{sourceLang}", this.sourceLangName)
      .replaceAll("{targetLang}", this.targetLangName);
  }

  private get sourceLangName(): string {
    return this._currentSourceLang || "auto";
  }
  private get targetLangName(): string {
    return this._currentTargetLang || "zh-CN";
  }
  private _currentSourceLang = "";
  private _currentTargetLang = "";

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    this._currentSourceLang = task.sourceLang;
    this._currentTargetLang = task.targetLang;

    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt },
    ];
    let userContent = "";
    if (task.context && prefs.contextAware) {
      userContent += `Context (for reference only, do not translate it):\n${task.context}\n\n`;
    }
    userContent += `Text to translate:\n${task.sourceText}`;
    messages.push({ role: "user", content: userContent });

    const url = `${this.config.baseURL.replace(/\/+$/, "")}/chat/completions`;
    const response = await requestStream({
      url,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      json: {
        model: this.config.model,
        messages,
        stream: true,
        temperature: 0.3,
      },
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    let fullText = "";
    await consumeSSE(
      response.body,
      (data) => {
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as ChatCompletionChunk;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk?.({ index: 0, total: 1, text: delta });
          }
        } catch {
          // 忽略无法解析的行（心跳/注释等）
        }
      },
      task.token,
    );

    return { text: fullText };
  }
}
