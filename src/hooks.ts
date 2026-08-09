import { getString, initLocale } from "./utils/locale";
import { registerShortcuts } from "./modules/shortcuts";
import { ensureHistoryTable } from "./modules/history";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPrefsScripts } from "./modules/preferences";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // 历史表（幂等）
  await ensureHistoryTable();

  // 设置面板
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("pref-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });

  // 区块 + 阅读器事件
  addon.data.reader.register();
  addon.data.itemPane.register();

  // 条目右键菜单："翻译所选条目摘要"
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "zotero-itemmenu-translatornext-translate",
    label: getString("menuitem-translate-abstract"),
    commandListener: () => {
      const items = Zotero.getActiveZoteroPane()?.getSelectedItems();
      const item = items?.[0];
      const abstract = item?.getField("abstractNote");
      if (!abstract) {
        new ztoolkit.ProgressWindow(addon.data.config.addonName, {
          closeTime: 3000,
        })
          .createLine({ text: getString("no-abstract"), type: "error" })
          .show();
        return;
      }
      addon.data.translate.translate({
        sourceText: abstract,
        context: item.getField("title"),
        itemID: item.id,
      });
    },
    icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // 样式表
  const doc = win.document;
  const styles = ztoolkit.UI.createElement(doc, "link", {
    properties: {
      type: "text/css",
      rel: "stylesheet",
      href: `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
    },
  });
  doc.documentElement?.appendChild(styles);

  // 快捷键（主窗口；阅读器为同窗口内 tab，事件可达）
  registerShortcuts(win, addon.data.translate);
  // 总结快捷键 → 转发给阅读器模块
  win.addEventListener("ztr-summary-shortcut", () => {
    void addon.data.reader.summaryFromShortcut();
  });
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * Preference UI events
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
