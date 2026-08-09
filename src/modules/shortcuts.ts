/**
 * 快捷键（可配置）：翻译选中内容 / 总结
 * 默认：Cmd/Ctrl+Shift+T 翻译，Cmd/Ctrl+Shift+S 总结
 */
import { getPref, getPrefJSON } from "../utils/prefs";
import { TranslateManager } from "./translate";

export interface ShortcutSpec {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  key: string;
}

export function parseShortcut(spec: string): ShortcutSpec | null {
  try {
    const obj = JSON.parse(spec) as ShortcutSpec;
    if (!obj || typeof obj.key !== "string" || !obj.key) return null;
    return obj;
  } catch {
    return null;
  }
}

export function matchShortcut(
  ev: KeyboardEvent,
  spec: ShortcutSpec | null,
): boolean {
  if (!spec) return false;
  const key = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
  if (key !== spec.key.toUpperCase()) return false;
  if (Boolean(spec.ctrl) !== ev.ctrlKey) return false;
  if (Boolean(spec.shift) !== ev.shiftKey) return false;
  if (Boolean(spec.alt) !== ev.altKey) return false;
  if (Boolean(spec.meta) !== ev.metaKey) return false;
  return true;
}

/** 是否应忽略按键（输入框/编辑态） */
function isEditableTarget(ev: KeyboardEvent): boolean {
  const t = ev.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (t.isContentEditable) return true;
  return false;
}

export function registerShortcuts(
  win: Window,
  translateMgr: TranslateManager,
): void {
  win.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (isEditableTarget(ev)) return;
    const translateSpec = parseShortcut(getPref("shortcut.translate"));
    const summarySpec = parseShortcut(getPref("shortcut.summary"));
    if (matchShortcut(ev, translateSpec)) {
      ev.preventDefault();
      const text = translateMgr.selectedText?.trim();
      if (text) {
        translateMgr.translate({ sourceText: text });
      } else {
        // 无划选文本时翻译选中条目的摘要
        const items = Zotero.getActiveZoteroPane()?.getSelectedItems();
        const item = items?.[0];
        const abstract = item?.getField("abstractNote");
        if (abstract) {
          translateMgr.translate({
            sourceText: abstract,
            context: item.getField("title"),
            itemID: item.id,
          });
        }
      }
      return;
    }
    if (matchShortcut(ev, summarySpec)) {
      ev.preventDefault();
      // 总结最近一次翻译：由 reader 模块处理（通过自定义事件）
      win.dispatchEvent(new CustomEvent("ztr-summary-shortcut"));
    }
  });
}

/** 获取当前选中条目（工具函数） */
export function getSelectedItems(): Zotero.Item[] {
  return Zotero.getActiveZoteroPane()?.getSelectedItems() ?? [];
}
