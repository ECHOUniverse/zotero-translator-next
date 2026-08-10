/**
 * 阅读器/条目面板区块：注册 + 骨架 + 渲染。
 *
 * 依据（查询文档确认，非源码推断）：
 * - 官方文档：zotero.org/support/dev/zotero_7_for_developers → Custom Item Pane Sections
 * - API 文档：doc-for-zotero-plugin-dev/api/itemPaneManager（模板/toolkit 作者维护）
 *
 * Hook 语义（文档）：
 * - onInit：初始化数据 + 设置 hooks（如 notifier 回调）。不要渲染 UI。
 * - onItemChange：条目变化。更新数据 + 用 props.setEnabled 更新启用状态。不要渲染区块 UI。
 * - onRender：初始渲染（不能 async），创建元素 append 到 props.body。
 * - onAsyncRender：耗时渲染放这里（如异步查询历史）。
 * - refresh（onInit props）：需要时刷新（如 notifier 回调场景）。
 *
 * 本插件的渲染驱动：
 * - 翻译任务状态变化 → onInit 订阅（notifier 式），直接更新结果容器 DOM
 * - 条目变化 → onItemChange 更新数据 + setEnabled（tabType 区分），并刷新历史容器
 * - bodyXHTML 静态骨架（文档：defaults to XUL namespace，元素须显式 html: 前缀）
 */

import { getString, getLocaleID } from "../utils/locale";
import type { TranslateManager, TranslateTaskInfo } from "../modules/tasks";
import { getHistoryByItem, deleteHistory } from "../modules/history";
import type { HistoryEntry } from "../modules/history";
import { prefs } from "../prefs";
import { channelRegistry } from "../services";
import type { SummaryManager } from "../modules/summary";
import { createCancelToken, CancelError } from "../utils/cancel";

export const READER_PANE_ID = "translator-reader";
export const ITEM_PANE_ID = "translator-item";

/** 工具栏当前选中的渠道（翻译入口读取） */
let selectedChannelId = "bing";
export function getSelectedChannelId(): string {
  return selectedChannelId;
}

let summaryManager: SummaryManager | null = null;
let lastSuccessTask: TranslateTaskInfo | null = null;
export function getLastSuccessTask(): TranslateTaskInfo | null {
  return lastSuccessTask;
}

// ---------------------------------------------------------------------------
// 区块上下文（按 body 元素追踪；多窗口/多 tab 各有实例）
// ---------------------------------------------------------------------------

interface SectionCtx {
  paneID: string;
  kind: "reader" | "item";
  doc: Document;
  body: HTMLDivElement;
  itemID: number | null;
  tabType: "library" | "reader";
  rendered: boolean;
  /** onInit 提供的刷新入口（任务/数据变化时调用） */
  refresh: (() => Promise<void>) | null;
  /** 订阅解绑 */
  unsubscribe: (() => void) | null;
}

const contexts = new Map<string, SectionCtx>();

function ctxKey(body: HTMLElement): string {
  return body.dataset.ztrKey ?? (body.dataset.ztrKey = `c${contexts.size}`);
}

function getCtx(body: HTMLElement): SectionCtx | undefined {
  return contexts.get(ctxKey(body));
}

// ---------------------------------------------------------------------------
// 区块注册（官方文档 registerSection）
// ---------------------------------------------------------------------------

export function registerSections(
  translate: TranslateManager,
  summary: SummaryManager,
): { readerPaneID: string; itemPaneID: string } {
  summaryManager = summary;
  const pluginID = "zotero-translator-next@echouniverse.io";

  // 阅读器侧栏区块（仅 tabType='reader' 显示）
  Zotero.ItemPaneManager.registerSection({
    paneID: READER_PANE_ID,
    pluginID,
    header: {
      l10nID: getLocaleID("ztr-section-reader-header"),
      icon: "chrome://zotero-translator-next/content/icons/section-16.svg",
    },
    sidenav: {
      l10nID: getLocaleID("ztr-section-reader-header"),
      icon: "chrome://zotero-translator-next/content/icons/section-20.svg",
    },
    bodyXHTML: readerBodyXHTML(),
    onInit: ({ body, refresh }) => {
      initCtx(translate, {
        paneID: READER_PANE_ID,
        kind: "reader",
        body: body as HTMLDivElement,
        refresh,
      });
    },
    onItemChange: ({ body, item, tabType, setEnabled }) => {
      // 文档：更新数据 + setEnabled（不渲染区块）
      setEnabled(tabType === "reader");
      const ctx = getCtx(body as HTMLDivElement);
      if (ctx) {
        ctx.tabType = tabType;
        ctx.itemID = item?.id ?? null;
        void refreshHistoryFor(ctx);
      }
    },
    onRender: ({ body, item }) => {
      // 文档：初始渲染（不能 async）
      const ctx = getCtx(body as HTMLDivElement);
      if (!ctx) return;
      ctx.rendered = true;
      ctx.itemID = item?.id ?? null;
      renderSection(translate, ctx);
    },
    onAsyncRender: async ({ body, item }) => {
      // 文档：耗时渲染（异步查询历史）
      const ctx = getCtx(body as HTMLDivElement);
      if (!ctx) return;
      ctx.itemID = item?.id ?? null;
      await refreshHistoryFor(ctx);
    },
  });

  // 条目面板区块（仅 tabType='library' 显示）
  Zotero.ItemPaneManager.registerSection({
    paneID: ITEM_PANE_ID,
    pluginID,
    header: {
      l10nID: getLocaleID("ztr-section-item-header"),
      icon: "chrome://zotero-translator-next/content/icons/section-16.svg",
    },
    sidenav: {
      l10nID: getLocaleID("ztr-section-item-header"),
      icon: "chrome://zotero-translator-next/content/icons/section-20.svg",
    },
    bodyXHTML: itemBodyXHTML(),
    onInit: ({ body, refresh }) => {
      initCtx(translate, {
        paneID: ITEM_PANE_ID,
        kind: "item",
        body: body as HTMLDivElement,
        refresh,
      });
    },
    onItemChange: ({ body, item, tabType, setEnabled }) => {
      setEnabled(tabType === "library");
      const ctx = getCtx(body as HTMLDivElement);
      if (ctx) {
        ctx.tabType = tabType;
        ctx.itemID = item?.id ?? null;
        void refreshHistoryFor(ctx);
      }
    },
    onRender: ({ body, item }) => {
      const ctx = getCtx(body as HTMLDivElement);
      if (!ctx) return;
      ctx.rendered = true;
      ctx.itemID = item?.id ?? null;
      renderSection(translate, ctx);
    },
    onAsyncRender: async ({ body, item }) => {
      const ctx = getCtx(body as HTMLDivElement);
      if (!ctx) return;
      ctx.itemID = item?.id ?? null;
      await refreshHistoryFor(ctx);
    },
  });

  return { readerPaneID: READER_PANE_ID, itemPaneID: ITEM_PANE_ID };
}

/** onInit：保存上下文 + 订阅任务更新（notifier 式 hook，不渲染） */
function initCtx(
  translate: TranslateManager,
  init: {
    paneID: string;
    kind: "reader" | "item";
    body: HTMLDivElement;
    refresh: () => Promise<void>;
  },
): void {
  const ctx: SectionCtx = {
    paneID: init.paneID,
    kind: init.kind,
    doc: init.body.ownerDocument!,
    body: init.body,
    itemID: null,
    tabType: "library",
    rendered: false,
    refresh: init.refresh,
    unsubscribe: null,
  };
  contexts.set(ctxKey(init.body), ctx);
  // 订阅任务状态变化：更新结果容器（不触发区块级渲染）
  ctx.unsubscribe = translate.subscribe((task) => {
    if (!ctx.rendered) return;
    const root = sectionRoot(ctx);
    if (!root) return;
    renderResultCard(ctx, task);
    if (task.status === "success") {
      lastSuccessTask = task;
    }
  });
}

// ---------------------------------------------------------------------------
// 骨架（bodyXHTML：XUL 文档默认命名空间，元素须 html: 前缀）
// ---------------------------------------------------------------------------

function readerBodyXHTML(): string {
  return `
<html:link rel="stylesheet" href="chrome://zotero-translator-next/content/zoteroPane.css"/>
<html:div class="ztr-section" id="ztr-reader-section">
  <html:div class="ztr-toolbar" id="ztr-reader-toolbar"></html:div>
  <html:div class="ztr-result" id="ztr-reader-result"></html:div>
  <html:div class="ztr-summary" id="ztr-reader-summary"></html:div>
  <html:div class="ztr-history" id="ztr-reader-history"></html:div>
</html:div>`;
}

function itemBodyXHTML(): string {
  return `
<html:link rel="stylesheet" href="chrome://zotero-translator-next/content/zoteroPane.css"/>
<html:div class="ztr-section" id="ztr-item-section">
  <html:div class="ztr-toolbar" id="ztr-item-toolbar"></html:div>
  <html:div class="ztr-result" id="ztr-item-result"></html:div>
  <html:div class="ztr-summary" id="ztr-item-summary"></html:div>
  <html:div class="ztr-history" id="ztr-item-history"></html:div>
</html:div>`;
}

function sectionRoot(ctx: SectionCtx): HTMLDivElement | null {
  return ctx.body.querySelector<HTMLDivElement>(
    ctx.kind === "reader" ? "#ztr-reader-section" : "#ztr-item-section",
  );
}

function resultBox(ctx: SectionCtx): HTMLDivElement | null {
  return ctx.body.querySelector<HTMLDivElement>(
    ctx.kind === "reader" ? "#ztr-reader-result" : "#ztr-item-result",
  );
}

function summaryBox(ctx: SectionCtx): HTMLDivElement | null {
  return ctx.body.querySelector<HTMLDivElement>(
    ctx.kind === "reader" ? "#ztr-reader-summary" : "#ztr-item-summary",
  );
}

function historyBox(ctx: SectionCtx): HTMLDivElement | null {
  return ctx.body.querySelector<HTMLDivElement>(
    ctx.kind === "reader" ? "#ztr-reader-history" : "#ztr-item-history",
  );
}

// ---------------------------------------------------------------------------
// 渲染（onRender 初始渲染；后续数据驱动更新直接操作容器 DOM）
// ---------------------------------------------------------------------------

let translateManager: TranslateManager | null = null;

function renderSection(translate: TranslateManager, ctx: SectionCtx): void {
  translateManager = translate;
  const root = sectionRoot(ctx);
  if (!root) return;
  const doc = ctx.doc;

  // 工具栏（幂等：只建一次）
  buildToolbar(doc, root, ctx);

  // 结果卡片：最近任务
  const task = getLatestTask(translate);
  const box = resultBox(ctx);
  if (box && !box.hasChildNodes()) {
    if (task) {
      renderResultCard(ctx, task);
    } else {
      box.replaceChildren(emptyState(doc, getString("ztr-empty-result")));
    }
  }
}

/** 任务更新回调：重绘结果卡片（保持容器内其他内容不动） */
function renderResultCard(ctx: SectionCtx, task: TranslateTaskInfo): void {
  const box = resultBox(ctx);
  if (!box) return;
  const doc = ctx.doc;

  if (!task) {
    box.replaceChildren(emptyState(doc, getString("ztr-empty-result")));
    return;
  }

  const card = doc.createElement("div");
  card.className = "ztr-card";
  card.dataset.ztrTask = task.id;

  // 状态行
  const statusRow = doc.createElement("div");
  statusRow.className = "ztr-card-status";
  const badge = doc.createElement("span");
  badge.className = `ztr-badge ztr-badge-${task.status}`;
  badge.textContent = statusLabel(task.status);
  statusRow.append(badge);
  if (task.engine) {
    const engine = doc.createElement("span");
    engine.className = "ztr-badge ztr-badge-channel";
    engine.textContent = channelRegistry.get(task.engine)?.name ?? task.engine;
    statusRow.append(engine);
  }
  if (task.detectedLang && task.detectedLang !== "auto") {
    const lang = doc.createElement("span");
    lang.className = "ztr-muted";
    lang.textContent = `↳ ${task.detectedLang}`;
    statusRow.append(lang);
  }
  if (task.fromCache) {
    const cache = doc.createElement("span");
    cache.className = "ztr-badge ztr-badge-cache";
    cache.textContent = getString("ztr-cache-hit");
    statusRow.append(cache);
  }
  if (task.error) {
    const err = doc.createElement("span");
    err.className = "ztr-error";
    err.textContent = task.error;
    statusRow.append(err);
  }
  card.append(statusRow);

  // 译文
  const text = doc.createElement("div");
  text.className = "ztr-result-text";
  text.textContent =
    task.status === "processing" && !task.translatedText
      ? getString("ztr-translating")
      : task.translatedText || "—";
  if (task.status === "processing") text.classList.add("ztr-streaming");
  card.append(text);

  // 操作行
  const actions = doc.createElement("div");
  actions.className = "ztr-card-actions";
  if (task.status === "success" || task.status === "fail") {
    actions.append(
      actionButton(doc, getString("ztr-copy"), () => {
        copyText(task.translatedText);
      }),
      actionButton(doc, getString("ztr-retry"), () => {
        void translateManager?.translate({
          sourceText: task.sourceText,
          itemID: task.itemID,
          channelId: task.channelId,
        });
      }),
    );
    if (task.status === "success" && summaryManager?.hasAvailableLLM()) {
      actions.append(
        actionButton(doc, getString("ztr-summarize"), () => {
          void runSummary(ctx, task);
        }),
      );
    }
  }
  if (task.status === "processing" || task.status === "waiting") {
    actions.append(
      actionButton(doc, getString("ztr-cancel"), () => {
        translateManager?.cancel(task.id);
      }),
    );
  }
  card.append(actions);

  // 三段对照
  if (task.status === "success" && task.sourceText) {
    card.append(buildCompare(doc, task));
  }

  box.replaceChildren(card);

  // 总结容器：任务变化时若非成功则清空
  const sbox = summaryBox(ctx);
  if (
    sbox &&
    task.status !== "success" &&
    !sbox.querySelector(".ztr-streaming")
  ) {
    sbox.replaceChildren();
  }
}

/** 最近任务（当前处理中的或最新结束的） */
function getLatestTask(translate: TranslateManager): TranslateTaskInfo | null {
  const queued = translate.getQueued();
  const current = translate.getCurrent();
  if (current) return current;
  if (queued.length > 0) return queued[queued.length - 1];
  return lastSuccessTask;
}

// ---------------------------------------------------------------------------
// 工具栏
// ---------------------------------------------------------------------------

function buildToolbar(
  doc: Document,
  root: HTMLDivElement,
  ctx: SectionCtx,
): void {
  const toolbar = root.querySelector<HTMLDivElement>(
    ctx.kind === "reader" ? "#ztr-reader-toolbar" : "#ztr-item-toolbar",
  );
  if (!toolbar || toolbar.hasChildNodes()) return;

  // 渠道选择
  const channelSelect = doc.createElement("select");
  channelSelect.className = "ztr-select";
  channelSelect.title = getString("ztr-channel-label");
  for (const meta of channelRegistry.listAll()) {
    const opt = doc.createElement("option");
    opt.value = meta.id;
    opt.textContent = meta.name;
    opt.disabled = !meta.enabled || !meta.configured;
    channelSelect.append(opt);
  }
  channelSelect.value = prefs.channelsOrder[0] ?? "bing";
  channelSelect.addEventListener("change", () => {
    selectedChannelId = channelSelect.value;
  });
  toolbar.append(channelSelect);

  // 目标语言
  const langSelect = doc.createElement("select");
  langSelect.className = "ztr-select";
  const langs: Array<[string, string]> = [
    ["zh-CN", "中文（简体）"],
    ["zh-TW", "中文（繁體）"],
    ["en", "English"],
    ["ja", "日本語"],
    ["ko", "한국어"],
    ["de", "Deutsch"],
    ["fr", "Français"],
    ["ru", "Русский"],
    ["es", "Español"],
  ];
  for (const [code, label] of langs) {
    const opt = doc.createElement("option");
    opt.value = code;
    opt.textContent = label;
    langSelect.append(opt);
  }
  langSelect.value = prefs.targetLang;
  langSelect.title = getString("ztr-target-lang-label");
  langSelect.addEventListener("change", () => {
    prefs.targetLang = langSelect.value;
  });
  toolbar.append(langSelect);

  // 条目区块：翻译选中条目按钮
  if (ctx.kind === "item") {
    const btn = doc.createElement("button");
    btn.className = "ztr-btn";
    btn.textContent = getString("ztr-translate-item");
    btn.addEventListener("click", () => {
      const item = getSelectedItem();
      if (!item) return;
      void translateManager?.translate({
        sourceText:
          item.getField("abstractNote") || item.getField("title") || "",
        context: item.getField("abstractNote")
          ? item.getField("title")
          : undefined,
        itemID: item.id,
        channelId: selectedChannelId,
      });
    });
    toolbar.append(btn);
  }
}

function getSelectedItem(): Zotero.Item | null {
  try {
    const pane = Zotero.getActiveZoteroPane();
    return pane?.getSelectedItems?.()[0] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 历史列表（onAsyncRender / 条目变化时异步刷新）
// ---------------------------------------------------------------------------

async function refreshHistoryFor(ctx: SectionCtx): Promise<void> {
  const box = historyBox(ctx);
  if (!box) return;
  const doc = ctx.doc;
  const entries = ctx.itemID ? await getHistoryByItem(ctx.itemID, 20) : [];
  box.replaceChildren();
  if (entries.length === 0) {
    box.append(emptyState(doc, getString("ztr-empty-history")));
    return;
  }
  const list = doc.createElement("div");
  list.className = "ztr-history-list";
  for (const entry of entries) {
    list.append(
      historyItem(doc, entry, () => {
        void deleteHistory(entry.id).then(() => refreshHistoryFor(ctx));
      }),
    );
  }
  box.append(list);
}

function historyItem(
  doc: Document,
  entry: HistoryEntry,
  onDelete: () => void,
): HTMLDivElement {
  const row = doc.createElement("div");
  row.className = "ztr-history-item";
  const head = doc.createElement("div");
  head.className = "ztr-history-head";
  const time = doc.createElement("span");
  time.className = "ztr-muted";
  time.textContent = formatTime(entry.createdAt);
  head.append(time);
  const engine = doc.createElement("span");
  engine.className = "ztr-badge ztr-badge-channel";
  engine.textContent = channelRegistry.get(entry.engine)?.name ?? entry.engine;
  head.append(engine);
  const del = doc.createElement("button");
  del.className = "ztr-icon-btn";
  del.textContent = "🗑";
  del.title = getString("ztr-delete");
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete();
  });
  head.append(del);
  row.append(head);

  const preview = doc.createElement("div");
  preview.className = "ztr-history-preview";
  preview.textContent =
    entry.translatedText.slice(0, 120) +
    (entry.translatedText.length > 120 ? "…" : "");
  row.append(preview);
  return row;
}

// ---------------------------------------------------------------------------
// 总结卡片
// ---------------------------------------------------------------------------

async function runSummary(
  ctx: SectionCtx,
  task: TranslateTaskInfo,
): Promise<void> {
  const sbox = summaryBox(ctx);
  if (!sbox || !summaryManager) return;
  const doc = ctx.doc;
  const token = createCancelToken();

  sbox.replaceChildren();
  const card = doc.createElement("div");
  card.className = "ztr-card";
  const head = doc.createElement("div");
  head.className = "ztr-card-status";
  const badge = doc.createElement("span");
  badge.className = "ztr-badge ztr-badge-processing";
  badge.textContent = getString("ztr-summarizing");
  head.append(badge);
  card.append(head);

  const text = doc.createElement("div");
  text.className = "ztr-result-text ztr-streaming";
  card.append(text);

  const actions = doc.createElement("div");
  actions.className = "ztr-card-actions";
  card.append(actions);
  sbox.append(card);

  try {
    const { text: result } = await summaryManager.summarize(
      task.translatedText,
      (delta) => {
        text.textContent += delta;
      },
      token,
    );
    badge.textContent = getString("ztr-status-success");
    badge.className = "ztr-badge ztr-badge-success";
    actions.append(
      actionButton(doc, getString("ztr-save-summary"), () => {
        void saveSummaryToHistory(task, result).then(() => {
          actions.replaceChildren();
          const saved = doc.createElement("span");
          saved.className = "ztr-muted";
          saved.textContent = getString("ztr-summary-saved");
          actions.append(saved);
        });
      }),
    );
  } catch (e) {
    if (e instanceof CancelError) {
      badge.textContent = getString("ztr-status-cancelled");
    } else {
      badge.textContent = getString("ztr-status-fail");
      const err = doc.createElement("div");
      err.className = "ztr-error";
      err.textContent = (e as Error).message;
      card.append(err);
    }
  }
}

async function saveSummaryToHistory(
  task: TranslateTaskInfo,
  summary: string,
): Promise<void> {
  const { hashSource, queryCache } = await import("../modules/history");
  const hash = hashSource(task.formattedText);
  const entry = await queryCache(hash, prefs.targetLang, task.engine ?? "bing");
  if (entry) {
    await summaryManager!.saveSummary(entry.id, summary);
  }
}

// ---------------------------------------------------------------------------
// 小部件
// ---------------------------------------------------------------------------

function emptyState(doc: Document, text: string): HTMLDivElement {
  const div = doc.createElement("div");
  div.className = "ztr-empty";
  div.textContent = text;
  return div;
}

function actionButton(
  doc: Document,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = doc.createElement("button");
  btn.className = "ztr-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildCompare(doc: Document, task: TranslateTaskInfo): HTMLElement {
  const details = doc.createElement("details");
  details.className = "ztr-compare";
  const summary = doc.createElement("summary");
  summary.textContent = getString("ztr-compare-label");
  details.append(summary);

  const src = doc.createElement("div");
  src.className = "ztr-compare-block";
  src.append(compareHeading(doc, getString("ztr-original")));
  src.append(compareText(doc, task.sourceText));
  details.append(src);

  if (task.formattedText && task.formattedText !== task.sourceText) {
    const fmt = doc.createElement("div");
    fmt.className = "ztr-compare-block";
    fmt.append(compareHeading(doc, getString("ztr-formatted")));
    fmt.append(compareText(doc, task.formattedText));
    details.append(fmt);
  }

  const tr = doc.createElement("div");
  tr.className = "ztr-compare-block";
  tr.append(compareHeading(doc, getString("ztr-translated")));
  tr.append(compareText(doc, task.translatedText));
  details.append(tr);
  return details;
}

function compareHeading(doc: Document, label: string): HTMLDivElement {
  const div = doc.createElement("div");
  div.className = "ztr-compare-heading";
  div.textContent = label;
  return div;
}

function compareText(doc: Document, text: string): HTMLDivElement {
  const div = doc.createElement("div");
  div.className = "ztr-compare-text";
  div.textContent = text;
  return div;
}

function statusLabel(status: TranslateTaskInfo["status"]): string {
  switch (status) {
    case "waiting":
      return getString("ztr-status-waiting");
    case "processing":
      return getString("ztr-status-processing");
    case "success":
      return getString("ztr-status-success");
    case "fail":
      return getString("ztr-status-fail");
    case "cancelled":
      return getString("ztr-status-cancelled");
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function copyText(text: string): void {
  const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper,
  );
  clipboard.copyString(text);
}
