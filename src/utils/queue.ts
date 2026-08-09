/**
 * 翻译任务队列（纯 TS，无 Zotero 依赖，可单测）
 * 单消费者 FIFO；等待中任务可取消，处理中任务通过 AbortSignal 取消。
 */

export type TaskStatus =
  | "waiting"
  | "processing"
  | "success"
  | "fail"
  | "cancelled";

export interface QueueTask<T> {
  id: string;
  status: TaskStatus;
  payload: T;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export type TaskProcessor<T> = (
  payload: T,
  signal: AbortSignal,
) => Promise<void>;

let seq = 0;

function nextId(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export class TaskQueue<T> {
  private tasks: QueueTask<T>[] = [];
  private processing = false;
  private processor: TaskProcessor<T>;
  private controller: AbortController | null = null;

  /** 任务状态变化回调（waiting→processing→终态） */
  onUpdate?: (task: QueueTask<T>) => void;

  constructor(processor: TaskProcessor<T>) {
    this.processor = processor;
  }

  /** 入队；返回的 Promise 在任务到达终态时 resolve（fail 时 reject） */
  add(payload: T): Promise<QueueTask<T>> {
    const task: QueueTask<T> = {
      id: nextId(),
      status: "waiting",
      payload,
      createdAt: Date.now(),
    };
    this.tasks.push(task);
    this.emit(task);
    void this.pump();
    return new Promise<QueueTask<T>>((resolve, reject) => {
      this.finishListeners.set(task.id, (t) => {
        if (t.status === "fail") reject(new Error(t.error || "task failed"));
        else resolve(t);
      });
    });
  }

  private finishListeners = new Map<string, (t: QueueTask<T>) => void>();

  /** 取消任务：waiting 直接移除；processing 触发 abort */
  cancel(id: string): boolean {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const task = this.tasks[idx];
    if (task.status === "waiting") {
      task.status = "cancelled";
      task.finishedAt = Date.now();
      this.tasks.splice(idx, 1);
      this.emit(task);
      this.resolveFinish(task);
      return true;
    }
    if (task.status === "processing") {
      this.controller?.abort();
      return true;
    }
    return false;
  }

  /** 取消当前处理中的任务（若有） */
  cancelProcessing(): boolean {
    if (this.processing && this.controller) {
      this.controller.abort();
      return true;
    }
    return false;
  }

  /** 清空等待队列（处理中任务不受影响） */
  clear(): void {
    const cancelled = this.tasks.filter((t) => t.status === "waiting");
    this.tasks = this.tasks.filter((t) => t.status !== "waiting");
    for (const t of cancelled) {
      t.status = "cancelled";
      t.finishedAt = Date.now();
      this.emit(t);
      this.resolveFinish(t);
    }
  }

  size(): number {
    return this.tasks.length;
  }

  waiting(): number {
    return this.tasks.filter((t) => t.status === "waiting").length;
  }

  processingCount(): number {
    return this.tasks.filter((t) => t.status === "processing").length;
  }

  /** 当前所有任务（含终态，仅保留最近记录） */
  all(): QueueTask<T>[] {
    return [...this.tasks];
  }

  private emit(t: QueueTask<T>) {
    this.onUpdate?.(t);
  }

  private resolveFinish(t: QueueTask<T>) {
    const fn = this.finishListeners.get(t.id);
    if (fn) {
      this.finishListeners.delete(t.id);
      fn(t);
    }
  }

  private async pump(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.tasks.length > 0) {
      const task = this.tasks[0];
      if (task.status !== "waiting") {
        this.tasks.shift();
        continue;
      }
      task.status = "processing";
      task.startedAt = Date.now();
      this.emit(task);
      this.controller = new AbortController();
      try {
        await this.processor(task.payload, this.controller.signal);
        task.status = "success";
      } catch (e) {
        if (this.controller.signal.aborted) {
          task.status = "cancelled";
        } else {
          task.status = "fail";
          task.error = e instanceof Error ? e.message : String(e);
        }
      }
      task.finishedAt = Date.now();
      this.tasks.shift();
      this.emit(task);
      this.resolveFinish(task);
    }
    this.processing = false;
  }
}
