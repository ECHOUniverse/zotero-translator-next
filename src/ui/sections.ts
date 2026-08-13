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
import {
  createCancelToken,
  CancelError,
  type CancelToken,
} from "../utils/cancel";
import { openPluginPreferences } from "../modules/settings";

export const READER_PANE_ID = "translator-reader";
export const ITEM_PANE_ID = "translator-item";

/** XUL 文档中创建 HTML 元素必须显式指定 HTML 命名空间（createElement 默认 XUL） */
const HTML_NS = "http://www.w3.org/1999/xhtml";

function el(doc: Document, tag: string): any {
  return doc.createElementNS(HTML_NS, tag);
}

/** 工具栏当前选中的渠道（翻译入口读取） */
let selectedChannelId = "mymemory";
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
  // 订阅任务状态变化：更新结果容器 + 成功时刷新历史列表（不触发区块级渲染）
  ctx.unsubscribe = translate.subscribe((task) => {
    if (!ctx.rendered) return;
    const root = sectionRoot(ctx);
    if (!root) return;
    renderResultCard(ctx, task);
    if (task.status === "success") {
      lastSuccessTask = task;
      // 新翻译落库后刷新历史（含全局历史场景）
      void refreshHistoryFor(ctx);
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

  const card = el(doc, "div");
  card.className = "ztr-card";
  card.dataset.ztrTask = task.id;

  // 状态行
  const statusRow = el(doc, "div");
  statusRow.className = "ztr-card-status";
  const badge = el(doc, "span");
  badge.className = `ztr-badge ztr-badge-${task.status}`;
  badge.textContent = statusLabel(task.status);
  statusRow.append(badge);
  if (task.engine) {
    const engine = el(doc, "span");
    engine.className = "ztr-badge ztr-badge-channel";
    engine.textContent = channelRegistry.get(task.engine)?.name ?? task.engine;
    statusRow.append(engine);
  }
  if (task.detectedLang && task.detectedLang !== "auto") {
    const lang = el(doc, "span");
    lang.className = "ztr-muted";
    lang.textContent = `↳ ${task.detectedLang}`;
    statusRow.append(lang);
  }
  if (task.fromCache) {
    const cache = el(doc, "span");
    cache.className = "ztr-badge ztr-badge-cache";
    cache.textContent = getString("ztr-cache-hit");
    statusRow.append(cache);
  }
  if (task.error) {
    const err = el(doc, "span");
    err.className = "ztr-error";
    err.textContent = task.error;
    statusRow.append(err);
  }
  card.append(statusRow);

  // 译文
  const text = el(doc, "div");
  text.className = "ztr-result-text";
  text.textContent =
    task.status === "processing" && !task.translatedText
      ? getString("ztr-translating")
      : task.translatedText || "—";
  if (task.status === "processing") text.classList.add("ztr-streaming");
  card.append(text);

  // 操作行
  const actions = el(doc, "div");
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
    // AI 总结按钮常驻（D2）：无可用 LLM 渠道时点击提示配置
    if (task.status === "success") {
      actions.append(
        actionButton(doc, getString("ztr-summarize"), () => {
          onSummarizeClick(ctx, taskToSummarySource(task));
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
  const channelSelect = el(doc, "select");
  channelSelect.className = "ztr-select";
  channelSelect.title = getString("ztr-channel-label");
  for (const meta of channelRegistry.listAll()) {
    const opt = el(doc, "option");
    opt.value = meta.id;
    opt.textContent = meta.name;
    opt.disabled = !meta.enabled || !meta.configured;
    channelSelect.append(opt);
  }
  channelSelect.value = prefs.channelsOrder[0] ?? "mymemory";
  channelSelect.addEventListener("change", () => {
    selectedChannelId = channelSelect.value;
  });
  toolbar.append(channelSelect);

  // 目标语言
  const langSelect = el(doc, "select");
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
    const opt = el(doc, "option");
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
    const btn = el(doc, "button");
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
  // 全局最近历史（任何来源的翻译都可查；条目信息在条目上标注）
  const entries = await getHistoryByItem(null, 20);
  box.replaceChildren();
  if (entries.length === 0) {
    box.append(emptyState(doc, getString("ztr-empty-history")));
    return;
  }
  const list = el(doc, "div");
  list.className = "ztr-history-list";
  for (const entry of entries) {
    const { row, container } = historyItem(doc, entry, {
      onDelete: () => {
        void deleteHistory(entry.id).then(() => refreshHistoryFor(ctx));
      },
      // 历史条目总结入口（D3）：内联展开在该条目下方，互不串台
      onSummarize: () => {
        if (startSummary(ctx, historyToSummarySource(entry), container)) {
          container.hidden = false;
        }
      },
    });
    list.append(row, container);
  }
  box.append(list);
}

function historyItem(
  doc: Document,
  entry: HistoryEntry,
  handlers: { onDelete: () => void; onSummarize: () => void },
): { row: HTMLDivElement; container: HTMLDivElement } {
  const row = el(doc, "div");
  row.className = "ztr-history-item";
  const head = el(doc, "div");
  head.className = "ztr-history-head";
  const time = el(doc, "span");
  time.className = "ztr-muted";
  time.textContent = formatTime(entry.createdAt);
  head.append(time);
  const engine = el(doc, "span");
  engine.className = "ztr-badge ztr-badge-channel";
  engine.textContent = channelRegistry.get(entry.engine)?.name ?? entry.engine;
  head.append(engine);
  const tools = el(doc, "span");
  tools.className = "ztr-history-tools";
  const summarize = el(doc, "button");
  summarize.className = "ztr-icon-btn";
  summarize.textContent = "✨";
  summarize.title = getString("ztr-summarize");
  summarize.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    handlers.onSummarize();
  });
  tools.append(summarize);
  const del = el(doc, "button");
  del.className = "ztr-icon-btn";
  del.textContent = "🗑";
  del.title = getString("ztr-delete");
  del.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    handlers.onDelete();
  });
  tools.append(del);
  head.append(tools);
  row.append(head);

  // 来源条目标注（全局历史时区分来源）
  if (entry.itemID != null) {
    const itemTitle = getItemTitle(entry.itemID);
    if (itemTitle) {
      const src = el(doc, "div");
      src.className = "ztr-history-source";
      src.textContent = itemTitle;
      src.title = itemTitle;
      row.append(src);
    }
  }

  const preview = el(doc, "div");
  preview.className = "ztr-history-preview";
  preview.textContent =
    entry.translatedText.slice(0, 120) +
    (entry.translatedText.length > 120 ? "…" : "");
  row.append(preview);

  // 内联总结容器（跟随条目；多条历史可各自总结）
  const container = el(doc, "div");
  container.className = "ztr-inline-summary";
  container.hidden = true;
  return { row, container };
}

function getItemTitle(itemID: number): string {
  try {
    const item = Zotero.Items.get(itemID);
    return item?.getField("title") ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// 总结
// ---------------------------------------------------------------------------

/** 可总结对象：最新翻译任务或历史条目（runSummary 统一入口） */
export interface SummarySource {
  /** 待总结文本（译文） */
  translatedText: string;
  /** 格式化后文本（存历史时用于 hash 定位） */
  formattedText: string;
  /** 实际渠道（历史条目可能为空） */
  engine?: string;
  /** 关联条目（写笔记用；null 禁用写笔记按钮） */
  itemID: number | null;
  /** 历史记录 id：历史条目直接定位；最新任务为 null（按 hash 查） */
  historyID: number | null;
}

function taskToSummarySource(task: TranslateTaskInfo): SummarySource {
  return {
    translatedText: task.translatedText,
    formattedText: task.formattedText,
    engine: task.engine,
    itemID: task.itemID ?? null,
    historyID: null,
  };
}

function historyToSummarySource(entry: HistoryEntry): SummarySource {
  return {
    translatedText: entry.translatedText,
    formattedText: entry.formattedText ?? entry.sourceText,
    engine: entry.engine,
    itemID: entry.itemID ?? null,
    historyID: entry.id,
  };
}

/** 总结入口统一守卫：LLM 可用 → 启动总结并返回 true；不可用 → 提示配置（D2） */
function startSummary(
  ctx: SectionCtx,
  source: SummarySource,
  container?: HTMLElement,
): boolean {
  if (!summaryManager) return false;
  if (!summaryManager.hasAvailableLLM()) {
    promptLLMNeeded(ctx);
    return false;
  }
  void runSummary(ctx, source, container);
  return true;
}

/** 总结按钮点击入口 */
function onSummarizeClick(ctx: SectionCtx, source: SummarySource): void {
  startSummary(ctx, source);
}

/** 无可用 LLM 渠道：Zotero 原生提示 + 直达设置面板 */
function promptLLMNeeded(ctx: SectionCtx): void {
  const Prompt = (Zotero as any).Prompt;
  if (!Prompt?.confirm) {
    // 极端环境（无 Prompt API）：静默失败，不阻断 UI
    return;
  }
  let win: Window | null = null;
  try {
    win = ctx.doc.defaultView as Window | null;
  } catch {
    win = null;
  }
  let index = -1;
  try {
    index = Prompt.confirm({
      window: win,
      title: getString("ztr-summarize"),
      text: getString("ztr-summary-no-llm"),
      button0: getString("ztr-open-settings"),
      button1: getString("ztr-cancel"),
      defaultButton: 1,
    });
  } catch {
    index = -1;
  }
  if (index === 0) {
    openPluginPreferences();
  }
}

/** 进行中的总结流（按容器追踪；重新生成前取消旧流） */
const runningTokens = new WeakMap<HTMLElement, CancelToken>();

/**
 * 总结流程（最新任务渲染到 #ztr-*-summary；历史条目渲染到内联容器）。
 * @param container 内联容器（历史条目场景）；省略 = 最新任务容器
 */
async function runSummary(
  ctx: SectionCtx,
  source: SummarySource,
  container?: HTMLElement,
): Promise<void> {
  const sbox = container ?? summaryBox(ctx);
  if (!sbox || !summaryManager) return;
  const doc = ctx.doc;
  // 重新生成/重复点击：先取消进行中的流
  runningTokens.get(sbox)?.cancel();
  const token = createCancelToken();
  runningTokens.set(sbox, token);

  sbox.replaceChildren();
  const card = el(doc, "div");
  card.className = "ztr-card";
  const head = el(doc, "div");
  head.className = "ztr-card-status";
  const badge = el(doc, "span");
  badge.className = "ztr-badge ztr-badge-processing";
  badge.textContent = getString("ztr-summarizing");
  head.append(badge);
  card.append(head);

  const text = el(doc, "div");
  text.className = "ztr-result-text ztr-streaming";
  card.append(text);

  const actions = el(doc, "div");
  actions.className = "ztr-card-actions";
  const hint = el(doc, "span");
  hint.className = "ztr-muted";
  hint.hidden = true;
  const setHint = (msg: string) => {
    hint.textContent = msg;
    hint.hidden = false;
  };
  actions.append(hint);
  // 流式期间提供"取消"（§7：取消/失败有状态）
  const cancelBtn = actionButton(doc, getString("ztr-cancel"), () => {
    token.cancel();
  });
  actions.append(cancelBtn);
  card.append(actions);
  sbox.append(card);

  try {
    const { text: result } = await summaryManager.summarize(
      source.translatedText,
      (delta) => {
        text.textContent += delta;
      },
      token,
    );
    badge.textContent = getString("ztr-status-success");
    badge.className = "ztr-badge ztr-badge-success";
    text.classList.remove("ztr-streaming");
    cancelBtn.remove();
    actions.append(
      // D5 操作区：复制 / 存入历史 / 写入笔记 / 重新生成
      actionButton(doc, getString("ztr-copy-summary"), () => {
        copyText(result);
        setHint(getString("ztr-summary-copied"));
      }),
      actionButton(doc, getString("ztr-save-summary"), () => {
        void saveSummaryToHistory(source, result).then((ok) => {
          setHint(
            ok
              ? getString("ztr-summary-saved")
              : getString("ztr-summary-save-fail"),
          );
        });
      }),
      noteActionButton(doc, source.itemID, getString("ztr-save-note"), () => {
        void summaryManager!.saveNote(source.itemID, result).then((note) => {
          setHint(
            note
              ? getString("ztr-note-saved")
              : getString("ztr-note-save-fail"),
          );
        });
      }),
      actionButton(doc, getString("ztr-regenerate"), () => {
        void runSummary(ctx, source, container);
      }),
    );
  } catch (e) {
    if (e instanceof CancelError) {
      badge.textContent = getString("ztr-status-cancelled");
    } else {
      badge.textContent = getString("ztr-status-fail");
      const err = el(doc, "div");
      err.className = "ztr-error";
      err.textContent = (e as Error).message;
      card.append(err);
    }
  }
}

/** 写笔记按钮：无关联条目（itemID 为 null）时禁用并提示（D8） */
function noteActionButton(
  doc: Document,
  itemID: number | null,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = actionButton(doc, label, onClick);
  if (itemID == null) {
    btn.disabled = true;
    btn.title = getString("ztr-no-note-item");
  }
  return btn;
}

/**
 * 保存总结到历史：
 * - 历史条目场景：historyID 直接定位；
 * - 最新任务场景：按 formattedText 哈希查历史条目再写入 summary 字段。
 */
async function saveSummaryToHistory(
  source: SummarySource,
  summary: string,
): Promise<boolean> {
  try {
    if (!summaryManager) return false;
    if (source.historyID != null) {
      await summaryManager.saveSummary(source.historyID, summary);
      return true;
    }
    const { hashSource, queryCache } = await import("../modules/history");
    const hash = hashSource(source.formattedText);
    const entry = await queryCache(
      hash,
      prefs.targetLang,
      source.engine ?? "bing",
    );
    if (!entry) return false;
    await summaryManager.saveSummary(entry.id, summary);
    return true;
  } catch {
    return false;
  }
}

/**
 * 快捷键桥（D6）：对最近成功任务触发总结，渲染到指定窗格。
 * @returns 是否已处理（无任务/无窗格时返回 false，由调用方提示）
 */
export function summarizeTaskIn(
  kind: "reader" | "item",
  task: TranslateTaskInfo,
): boolean {
  if (!summaryManager) return false;
  const ctx =
    [...contexts.values()].find(
      (c) => c.kind === kind && c.rendered && c.body.isConnected,
    ) ?? [...contexts.values()].find((c) => c.rendered && c.body.isConnected);
  if (!ctx) return false;
  return startSummary(ctx, taskToSummarySource(task));
}

// ---------------------------------------------------------------------------
// 小部件
// ---------------------------------------------------------------------------

function emptyState(doc: Document, text: string): HTMLDivElement {
  const div = el(doc, "div");
  div.className = "ztr-empty";
  div.textContent = text;
  return div;
}

function actionButton(
  doc: Document,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = el(doc, "button");
  btn.className = "ztr-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildCompare(doc: Document, task: TranslateTaskInfo): HTMLElement {
  const details = el(doc, "details");
  details.className = "ztr-compare";
  const summary = el(doc, "summary");
  summary.textContent = getString("ztr-compare-label");
  details.append(summary);

  const src = el(doc, "div");
  src.className = "ztr-compare-block";
  src.append(compareHeading(doc, getString("ztr-original")));
  src.append(compareText(doc, task.sourceText));
  details.append(src);

  if (task.formattedText && task.formattedText !== task.sourceText) {
    const fmt = el(doc, "div");
    fmt.className = "ztr-compare-block";
    fmt.append(compareHeading(doc, getString("ztr-formatted")));
    fmt.append(compareText(doc, task.formattedText));
    details.append(fmt);
  }

  const tr = el(doc, "div");
  tr.className = "ztr-compare-block";
  tr.append(compareHeading(doc, getString("ztr-translated")));
  tr.append(compareText(doc, task.translatedText));
  details.append(tr);
  return details;
}

function compareHeading(doc: Document, label: string): HTMLDivElement {
  const div = el(doc, "div");
  div.className = "ztr-compare-heading";
  div.textContent = label;
  return div;
}

function compareText(doc: Document, text: string): HTMLDivElement {
  const div = el(doc, "div");
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
