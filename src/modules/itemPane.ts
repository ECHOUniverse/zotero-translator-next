/**
 * 条目面板输入源：翻译选中条目的标题/摘要 → 同一管线，历史关联 itemID。
 * - 条目右键菜单（MenuManager，Zotero 8+ 官方 API）
 * - 区块工具栏按钮
 */

import { getString, getLocaleID } from "../utils/locale";
import type { TranslateManager } from "./tasks";
import { getSelectedChannelId } from "../ui/sections";

export class ItemPaneModule {
  private translate: TranslateManager;

  constructor(translate: TranslateManager) {
    this.translate = translate;
  }

  /** 注册条目右键菜单（Zotero.MenuManager，官方 API） */
  registerContextMenu(): void {
    try {
      const registered = Zotero.MenuManager.registerMenu({
        menuID: "ztr-translate-item",
        pluginID: "zotero-translator-next@echouniverse.io",
        target: "main/library/item",
        menus: [
          {
            menuType: "menuitem",
            l10nID: getLocaleID("ztr-menuitem-translate-abstract"),
            onCommand: (_event, context) => {
              const item = context.items?.[0];
              if (!item) return;
              void this.translateItem(item);
            },
          },
        ],
      });
      if (registered) {
        ztoolkit.log("context menu registered");
      }
    } catch (e) {
      ztoolkit.log(`registerContextMenu failed: ${(e as Error).message}`);
    }
  }

  /** 翻译条目（标题 + 摘要拼接，摘要优先） */
  async translateItem(item: Zotero.Item): Promise<void> {
    const title = item.getField("title") ?? "";
    const abstract = item.getField("abstractNote") ?? "";
    let sourceText = "";
    let context: string | undefined;
    if (abstract) {
      sourceText = abstract;
      context = title;
    } else if (title) {
      sourceText = title;
    } else {
      throw new Error(getString("ztr-no-text"));
    }
    await this.translate.translate({
      sourceText,
      context,
      itemID: item.id,
      channelId: getSelectedChannelId(),
    });
  }
}
