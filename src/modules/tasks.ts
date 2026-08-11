/**
 * 翻译调度：队列 + 取消 + 状态机 + 历史落库。
 * @see PLAN.md §8 队列
 *
 * - 单消费者 FIFO 队列；pump 异常在 finally 释放锁（防死锁，v0.1.4 教训）
 * - 状态机：waiting → processing → success | fail | cancelled
 * - 缓存命中在入队前检查（不占队列）
 * - 流式 onChunk 累积到 task.translatedText，UI 订阅更新
 */

import { prefs } from "../prefs";
import { formatText } from "./formatter";
import { chunkText, chunkTextByTokens } from "./chunker";
import { detectLang, resolveSourceLang } from "../utils/lang";
import {
  createCancelToken,
  CancelError,
  type CancelToken,
} from "../utils/cancel";
import { channelRegistry } from "../services";
import { MYMEMORY_MAX_CHARS } from "../services/mymemory";
import { hashSource, addHistory, queryCache } from "./history";
import type { TranslateChannelId } from "../services/base";

export type TaskStatus =
  | "waiting"
  | "processing"
  | "success"
  | "fail"
  | "cancelled";

export interface TranslateTaskInfo {
  id: string;
  status: TaskStatus;
  /** 原文（未格式化） */
  sourceText: string;
  /** 格式化后文本 */
  formattedText: string;
  /** 译文（流式累积） */
  translatedText: string;
  /** 实际使用的渠道 */
  engine?: TranslateChannelId;
  /** 检测到的源语言 */
  detectedLang?: string;
  error?: string;
  itemID?: number | null;
  fromCache?: boolean;
  channelId: TranslateChannelId;
  createdAt: number;
  summary?: string | null;
  token: CancelToken;
}

export interface TranslateRequest {
  sourceText: string;
  context?: string;
  itemID?: number | null;
  /** 目标渠道；为空则从回退链第一个开始 */
  channelId?: TranslateChannelId;
}

type TaskListener = (task: TranslateTaskInfo) => void;

export class TranslateManager {
  private queue: TranslateTaskInfo[] = [];
  private current: TranslateTaskInfo | null = null;
  private pumping = false;
  private listeners = new Set<TaskListener>();
  private seq = 0;

  /** 订阅任务状态变化（新增/更新/结束） */
  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(task: TranslateTaskInfo): void {
    for (const l of this.listeners) {
      try {
        l(task);
      } catch (e) {
        ztoolkit.log(`task listener error: ${(e as Error).message}`);
      }
    }
  }

  private nextId(): string {
    this.seq++;
    return `t${Date.now().toString(36)}-${this.seq}`;
  }

  /**
   * 翻译入口：格式化 → 缓存检查 → 分块 → 入队。
   * 返回任务信息（status 随进度更新；可 await 结束）。
   */
  async translate(request: TranslateRequest): Promise<TranslateTaskInfo> {
    const sourceText = request.sourceText?.trim() ?? "";
    if (!sourceText) {
      throw new Error("Empty source text");
    }
    const formattedText = formatText(sourceText, {
      mergeLineBreaks: prefs.formatterMergeLineBreaks,
      fixHyphenation: prefs.formatterFixHyphenation,
      normalizeQuotes: prefs.formatterNormalizeQuotes,
      normalizeDashes: prefs.formatterNormalizeDashes,
      normalizeWidth: prefs.formatterNormalizeWidth,
      collapseWhitespace: prefs.formatterCollapseWhitespace,
      normalizeSymbols: prefs.formatterNormalizeSymbols,
    });
    const channelId = request.channelId ?? "bing";
    const targetLang = prefs.targetLang;
    const sourceHash = hashSource(formattedText);

    // 缓存命中
    if (prefs.cacheEnabled) {
      const cached = await queryCache(sourceHash, targetLang, channelId);
      if (cached) {
        const task: TranslateTaskInfo = {
          id: this.nextId(),
          status: "success",
          sourceText,
          formattedText,
          translatedText: cached.translatedText,
          engine: cached.engine,
          fromCache: true,
          itemID: request.itemID ?? cached.itemID,
          channelId,
          createdAt: Date.now(),
          token: createCancelToken(),
          summary: cached.summary,
        };
        this.emit(task);
        return task;
      }
    }

    const token = createCancelToken();
    const task: TranslateTaskInfo = {
      id: this.nextId(),
      status: "waiting",
      sourceText,
      formattedText,
      translatedText: "",
      itemID: request.itemID ?? null,
      channelId,
      createdAt: Date.now(),
      token,
    };
    // 附带上下文/分块信息给执行阶段
    (task as any)._context = request.context;
    this.queue.push(task);
    this.emit(task);
    void this.pump();
    return task;
  }

  /** 队列泵：单消费者 */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        if (!this.queue.length) break;
        const task = this.queue.shift()!;
        this.current = task;
        try {
          await this.execute(task);
        } catch (e) {
          if (e instanceof CancelError) {
            task.status = "cancelled";
          } else {
            task.status = "fail";
            task.error = (e as Error).message;
          }
          this.emit(task);
        } finally {
          this.current = null;
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** 执行单个任务 */
  private async execute(task: TranslateTaskInfo): Promise<void> {
    task.status = "processing";
    this.emit(task);

    const detected = detectLang(task.formattedText);
    const sourceLang = resolveSourceLang(detected, prefs.sourceLang);
    const targetLang = prefs.targetLang;

    const channelId = task.channelId || "mymemory";
    const svc = channelRegistry.get(channelId);
    const isLLM = svc?.kind === "llm";

    // 分块（渠道感知：MyMemory 匿名层单请求 ≤ 500 字符）
    const chunks = isLLM
      ? chunkTextByTokens(task.formattedText, 8000)
      : chunkText(task.formattedText, {
          maxChars:
            channelId === "mymemory"
              ? MYMEMORY_MAX_CHARS
              : prefs.chunkMaxChars || 10000,
        });

    const fullChunks: string[] = [];
    // 回退链起点：首个块用目标渠道，后续块沿用上一块生效渠道
    let fallbackStartId: TranslateChannelId = channelId;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const { result, channelId: usedId } =
        await channelRegistry.translateWithFallback(
          {
            id: task.id,
            sourceText: chunk,
            context: (task as any)._context,
            sourceLang,
            targetLang,
            channelId: fallbackStartId,
            token: task.token,
          },
          (c) => {
            // 流式回调：只累积文本（engine 在 translateWithFallback 返回后设置）
            task.translatedText += c.text;
            this.emit(task);
          },
        );
      fallbackStartId = usedId;
      fullChunks.push(result.text);
      task.translatedText = fullChunks.join("\n\n");
      task.engine = usedId;
      if (result.detectedLang) task.detectedLang = result.detectedLang;
      this.emit(task);
    }

    // 历史落库
    await addHistory({
      itemID: task.itemID ?? null,
      sourceHash: hashSource(task.formattedText),
      sourceText: task.sourceText,
      formattedText: task.formattedText,
      translatedText: task.translatedText,
      summary: task.summary ?? null,
      sourceLang,
      targetLang,
      engine: task.engine ?? channelId,
    });

    task.status = "success";
    this.emit(task);
  }

  /** 取消当前或队列中任务 */
  cancel(taskId: string): void {
    for (const t of this.queue) {
      if (t.id === taskId) {
        t.token.cancel();
        t.status = "cancelled";
        this.emit(t);
        this.queue = this.queue.filter((x) => x.id !== taskId);
        return;
      }
    }
    if (this.current?.id === taskId) {
      this.current.token.cancel();
    }
  }

  /** 取消全部 */
  cancelAll(): void {
    for (const t of this.queue) t.token.cancel();
    this.queue = [];
    this.current?.token.cancel();
  }

  /** 当前任务 */
  getCurrent(): TranslateTaskInfo | null {
    return this.current;
  }

  /** 队列中的任务（不含当前） */
  getQueued(): TranslateTaskInfo[] {
    return this.queue.slice();
  }
}
