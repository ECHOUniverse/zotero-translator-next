/**
 * 全部历史浏览窗口（独立 bundle，由 addon/content/history.xhtml 加载）。
 *
 * - 打开时默认停在当前文章的历史 tab（openDialog 传入 { initialItemID }）
 * - 顶部横向滚动 tab 条：每篇一个 tab（截断标题）；末尾固定「未关联条目」tab；
 *   已删除条目标「(已删除)」，历史不丢
 * - 当前 tab 全量显示（不限条数），操作与侧栏一致：展开/收起、AI 总结（内联）、
 *   单条删除、「清空本条」
 *
 * l10n：独立 Fluent 实例 + history.xhtml 内 localization link。
 * 注意：本 bundle 与主 bundle 独立打包，模块内 import 会重复打包但无副作用。
 */

import {
  ensureHistoryTable,
  getHistoryItemGroups,
  getHistoryByItem,
  getOrphanHistory,
  deleteHistory,
  deleteHistoryByItem,
  type HistoryEntry,
} from "../modules/history";
import { channelRegistry } from "../services";
import {
  createCancelToken,
  CancelError,
  type CancelToken,
} from "../utils/cancel";
import { config } from "../../package.json";
import {
  renderContent,
  finalizeMarkdownContent,
} from "../utils/renderContent";

// 窗口页面脚本运行在 chrome 文档上下文；tsconfig 无 DOM lib，这里显式声明
// （esbuild 编译期仅按类型擦除处理，运行时由 Firefox 提供）
declare const document: Document;
declare const window: Window & {
  arguments?: unknown[];
  confirm?(message?: string): boolean;
  alert?(message?: string): void;
};

const ADDON_INSTANCE = "ZoteroTranslatorNext";
const ALL_LIMIT = 100000; // 全量（getHistoryByItem 的 LIMIT 上限）

/** 独立 chrome 窗口无 Zotero 全局；从主窗口注入 globalThis */
function bindZoteroGlobal(): boolean {
  if (typeof (globalThis as any).Zotero !== "undefined") return true;
  try {
    const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(
      Ci.nsIWindowMediator,
    );
    const mainWin = wm.getMostRecentWindow("navigator:browser") as any;
    if (mainWin?.Zotero) {
      (globalThis as any).Zotero = mainWin.Zotero;
      return true;
    }
  } catch {
    // ignore
  }
  try {
    const opener = (window as any).opener;
    if (opener?.Zotero) {
      (globalThis as any).Zotero = opener.Zotero;
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

let windowL10n: any = null;

function el(tag: string, className = ""): any {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function initWindowL10n(): void {
  if (windowL10n) return;
  const L10nCtor =
    typeof Localization !== "undefined"
      ? Localization
      : (globalThis as any).Localization;
  if (!L10nCtor) return;
  windowL10n = new L10nCtor([`${config.addonRef}-addon.ftl`], true);
}

/** 独立窗口内 Fluent（不依赖主 bundle 的 locale 实例） */
function str(id: string): string {
  try {
    initWindowL10n();
    const msg = windowL10n?.formatMessagesSync([
      { id: `${config.addonRef}-${id}` },
    ])[0];
    return msg?.value ?? id;
  } catch {
    return id;
  }
}

/** 与 Zotero 主窗口主题同步（独立 chrome 文档不继承 :root 变量） */
function syncThemeFromMainWindow(): void {
  try {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;
    const mainRoot = Zotero.getMainWindows()[0]?.document?.documentElement;
    const scheme = mainRoot?.getAttribute("data-color-scheme");
    if (scheme === "dark" || scheme === "light") {
      root.setAttribute("data-color-scheme", scheme);
      body.setAttribute("data-color-scheme", scheme);
      return;
    }
    const prefersDark = window.matchMedia?.(
      "(prefers-color-scheme: dark)",
    )?.matches;
    if (prefersDark) {
      root.setAttribute("data-color-scheme", "dark");
      body.setAttribute("data-color-scheme", "dark");
    }
  } catch {
    // 忽略
  }
}

function resolveInitialItemID(): number | null {
  const args = (window as any).arguments?.[0];
  if (args && typeof args === "object" && "initialItemID" in args) {
    return args.initialItemID as number | null;
  }
  const fromAddon = (Zotero as any)[ADDON_INSTANCE]?.data
    ?.historyWindowInitialItemID;
  return fromAddon ?? null;
}

function showFatalError(message: string): void {
  const content = document.getElementById("ztr-window-content");
  if (!content) return;
  const err = el("div", "ztr-error");
  err.textContent = message;
  content.replaceChildren(err);
}

function itemTitle(itemID: number): string {
  try {
    const item = Zotero.Items.get(itemID);
    if (!item) return "";
    const t = item.getField("title");
    return t ? String(t) : "";
  } catch {
    return "";
  }
}

function summaryManager(): any {
  try {
    return (Zotero as any)[ADDON_INSTANCE]?.data?.summary ?? null;
  } catch {
    return null;
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

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

interface Group {
  itemID: number | null;
  count: number;
}

let groups: Group[] = [];
let currentTab: number | null | undefined = undefined; // undefined=未选择

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  if (!bindZoteroGlobal()) {
    showFatalError("Zotero API unavailable in history window");
    return;
  }

  syncThemeFromMainWindow();
  initWindowL10n();

  const initialItemID = resolveInitialItemID();

  try {
    await Zotero.initializationPromise;
    await ensureHistoryTable();
  } catch (e) {
    showFatalError((e as Error).message);
    return;
  }

  document.title = str("ztr-history-window-title");
  const title = document.getElementById("ztr-window-title");
  if (title) title.textContent = str("ztr-history-window-title");

  const clearBtn = document.getElementById(
    "ztr-window-clear",
  ) as HTMLButtonElement | null;
  if (clearBtn) {
    clearBtn.textContent = "🗑";
    clearBtn.title = str("ztr-clear-item-history");
    clearBtn.addEventListener("click", () => {
      if (currentTab === undefined) return;
      if (!window.confirm(str("ztr-clear-item-history-confirm"))) return;
      void deleteHistoryByItem(currentTab).then(() =>
        reloadGroups(initialItemID),
      );
    });
  }

  try {
    await reloadGroups(initialItemID);
  } catch (e) {
    showFatalError((e as Error).message);
  }
}

/** 重新加载分组 → 重建 tab 条；尽量保持当前 tab */
async function reloadGroups(initialItemID: number | null): Promise<void> {
  const raw = await getHistoryItemGroups();
  groups = raw.map((g) => ({ itemID: g.itemID, count: g.count }));

  // 默认 tab：initialItemID 有历史 → 它；否则第一个分组；孤儿记录存在时「未关联」
  let target: number | null | undefined;
  if (groups.length === 0) {
    target = undefined;
  } else if (
    initialItemID != null &&
    groups.some((g) => g.itemID === initialItemID)
  ) {
    target = initialItemID;
  } else if (
    currentTab !== undefined &&
    groups.some((g) => g.itemID === currentTab)
  ) {
    target = currentTab;
  } else {
    const firstWithItem = groups.find((g) => g.itemID != null);
    target = firstWithItem?.itemID ?? groups[0].itemID;
  }

  renderTabs(target);
  if (target === undefined) {
    renderEmpty();
  } else {
    await loadItem(target);
  }
}

// ---------------------------------------------------------------------------
// Tab 条
// ---------------------------------------------------------------------------

function renderTabs(active: number | null | undefined): void {
  const tabsBox = document.getElementById("ztr-window-tabs");
  if (!tabsBox) return;
  tabsBox.replaceChildren();

  for (const g of groups) {
    const tab = el("button", "ztr-window-tab");
    tab.type = "button";
    tab.dataset.itemID = g.itemID === null ? "__null__" : String(g.itemID);
    if (g.itemID === null) {
      // 孤儿记录（未关联条目）
      tab.textContent = str("ztr-unattached");
      tab.title = str("ztr-unattached");
    } else {
      const t = itemTitle(g.itemID);
      tab.textContent = t ? t : str("ztr-deleted-item");
      tab.title = `${tab.textContent}（${g.count}）`;
    }
    if (g.itemID === active) tab.classList.add("active");
    const id = g.itemID;
    tab.addEventListener("click", () => {
      void loadItem(id);
    });
    tabsBox.append(tab);
  }
}

// ---------------------------------------------------------------------------
// 内容区：当前 tab 的全量历史
// ---------------------------------------------------------------------------

function renderEmpty(): void {
  const content = document.getElementById("ztr-window-content");
  if (!content) return;
  const empty = el("div", "ztr-empty");
  empty.textContent = str("ztr-empty-history");
  content.replaceChildren(empty);
}

async function loadItem(itemID: number | null): Promise<void> {
  currentTab = itemID;
  // 高亮当前 tab（按 dataset.itemID 匹配）
  document
    .querySelectorAll<HTMLElement>(".ztr-window-tab")
    .forEach((t: HTMLElement) => {
      const key = itemID === null ? "__null__" : String(itemID);
      t.classList.toggle("active", t.dataset.itemID === key);
    });

  const content = document.getElementById("ztr-window-content");
  if (!content) return;

  let entries: HistoryEntry[] = [];
  let loadError: string | null = null;
  try {
    entries =
      itemID === null
        ? await getOrphanHistory(ALL_LIMIT)
        : await getHistoryByItem(itemID, ALL_LIMIT);
  } catch (e) {
    loadError = (e as Error).message;
  }

  content.replaceChildren();
  if (loadError) {
    const err = el("div", "ztr-error");
    err.textContent = loadError;
    content.append(err);
    return;
  }
  if (entries.length === 0) {
    const empty = el("div", "ztr-empty");
    empty.textContent = str("ztr-empty-history");
    content.append(empty);
    return;
  }

  // 顶部：文章标题 + 条数
  const head = el("div", "ztr-window-item-head");
  const titleSpan = el("span");
  titleSpan.className = "ztr-window-item-title";
  titleSpan.textContent =
    itemID === null
      ? str("ztr-unattached")
      : itemTitle(itemID) || str("ztr-deleted-item");
  head.append(titleSpan);
  const countSpan = el("span", "ztr-muted");
  countSpan.textContent = `${entries.length}`;
  head.append(countSpan);
  content.append(head);

  const list = el("div", "ztr-history-list");
  const measurable: { preview: HTMLDivElement; toggle: HTMLButtonElement }[] =
    [];
  for (const entry of entries) {
    const { row, container, preview, toggle } = historyItem(entry);
    list.append(row, container);
    measurable.push({ preview, toggle });
  }
  content.append(list);
  for (const { preview, toggle } of measurable) {
    toggle.hidden = preview.scrollHeight <= preview.clientHeight;
  }
}

// ---------------------------------------------------------------------------
// 历史条目卡片（与侧栏同构；含内联总结容器）
// ---------------------------------------------------------------------------

function historyItem(entry: HistoryEntry): {
  row: HTMLDivElement;
  container: HTMLDivElement;
  preview: HTMLDivElement;
  toggle: HTMLButtonElement;
} {
  const row = el("div", "ztr-history-item");
  const head = el("div", "ztr-history-head");
  const time = el("span", "ztr-muted");
  time.textContent = formatTime(entry.createdAt);
  head.append(time);
  const engine = el("span", "ztr-badge ztr-badge-channel");
  engine.textContent = engineName(entry.engine);
  head.append(engine);
  const tools = el("span", "ztr-history-tools");
  const summarizeBtn = el("button", "ztr-icon-btn");
  summarizeBtn.textContent = "✨";
  summarizeBtn.title = str("ztr-summarize");
  summarizeBtn.addEventListener("click", () => {
    container.hidden = false;
    void runSummary(entry, container);
  });
  tools.append(summarizeBtn);
  const del = el("button", "ztr-icon-btn");
  del.textContent = "🗑";
  del.title = str("ztr-delete");
  del.addEventListener("click", async () => {
    await deleteHistory(entry.id);
    if (currentTab === undefined) return;
    void loadItem(currentTab);
  });
  tools.append(del);
  head.append(tools);
  row.append(head);

  const preview = el("div", "ztr-history-preview");
  renderContent(preview, entry.translatedText, { mode: "markdown" });
  row.append(preview);

  const toggle = el("button", "ztr-history-toggle");
  toggle.hidden = true;
  toggle.textContent = `${str("ztr-expand")} ▾`;
  toggle.addEventListener("click", () => {
    const expanded = row.classList.toggle("expanded");
    toggle.textContent =
      (expanded ? str("ztr-collapse") : str("ztr-expand")) +
      (expanded ? " ▴" : " ▾");
  });
  row.append(toggle);

  const container = el("div", "ztr-inline-summary");
  container.hidden = true;
  return { row, container, preview, toggle };
}

function engineName(id: string): string {
  return channelRegistry.get(id as any)?.name ?? id;
}

// ---------------------------------------------------------------------------
// 内联 AI 总结（与侧栏 runSummary 同构的简化版）
// ---------------------------------------------------------------------------

const runningTokens = new WeakMap<HTMLElement, CancelToken>();

async function runSummary(
  entry: HistoryEntry,
  container: HTMLElement,
): Promise<void> {
  const sm = summaryManager();
  if (!sm) return;
  if (!sm.hasAvailableLLM()) {
    window.alert(str("ztr-summary-no-llm"));
    return;
  }

  runningTokens.get(container)?.cancel();
  const token = createCancelToken();
  runningTokens.set(container, token);

  container.replaceChildren();
  const card = el("div", "ztr-card");
  const head = el("div", "ztr-card-status");
  const badge = el("span", "ztr-badge ztr-badge-processing");
  badge.textContent = str("ztr-summarizing");
  head.append(badge);
  card.append(head);

  const text = el("div", "ztr-result-text ztr-streaming");
  card.append(text);

  const actions = el("div", "ztr-card-actions");
  const hint = el("span", "ztr-muted");
  hint.hidden = true;
  const setHint = (msg: string) => {
    hint.textContent = msg;
    hint.hidden = false;
  };
  actions.append(hint);
  const cancelBtn = el("button", "ztr-btn");
  cancelBtn.textContent = str("ztr-cancel");
  cancelBtn.addEventListener("click", () => token.cancel());
  actions.append(cancelBtn);
  card.append(actions);
  container.append(card);

  try {
    const { text: result } = await sm.summarize(
      entry.translatedText,
      (delta: string) => {
        text.textContent += delta;
      },
      token,
    );
    badge.textContent = str("ztr-status-success");
    badge.className = "ztr-badge ztr-badge-success";
    text.classList.remove("ztr-streaming");
    finalizeMarkdownContent(text, result);
    cancelBtn.remove();

    const copyBtn = el("button", "ztr-btn");
    copyBtn.textContent = str("ztr-copy-summary");
    copyBtn.addEventListener("click", () => {
      copyText(result);
      setHint(str("ztr-summary-copied"));
    });
    actions.append(copyBtn);

    const saveBtn = el("button", "ztr-btn");
    saveBtn.textContent = str("ztr-save-summary");
    saveBtn.addEventListener("click", async () => {
      try {
        await sm.saveSummary(entry.id, result);
        setHint(str("ztr-summary-saved"));
      } catch {
        setHint(str("ztr-summary-save-fail"));
      }
    });
    actions.append(saveBtn);

    const noteBtn = el("button", "ztr-btn");
    noteBtn.textContent = str("ztr-save-note");
    if (entry.itemID == null) {
      noteBtn.disabled = true;
      noteBtn.title = str("ztr-no-note-item");
    } else {
      noteBtn.addEventListener("click", async () => {
        try {
          const note = await sm.saveNote(entry.itemID, result);
          setHint(note ? str("ztr-note-saved") : str("ztr-note-save-fail"));
        } catch {
          setHint(str("ztr-note-save-fail"));
        }
      });
    }
    actions.append(noteBtn);

    const regenBtn = el("button", "ztr-btn");
    regenBtn.textContent = str("ztr-regenerate");
    regenBtn.addEventListener("click", () => {
      void runSummary(entry, container);
    });
    actions.append(regenBtn);
  } catch (e) {
    if (e instanceof CancelError) {
      badge.textContent = str("ztr-status-cancelled");
    } else {
      badge.textContent = str("ztr-status-fail");
      const err = el("div", "ztr-error");
      err.textContent = (e as Error).message;
      card.append(err);
    }
  }
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

bindZoteroGlobal();
void init();
