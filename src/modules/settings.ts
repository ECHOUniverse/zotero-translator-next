/**
 * 设置面板桥接：
 * - PreferencePanes.register（官方 API）注册偏好面板
 * - onPrefsEvent('load') 时在偏好窗口初始化交互
 *   （Zotero 8+ 偏好面板脚本独立 global scope，跨 pane 共享须挂 window；
 *   本插件仅一个 pane，模块内闭包即可）
 */

import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { prefs } from "../prefs";
import { channelRegistry } from "../services";

export function registerPreferencePane(): void {
  void Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: "content/preferences.xhtml",
    label: getString("ztr-prefs-title"),
    image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
  });
}

/** 偏好窗口加载时：初始化交互逻辑 */
export function initPrefsWindow(win: Window): void {
  const doc = win.document;

  // 渠道顺序上移/下移 + 启用开关
  const orderBox = doc.querySelector(
    "#ztr-channel-order",
  ) as HTMLElement | null;
  if (orderBox) {
    renderChannelOrder(doc, orderBox);
  }

  // Bing 模式联动
  const modeSelect = doc.querySelector(
    "#ztr-bing-mode",
  ) as HTMLSelectElement | null;
  if (modeSelect) {
    modeSelect.addEventListener("command", () => {
      prefs.bingMode = modeSelect.value as "edge" | "azure";
      const azureBox = doc.querySelector(
        "#ztr-bing-azure",
      ) as HTMLElement | null;
      if (azureBox) azureBox.hidden = modeSelect.value !== "azure";
    });
  }

  // 自定义渠道增删
  const customBox = doc.querySelector(
    "#ztr-custom-channels",
  ) as HTMLElement | null;
  if (customBox) {
    renderCustomChannels(doc, customBox);
    const addBtn = doc.querySelector(
      "#ztr-add-channel",
    ) as HTMLButtonElement | null;
    addBtn?.addEventListener("command", () => {
      addCustomChannel(doc, customBox);
    });
  }

  // 快捷键输入捕获
  for (const [id, kind] of [
    ["#ztr-shortcut-translate", "translate"],
    ["#ztr-shortcut-summary", "summary"],
  ] as Array<[string, "translate" | "summary"]>) {
    const input = doc.querySelector(id) as HTMLInputElement | null;
    if (!input) continue;
    input.value = shortcutDisplay(
      kind === "translate" ? prefs.shortcutTranslate : prefs.shortcutSummary,
    );
    input.addEventListener("keydown", (e) => {
      e.preventDefault();
      const ke = e as KeyboardEvent;
      const pattern = {
        ctrl: ke.ctrlKey,
        shift: ke.shiftKey,
        alt: ke.altKey,
        meta: ke.metaKey,
        key: ke.key.length === 1 ? ke.key.toUpperCase() : ke.key,
      };
      if (kind === "translate") prefs.shortcutTranslate = pattern;
      else prefs.shortcutSummary = pattern;
      input.value = shortcutDisplay(pattern);
    });
  }

  // 清空历史
  const clearBtn = doc.querySelector(
    "#ztr-clear-history",
  ) as HTMLButtonElement | null;
  clearBtn?.addEventListener("command", async () => {
    const confirmed = win.confirm(getString("ztr-clear-history-confirm"));
    if (!confirmed) return;
    const { clearHistory } = await import("./history");
    await clearHistory();
    clearBtn.disabled = true;
    clearBtn.textContent = getString("ztr-clear-history-done");
  });

  // 渠道排序按钮事件（委托）
  orderBox?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(
      "button",
    ) as HTMLElement | null;
    if (!btn) return;
    const id = (btn as any).dataset?.channelId as string | undefined;
    if (!id) return;
    const order = prefs.channelsOrder;
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const dir = (btn as any).dataset?.dir;
    if (dir === "up" && idx > 0) {
      [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
    } else if (dir === "down" && idx < order.length - 1) {
      [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
    }
    prefs.channelsOrder = order;
    renderChannelOrder(doc, orderBox);
  });
}

function shortcutDisplay(pattern: {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}): string {
  const parts: string[] = [];
  if (pattern.meta) parts.push("Cmd");
  if (pattern.ctrl) parts.push("Ctrl");
  if (pattern.alt) parts.push("Alt");
  if (pattern.shift) parts.push("Shift");
  parts.push(pattern.key);
  return parts.join("+");
}

function renderChannelOrder(doc: Document, box: HTMLElement): void {
  box.replaceChildren();
  for (const meta of channelRegistry.listAll()) {
    const row = doc.createElement("div");
    row.className = "ztr-prefs-row";
    const name = doc.createElement("span");
    name.textContent = `${meta.name}${meta.needsConfig && !meta.configured ? " ⚠" : ""}`;
    row.append(name);
    const up = doc.createElement("button");
    up.textContent = "↑";
    (up as any).dataset.channelId = meta.id;
    (up as any).dataset.dir = "up";
    const down = doc.createElement("button");
    down.textContent = "↓";
    (down as any).dataset.channelId = meta.id;
    (down as any).dataset.dir = "down";
    row.append(up, down);
    box.append(row);
  }
}

function renderCustomChannels(doc: Document, box: HTMLElement): void {
  box.replaceChildren();
  for (const cfg of prefs.customChannels) {
    const row = doc.createElement("div");
    row.className = "ztr-prefs-row";
    const name = doc.createElement("span");
    name.textContent = cfg.name;
    const del = doc.createElement("button");
    del.textContent = "✕";
    del.addEventListener("command", () => {
      prefs.customChannels = prefs.customChannels.filter(
        (c) => c.id !== cfg.id,
      );
      channelRegistry.invalidate();
      renderCustomChannels(doc, box);
    });
    row.append(name, del);
    box.append(row);
  }
}

function addCustomChannel(doc: Document, box: HTMLElement): void {
  const name = doc.querySelector("#ztr-custom-name") as HTMLInputElement | null;
  const baseURL = doc.querySelector(
    "#ztr-custom-baseurl",
  ) as HTMLInputElement | null;
  const apiKey = doc.querySelector(
    "#ztr-custom-key",
  ) as HTMLInputElement | null;
  const model = doc.querySelector(
    "#ztr-custom-model",
  ) as HTMLInputElement | null;
  if (!name || !baseURL || !apiKey) return;
  if (!name.value.trim() || !baseURL.value.trim() || !apiKey.value.trim()) {
    return;
  }
  const id = `c${Date.now().toString(36)}`;
  const channels = prefs.customChannels;
  channels.push({
    id,
    name: name.value.trim(),
    baseURL: baseURL.value.trim(),
    apiKey: apiKey.value.trim(),
    model: model?.value.trim() || "gpt-4o-mini",
    prompt: "",
  });
  prefs.customChannels = channels;
  // 加入回退链
  const order = prefs.channelsOrder;
  if (!order.includes(`custom:${id}`)) {
    order.push(`custom:${id}`);
    prefs.channelsOrder = order;
  }
  channelRegistry.invalidate();
  name.value = "";
  baseURL.value = "";
  apiKey.value = "";
  if (model) model.value = "";
  renderCustomChannels(doc, box);
  renderChannelOrder(
    doc,
    doc.querySelector("#ztr-channel-order") as HTMLElement,
  );
}
