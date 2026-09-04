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
    assert.equal(instance.data.sectionKeys.itemPaneID, "translator-item");
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
      ids.some((id: string) => id.endsWith(`${prefixed}translator-item`)),
      `应注册 translator-item（实际：${ids.join(", ")}）`,
    );
  });

  it("选中条目后渲染自定义区块（真实 item-details 流程）", async function () {
    const win = Zotero.getMainWindows()[0];
    if (!win || !win.ZoteroPane) {
      this.skip();
      return;
    }
    // headless/无显示环境：item-details 可能未完整加载，跳过（注册已由上一用例覆盖）
    const details = win.document.querySelector("item-details");
    if (!details) {
      this.skip();
      return;
    }
    // 创建条目（触发 item-details 渲染区块）；无可用库时跳过
    let item: any = null;
    try {
      item = new Zotero.Item("journalArticle");
      item.setField("title", `ZTR Test ${Date.now()}`);
      await item.saveTx();
      win.ZoteroPane.selectItem(item.id);
    } catch {
      this.skip();
      return;
    }

    // 等待我们的区块元素出现（最长 10s；data-pane 为 pluginID-paneID 命名空间形式）
    const deadline = Date.now() + 10000;
    let ours = 0;
    let diag = "";
    while (Date.now() < deadline) {
      ours = win.document.querySelectorAll(
        'item-pane-custom-section[data-pane$="-translator-reader"], item-pane-custom-section[data-pane$="-translator-item"]',
      ).length;
      if (ours > 0) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (ours === 0) {
      const all = win.document.querySelectorAll("item-pane-custom-section");
      const panes = Array.from(all).map((el) => el.getAttribute("data-pane"));
      diag = JSON.stringify({
        allSections: panes,
        selected: win.ZoteroPane.getSelectedItems().length,
      });
    }
    assert.isAtLeast(ours, 2, `应渲染两个自定义区块; diag=${diag}`);

    // 区块内部骨架：主窗口 library tab 中 item 区块应渲染，reader 区块应隐藏
    const itemSection = win.document.querySelector(
      'item-pane-custom-section[data-pane$="-translator-item"]',
    );
    const readerSection = win.document.querySelector(
      'item-pane-custom-section[data-pane$="-translator-reader"]',
    );
    assert.ok(itemSection, "item 区块元素应存在");

    // 等待 l10n 异步应用完成（回归：Fluent value 形态会清空区块内容，
    // .label 形态应用后 body 必须仍然存在）
    await new Promise((r) => setTimeout(r, 2000));

    const body = itemSection!.querySelector('[data-type="body"]');
    assert.ok(body, "item 区块 body 应存在（l10n 应用后不得清空区块内容）");
    const toolbar = body?.querySelector(".ztr-toolbar");
    const result = body?.querySelector(".ztr-result");
    assert.ok(toolbar, "工具栏应已渲染");
    assert.ok(result, "结果容器应已渲染");
    const selectCount = toolbar!.querySelectorAll("select").length;
    assert.isAtLeast(
      selectCount,
      2,
      `工具栏应有渠道/语言两个下拉; bodyHTML=${body?.innerHTML.slice(0, 400)}`,
    );
    // 区块 label 来自 .label 属性形态（value 形态会写坏内容）
    const cs = itemSection!.querySelector("collapsible-section");
    if (cs) {
      assert.ok(
        cs.getAttribute("label"),
        `区块 label 应来自 .label 属性; label=${cs.getAttribute("label")}`,
      );
    }
    // reader 区块在主窗口应隐藏（仅阅读器 tab 显示），防止双区块重复
    if (readerSection) {
      assert.equal(
        (readerSection as HTMLElement).hidden,
        true,
        "reader 区块在主窗口 library tab 应隐藏",
      );
    }
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

    // UI 验证：关联了当前选中条目时，区块历史容器应自动刷新出记录（subscribe 回调）
    const section2 = win?.document.querySelector(
      'item-pane-custom-section[data-pane$="-translator-item"]',
    );
    if (section2) {
      if (selected) {
        const deadline2 = Date.now() + 5000;
        let historyCount = 0;
        while (Date.now() < deadline2) {
          historyCount = section2.querySelectorAll(".ztr-history-item").length;
          if (historyCount > 0) break;
          await new Promise((r) => setTimeout(r, 300));
        }
        assert.ok(
          historyCount > 0,
          "翻译成功后历史容器应自动出现记录（subscribe 刷新）",
        );
      } else {
        // 无当前选中条目：新语义下历史区显示空态（itemID 为 null 的记录不进入任何条目历史区）
        const empty = section2.querySelector(".ztr-empty");
        assert.ok(empty, "无当前条目时历史区应显示空态");
      }
    }
  });
});
