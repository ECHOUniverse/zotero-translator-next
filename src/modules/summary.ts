/**
 * AI 总结：复用当前启用的 LLM（OpenAI 兼容）渠道。
 * @see PLAN.md §10
 * - 模型/提示词可独立覆盖（prefs.summary.model / summary.prompt）
 * - SSE 流式显示；可存入历史（translation_history.summary）
 */

import { prefs } from "../prefs";
import { consumeSSE } from "../utils/sse";
import { requestStream } from "../utils/network";
import type { CancelToken } from "../utils/cancel";
import { channelRegistry } from "../services";
import { updateSummary } from "./history";

export interface SummaryResult {
  text: string;
  channelId: string;
}

export class SummaryManager {
  /** 是否有可用的 LLM 渠道 */
  hasAvailableLLM(): boolean {
    return channelRegistry
      .listEnabled()
      .some((m) => m.kind === "llm" && m.configured);
  }

  /**
   * 流式总结。
   * @param text 待总结文本（译文）
   * @param onChunk 流式增量回调
   */
  async summarize(
    text: string,
    onChunk: (delta: string) => void,
    token: CancelToken,
  ): Promise<SummaryResult> {
    const metas = channelRegistry.listEnabled();
    const llmMeta = metas.find((m) => m.kind === "llm" && m.configured);
    if (!llmMeta) {
      throw new Error("No available LLM channel configured");
    }
    const svc = channelRegistry.get(llmMeta.id);
    if (!svc) {
      throw new Error(`Channel ${llmMeta.id} not found`);
    }

    // 若自定义了总结模型，克隆配置并覆盖
    const customModel = prefs.summaryModel.trim();
    const prompt = prefs.summaryPrompt.trim();

    let baseURL: string | undefined;
    let apiKey: string | undefined;
    let model: string | undefined;
    if (llmMeta.id === "deepseek") {
      baseURL = prefs.deepseekBaseURL;
      apiKey = prefs.deepseekApiKey;
      model = customModel || prefs.deepseekModel;
    } else if (llmMeta.id.startsWith("custom:")) {
      const cfg = prefs.customChannels.find(
        (c) => `custom:${c.id}` === llmMeta.id,
      );
      baseURL = cfg?.baseURL;
      apiKey = cfg?.apiKey;
      model = customModel || cfg?.model;
    }

    if (!baseURL || !apiKey) {
      throw new Error(`Channel ${llmMeta.id} is not fully configured`);
    }

    const messages = [
      {
        role: "system" as const,
        content:
          prompt ||
          "You are an academic assistant. Summarize the given translated text in {targetLang}: key findings, methods and conclusions. Be concise (within 300 words).",
      },
      { role: "user" as const, content: text },
    ];

    const url = `${baseURL.replace(/\/+$/, "")}/chat/completions`;
    const response = await requestStream({
      url,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      json: {
        model,
        messages,
        stream: true,
        temperature: 0.3,
      },
      token,
      timeoutMs: prefs.timeout,
    });

    let fullText = "";
    await consumeSSE(
      response.body,
      (data) => {
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // 忽略解析失败行
        }
      },
      token,
    );

    return { text: fullText, channelId: llmMeta.id };
  }

  /** 保存总结到历史记录 */
  async saveSummary(historyID: number, summary: string): Promise<void> {
    await updateSummary(historyID, summary);
  }
}
