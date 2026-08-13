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
import {
  getHistoryByItem,
  deleteHistory,
  deleteHistoryByItem,
  hashSource,
} from "../modules/history";
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
import {
  SelectionManager,
  joinRegions,
  type SelectionRegion,
} from "../modules/selection";
import { headTail } from "../utils/truncate";

export const READER_PANE_ID = "translator-reader";
export const ITEM_PANE_ID = "translator-item";

/** 跨区域选区在 reader 区块内的容器 id（不注册独立区块，见 Doc D3 变更） */
const SELECTION_BLOCK_ID = "ztr-reader-selection";

/** 区域原文头/尾各保留的字符数（行内头尾摘要） */
const PREVIEW_HEAD_LEN = 24;
const PREVIEW_TAIL_LEN = 24;

/** 侧栏历史区每篇文章显示条数上限 */
const HISTORY_LIMIT = 20;

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
  /** 跨区域选区管理器（reader 区块持有） */
  selection: SelectionManager | null;
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
  selection: SelectionManager,
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
      // 跨区域选区：订阅选区变化 → 激活/隐藏 + 重绘（内嵌容器，无独立区块）
      const ctx = getCtx(body as HTMLDivElement);
      if (!ctx) return;
      ctx.selection = selection;
      const selUnsub = selection.subscribe(() => {
        updateSelectionBlock(ctx);
      });
      const prevUnsub = ctx.unsubscribe;
      ctx.unsubscribe = () => {
        prevUnsub?.();
        selUnsub();
      };
    },
    onItemChange: ({ body, item, tabType, setEnabled }) => {
      // 文档：更新数据 + setEnabled（不渲染区块）
      setEnabled(tabType === "reader");
      const ctx = getCtx(body as HTMLDivElement);
      if (ctx) {
        ctx.tabType = tabType;
        ctx.itemID = item?.id ?? null;
        // 选区块激活条件依赖 tabType + itemID，随条目变化更新
        updateSelectionBlock(ctx);
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
      updateSelectionBlock(ctx);
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
    selection: null,
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
  <html:div class="ztr-selection" id="ztr-reader-selection" hidden="true"></html:div>
  <html:div class="ztr-section-title-row" id="ztr-reader-current-title"></html:div>
  <html:div class="ztr-result" id="ztr-reader-result"></html:div>
  <html:div class="ztr-summary" id="ztr-reader-summary"></html:div>
  <html:div class="ztr-section-title-row" id="ztr-reader-history-title"></html:div>
  <html:div class="ztr-history" id="ztr-reader-history"></html:div>
</html:div>`;
}

function itemBodyXHTML(): string {
  return `
<html:link rel="stylesheet" href="chrome://zotero-translator-next/content/zoteroPane.css"/>
<html:div class="ztr-section" id="ztr-item-section">
  <html:div class="ztr-toolbar" id="ztr-item-toolbar"></html:div>
  <html:div class="ztr-section-title-row" id="ztr-item-current-title"></html:div>
  <html:div class="ztr-result" id="ztr-item-result"></html:div>
  <html:div class="ztr-summary" id="ztr-item-summary"></html:div>
  <html:div class="ztr-section-title-row" id="ztr-item-history-title"></html:div>
  <html:div class="ztr-history" id="ztr-item-history"></html:div>
</html:div>`;
}

function sectionRoot(ctx: SectionCtx): HTMLDivElement | null {
  return ctx.body.querySelector<HTMLDivElement>(
    ctx.kind === "reader" ? "#ztr-reader-section" : "#ztr-item-section",
  );
}

function currentTitleBox(ctx: SectionCtx): HTMLDivElement | null {
  return ctx.body.querySelector<HTMLDivElement>(
    ctx.kind === "reader"
      ? "#ztr-reader-current-title"
      : "#ztr-item-current-title",
  );
}

function historyTitleBox(ctx: SectionCtx): HTMLDivElement | null {
  return ctx.body.querySelector<HTMLDivElement>(
    ctx.kind === "reader"
      ? "#ztr-reader-history-title"
      : "#ztr-item-history-title",
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
  // 分区标题（幂等）
  buildSectionTitles(doc, root, ctx);

  // 结果卡片：最近任务（按条目隔离，见 renderResultCard）
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

/**
 * 分区标题（幂等）：
 * - 「当前翻译」：结果卡片/总结区上方
 * - 「翻译历史」：历史列表上方，右侧带「清空本条」「查看全部历史」按钮
 */
function buildSectionTitles(
  doc: Document,
  root: HTMLDivElement,
  ctx: SectionCtx,
): void {
  const curBox = currentTitleBox(ctx);
  if (curBox && !curBox.hasChildNodes()) {
    const label = el(doc, "span");
    label.className = "ztr-section-title-text";
    label.textContent = getString("ztr-section-current");
    curBox.append(label);
  }

  const histBox = historyTitleBox(ctx);
  if (!histBox || histBox.hasChildNodes()) return;
  const label = el(doc, "span");
  label.className = "ztr-section-title-text";
  label.textContent = getString("ztr-section-history");
  histBox.append(label);

  const tools = el(doc, "span");
  tools.className = "ztr-history-tools";
  // 清空本条历史
  const clearBtn = el(doc, "button");
  clearBtn.className = "ztr-icon-btn";
  clearBtn.textContent = "🗑";
  clearBtn.title = getString("ztr-clear-item-history");
  clearBtn.disabled = ctx.itemID == null;
  clearBtn.addEventListener("click", () => {
    if (ctx.itemID == null) return;
    const win = ctx.doc.defaultView as Window | null;
    if (win && !win.confirm(getString("ztr-clear-item-history-confirm")))
      return;
    void deleteHistoryByItem(ctx.itemID).then(() => refreshHistoryFor(ctx));
  });
  tools.append(clearBtn);
  // 查看全部历史（独立窗口）
  const allBtn = el(doc, "button");
  allBtn.className = "ztr-icon-btn";
  allBtn.textContent = "📚";
  allBtn.title = getString("ztr-view-all-history");
  allBtn.addEventListener("click", () => {
    openHistoryWindow(ctx.itemID);
  });
  tools.append(allBtn);
  histBox.append(tools);
}

/** 打开全部历史浏览窗口（chrome 独立窗口，由窗口内脚本自行渲染） */
function openHistoryWindow(initialItemID: number | null): void {
  try {
    const mainWin = Zotero.getMainWindows()[0] as any;
    mainWin?.openDialog(
      "chrome://zotero-translator-next/content/history.xhtml",
      "ztr-history",
      "chrome,titlebar,centerscreen,resizable=yes",
      { initialItemID },
    );
  } catch (e) {
    ztoolkit.log(`openHistoryWindow failed: ${(e as Error).message}`);
  }
}

/** 任务更新回调：重绘结果卡片（保持容器内其他内容不动） */
function renderResultCard(ctx: SectionCtx, task: TranslateTaskInfo): void {
  const box = resultBox(ctx);
  if (!box) return;
  const doc = ctx.doc;

  // 结果卡片按条目隔离：任务属于其他条目时显示空态，不串台（D10）
  if (
    task &&
    ctx.itemID != null &&
    task.itemID != null &&
    task.itemID !== ctx.itemID
  ) {
    box.replaceChildren(emptyState(doc, getString("ztr-empty-result")));
    return;
  }

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
// 跨区域选区（多选拼段翻译；内嵌于 reader 区块，位于工具栏与「当前翻译」之间）
// ---------------------------------------------------------------------------

/** 选区容器（reader 区块内；无选区时整块 hidden） */
function selectionBlock(ctx: SectionCtx): HTMLDivElement | null {
  return ctx.body.querySelector<HTMLDivElement>(`#${SELECTION_BLOCK_ID}`);
}

/** 激活条件 + 显隐（选区订阅 / onItemChange / onRender 共用）：
 *  当前文献有选区且处于阅读器 tab → 显示 + 重绘；否则隐藏。 */
function updateSelectionBlock(ctx: SectionCtx): void {
  const block = selectionBlock(ctx);
  if (!block) return;
  const active =
    ctx.itemID != null &&
    ctx.selection?.has(ctx.itemID) === true &&
    ctx.tabType === "reader";
  block.hidden = !active;
  if (active) renderSelectionBlock(ctx);
}

/** 重绘选区卡片（骨架幂等；列表随选区变化刷新） */
function renderSelectionBlock(ctx: SectionCtx): void {
  if (!ctx.rendered) return;
  const block = selectionBlock(ctx);
  if (!block) return;
  buildSelectionCard(ctx);
  renderSelectionList(ctx);
}

/** 卡片骨架（幂等）：标题行 + 列表容器 + 动作行 */
function buildSelectionCard(ctx: SectionCtx): void {
  const block = selectionBlock(ctx);
  if (!block || block.hasChildNodes()) return;
  const doc = ctx.doc;

  const card = el(doc, "div");
  card.className = "ztr-card ztr-selection-card";

  // 标题行：标题 + 段数徽章
  const head = el(doc, "div");
  head.className = "ztr-selection-card-head";
  const title = el(doc, "span");
  title.className = "ztr-section-title-text";
  title.textContent = getString("ztr-section-selection-title");
  head.append(title);
  const count = el(doc, "span");
  count.className = "ztr-selection-count";
  head.append(count);
  card.append(head);

  // 区域列表
  const list = el(doc, "div");
  list.className = "ztr-selection-list";
  card.append(list);

  // 动作行：翻译全部（主按钮）/ 清空（危险色）
  const actions = el(doc, "div");
  actions.className = "ztr-selection-card-actions";
  const translateAll = el(doc, "button");
  translateAll.className = "ztr-btn ztr-btn-primary";
  translateAll.textContent = getString("ztr-selection-translate-all");
  translateAll.addEventListener("click", () => {
    const itemID = ctx.itemID;
    if (itemID == null || !ctx.selection) return;
    // 拼接合成完整段落，走现有管线（格式化→分块→渠道→历史）
    const joined = joinRegions(ctx.selection.get(itemID));
    if (!joined) return;
    void translateManager
      ?.translate({
        sourceText: joined,
        itemID,
        channelId: getSelectedChannelId(),
      })
      .catch((e) => ztoolkit.log(`[selection] translate error: ${e.message}`));
  });
  actions.append(translateAll);

  const clear = el(doc, "button");
  clear.className = "ztr-btn ztr-btn-danger";
  clear.textContent = getString("ztr-selection-clear");
  clear.addEventListener("click", () => {
    const itemID = ctx.itemID;
    if (itemID == null || !ctx.selection) return;
    const win = ctx.doc.defaultView as Window | null;
    if (win && !win.confirm(getString("ztr-selection-clear-confirm"))) return;
    ctx.selection.clear(itemID);
  });
  actions.append(clear);
  card.append(actions);

  block.replaceChildren(card);
}

/** 重绘区域列表（含段数徽章；无选区时清空） */
function renderSelectionList(ctx: SectionCtx): void {
  if (!ctx.rendered) return;
  const block = selectionBlock(ctx);
  if (!block) return;
  const listBox = block.querySelector<HTMLDivElement>(".ztr-selection-list");
  const countBadge = block.querySelector<HTMLSpanElement>(
    ".ztr-selection-count",
  );
  const itemID = ctx.itemID;
  const regions =
    itemID != null && ctx.selection ? ctx.selection.get(itemID) : [];
  if (countBadge) {
    countBadge.textContent = getString("ztr-selection-count", {
      args: { count: regions.length },
    });
  }
  if (!listBox) return;
  if (regions.length === 0) {
    listBox.replaceChildren();
    return;
  }

  const doc = ctx.doc;
  const showOrdinal = regions.length >= 2;
  listBox.replaceChildren();
  for (let i = 0; i < regions.length; i++) {
    listBox.append(
      selectionRow(
        doc,
        regions[i],
        i + 1,
        showOrdinal,
        itemID!,
        ctx.selection!,
      ),
    );
  }
}

/** 区域行：序号 + 页码徽章 + 头尾摘要（title 全文）+ ×删除；行点击跳页核对 */
function selectionRow(
  doc: Document,
  region: SelectionRegion,
  index: number,
  showOrdinal: boolean,
  itemID: number,
  selection: SelectionManager,
): HTMLDivElement {
  const row = el(doc, "div");
  row.className = "ztr-selection-item";
  row.title = region.text;
  // 行点击 → 阅读器跳页核对
  row.addEventListener("click", () => navigateToPage(region.pageIndex));

  if (showOrdinal) {
    const seq = el(doc, "span");
    seq.className = "ztr-selection-seq";
    seq.textContent = ordinal(index);
    row.append(seq);
  }
  const page = el(doc, "span");
  page.className = "ztr-selection-page";
  page.textContent = region.pageLabel;
  row.append(page);
  const preview = el(doc, "span");
  preview.className = "ztr-selection-preview";
  // 头尾摘要：原文不显示全，保留头/尾各 PREVIEW_*_LEN 字符，全文在 title
  preview.textContent = headTail(
    region.text,
    PREVIEW_HEAD_LEN,
    PREVIEW_TAIL_LEN,
  );
  row.append(preview);
  const del = el(doc, "button");
  del.className = "ztr-icon-btn";
  del.textContent = "×";
  del.title = getString("ztr-selection-delete");
  del.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    selection.remove(itemID, region.key);
  });
  row.append(del);
  return row;
}

/**
 * 阅读器跳页（行点击核对）。
 * 不复用 ReaderModule.getCurrentReader()：reader.ts → sections.ts 已有依赖
 * （getSelectedChannelId），反向引用会形成循环依赖；此处内联等价查询。
 */
function navigateToPage(pageIndex: number): void {
  try {
    const win = Zotero.getMainWindows()[0] as any;
    const tabID = win?.Zotero_Tabs?.selectedID;
    const reader = tabID ? Zotero.Reader.getByTabID(tabID) : null;
    (reader as any)?.navigate?.({ pageIndex });
  } catch (e) {
    ztoolkit.log(`[selection] navigate error: ${(e as Error).message}`);
  }
}

/** 文档顺序序号（1-20 用圈号；超限回落数字） */
function ordinal(n: number): string {
  const CIRCLED = [
    "①",
    "②",
    "③",
    "④",
    "⑤",
    "⑥",
    "⑦",
    "⑧",
    "⑨",
    "⑩",
    "⑪",
    "⑫",
    "⑬",
    "⑭",
    "⑮",
    "⑯",
    "⑰",
    "⑱",
    "⑲",
    "⑳",
  ];
  return n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : String(n);
}

// ---------------------------------------------------------------------------
// 历史列表（onAsyncRender / 条目变化时异步刷新）
// ---------------------------------------------------------------------------

/** 当前条目下已成功结束的任务（结果卡片展示的那个；供「当前」徽标精确匹配） */
function currentSuccessTaskFor(ctx: SectionCtx): TranslateTaskInfo | null {
  const current = translateManager?.getCurrent();
  if (
    current &&
    current.status === "success" &&
    ctx.itemID != null &&
    current.itemID === ctx.itemID
  ) {
    return current;
  }
  if (
    lastSuccessTask &&
    lastSuccessTask.status === "success" &&
    ctx.itemID != null &&
    lastSuccessTask.itemID === ctx.itemID
  ) {
    return lastSuccessTask;
  }
  return null;
}

async function refreshHistoryFor(ctx: SectionCtx): Promise<void> {
  const box = historyBox(ctx);
  if (!box) return;
  const doc = ctx.doc;

  // 无当前条目：显式空态，绝不回退到全局历史（itemID=null 曾是全局查询的漏洞）
  if (ctx.itemID == null) {
    box.replaceChildren(emptyState(doc, getString("ztr-no-item-selected")));
    return;
  }

  // 只显示当前文章历史（最新在前，上限 HISTORY_LIMIT）
  const entries = await getHistoryByItem(ctx.itemID, HISTORY_LIMIT);
  box.replaceChildren();
  if (entries.length === 0) {
    box.append(emptyState(doc, getString("ztr-empty-history")));
    return;
  }

  // 「当前」徽标：与结果卡片当前成功任务精确匹配的落库记录（sourceHash+engine+targetLang）
  const task = currentSuccessTaskFor(ctx);
  const currentHash =
    task && task.formattedText ? hashSource(task.formattedText) : null;
  const currentEngine = task?.engine ?? null;
  const targetLang = prefs.targetLang;
  let marked = false;

  const list = el(doc, "div");
  list.className = "ztr-history-list";
  // 展开按钮可见性依赖布局，须在全部节点挂载后统一测量
  const measurable: { preview: HTMLDivElement; toggle: HTMLButtonElement }[] =
    [];
  for (const entry of entries) {
    const isCurrent =
      !marked &&
      currentHash != null &&
      currentEngine != null &&
      entry.sourceHash === currentHash &&
      entry.targetLang === targetLang &&
      entry.engine === currentEngine;
    if (isCurrent) marked = true;
    const { row, container, preview, toggle } = historyItem(doc, entry, {
      isCurrent,
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
    measurable.push({ preview, toggle });
  }
  box.append(list);
  // 挂载后测量：仅当文本溢出 3 行截断线时才显示展开按钮
  for (const { preview, toggle } of measurable) {
    toggle.hidden = preview.scrollHeight <= preview.clientHeight;
  }
}

function historyItem(
  doc: Document,
  entry: HistoryEntry,
  handlers: {
    isCurrent?: boolean;
    onDelete: () => void;
    onSummarize: () => void;
  },
): {
  row: HTMLDivElement;
  container: HTMLDivElement;
  preview: HTMLDivElement;
  toggle: HTMLButtonElement;
} {
  const row = el(doc, "div");
  row.className = "ztr-history-item";
  const head = el(doc, "div");
  head.className = "ztr-history-head";
  const time = el(doc, "span");
  time.className = "ztr-muted";
  time.textContent = formatTime(entry.createdAt);
  head.append(time);
  // 「当前」徽标：与结果卡片当前任务匹配的这条记录
  if (handlers.isCurrent) {
    const cur = el(doc, "span");
    cur.className = "ztr-badge ztr-badge-current";
    cur.textContent = getString("ztr-badge-current");
    head.append(cur);
  }
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

  // 来源条目标注（全局历史时区分来源；按条目后仅孤儿/跨条目场景可见）
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

  // 全文渲染，CSS 3 行截断（.ztr-history-preview）；超长时由调用方测量后显示展开按钮
  const preview = el(doc, "div");
  preview.className = "ztr-history-preview";
  preview.textContent = entry.translatedText;
  row.append(preview);

  const toggle = el(doc, "button");
  toggle.className = "ztr-history-toggle";
  toggle.hidden = true;
  toggle.textContent = `${getString("ztr-expand")} ▾`;
  toggle.addEventListener("click", () => {
    const expanded = row.classList.toggle("expanded");
    toggle.textContent =
      (expanded ? getString("ztr-collapse") : getString("ztr-expand")) +
      (expanded ? " ▴" : " ▾");
  });
  row.append(toggle);

  // 内联总结容器（跟随条目；多条历史可各自总结）
  const container = el(doc, "div");
  container.className = "ztr-inline-summary";
  container.hidden = true;
  return { row, container, preview, toggle };
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
