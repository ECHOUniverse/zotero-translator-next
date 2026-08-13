/**
 * 阅读器输入源：
 * - renderTextSelectionPopup 划选弹层注入"翻译"按钮（官方 API）
 * - 划选即译（默认关，防抖）
 * - 快捷键翻译/总结（主窗口捕获阶段 keydown；阅读器为同窗口 tab，
 *   捕获阶段可穿过 iframe 边界，v0.1.x 验证）
 */

import { prefs } from "../prefs";
import { getString } from "../utils/locale";
import type { TranslateManager, TranslateTaskInfo } from "./tasks";
import type { SummaryManager } from "./summary";
import type { SelectionManager, SelectionAddResult } from "./selection";
import { getSelectedChannelId, getLastSuccessTask } from "../ui/sections";

export interface ReaderOptions {
  /**
   * 总结回调（由 addon.ts 装配注入 sections 的窗格渲染函数，
   * 避免 ReaderModule 反向依赖 UI 区块上下文）。
   */
  onSummarize?: (task: TranslateTaskInfo, kind: "reader" | "item") => void;
  /** 跨区域选区管理器（弹层「加入选区」按钮写入） */
  selection?: SelectionManager;
}

export class ReaderModule {
  private translate: TranslateManager;
  private summary: SummaryManager;
  private onSummarize?: (
    task: TranslateTaskInfo,
    kind: "reader" | "item",
  ) => void;
  private selection?: SelectionManager;
  private lastSelectionText = "";
  private lastSelectionTime = 0;
  private autoDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    translate: TranslateManager,
    summary: SummaryManager,
    options: ReaderOptions = {},
  ) {
    this.translate = translate;
    this.summary = summary;
    this.onSummarize = options.onSummarize;
    this.selection = options.selection;
  }

  /** 注册划选弹层按钮（startup 调用；插件卸载自动注销） */
  registerSelectionPopup(): void {
    const pluginID = "zotero-translator-next@echouniverse.io";
    Zotero.Reader.registerEventListener(
      "renderTextSelectionPopup",
      (event) => {
        const { reader, doc, params, append } = event;
        const text = params.annotation?.text ?? "";
        if (!text) return;
        this.lastSelectionText = text;
        this.lastSelectionTime = Date.now();
        const itemID = logicalItemID(reader.itemID);

        // 按钮容器（append 必须同步调用）
        const container = doc.createElement("div");
        container.className = "ztr-selection-popup";
        container.style.display = "flex";
        container.style.gap = "4px";
        container.style.margin = "2px 0";
        append(container);

        const btn = selectionPopupButton(
          doc,
          getString("ztr-translate-selection"),
        );
        btn.addEventListener("click", () => {
          void this.translate
            .translate({
              sourceText: text,
              itemID,
              channelId: getSelectedChannelId(),
            })
            .catch((e) => {
              ztoolkit.log(`[reader] translate error: ${e.message}`);
            });
        });
        container.append(btn);

        // 「加入选区」（跨区域拼段翻译入口）：
        // 点击取消挂起的划选即译；加入后弹层保持，可继续划下一段。
        if (this.selection && itemID != null) {
          const addBtn = selectionPopupButton(
            doc,
            getString("ztr-add-to-selection"),
          );
          addBtn.addEventListener("click", () => {
            // 1. 取消划选即译定时器（不触发自动翻译）
            if (this.autoDebounceTimer) {
              clearTimeout(this.autoDebounceTimer);
              this.autoDebounceTimer = null;
            }
            // 2. annotation 字段统一兜底（官方实现细节，未来版本可能变动）
            const annotation = params.annotation as any;
            const pageIndex = annotation?.position?.pageIndex ?? 0;
            // sortIndex 缺失 → undefined，由 manager 按添加顺序兜底（规格 §6.2）
            const sortIndex = Number(annotation?.sortIndex);
            const result = this.selection!.add(itemID, {
              pageIndex,
              sortIndex: Number.isFinite(sortIndex) ? sortIndex : undefined,
              pageLabel: annotation?.pageLabel ?? `p. ${pageIndex + 1}`,
              text,
            });
            // 3. 按钮反馈（800ms 后恢复）
            addBtn.textContent = selectionFeedback(result);
            setTimeout(() => {
              addBtn.textContent = getString("ztr-add-to-selection");
            }, 800);
          });
          container.append(addBtn);
        }

        // 划选即译（默认关）
        if (prefs.autoOnSelect) {
          if (this.autoDebounceTimer) clearTimeout(this.autoDebounceTimer);
          this.autoDebounceTimer = setTimeout(() => {
            void this.translate
              .translate({
                sourceText: text,
                itemID,
                channelId: getSelectedChannelId(),
              })
              .catch((e) => ztoolkit.log(e.message));
          }, prefs.autoDebounceMs || 800);
        }
      },
      pluginID,
    );
  }

  /** 快捷键（主窗口注册；阅读器 tab 捕获可达） */
  registerShortcuts(win: Window): void {
    win.addEventListener(
      "keydown",
      (event: KeyboardEvent) => {
        // 输入框/编辑态不响应
        const target = event.target as HTMLElement | null;
        if (target && isEditableTarget(target)) return;

        if (matchShortcut(event, prefs.shortcutTranslate)) {
          event.preventDefault();
          void this.translateSelection();
        } else if (matchShortcut(event, prefs.shortcutSummary)) {
          event.preventDefault();
          void this.summarizeLastSelection();
        }
      },
      true, // 捕获阶段（覆盖阅读器 iframe）
    );
  }

  /** 翻译当前划选文本（快捷键入口） */
  async translateSelection(): Promise<void> {
    const text = this.lastSelectionText;
    if (!text) {
      ztoolkit.log("No selection");
      return;
    }
    const reader = this.getCurrentReader();
    await this.translate
      .translate({
        sourceText: text,
        itemID: reader ? logicalItemID(reader.itemID) : null,
        channelId: getSelectedChannelId(),
      })
      .catch((e) => ztoolkit.log(e.message));
  }

  /** 总结最近一次翻译结果（快捷键入口，D6） */
  async summarizeLastSelection(): Promise<void> {
    const task = getLastSuccessTask();
    if (!task) {
      // 暂无已翻译内容：原生提示
      const Prompt = (Zotero as any).Prompt;
      if (Prompt?.confirm) {
        try {
          Prompt.confirm({
            title: getString("ztr-summarize"),
            text: getString("ztr-no-translated"),
            button0: getString("ztr-cancel"),
          });
        } catch (e) {
          ztoolkit.log(
            `[reader] summary prompt error: ${(e as Error).message}`,
          );
        }
      }
      return;
    }
    this.onSummarize?.(task, this.currentPaneKind());
  }

  /** 当前窗格类型：阅读器 tab → 阅读器窗格；主窗口 → 条目窗格 */
  private currentPaneKind(): "reader" | "item" {
    try {
      const win = Zotero.getMainWindows()[0] as any;
      const tabID = win?.Zotero_Tabs?.selectedID;
      if (tabID && Zotero.Reader.getByTabID(tabID)) return "reader";
    } catch {
      // 忽略，回落条目窗格
    }
    return "item";
  }

  /** 当前阅读器实例（弹层/区块跳页复用；无阅读器 tab 时 undefined） */
  getCurrentReader(): _ZoteroTypes.ReaderInstance | undefined {
    try {
      const win = Zotero.getMainWindows()[0] as any;
      const tabID = win?.Zotero_Tabs?.selectedID;
      return tabID ? Zotero.Reader.getByTabID(tabID) : undefined;
    } catch {
      return undefined;
    }
  }
}

function isEditableTarget(target: HTMLElement): boolean {
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  // XUL textbox 等
  if (target.closest?.("textbox, [contenteditable='true']")) return true;
  return false;
}

/** 弹层按钮（与「翻译」按钮同款样式） */
function selectionPopupButton(doc: Document, label: string): HTMLButtonElement {
  const b = doc.createElement("button");
  b.textContent = label;
  b.style.cssText =
    "padding:2px 8px;border-radius:4px;cursor:pointer;" +
    "font-size:12px;background:var(--fill-quinary,#eee);" +
    "border:1px solid var(--color-border,#ccc);color:var(--fill-primary,#333)";
  return b;
}

/** 「加入选区」结果反馈文案（added/dup/limit） */
function selectionFeedback(result: SelectionAddResult): string {
  if (result.added) {
    return getString("ztr-added-to-selection", {
      args: { count: result.count },
    });
  }
  return result.reason === "dup"
    ? getString("ztr-already-in-selection")
    : getString("ztr-selection-limit");
}

/**
 * 附件 → 父条目（逻辑条目）id。
 *
 * 阅读器 tab 中 ItemPane 上下文向区块提供的 item 为父条目（Zotero contextPane
 * 会把附件提升为 parentItem），而 ReaderInstance.itemID 是附件 id。若翻译任务
 * 直接落附件 id，与区块 ctx.itemID 不一致：条目隔离渲染/历史按文章查询都会错位
 * （表现为翻译成功但卡片不显示、历史区空）。统一归一化为父条目 id。
 */
function logicalItemID(readerItemID: number | null | undefined): number | null {
  if (readerItemID == null) return null;
  try {
    const item = Zotero.Items.get(readerItemID);
    // Zotero 类型中 parentID 为 number | false（无父条目时 false）
    const parentID = item?.parentID;
    return typeof parentID === "number" ? parentID : readerItemID;
  } catch {
    return readerItemID;
  }
}

interface ShortcutPattern {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

function matchShortcut(
  event: KeyboardEvent,
  pattern: ShortcutPattern,
): boolean {
  if (!pattern || !pattern.key) return false;
  const key = pattern.key.toUpperCase();
  if (event.key.toUpperCase() !== key) return false;
  if (Boolean(event.ctrlKey) !== Boolean(pattern.ctrl)) return false;
  if (Boolean(event.shiftKey) !== Boolean(pattern.shift)) return false;
  if (Boolean(event.altKey) !== Boolean(pattern.alt)) return false;
  if (Boolean(event.metaKey) !== Boolean(pattern.meta)) return false;
  return true;
}
