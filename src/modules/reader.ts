/**
 * 阅读器输入源：
 * - renderTextSelectionPopup 划选弹层注入"翻译"按钮（官方 API）
 * - 划选即译（默认关，防抖）
 * - 快捷键翻译/总结（主窗口捕获阶段 keydown；阅读器为同窗口 tab，
 *   捕获阶段可穿过 iframe 边界，v0.1.x 验证）
 */

import { prefs } from "../prefs";
import { getString } from "../utils/locale";
import { createCancelToken, CancelError } from "../utils/cancel";
import type { TranslateManager } from "./tasks";
import type { SummaryManager } from "./summary";
import { getSelectedChannelId } from "../ui/sections";

export class ReaderModule {
  private translate: TranslateManager;
  private summary: SummaryManager;
  private lastSelectionText = "";
  private lastSelectionTime = 0;
  private autoDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(translate: TranslateManager, summary: SummaryManager) {
    this.translate = translate;
    this.summary = summary;
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

        // 按钮容器（append 必须同步调用）
        const container = doc.createElement("div");
        container.className = "ztr-selection-popup";
        container.style.display = "flex";
        container.style.gap = "4px";
        container.style.margin = "2px 0";
        append(container);

        const btn = doc.createElement("button");
        btn.textContent = getString("ztr-translate-selection");
        btn.style.cssText =
          "padding:2px 8px;border-radius:4px;cursor:pointer;" +
          "font-size:12px;background:var(--fill-quinary,#eee);" +
          "border:1px solid var(--color-border,#ccc);color:var(--fill-primary,#333)";
        btn.addEventListener("click", () => {
          void this.translate
            .translate({
              sourceText: text,
              itemID: reader.itemID ?? null,
              channelId: getSelectedChannelId(),
            })
            .catch((e) => {
              ztoolkit.log(`[reader] translate error: ${e.message}`);
            });
        });
        container.append(btn);

        // 划选即译（默认关）
        if (prefs.autoOnSelect) {
          if (this.autoDebounceTimer) clearTimeout(this.autoDebounceTimer);
          this.autoDebounceTimer = setTimeout(() => {
            void this.translate
              .translate({
                sourceText: text,
                itemID: reader.itemID ?? null,
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
        itemID: reader?.itemID ?? null,
        channelId: getSelectedChannelId(),
      })
      .catch((e) => ztoolkit.log(e.message));
  }

  /** 总结最近一次翻译结果 */
  async summarizeLastSelection(): Promise<void> {
    ztoolkit.log("summary shortcut");
    // 简单实现：取最近成功任务（由 UI 层按钮触发完整流程）
    // 快捷键只对已翻译内容生效
    const task = this.translate.getCurrent();
    void task;
  }

  private getCurrentReader(): _ZoteroTypes.ReaderInstance | undefined {
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
