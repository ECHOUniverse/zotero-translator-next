import { assert } from "chai";
import { config } from "../package.json";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * 诊断：在真实 Zotero 9 里复现 item-pane-custom-section 渲染流程，
 * 检查 collapsible-section 的 open 状态 / --open-height / body 可见性。
 */
describe("item-pane-custom-section visibility", function () {
  it("sections are registered with pluginID-prefixed paneID", function () {
    const data = (Zotero.ItemPaneManager as any).customSectionData;
    const ids = data.options.map((o: any) => o.paneID);
    // Zotero 9 会对 paneID 中的特殊字符做转义（@ → \\@, . → \\.）
    const prefixed = `${config.addonID.replace(/[.@]/g, "\\$&")}-translator-reader`;
    assert.include(
      ids,
      prefixed,
      `paneID 应被 Zotero 加 pluginID 前缀（实际注册：${ids.join(", ")}）`,
    );
  });

  it("default section body is visible when open", function () {
    const doc = Zotero.getMainWindow().document;
    const elem = doc.createXULElement("item-pane-custom-section") as any;
    elem.paneID = "diag-pane-default";
    elem.bodyXHTML = "<html:div class='diag-probe'>probe-content</html:div>";
    doc.documentElement.appendChild(elem);

    const section = elem.querySelector("collapsible-section") as HTMLElement;
    const body = section.querySelector('[data-type="body"]') as HTMLElement;
    const cs = getComputedStyle(body);

    assert.ok(
      section.hasAttribute("open"),
      `默认应 open（open=${section.hasAttribute("open")}）`,
    );
    assert.notEqual(
      cs.visibility,
      "hidden",
      `body 应可见（visibility=${cs.visibility} maxHeight=${cs.maxHeight} openHeight=${section.style.getPropertyValue("--open-height")}）`,
    );
    assert.equal(body.children.length, 1, "bodyXHTML 内容应注入 body");
    elem.remove();
  });

  it("collapsed section (pref=false) is invisible and recovered by forcing open", function () {
    const paneID = "diag-pane-collapsed";
    Zotero.Prefs.set(`panes.${paneID}.open`, false);
    const doc = Zotero.getMainWindow().document;
    const elem = doc.createXULElement("item-pane-custom-section") as any;
    elem.paneID = paneID;
    elem.bodyXHTML = "<html:div>collapsed-content</html:div>";
    doc.documentElement.appendChild(elem);

    const section = elem.querySelector("collapsible-section") as HTMLElement;
    const body = section.querySelector('[data-type="body"]') as HTMLElement;
    const csHidden = getComputedStyle(body);

    // 1) pref=false → 默认折叠 → 不可见
    assert.equal(section.hasAttribute("open"), false, "pref=false 时应折叠");
    assert.equal(
      csHidden.visibility,
      "hidden",
      "折叠时 body 应 visibility:hidden（这正是'标题可见内容不可见'的机制）",
    );

    // 2) 模拟我们的 ensureSectionOpen：强制展开
    (section as any).open = true;
    const csOpen = getComputedStyle(body);
    assert.ok(
      section.hasAttribute("open") && csOpen.visibility !== "hidden",
      `强制 open 后应可见（open=${section.hasAttribute("open")} visibility=${csOpen.visibility}）`,
    );

    Zotero.Prefs.clear(`panes.${paneID}.open`);
    elem.remove();
  });

  it("real item-details renders plugin pane visible after selecting an item", async function () {
    this.timeout(60000);
    const win = Zotero.getMainWindow();
    const details = win.document.querySelector("item-details");
    if (!details) {
      // headless 测试环境主窗口可能未完整加载 item-details，跳过
      this.skip();
      return;
    }

    // 创建条目并选中，触发 item-details 渲染我们的 custom sections
    let item: any = null;
    try {
      item = new Zotero.Item();
      item.itemTypeID = Zotero.ItemTypes.getID("journalArticle");
      item.setField("title", "Pane diagnostic item");
      await item.saveTx();
      (win as any).ZoteroPane?.selectItem?.(item.id);
    } catch (e) {
      // headless 测试环境无可用 library 时跳过（核心机制已由前面用例覆盖）
      this.skip();
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));

    const prefixed = `${config.addonID}-translator-reader`;
    const pane = details!.querySelector(
      `item-pane-custom-section[data-pane="${prefixed}"]`,
    ) as HTMLElement | null;
    assert.ok(
      pane,
      `item-details 中应渲染 translator-reader 区块（paneID=${prefixed}）`,
    );

    const section = pane!.querySelector("collapsible-section") as HTMLElement;
    const body = section.querySelector('[data-type="body"]') as HTMLElement;
    const cs = getComputedStyle(body);

    assert.ok(
      section.hasAttribute("open"),
      `真实区块应 open（open=${section.hasAttribute("open")}）`,
    );
    assert.notEqual(
      cs.visibility,
      "hidden",
      `真实区块 body 应可见（visibility=${cs.visibility} maxHeight=${cs.maxHeight} display=${cs.display} openHeight=${section.style.getPropertyValue("--open-height")}）`,
    );
    assert.ok(
      body.children.length > 0,
      `真实区块 body 应有内容（children=${body.children.length} html=${body.innerHTML.slice(0, 200)}）`,
    );

    if (item) await item.eraseTx();
  });

  describe("可见性兜底（v0.1.4：不依赖 Zotero open 状态）", function () {
    it("forceBodyVisible 内联样式可覆盖折叠态隐藏", async function () {
      const { forceBodyVisible, forceSectionOpenHeight, ensureSectionOpen } =
        await import("../src/modules/sectionUI.js");
      const win = Zotero.getMainWindow();
      const doc = win.document;
      const section = doc.createElement("collapsible-section");
      section.setAttribute("data-pane", "visibility-test-pane");
      const body = doc.createElement("html:div") as HTMLElement;
      body.setAttribute("data-type", "body");
      const content = doc.createElement("html:div") as HTMLElement;
      content.textContent = "visible-content";
      body.append(content);
      section.append(body);
      doc.documentElement.append(section);

      // 模拟折叠态（无 open 属性）
      section.removeAttribute("open");
      section.setAttribute("empty", ""); // 最坏情况：empty=true 时 setter 失效

      forceSectionOpenHeight(body);
      ensureSectionOpen(body);
      forceBodyVisible(body);

      const cs = getComputedStyle(body);
      assert.equal(
        body.style.getPropertyValue("max-height"),
        "none",
        "body 内联 max-height 应为 none",
      );
      assert.equal(body.style.getPropertyValue("visibility"), "visible");
      assert.equal(body.style.getPropertyValue("opacity"), "1");
      assert.equal(
        section.style.getPropertyValue("--open-height"),
        "auto",
        "section --open-height 应为 auto",
      );
      assert.ok(
        section.hasAttribute("open"),
        "即使 empty=true，open 属性也应被直接设置",
      );

      section.remove();
    });
  });

  describe("v0.1.5 bodyXHTML 静态骨架 + 兜底挂载", function () {
    it("sectionBodyXHTML 生成含骨架容器的 XHTML 片段", async function () {
      const { sectionBodyXHTML } = await import("../src/modules/sectionUI.js");
      const html = sectionBodyXHTML("test-section-id");
      assert.include(html, 'id="test-section-id"');
      assert.include(html, "ztr-toolbar");
      assert.include(html, "ztr-result-card");
      assert.include(html, "ztr-summary-card");
      assert.include(html, "ztr-history-card");
      assert.include(html, "html:div");
    });

    it("adoptSectionSkeleton 从既有骨架容器中采用（缺则创建）", async function () {
      const { adoptSectionSkeleton } =
        await import("../src/modules/sectionUI.js");
      const win = Zotero.getMainWindow();
      const doc = win.document;
      const root = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      ) as HTMLElement;
      root.className = "ztr-section";
      const toolbar = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      ) as HTMLElement;
      toolbar.className = "ztr-toolbar";
      const result = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      ) as HTMLElement;
      result.className = "ztr-card ztr-result-card";
      root.append(toolbar, result);
      doc.documentElement.append(root);

      const sk = adoptSectionSkeleton(doc, root);
      assert.equal(sk.toolbar, toolbar, "复用注入的 toolbar");
      assert.equal(sk.resultCard, result, "复用注入的 resultCard");
      assert.ok(sk.summaryCard, "缺失的 summaryCard 被创建");
      assert.ok(sk.historyCard, "缺失的 historyCard 被创建");
      assert.equal(root.children.length, 4, "骨架容器齐全");
      root.remove();
    });
  });
});
