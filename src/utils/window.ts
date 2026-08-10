import { config } from "../../package.json";

export { getCurrentWindow, getCurrentPane };

/**
 * 获取当前 Zotero 主窗口
 */
function getCurrentWindow(): _ZoteroTypes.MainWindow {
  return (
    ztoolkit.getGlobal("Zotero")?.getMainWindows?.()[0] ??
    (ztoolkit.getGlobal("window") as _ZoteroTypes.MainWindow)
  );
}

/**
 * 获取当前活跃的 ZoteroPane（条目面板/阅读器共用同一 pane 对象）
 */
function getCurrentPane(): _ZoteroTypes.ZoteroPane {
  return (getCurrentWindow() as any)?.ZoteroPane ?? null;
}

export { config };
