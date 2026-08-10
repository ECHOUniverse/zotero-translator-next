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
    const prefixed = `${config.addonID}-translator-reader`;
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
    assert.ok(details, "主窗口应有 item-details");

    // 创建条目并选中，触发 item-details 渲染我们的 custom sections
    const item = new Zotero.Item();
    item.itemTypeID = Zotero.ItemTypes.getID("journalArticle");
    item.setField("title", "Pane diagnostic item");
    await item.saveTx();

    (win as any).ZoteroPane.selectItem(item.id);
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

    await item.eraseTx();
  });
});
