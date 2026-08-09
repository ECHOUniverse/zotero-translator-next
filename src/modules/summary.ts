/**
 * AI 总结：复用当前启用的 LLM 渠道，模型/提示词可独立覆盖。
 */
import { getPref } from "../utils/prefs";
import { getFirstLLMChannel } from "../services";
import { errorMessage, isAbortError } from "../services/base";
import { OpenAIService } from "../services/openai";
import { updateSummary } from "./history";

export interface SummaryOptions {
  /** 指定 LLM 渠道 id（默认：首个启用的 LLM 渠道） */
  channelId?: string;
  /** 覆盖模型（默认：总结专用模型或渠道默认） */
  model?: string;
  /** 覆盖总结提示词（默认：summary.prompt） */
  prompt?: string;
  signal?: AbortSignal;
  /** 总结完成后写入历史（需 historyId） */
  historyId?: number;
}

export interface SummaryResult {
  text: string;
  engine: string;
}

/**
 * 对译文进行 AI 总结（流式）。
 * @throws 无可用 LLM 渠道时抛出提示
 */
export async function summarize(
  text: string,
  opts: SummaryOptions = {},
  onChunk?: (delta: string) => void,
): Promise<SummaryResult> {
  let channel = getFirstLLMChannel();
  if (opts.channelId && channel?.id !== opts.channelId) {
    channel = getFirstLLMChannel(); // 暂仅支持当前首选；多 LLM 渠道扩展时按 id 查找
  }
  if (!channel || channel.kind !== "llm") {
    throw new Error("总结需要 AI 渠道（DeepSeek 或自定义 OpenAI 兼容渠道），请先在设置中配置");
  }
  const llm = channel as OpenAIService;

  const targetLang = getPref("targetLang");
  const prompt = (opts.prompt || getPref("summary.prompt")).replace(
    /\{targetLang\}/g,
    targetLang,
  );

  try {
    const summaryText = await llm.chat(
      {
        system: prompt,
        user: text,
        model: opts.model || getPref("summary.model") || undefined,
        signal: opts.signal,
      },
      onChunk,
    );
    if (opts.historyId != null) {
      await updateSummary(opts.historyId, summaryText).catch((e) =>
        ztoolkit.log("save summary failed", e),
      );
    }
    return { text: summaryText, engine: channel.id };
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new Error(`总结失败: ${errorMessage(e)}`);
  }
}
