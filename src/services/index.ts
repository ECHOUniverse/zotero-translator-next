/**
 * 渠道注册表 + 回退链。
 * @see PLAN.md §6.5
 * - 渠道顺序 = prefs.channelsOrder（设置中可排序）= 回退顺序
 * - 失败 → 指数退避（1s→2s→4s，最多 3 次）→ 下一个渠道 → 全部失败抛错
 */

import { prefs, type CustomChannelConfig } from "../prefs";
import { CancelError } from "../utils/cancel";
import { BingService } from "./bing";
import { OpenAIService } from "./openai";
import type {
  ChannelMeta,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

export { BingService, OpenAIService };

export class ChannelRegistry {
  private services = new Map<string, TranslateService>();

  /** 内置渠道工厂（懒构建，读取当前偏好） */
  private buildBuiltin(id: string): TranslateService | null {
    switch (id) {
      case "bing":
        return new BingService();
      case "deepseek":
        return OpenAIService.createDeepSeek();
      default:
        return null;
    }
  }

  /** 构建自定义渠道 */
  private buildCustom(cfg: CustomChannelConfig): OpenAIService {
    return new OpenAIService({
      id: `custom:${cfg.id}`,
      name: cfg.name || cfg.id,
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      model: cfg.model,
      prompt: cfg.prompt,
    });
  }

  /** 按 id 获取渠道实例（不存在时尝试构建） */
  get(id: string): TranslateService | null {
    const cached = this.services.get(id);
    if (cached) return cached;
    const svc = id.startsWith("custom:")
      ? (() => {
          const cfg = prefs.customChannels.find((c) => `custom:${c.id}` === id);
          return cfg ? this.buildCustom(cfg) : null;
        })()
      : this.buildBuiltin(id);
    if (svc) this.services.set(id, svc);
    return svc;
  }

  /** 当前启用的渠道元信息列表（按 channelsOrder） */
  listEnabled(): ChannelMeta[] {
    const order = prefs.channelsOrder;
    const metas: ChannelMeta[] = [];
    for (const id of order) {
      const svc = this.get(id);
      if (!svc) continue;
      const enabled =
        id === "bing"
          ? prefs.bingEnabled
          : id === "deepseek"
            ? prefs.deepseekEnabled
            : true;
      if (!enabled) continue;
      metas.push({
        id: svc.id,
        name: svc.name,
        kind: svc.kind,
        needsConfig: id !== "bing" || prefs.bingMode === "azure",
        configured: svc.isConfigured(),
        enabled,
      });
    }
    return metas;
  }

  /** 全部渠道（含未启用） */
  listAll(): ChannelMeta[] {
    const order = prefs.channelsOrder;
    const metas: ChannelMeta[] = [];
    for (const id of order) {
      const svc = this.get(id);
      if (!svc) continue;
      metas.push({
        id: svc.id,
        name: svc.name,
        kind: svc.kind,
        needsConfig: id !== "bing" || prefs.bingMode === "azure",
        configured: svc.isConfigured(),
        enabled:
          id === "bing"
            ? prefs.bingEnabled
            : id === "deepseek"
              ? prefs.deepseekEnabled
              : true,
      });
    }
    return metas;
  }

  /**
   * 走回退链翻译。
   * @param task 任务（channelId 为目标渠道；null/空 = 按顺序从第一个开始）
   * @returns 结果 + 实际使用的渠道 id
   */
  async translateWithFallback(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<{ result: TranslateResult; channelId: string }> {
    const order = prefs.channelsOrder;
    // 起点：目标渠道在 order 中的位置（不存在则从 0 开始）
    const startIndex = task.channelId
      ? Math.max(
          0,
          order.findIndex((id) => id === task.channelId),
        )
      : 0;

    let lastError: Error | null = null;
    for (let i = startIndex; i < order.length; i++) {
      const id = order[i];
      if (task.token.cancelled) throw new CancelError();
      const svc = this.get(id);
      if (!svc) continue;
      const enabled =
        id === "bing"
          ? prefs.bingEnabled
          : id === "deepseek"
            ? prefs.deepseekEnabled
            : true;
      if (!enabled || !svc.isConfigured()) continue;

      try {
        const result = await this.translateWithRetry(svc, task, onChunk);
        return { result, channelId: id };
      } catch (e) {
        if (e instanceof CancelError) throw e;
        lastError = e as Error;
        ztoolkit.log(
          `[${svc.name}] 翻译失败: ${(e as Error).message}，尝试回退`,
        );
      }
    }
    throw lastError ?? new Error("No available channel");
  }

  /** 单渠道 + 429 指数退避重试（最多 3 次） */
  private async translateWithRetry(
    svc: TranslateService,
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    let attempt = 0;
    for (;;) {
      try {
        return await svc.translate(task, onChunk);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        const isRateLimit = status === 429 || status === 403;
        if (!isRateLimit || attempt >= 3) throw e;
        attempt++;
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  /** 清理缓存的渠道实例（设置变更后调用） */
  invalidate(id?: string): void {
    if (id) {
      this.services.delete(id);
    } else {
      this.services.clear();
    }
  }
}

export const channelRegistry = new ChannelRegistry();
