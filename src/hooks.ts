import { config } from "../package.json";
import { getString, initLocale } from "./utils/locale";
import { ensureHistoryTable } from "./modules/history";
import { registerSections } from "./ui/sections";
import { registerPreferencePane, initPrefsWindow } from "./modules/settings";
import type { TranslateManager } from "./modules/tasks";
import type { SummaryManager } from "./modules/summary";
import type { ReaderModule } from "./modules/reader";
import type { ItemPaneModule } from "./modules/itemPane";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // 历史表（幂等）
  await ensureHistoryTable();

  // 偏好面板（官方 API；await 以捕获 paneID，供"打开设置"直达）
  await registerPreferencePane();

  // 区块（阅读器侧栏 + 条目面板）
  const { translate, summary, reader, itemPane } = addon.data;
  const { readerPaneID, itemPaneID } = registerSections(translate, summary);
  (addon.data as any).sectionKeys = { readerPaneID, itemPaneID };

  // 阅读器划选弹层 + 快捷键
  reader.registerSelectionPopup();
  itemPane.registerContextMenu();

  // 主窗口（可能已打开）
  for (const win of Zotero.getMainWindows()) {
    await onMainWindowLoad(win);
  }

  addon.data.initialized = true;
  ztoolkit.log(`${config.addonName} loaded`);
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // 区块 header/sidenav 的 data-l10n-id 在主窗口 Fluent 中解析
  win.MozXULElement.insertFTLIfNeeded(`${config.addonRef}-mainWindow.ftl`);
  // 快捷键（捕获阶段，覆盖阅读器 iframe tab）
  addon.data.reader.registerShortcuts(win as unknown as Window);
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  // 窗口级清理（快捷键监听随窗口销毁）
}

function onShutdown(): void {
  // 取消进行中任务
  addon.data.translate.cancelAll();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[config.addonInstance];
}

/**
 * Preference UI events（偏好窗口加载时初始化交互）
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      initPrefsWindow(data.window as Window);
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
