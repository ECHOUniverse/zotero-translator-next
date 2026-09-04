import { assert } from "chai";

/**
 * 撑爆回归复现（v0.5.2 用户故障）：item-pane 内容被 .ztr-history-source 的
 * nowrap 长英文标题撑到 ~1000px（Gecko flex min-content 计算中百分比
 * max-width 不生效），导致 item-pane scrollWidth > clientWidth，
 * 右侧内容被裁、整个窗格撑满窗口无法拖回。
 *
 * 红灯条件：item-pane（或其 body）scrollWidth > clientWidth（溢出）。
 */
describe("layout: item-pane no overflow (撑爆回归)", function () {
  this.timeout(120000);

  const TITLE =
    "Characterization of the High-Pressure Structural Transition and Thermodynamic Properties in Sodium Chloride: A Computational Investigation on the Basis of the Density Functional Theory";
  const TRANSLATED_TEXT =
    "利用第一性原理计算，利用伪电位平面波法研究了NaCl的弹性常数、热力学性质以及B1 （岩盐）和B2 （氯化铯）相之间的结构相变。计算是在密度泛函理论的广义梯度近似中进行的，其中Perdew-Burke-Ernzerhof交换相关泛函。\n\n基于三阶Birch-Murnaghan状态方程，确定了NaCl的B1相和B2相之间的过渡压力Pt。计算值一般来说与实验和类似的理论计算非常吻合。从理论计算中推导出NaCl的剪切模量、杨氏模量、刚度模量和泊松比。\n\n根据准谐波德拜模型，我们从平均声速估计了NaCl的德拜温度。此外，还首次研究了NaCl晶体弹性常数的压力导数，即C11/P、C12/P、C44/P、S11/P、S12/P和S44/P。这是对NaCl弹性和热力学性质的定量理论预测，尚待实验证实。";

  function measureOverflow(win: any) {
    const q = (sel: string) =>
      win.document.querySelector(sel) as HTMLElement | null;
    const pane = q("item-pane") as any;
    const section = q(
      'item-pane-custom-section[data-pane$="-translator-item"]',
    );
    const body = section?.querySelector('[data-type="body"]') as HTMLElement;
    const src = section?.querySelector(".ztr-history-source") as HTMLElement;
    const item = section?.querySelector(".ztr-history-item") as HTMLElement;
    const out: Record<string, any> = {};
    if (pane) {
      out.pane = { cw: pane.clientWidth, sw: pane.scrollWidth };
    }
    if (body) out.body = { cw: body.clientWidth, sw: body.scrollWidth };
    if (src) out.src = { cw: src.clientWidth, sw: src.scrollWidth };
    if (item) out.item = { cw: item.clientWidth, sw: item.scrollWidth };
    return out;
  }

  it("item-pane 内容不得横向溢出（红灯=撑爆）", async function () {
    const win = Zotero.getMainWindows()[0] as any;
    if (!win || !win.ZoteroPane) {
      this.skip();
      return;
    }

    // 建条目 + 直接向区块 body 注入与真实渲染同构的历史条目
    const item = new Zotero.Item("journalArticle");
    item.setField("title", TITLE);
    await item.saveTx();
    win.ZoteroPane.selectItem(item.id);

    const deadline = Date.now() + 15000;
    let bodyEl: any = null;
    while (Date.now() < deadline) {
      const section = win.document.querySelector(
        'item-pane-custom-section[data-pane$="-translator-item"]',
      );
      bodyEl = section?.querySelector('[data-type="body"] .ztr-toolbar');
      if (bodyEl) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.ok(bodyEl, "区块工具栏应已渲染");
    const bucket = bodyEl.closest(".ztr-section");

    const doc = win.document;
    const list = doc.createElement("div");
    list.className = "ztr-history-list";
    const row = doc.createElement("div");
    row.className = "ztr-history-item";
    const head = doc.createElement("div");
    head.className = "ztr-history-head";
    head.append(
      Object.assign(doc.createElement("span"), {
        textContent: "2026-08-17 15:57",
        className: "ztr-muted",
      }),
    );
    head.append(
      Object.assign(doc.createElement("span"), {
        textContent: "MyMemory",
        className: "ztr-badge ztr-badge-channel",
      }),
    );
    row.append(head);
    const src = doc.createElement("div");
    src.className = "ztr-history-source";
    src.textContent = TITLE;
    src.title = TITLE;
    row.append(src);
    const preview = doc.createElement("div");
    preview.className = "ztr-history-preview";
    preview.textContent = TRANSLATED_TEXT;
    row.append(preview);
    list.append(row);
    bucket.append(list);
    await new Promise((r) => setTimeout(r, 500));

    const m = measureOverflow(win);
    const json = JSON.stringify(m);
    // 用户症状：item-pane 内容被 nowrap 长标题(≥983px)撑到可视区之外(scrollWidth≫clientWidth)。
    // 严格无撑爆（Gecko 舍入不会在这么宽的度量上产生 >1px 误差）。
    assert.ok(
      !(m.pane && m.pane.sw - m.pane.cw > 1),
      "item-pane 不得横向溢出（右侧内容被裁、窗格被撑宽）: " + json,
    );
    // body/item：容差 4px，吸收 item 1px 边框×2 在窄宽度下的 Gecko 取整残差；
    // 仍能捕获真正的百像素级内容撑爆。
    assert.ok(
      !(m.body && m.body.sw - m.body.cw > 4),
      "区块 body 不得横向溢出: " + json,
    );
  });
});
