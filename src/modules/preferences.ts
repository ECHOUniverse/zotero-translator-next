/**
 * 偏好面板脚本（onpaneload 时由 hooks.onPrefsEvent 调用）
 * 处理：清空历史按钮、自定义渠道 JSON 校验
 * 注意：Zotero 8+ 面板脚本运行在独立 global scope，仅通过 Zotero 全局通信。
 */
import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { clearAllHistory } from "./history";
import { getPrefJSON, setPrefJSON } from "../utils/prefs";

export function registerPrefsScripts(_window: Window): void {
  addon.data.prefs = { window: _window };
  bindClearHistory(_window);
  bindCustomChannels(_window);
  bindChannelsOrder(_window);
  bindPromptTextareas(_window);
}

/** textarea 的 preference 绑定不可靠，手动双向同步 */
function bindPromptTextareas(win: Window): void {
  const keys = ["deepseek.prompt", "summary.prompt"] as const;
  for (const key of keys) {
    const ta = win.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-textarea-${key.replace(".", "-")}`,
    ) as HTMLTextAreaElement | null;
    if (!ta) continue;
    ta.value = String(
      Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true) ?? "",
    );
    ta.addEventListener("change", () => {
      Zotero.Prefs.set(`${config.prefsPrefix}.${key}`, ta.value, true);
    });
  }
}

function bindClearHistory(win: Window): void {
  const btn = win.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-clear-history`,
  );
  btn?.addEventListener("click", async () => {
    await clearAllHistory();
    new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
      .createLine({ text: getString("prefs-history-cleared"), type: "success" })
      .show();
  });
}

function bindCustomChannels(win: Window): void {
  const ta = win.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-custom-channels`,
  ) as HTMLTextAreaElement | null;
  if (!ta) return;
  // 初始化显示当前值（preference 属性绑定在部分环境不生效于 textarea）
  ta.value = JSON.stringify(getPrefJSON("customChannels", []), null, 2);

  const validateBtn = win.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-channels-validate`,
  );
  validateBtn?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(ta.value);
      if (!Array.isArray(parsed)) throw new Error("必须是数组");
      for (const c of parsed) {
        if (!c || typeof c !== "object") throw new Error("非法条目");
        if (!c.id || !c.name || !c.baseURL || !c.apiKey || !c.model)
          throw new Error(
            `渠道 ${c.id ?? "(未命名)"} 缺少字段（id/name/baseURL/apiKey/model）`,
          );
        if (!/^[\w-]+$/.test(String(c.id)))
          throw new Error(`id 只能含字母数字-：${c.id}`);
      }
      setPrefJSON("customChannels", parsed);
      new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
        .createLine({
          text: getString("prefs-channels-saved"),
          type: "success",
        })
        .show();
    } catch (e) {
      new ztoolkit.ProgressWindow(config.addonName, { closeTime: 5000 })
        .createLine({
          text: `JSON 无效: ${e instanceof Error ? e.message : String(e)}`,
          type: "error",
        })
        .show();
    }
  });
}

function bindChannelsOrder(win: Window): void {
  const input = win.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-channels-order`,
  ) as HTMLInputElement | null;
  if (!input) return;
  input.value = getPrefJSON<string[]>("channelsOrder", [
    "bing",
    "deepseek",
  ]).join(",");
  input.addEventListener("change", () => {
    const order = input.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setPrefJSON("channelsOrder", order);
  });
}
