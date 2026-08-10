/**
 * 翻译服务抽象接口。
 * @see PLAN.md §6.1
 */

import type { CancelToken } from "../utils/cancel";

export type TranslateChannelId = string;

export interface TranslateTask {
  id: string;
  /** 格式化后的待翻译文本（可多段） */
  sourceText: string;
  /** 上下文（仅 LLM 渠道使用；前后文各一段落） */
  context?: string;
  sourceLang: string;
  targetLang: string;
  channelId: TranslateChannelId;
  token: CancelToken;
}

export interface TranslateResult {
  text: string;
  detectedLang?: string;
  fromCache?: boolean;
}

export interface TranslateChunk {
  index: number;
  total: number;
  text: string;
}

export interface TranslateService {
  readonly id: TranslateChannelId;
  readonly name: string;
  readonly kind: "rule" | "llm";
  readonly supportsStreaming: boolean;
  /** 是否已配置可用（key 等就绪） */
  isConfigured(): boolean;
  /**
   * 翻译单块文本。
   * @param onChunk 流式回调（若 supportsStreaming，逐增量调用）
   */
  translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult>;
}

export interface ChannelMeta {
  id: TranslateChannelId;
  name: string;
  kind: "rule" | "llm";
  /** 需要用户配置 key 才能用 */
  needsConfig: boolean;
  configured: boolean;
  enabled: boolean;
}
