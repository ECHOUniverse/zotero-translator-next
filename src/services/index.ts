/**
 * 渠道注册表与回退链
 * 渠道顺序 = 设置中 channelsOrder（可拖拽/排序），失败时按序自动回退。
 */
import { TranslateService, TranslateTask, TranslateResult, errorMessage } from "./base";
import { BingService } from "./bing";
import { OpenAIService, OpenAIConfig } from "./openai";
import { getPref, getPrefJSON } from "../utils/prefs";

export type CustomChannel = OpenAIConfig;

/** 读取启用的渠道（按 channelsOrder 排序） */
export function getChannels(): TranslateService[] {
  const order = getPrefJSON<string[]>("channelsOrder", ["bing", "deepseek"]);
  const map = new Map<string, TranslateService>();

  if (getPref("bing.enabled")) {
    map.set("bing", new BingService());
  }
  const deepseekKey = getPref("deepseek.apiKey").trim();
  if (getPref("deepseek.enabled") && deepseekKey) {
    map.set(
      "deepseek",
      new OpenAIService({
        id: "deepseek",
        name: "DeepSeek",
        baseURL: getPref("deepseek.baseURL"),
        apiKey: deepseekKey,
        model: getPref("deepseek.model"),
        prompt: getPref("deepseek.prompt"),
      }),
    );
  }
  for (const c of getPrefJSON<CustomChannel[]>("customChannels", [])) {
    if (c && c.id && c.apiKey && c.baseURL) {
      map.set(c.id, new OpenAIService(c));
    }
  }

  const channels = order
    .map((id) => map.get(id))
    .filter((c): c is TranslateService => Boolean(c));
  return channels;
}

/** 首个可用的 LLM 渠道（总结功能复用） */
export function getFirstLLMChannel(): TranslateService | null {
  return getChannels().find((c) => c.kind === "llm") ?? null;
}

export interface FallbackResult {
  result: TranslateResult;
  engine: string;
  errors: string[];
}

/**
 * 按回退链执行翻译（单块）。
 * @throws 所有渠道均失败时抛出汇总错误
 */
export async function translateWithFallback(
  task: TranslateTask,
  channels: TranslateService[],
  onChunk?: (text: string) => void,
): Promise<FallbackResult> {
  if (channels.length === 0) {
    throw new Error("没有可用的翻译渠道，请在设置中配置（至少启用必应或填写 DeepSeek key）");
  }
  const errors: string[] = [];
  for (const ch of channels) {
    try {
      const result = await ch.translate(task, onChunk);
      return { result, engine: ch.id, errors };
    } catch (e) {
      errors.push(`[${ch.name}] ${errorMessage(e)}`);
    }
  }
  throw new Error(errors.join("; "));
}
