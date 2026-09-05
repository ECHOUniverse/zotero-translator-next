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
import {
  TARGET_LANGUAGE_CODES,
  SOURCE_LANGUAGE_CODES,
  languageLabel,
} from "../constants/languages";
import {
  DEEPSEEK_BUILTIN_MODELS,
  getDeepSeekBalance,
  isDeepSeekLegacyModel,
  listDeepSeekModels,
  type DeepSeekBalanceInfo,
} from "../services/deepseek-admin";

/** 偏好窗口为 XUL 文档：创建 HTML 元素须显式命名空间 */
const HTML_NS = "http://www.w3.org/1999/xhtml";

function el(doc: Document, tag: string): any {
  return doc.createElementNS(HTML_NS, tag);
}

/** 已注册的偏好面板 id（openPreferences 定位用） */
let preferencePaneID: string | null = null;

/** 本次设置会话中从 API 拉到的模型 id */
let fetchedDeepSeekModels: string[] = [];

type XULMenulist = Element & { value: string };

function menupopupOf(menulist: Element): Element | null {
  return menulist.querySelector("menupopup");
}

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function createMenuItem(doc: Document, value: string, label: string): Element {
  const xulDoc = doc as Document & {
    createXULElement?: (tag: string) => Element;
  };
  const item = xulDoc.createXULElement
    ? xulDoc.createXULElement("menuitem")
    : doc.createElementNS(XUL_NS, "menuitem");
  item.setAttribute("value", value);
  item.setAttribute("label", label);
  return item;
}

function createXulCheckbox(doc: Document): any {
  const xulDoc = doc as Document & {
    createXULElement?: (tag: string) => Element;
  };
  const cb = xulDoc.createXULElement
    ? xulDoc.createXULElement("checkbox")
    : doc.createElementNS(XUL_NS, "checkbox");
  cb.setAttribute("native", "true");
  return cb;
}

function clearMenupopup(popup: Element): void {
  popup.replaceChildren();
}

export async function registerPreferencePane(): Promise<void> {
  preferencePaneID = await Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: "content/preferences.xhtml",
    label: getString("pref-title"),
    image: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
    stylesheets: [`chrome://${config.addonRef}/content/preferences.css`],
  });
}

/** 打开插件偏好面板（无 LLM 渠道提示的"打开设置"直达入口） */
export function openPluginPreferences(): void {
  try {
    const opener = (Zotero.Utilities.Internal as any)?.openPreferences;
    if (typeof opener === "function") {
      opener(preferencePaneID);
      return;
    }
  } catch {
    // 回落：直接打开偏好窗口（默认页）
  }
  try {
    Zotero.getMainWindows()[0]?.openDialog(
      "chrome://zotero/content/preferences/preferences.xhtml",
      "zotero-prefs",
      "chrome,titlebar,centerscreen,resizable=yes",
    );
  } catch {
    // 忽略
  }
}

/** 偏好窗口加载时：初始化交互逻辑 */
export function initPrefsWindow(win: Window): void {
  const doc = win.document;
  try {
    (win as any).MozXULElement?.insertFTLIfNeeded?.(
      `${config.addonRef}-preferences.ftl`,
    );
  } catch {
    // 偏好面板可能无 MozXULElement
  }
  fetchedDeepSeekModels = [];

  const orderBox = doc.querySelector(
    "#ztr-channel-order",
  ) as HTMLElement | null;
  if (orderBox) {
    renderChannelOrder(doc, orderBox);
    orderBox.addEventListener("click", (e) => {
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
      } else {
        return;
      }
      prefs.channelsOrder = order;
      renderChannelOrder(doc, orderBox);
    });
  }
  syncChannelSubsections(doc);
  initBingModeUI(doc);

  const customBox = doc.querySelector(
    "#ztr-custom-channels",
  ) as HTMLElement | null;
  if (customBox) {
    renderCustomChannels(doc, customBox);
    const addBtn = doc.querySelector(
      "#ztr-add-channel",
    ) as HTMLButtonElement | null;
    addBtn?.addEventListener("click", () => {
      addCustomChannel(doc, customBox);
    });
  }

  initLangSelectUI(
    doc,
    "#ztr-target-lang",
    "#ztr-target-lang-custom",
    TARGET_LANGUAGE_CODES,
    () => prefs.targetLang,
    (v) => {
      prefs.targetLang = v;
    },
  );
  initLangSelectUI(
    doc,
    "#ztr-source-lang",
    "#ztr-source-lang-custom",
    SOURCE_LANGUAGE_CODES,
    () => prefs.sourceLang,
    (v) => {
      prefs.sourceLang = v;
    },
    getString("pref-source-lang-auto"),
  );
  initLangSelectUI(
    doc,
    "#ztr-summary-lang",
    "#ztr-summary-lang-custom",
    ["auto", ...TARGET_LANGUAGE_CODES],
    () => prefs.summaryLang,
    (v) => {
      prefs.summaryLang = v;
    },
    getString("pref-summary-lang-auto"),
  );

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

  const clearBtn = doc.querySelector(
    "#ztr-clear-history",
  ) as HTMLButtonElement | null;
  clearBtn?.addEventListener("click", async () => {
    const confirmed = win.confirm(getString("ztr-clear-history-confirm"));
    if (!confirmed) return;
    const { clearHistory } = await import("./history");
    await clearHistory();
    clearBtn.disabled = true;
    clearBtn.textContent = getString("ztr-clear-history-done");
  });

  initDeepSeekUI(doc);
}

function initLangSelectUI(
  doc: Document,
  menulistId: string,
  customId: string,
  known: readonly string[],
  getValue: () => string,
  setValue: (v: string) => void,
  autoLabel?: string,
): void {
  const menulist = doc.querySelector(menulistId) as XULMenulist | null;
  const custom = doc.querySelector(customId) as HTMLInputElement | null;
  const popup = menulist ? menupopupOf(menulist) : null;
  if (!menulist || !custom || !popup) return;

  clearMenupopup(popup);
  for (const code of known) {
    const label =
      code === "auto" && autoLabel ? autoLabel : (languageLabel(code) ?? code);
    popup.append(createMenuItem(doc, code, label));
  }
  popup.append(
    createMenuItem(doc, "__custom__", getString("pref-lang-custom")),
  );

  const syncSelect = () => {
    const v = getValue();
    if (known.includes(v)) {
      menulist.value = v;
      custom.hidden = true;
    } else {
      menulist.value = "__custom__";
      custom.hidden = false;
    }
  };
  syncSelect();
  menulist.addEventListener("command", () => {
    if (menulist.value === "__custom__") {
      custom.hidden = false;
      custom.focus();
    } else {
      custom.hidden = true;
      custom.value = menulist.value;
      setValue(menulist.value);
    }
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

function setChannelEnabled(id: string, enabled: boolean): void {
  if (id === "mymemory") prefs.mymemoryEnabled = enabled;
  else if (id === "bing") prefs.bingEnabled = enabled;
  else if (id === "deepseek") prefs.deepseekEnabled = enabled;
  else if (id === "tencent") prefs.tencentEnabled = enabled;
}

function syncChannelSubsections(doc: Document): void {
  const bing = doc.querySelector("#ztr-bing-config") as HTMLElement | null;
  const ds = doc.querySelector("#ztr-deepseek-config") as HTMLElement | null;
  const tencent = doc.querySelector("#ztr-tencent-config") as HTMLElement | null;
  if (bing) bing.hidden = !prefs.bingEnabled;
  if (ds) ds.hidden = !prefs.deepseekEnabled;
  if (tencent) tencent.hidden = !prefs.tencentEnabled;
}

/** Bing 模式 radio：初始化选中态，切换时写 prefs 并显隐 Azure 字段 */
function initBingModeUI(doc: Document): void {
  const group = doc.querySelector("#ztr-bing-mode-group");
  if (!group) return;
  syncBingModeUI(doc);
  group.addEventListener("change", (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input?.name !== "ztr-bing-mode" || !input.checked) return;
    prefs.bingMode = input.value === "azure" ? "azure" : "edge";
    syncBingModeUI(doc);
  });
}

function syncBingModeUI(doc: Document): void {
  const mode = prefs.bingMode === "azure" ? "azure" : "edge";
  for (const radio of doc.querySelectorAll('input[name="ztr-bing-mode"]')) {
    (radio as HTMLInputElement).checked =
      (radio as HTMLInputElement).value === mode;
  }
  const fields = doc.querySelector(
    "#ztr-bing-azure-fields",
  ) as HTMLElement | null;
  if (fields) fields.hidden = mode !== "azure";
}

function renderChannelOrder(doc: Document, box: HTMLElement): void {
  box.replaceChildren();
  for (const meta of channelRegistry.listAll()) {
    const row = el(doc, "div");
    row.className = "ztr-prefs-row";

    const enable = createXulCheckbox(doc);
    enable.checked = meta.enabled;
    enable.disabled = meta.id.startsWith("custom:");
    enable.title = meta.name;
    enable.addEventListener("command", () => {
      setChannelEnabled(meta.id, enable.checked);
      syncChannelSubsections(doc);
    });

    const name = el(doc, "span");
    name.className = "ztr-prefs-row-name";
    name.textContent = `${meta.name}${meta.needsConfig && !meta.configured ? " ⚠" : ""}`;

    const up = el(doc, "button");
    up.textContent = "↑";
    (up as any).dataset.channelId = meta.id;
    (up as any).dataset.dir = "up";
    const down = el(doc, "button");
    down.textContent = "↓";
    (down as any).dataset.channelId = meta.id;
    (down as any).dataset.dir = "down";

    row.append(enable, name, up, down);
    box.append(row);
  }
}

function renderCustomChannels(doc: Document, box: HTMLElement): void {
  box.replaceChildren();
  for (const cfg of prefs.customChannels) {
    const row = el(doc, "div");
    row.className = "ztr-prefs-row";
    const name = el(doc, "span");
    name.className = "ztr-prefs-row-name";
    name.textContent = cfg.name;
    const del = el(doc, "button");
    del.textContent = "✕";
    del.addEventListener("click", () => {
      prefs.customChannels = prefs.customChannels.filter(
        (c) => c.id !== cfg.id,
      );
      prefs.channelsOrder = prefs.channelsOrder.filter(
        (id) => id !== `custom:${cfg.id}`,
      );
      channelRegistry.invalidate();
      renderCustomChannels(doc, box);
      const orderBox = doc.querySelector(
        "#ztr-channel-order",
      ) as HTMLElement | null;
      if (orderBox) renderChannelOrder(doc, orderBox);
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

function readDeepSeekForm(doc: Document): { apiKey: string; baseURL: string } {
  const keyInput = doc.querySelector(
    "#ztr-deepseek-key",
  ) as HTMLInputElement | null;
  const urlInput = doc.querySelector(
    "#ztr-deepseek-baseurl",
  ) as HTMLInputElement | null;
  return {
    apiKey: (keyInput?.value ?? prefs.deepseekApiKey).trim(),
    baseURL: (urlInput?.value ?? prefs.deepseekBaseURL).trim(),
  };
}

function initDeepSeekUI(doc: Document): void {
  const menulist = doc.querySelector(
    "#ztr-deepseek-model-select",
  ) as XULMenulist | null;
  const custom = doc.querySelector(
    "#ztr-deepseek-model-custom",
  ) as HTMLInputElement | null;
  const fetchModelsBtn = doc.querySelector(
    "#ztr-deepseek-fetch-models",
  ) as HTMLButtonElement | null;
  const fetchBalanceBtn = doc.querySelector(
    "#ztr-deepseek-fetch-balance",
  ) as HTMLButtonElement | null;
  if (!menulist || !custom) return;

  const syncModelSelect = () => {
    fillDeepSeekModelSelect(doc, menulist, custom, prefs.deepseekModel);
    syncLegacyHint(doc, prefs.deepseekModel);
  };
  syncModelSelect();

  menulist.addEventListener("command", () => {
    if (menulist.value === "__custom__") {
      custom.hidden = false;
      custom.focus();
    } else {
      custom.hidden = true;
      custom.value = menulist.value;
      prefs.deepseekModel = menulist.value;
      syncLegacyHint(doc, menulist.value);
    }
  });
  custom.addEventListener("change", () => {
    syncLegacyHint(doc, custom.value.trim());
  });

  fetchModelsBtn?.addEventListener("click", () => {
    void fetchAndFillModels(doc, menulist, custom, false);
  });
  fetchBalanceBtn?.addEventListener("click", () => {
    void fetchAndShowBalance(doc);
  });

  const { apiKey } = readDeepSeekForm(doc);
  if (apiKey) {
    void fetchAndFillModels(doc, menulist, custom, true);
  }
}

function fillDeepSeekModelSelect(
  doc: Document,
  menulist: XULMenulist,
  custom: HTMLInputElement,
  current: string,
): void {
  const popup = menupopupOf(menulist);
  if (!popup) return;

  const ids = [
    ...new Set(
      [...DEEPSEEK_BUILTIN_MODELS, ...fetchedDeepSeekModels, current].filter(
        Boolean,
      ),
    ),
  ];
  clearMenupopup(popup);
  for (const id of ids) {
    popup.append(createMenuItem(doc, id, id));
  }
  popup.append(
    createMenuItem(doc, "__custom__", getString("pref-deepseek-model-custom")),
  );

  if (current && ids.includes(current)) {
    menulist.value = current;
    custom.hidden = true;
  } else if (current) {
    menulist.value = "__custom__";
    custom.hidden = false;
  } else {
    menulist.value = DEEPSEEK_BUILTIN_MODELS[0];
    custom.hidden = true;
  }
}

function syncLegacyHint(doc: Document, model: string): void {
  const hint = doc.querySelector(
    "#ztr-deepseek-legacy-hint",
  ) as HTMLElement | null;
  if (!hint) return;
  if (isDeepSeekLegacyModel(model)) {
    hint.hidden = false;
    hint.textContent = getString("pref-deepseek-legacy-hint", {
      args: { model },
    });
  } else {
    hint.hidden = true;
    hint.textContent = "";
  }
}

function setDeepSeekStatus(doc: Document, text: string, warn = false): void {
  const status = doc.querySelector(
    "#ztr-deepseek-status",
  ) as HTMLElement | null;
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("ztr-prefs-warn", warn && Boolean(text));
}

async function fetchAndFillModels(
  doc: Document,
  menulist: XULMenulist,
  custom: HTMLInputElement,
  silent: boolean,
): Promise<void> {
  const { apiKey, baseURL } = readDeepSeekForm(doc);
  if (!apiKey) {
    if (!silent) {
      setDeepSeekStatus(doc, getString("pref-deepseek-key-required"), true);
    }
    return;
  }
  const btn = doc.querySelector(
    "#ztr-deepseek-fetch-models",
  ) as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  if (!silent) {
    setDeepSeekStatus(doc, getString("pref-deepseek-status-loading"));
  }
  try {
    fetchedDeepSeekModels = await listDeepSeekModels(baseURL, apiKey);
    fillDeepSeekModelSelect(doc, menulist, custom, prefs.deepseekModel);
    if (!silent) setDeepSeekStatus(doc, "");
  } catch (e) {
    if (!silent) {
      setDeepSeekStatus(
        doc,
        getString("pref-deepseek-fetch-error", {
          args: { message: (e as Error).message || String(e) },
        }),
        true,
      );
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function fetchAndShowBalance(doc: Document): Promise<void> {
  const { apiKey, baseURL } = readDeepSeekForm(doc);
  const box = doc.querySelector("#ztr-deepseek-balance") as HTMLElement | null;
  if (!apiKey) {
    setDeepSeekStatus(doc, getString("pref-deepseek-key-required"), true);
    return;
  }
  const btn = doc.querySelector(
    "#ztr-deepseek-fetch-balance",
  ) as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  setDeepSeekStatus(doc, getString("pref-deepseek-status-loading"));
  try {
    const balance = await getDeepSeekBalance(baseURL, apiKey);
    if (box) {
      const lines = balance.balance_infos.map((info) =>
        formatBalanceLine(info),
      );
      box.textContent = lines.join(" · ");
      box.hidden = lines.length === 0;
      box.classList.toggle("ztr-prefs-warn", !balance.is_available);
    }
    if (!balance.is_available) {
      setDeepSeekStatus(
        doc,
        getString("pref-deepseek-balance-unavailable"),
        true,
      );
    } else {
      setDeepSeekStatus(doc, "");
    }
  } catch (e) {
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
    setDeepSeekStatus(
      doc,
      getString("pref-deepseek-fetch-error", {
        args: { message: (e as Error).message || String(e) },
      }),
      true,
    );
  } finally {
    if (btn) btn.disabled = false;
  }
}

function formatBalanceLine(info: DeepSeekBalanceInfo): string {
  return getString("pref-deepseek-balance-line", {
    args: {
      currency: info.currency,
      total: info.total_balance,
      granted: info.granted_balance,
      topped: info.topped_up_balance,
    },
  });
}
