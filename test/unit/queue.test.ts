import { expect } from "chai";
import { TaskQueue, QueueTask } from "../../src/utils/queue.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("TaskQueue 任务队列", function () {
  it("FIFO 顺序执行（并发 1）", async function () {
    const order: number[] = [];
    const q = new TaskQueue<number>(async (n) => {
      await sleep(5);
      order.push(n);
    });
    const p1 = q.add(1);
    const p2 = q.add(2);
    const p3 = q.add(3);
    await Promise.all([p1, p2, p3]);
    expect(order).to.deep.equal([1, 2, 3]);
  });

  it("add 的 Promise 在成功后 resolve 任务", async function () {
    const q = new TaskQueue<number>(async (n) => {});
    const task = await q.add(42);
    expect(task.status).to.equal("success");
    expect(task.payload).to.equal(42);
    expect(task.id).to.be.a("string");
  });

  it("处理器抛错 → 任务 fail 并 reject", async function () {
    const q = new TaskQueue<number>(async () => {
      throw new Error("boom");
    });
    const finished: QueueTask<number>[] = [];
    q.onUpdate = (t) => {
      if (t.status === "fail" || t.status === "success") finished.push(t);
    };
    let caught: unknown;
    try {
      await q.add(1);
    } catch (e) {
      caught = e;
    }
    expect(caught).to.be.instanceOf(Error);
    expect((caught as Error).message).to.equal("boom");
    expect(finished[0].status).to.equal("fail");
    expect(finished[0].error).to.equal("boom");
  });

  it("cancel 等待中的任务", async function () {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const q = new TaskQueue<number>(async (n) => {
      if (n === 1) await gate;
    });
    const tasks = new Map<string, QueueTask<number>>();
    q.onUpdate = (t) => tasks.set(t.id, t);
    const p1 = q.add(1);
    await sleep(10);
    const p2 = q.add(2);
    const ids = [...tasks.keys()];
    expect(q.cancel(ids[0])).to.equal(true); // 处理中 → 触发 abort
    expect(q.cancel(ids[1])).to.equal(true); // 等待中 → 直接取消
    const t2 = await p2;
    expect(t2.status).to.equal("cancelled");
    release();
    await p1;
    expect(q.size()).to.equal(0);
  });

  it("取消处理中任务 → abort signal 触发", async function () {
    let aborted = false;
    const q = new TaskQueue<number>(async (n, signal) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          resolve();
        });
      });
    });
    const p = q.add(1);
    await sleep(10);
    expect(q.cancelProcessing()).to.equal(true);
    await p;
    expect(aborted).to.equal(true);
  });

  it("clear 清空等待队列（处理中任务不受影响）", async function () {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const q = new TaskQueue<number>(async (n) => {
      if (n === 1) await gate;
    });
    const p1 = q.add(1);
    await sleep(10);
    q.add(2);
    q.add(3);
    expect(q.size()).to.equal(3);
    q.clear();
    expect(q.size()).to.equal(1);
    expect(q.waiting()).to.equal(0);
    release();
    await p1;
  });

  it("状态回调 onUpdate 触发", async function () {
    const seen: string[] = [];
    const q = new TaskQueue<number>(async () => {});
    q.onUpdate = (t) => seen.push(t.status);
    await q.add(1);
    await sleep(10);
    expect(seen).to.include("processing");
    expect(seen).to.include("success");
  });

  it("任务 id 唯一", async function () {
    const q = new TaskQueue<number>(async () => {});
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const t = await q.add(i);
      ids.add(t.id);
    }
    expect(ids.size).to.equal(20);
  });

  it("失败后继续执行后续任务", async function () {
    const order: string[] = [];
    const q = new TaskQueue<string>(async (s) => {
      if (s === "bad") throw new Error("x");
      order.push(s);
    });
    await q.add("good1").catch(() => {});
    await q.add("bad").catch(() => {});
    await q.add("good2");
    expect(order).to.deep.equal(["good1", "good2"]);
  });
});

describe("TaskQueue 在无 AbortController 环境（Zotero 9 沙盒实证）", function () {
  let orig: any;

  before(function () {
    orig = (globalThis as any).AbortController;
    delete (globalThis as any).AbortController;
  });

  after(function () {
    (globalThis as any).AbortController = orig;
  });

  it("任务正常执行（无取消信号）", async function () {
    const q = new TaskQueue<number>(async (n, signal) => {
      expect(signal).to.equal(undefined);
    });
    const task = await q.add(7);
    expect(task.status).to.equal("success");
  });

  it("处理器异常仍正确标记 fail，队列不死锁（后续任务可继续）", async function () {
    const q = new TaskQueue<number>(async (n) => {
      if (n === 1) throw new Error("boom");
    });
    let caught: unknown;
    try {
      await q.add(1);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).to.equal("boom");
    // 死锁回归：队列锁必须在异常后释放
    const task = await q.add(2);
    expect(task.status).to.equal("success");
  });

  it("cancel 处理中任务为 no-op 且不崩溃", async function () {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const q = new TaskQueue<number>(async (n) => {
      if (n === 1) await gate;
    });
    const p1 = q.add(1);
    await sleep(10);
    expect(q.cancelProcessing()).to.equal(false); // 无取消能力
    expect(q.cancel("nonexistent")).to.equal(false);
    release();
    await p1;
  });
});
