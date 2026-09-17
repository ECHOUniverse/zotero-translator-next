import { assert } from "chai";
import { config } from "../../package.json";

describe("startup", function () {
  this.timeout(30000);

  it("插件实例已定义", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  it("插件已初始化完成", function () {
    assert.equal((Zotero as any)[config.addonInstance].data.initialized, true);
  });

  it("翻译历史表已创建", async function () {
    const exists = await Zotero.DB.tableExists("translation_history");
    assert.equal(exists, true);
  });

  it("历史索引已创建", async function () {
    const cacheIdx = await Zotero.DB.indexExists("idx_history_cache");
    const createdIdx = await Zotero.DB.indexExists("idx_history_created");
    assert.equal(cacheIdx, true);
    assert.equal(createdIdx, true);
  });

  it("偏好面板已注册", function () {
    const panes = Zotero.PreferencePanes.pluginPanes;
    assert.ok(
      panes.some((p: any) => p.pluginID === config.addonID),
      `pluginID ${config.addonID} 应在 pluginPanes 中`,
    );
  });

  it("区块已注册（registerSection 返回 paneID）", function () {
    const instance: any = Zotero[config.addonInstance];
    assert.ok(
      instance.data.sectionKeys,
      "sectionKeys 应存在（registerSections 返回值）",
    );
    assert.equal(instance.data.sectionKeys.readerPaneID, "translator-reader");
    assert.isUndefined(
      instance.data.sectionKeys.itemPaneID,
      "文献库条目窗格不应再注册 translator-item",
    );
  });

  it("区块注册于 ItemPaneManager（customSectionData，不依赖 GUI）", function () {
    const data: any = (Zotero.ItemPaneManager as any).customSectionData;
    assert.ok(data?.options?.length, "customSectionData.options 应存在");
    const ids = data.options.map((o: any) => o.paneID);
    // Zotero 9 对 paneID 特殊字符转义后加 pluginID 前缀
    const prefixed = `${config.addonID.replace(/[.@]/g, "\\$&")}-`;
    assert.ok(
      ids.some((id: string) => id.endsWith(`${prefixed}translator-reader`)),
      `应注册 translator-reader（实际：${ids.join(", ")}）`,
    );
    assert.ok(
      !ids.some((id: string) => id.endsWith(`${prefixed}translator-item`)),
      `不应注册 translator-item（实际：${ids.join(", ")}）`,
    );
  });

  it("文献库条目窗格不显示插件区块或侧栏图标", async function () {
    const win = Zotero.getMainWindows()[0];
    if (!win || !win.ZoteroPane) {
      this.skip();
      return;
    }
    const details = win.document.querySelector("item-details");
    if (!details) {
      this.skip();
      return;
    }
    try {
      const item = new Zotero.Item("journalArticle");
      item.setField("title", `ZTR Test ${Date.now()}`);
      await item.saveTx();
      win.ZoteroPane.selectItem(item.id);
    } catch {
      this.skip();
      return;
    }

    // 等条目详情渲染一轮，确认插件没有在文献库露出
    await new Promise((r) => setTimeout(r, 2000));

    const itemSection = win.document.querySelector(
      'item-pane-custom-section[data-pane$="-translator-item"]',
    );
    assert.isNull(itemSection, "文献库不应再挂载 translator-item 区块");

    const readerSections = Array.from(
      win.document.querySelectorAll(
        'item-pane-custom-section[data-pane$="-translator-reader"]',
      ),
    ) as HTMLElement[];
    for (const section of readerSections) {
      assert.equal(
        section.hidden,
        true,
        "reader 区块在主窗口 library tab 应隐藏",
      );
    }

    const visiblePluginChrome = Array.from(
      win.document.querySelectorAll("[data-pane*='translator']"),
    ).filter((el) => {
      const node = el as HTMLElement;
      if (node.hidden) return false;
      return node.tagName.toLowerCase() !== "item-pane-custom-section";
    });
    assert.equal(
      visiblePluginChrome.length,
      0,
      `文献库侧栏不得显示插件图标; panes=${visiblePluginChrome
        .map((el) => el.getAttribute("data-pane"))
        .join(", ")}`,
    );
  });

  it("Fluent 本地化可用（getString 返回文案而非裸 key）", function () {
    const instance: any = Zotero[config.addonInstance];
    assert.ok(instance.data.locale?.current, "locale 应已初始化");
    const l10n = instance.data.locale.current;
    const messages = l10n.formatMessagesSync([
      { id: `${config.addonRef}-ztr-status-success` },
      { id: `${config.addonRef}-pref-title` },
      { id: `${config.addonRef}-ztr-clear-history-confirm` },
    ]);
    assert.ok(messages[0]?.value, "ztr-status-success 应有译文");
    assert.equal(
      messages[1]?.value,
      "ZoteroTranslatorNext",
      "偏好面板标题应为插件名，而非裸 key",
    );
    assert.ok(
      messages[2]?.value &&
        !messages[2].value.includes("ztr-clear-history-confirm"),
      "清空历史确认文案应已定义",
    );
  });

  it("MyMemory 渠道真实翻译（网络）", async function () {
    // 测试运行在 Zotero（Firefox）进程内，无 Node 的 process 全局，
    // 需通过 Services.env 读取环境变量；CI 网络不稳定，真实 HTTP 调用会偶发失败
    const isCI =
      typeof Services !== "undefined" &&
      Services.env.exists("CI") &&
      Services.env.get("CI") === "true";
    if (isCI) {
      this.skip();
      return;
    }
    this.timeout(60000);
    const instance: any = Zotero[config.addonInstance];
    // 关联当前选中条目（新语义：历史按条目隔离，翻译需带 itemID 才会出现在该条目历史区）
    const win = Zotero.getMainWindows()[0];
    const selected =
      (win?.ZoteroPane?.getSelectedItems?.()?.[0] as any) ?? null;
    const task = await instance.data.translate.translate({
      // 随机文本避免跨运行缓存命中（缓存命中不落库，历史断言会失败）
      sourceText: `Hello world, this is a translation pipeline test. ${Date.now()}`,
      channelId: "mymemory",
      itemID: selected?.id ?? null,
    });
    // 等待队列完成（最长 30s）
    const deadline = Date.now() + 30000;
    while (
      ["waiting", "processing"].includes(task.status) &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(
      task.status,
      "success",
      `翻译应成功; status=${task.status} error=${task.error ?? ""}`,
    );
    assert.ok(task.translatedText.length > 0, "译文不应为空");
    assert.ok(task.engine, "应记录实际渠道");

    // 历史落库验证：全局历史应包含此记录；按 itemID 查询应命中
    const { getHistoryByItem } = await import("../../src/modules/history");
    const globalHistory = await getHistoryByItem(null, 10);
    assert.ok(
      globalHistory.some((h) => h.sourceText === task.sourceText),
      "翻译记录应写入历史（全局查询命中）",
    );
    if (task.itemID != null) {
      const itemHistory = await getHistoryByItem(task.itemID, 10);
      assert.ok(
        itemHistory.some((h) => h.sourceText === task.sourceText),
        "按 itemID 查询应命中",
      );
    }

    // 翻译 UI 只在阅读器内容窗格：文献库不再挂载条目区块，历史刷新由阅读器用例覆盖
  });
});
