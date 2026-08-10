/**
 * 翻译管线协调器：
 * 格式化 → 语言检测 → 分块 → 缓存命中检查 → 队列调度 → 渠道回退 → 历史入库
 */
import { TaskQueue } from "../utils/queue";
import { formatText, FormatOptions } from "../utils/format";
import { chunkText } from "../utils/chunker";
import { detectLanguage } from "../utils/lang";
import { getPref } from "../utils/prefs";
import { getChannels } from "../services";
import { errorMessage, isAbortError } from "../services/base";
import { createAbortController } from "../utils/abort";
import { addHistory, findCache, hashSource } from "./history";

export interface TranslateRequest {
  /** 原始文本（未格式化） */
  sourceText: string;
  /** 上下文（LLM 渠道使用，如条目标题） */
  context?: string;
  itemID?: number;
  sourceLang?: string;
  targetLang?: string;
}

export interface TranslationEvent {
  type: "queued" | "processing" | "chunk" | "success" | "fail" | "cancelled";
  taskId: string;
  /** chunk 事件：流式增量 */
  delta?: string;
  /** success：完整结果 */
  result?: {
    text: string;
    engine: string;
    fromCache: boolean;
    formattedText?: string | null;
    detectedLang?: string;
    historyId?: number;
    sourceText?: string;
  };
  error?: string;
}

export interface TranslateJobMeta {
  taskId: string;
  request: TranslateRequest;
  formattedText: string;
  sourceLang: string;
  targetLang: string;
  chunks: string[];
}

let taskSeq = 0;

function cryptoTaskId(): string {
  taskSeq += 1;
  return `t${Date.now().toString(36)}${taskSeq.toString(36)}`;
}

export class TranslateManager {
  /** 内部任务队列（并发 1，FIFO） */
  readonly queue = new TaskQueue<TranslateJobMeta>((job, signal) =>
    this.process(job, signal),
  );
  /** 事件总线（多订阅者；UI 区块可各自订阅） */
  private listeners = new Set<(ev: TranslationEvent) => void>();

  addEventListener(fn: (ev: TranslationEvent) => void): void {
    this.listeners.add(fn);
  }

  removeEventListener(fn: (ev: TranslationEvent) => void): void {
    this.listeners.delete(fn);
  }

  /** 最近一次划选文本（reader 弹层事件写入） */
  selectedText = "";

  private emit(ev: TranslationEvent) {
    for (const fn of this.listeners) {
      try {
        fn(ev);
      } catch (e) {
        ztoolkit.log("translate event handler error", e);
      }
    }
  }

  formatOptions(): FormatOptions {
    return {
      mergeLineBreaks: getPref("formatter.mergeLineBreaks"),
      fixHyphenation: getPref("formatter.fixHyphenation"),
      normalizeQuotes: getPref("formatter.normalizeQuotes"),
      normalizeDashes: getPref("formatter.normalizeDashes"),
      normalizeWidth: getPref("formatter.normalizeWidth"),
      collapseWhitespace: getPref("formatter.collapseWhitespace"),
      normalizeSymbols: getPref("formatter.normalizeSymbols"),
    };
  }

  /**
   * 发起翻译：格式化 → 缓存检查 → 入队。
   * 返回任务 id；进度通过 onEvent 推送。
   */
  translate(req: TranslateRequest): string {
    const formattedText = formatText(req.sourceText, this.formatOptions());
    const sourceLang = req.sourceLang || getPref("sourceLang");
    const targetLang = req.targetLang || getPref("targetLang");

    const taskId = cryptoTaskId();
    const meta: TranslateJobMeta = {
      taskId,
      request: req,
      formattedText,
      sourceLang,
      targetLang,
      chunks: [],
    };

    // 缓存命中检查（异步；命中则直接 success，否则入队）
    void this.checkCacheAndEnqueue(meta);
    return taskId;
  }

  private async checkCacheAndEnqueue(meta: TranslateJobMeta): Promise<void> {
    try {
      if (getPref("cacheEnabled")) {
        const engines = getChannels().map((c) => c.id);
        const hit = await findCache(
          hashSource(meta.formattedText),
          meta.targetLang,
          engines,
        );
        if (hit) {
          this.emit({
            type: "success",
            taskId: meta.taskId,
            result: {
              text: hit.translatedText,
              engine: hit.engine,
              fromCache: true,
              formattedText: hit.formattedText,
              detectedLang: hit.sourceLang,
              sourceText: meta.request.sourceText,
            },
          });
          return;
        }
      }
    } catch (e) {
      // 缓存查询失败不阻塞翻译
      ztoolkit.log("cache lookup failed", e);
    }

    // 分块（含 LLM 渠道时缩小单块，保证上下文窗口）
    const maxChars = getPref("translate.chunkMaxChars");
    const channels = getChannels();
    const anyLLM = channels.some((c) => c.kind === "llm");
    meta.chunks = chunkText(
      meta.formattedText,
      anyLLM ? Math.min(maxChars, 4000) : maxChars,
    );

    this.emit({ type: "queued", taskId: meta.taskId });
    void this.queue
      .add(meta)
      .then((t) => {
        if (t.status === "cancelled") {
          this.emit({ type: "cancelled", taskId: meta.taskId });
        }
      })
      .catch((e: unknown) => {
        if (isAbortError(e)) {
          this.emit({ type: "cancelled", taskId: meta.taskId });
        } else {
          this.emit({
            type: "fail",
            taskId: meta.taskId,
            error: errorMessage(e),
          });
        }
      });
  }

  /** 取消任务（等待中移除 / 处理中 abort） */
  cancel(taskId: string): boolean {
    return this.queue.cancel(taskId);
  }

  cancelCurrent(): boolean {
    return this.queue.cancelProcessing();
  }

  /** 队列处理器：逐块翻译，失败整任务回退下一渠道 */
  private async process(
    job: TranslateJobMeta,
    signal?: AbortSignal,
  ): Promise<void> {
    this.emit({ type: "processing", taskId: job.taskId });

    const channels = getChannels();
    const detected = detectLanguage(job.formattedText);
    const srcLang = job.sourceLang === "auto" ? detected : job.sourceLang;

    const contextAware = getPref("translate.contextAware");
    const context = contextAware ? job.request.context : undefined;

    const errors: string[] = [];
    let engine = "";
    let translated = "";
    let ok = false;

    // 渠道级回退：整任务重试下一渠道（避免混用引擎输出）
    for (const ch of channels) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      // 重置流式缓冲（避免回退后残留上一渠道的增量）
      this.emit({ type: "processing", taskId: job.taskId });
      const parts: string[] = [];
      let chunkOk = true;
      for (let i = 0; i < job.chunks.length; i++) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        try {
          const res = await ch.translate(
            {
              id: job.taskId,
              sourceText: job.chunks[i],
              context,
              sourceLang: srcLang,
              targetLang: job.targetLang,
              signal,
            },
            (delta) => this.emit({ type: "chunk", taskId: job.taskId, delta }),
          );
          parts[i] = res.text;
        } catch (e) {
          errors.push(`[${ch.name}] ${errorMessage(e)}`);
          chunkOk = false;
          break;
        }
      }
      if (chunkOk) {
        translated = parts.join("\n\n");
        engine = ch.id;
        ok = true;
        break;
      }
    }

    if (!ok) {
      throw new Error(errors.join("; ") || "没有可用的翻译渠道");
    }

    // 入历史（sourceHash = 格式化后文本的 hash，与缓存查询键一致）
    let historyId: number | undefined;
    try {
      historyId = await addHistory(
        {
          itemID: job.request.itemID ?? null,
          sourceText: job.request.sourceText,
          formattedText: job.formattedText,
          translatedText: translated,
          summary: null,
          sourceLang: srcLang,
          targetLang: job.targetLang,
          engine,
        },
        hashSource(job.formattedText),
      );
    } catch (e) {
      ztoolkit.log("save history failed", e);
    }

    this.emit({
      type: "success",
      taskId: job.taskId,
      result: {
        text: translated,
        engine,
        fromCache: false,
        formattedText: job.formattedText,
        detectedLang: detected,
        historyId,
        sourceText: job.request.sourceText,
      },
    });
  }
}
