import { assert } from "chai";
import { config } from "../package.json";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

function log(msg: string, obj?: unknown): void {
  console.log(
    `[ZTR-PANE-DIAG] ${msg}`,
    obj === undefined ? "" : JSON.stringify(obj),
  );
}

/**
 * 诊断：在真实 Zotero 9 里复现 item-pane-custom-section 渲染流程，
 * 检查 collapsible-section 的 open 状态 / --open-height / body 可见性。
 */
describe("item-pane-custom-section visibility", function () {
  it("sections are registered in ItemPaneManager", function () {
    const data = (Zotero.ItemPaneManager as any).customSectionData;
    const ids = data.options.map((o: any) => o.paneID);
    log("registered panes", ids);
    assert.include(ids, "translator-reader");
    assert.include(ids, "translator-item");
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

    log("default: open attr", section.hasAttribute("open"));
    log(
      "default: --open-height",
      section.style.getPropertyValue("--open-height"),
    );
    log("default: body computed", {
      maxHeight: cs.maxHeight,
      visibility: cs.visibility,
      display: cs.display,
      height: cs.height,
      overflowY: cs.overflowY,
    });
    log("default: body children", body.children.length);
    log("default: probe text", body.textContent?.slice(0, 20));

    assert.ok(section.hasAttribute("open"), "section should be open");
    assert.notEqual(cs.visibility, "hidden", "body should be visible");
    assert.notEqual(cs.maxHeight, "0px", "body max-height should not be 0");
    elem.remove();
  });

  it("body stays visible after manual skeleton mount (our onInit/onRender path)", function () {
    const doc = Zotero.getMainWindow().document;
    const captured: any = {};
    const elem = doc.createXULElement("item-pane-custom-section") as any;
    elem.paneID = "diag-pane-mount";
    elem.bodyXHTML = "";
    elem.registerHook({
      type: "init",
      callback: (props: any) => {
        captured.initBody = props.body;
        const root = doc.createElementNS(XHTML_NS, "div");
        root.className = "diag-root";
        root.textContent = "mounted-in-init";
        props.body.append(root);
      },
    });
    elem.registerHook({
      type: "render",
      callback: (props: any) => {
        captured.renderBody = props.body;
        if (props.body.children.length === 0) {
          const root = doc.createElementNS(XHTML_NS, "div");
          root.className = "diag-root";
          root.textContent = "mounted-in-render";
          props.body.append(root);
        }
      },
    });
    doc.documentElement.appendChild(elem);

    const section = elem.querySelector("collapsible-section") as HTMLElement;
    const body = (captured.renderBody || captured.initBody) as HTMLElement;
    const cs = getComputedStyle(body);

    log("mount: init body === render body", captured.initBody === captured.renderBody);
    log("mount: body children", body.children.length);
    log("mount: root class", body.querySelector(".diag-root")?.className);
    log("mount: open attr", section.hasAttribute("open"));
    log(
      "mount: --open-height",
      section.style.getPropertyValue("--open-height"),
    );
    log("mount: body computed", {
      maxHeight: cs.maxHeight,
      visibility: cs.visibility,
      display: cs.display,
      height: cs.height,
    });
    log(
      "mount: root computed",
      (() => {
        const root = body.querySelector(".diag-root");
        if (!root) return null;
        const rcs = getComputedStyle(root);
        return {
          display: rcs.display,
          visibility: rcs.visibility,
          height: rcs.height,
        };
      })(),
    );

    assert.ok(body.querySelector(".diag-root"), "root should be mounted");
    assert.notEqual(cs.visibility, "hidden");
    assert.notEqual(cs.maxHeight, "0px");
    elem.remove();
  });

  it("plugin section exists in real item-details if main window rendered it", function () {
    const win = Zotero.getMainWindow();
    const details = win.document.querySelector("item-details");
    if (!details) {
      log("real: no item-details in main window");
      return;
    }
    const pane = details.querySelector(
      'item-pane-custom-section[data-pane="translator-reader"]',
    ) as HTMLElement | null;
    if (!pane) {
      log("real: translator-reader pane not rendered yet");
      return;
    }
    const section = pane.querySelector("collapsible-section") as HTMLElement;
    const body = section.querySelector('[data-type="body"]') as HTMLElement;
    const cs = getComputedStyle(body);
    log("real: open attr", section.hasAttribute("open"));
    log(
      "real: --open-height",
      section.style.getPropertyValue("--open-height"),
    );
    log("real: body children", body.children.length);
    log("real: body computed", {
      maxHeight: cs.maxHeight,
      visibility: cs.visibility,
      display: cs.display,
    });
    log("real: body innerHTML head", body.innerHTML.slice(0, 300));
  });
});
