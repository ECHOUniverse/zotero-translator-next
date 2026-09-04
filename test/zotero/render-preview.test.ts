import { assert } from "chai";
import { renderContent } from "../src/utils/renderContent";

/**
 * 布局回归：在真实区块 body 中构造与 renderHistoryList 完全同构的历史条目 DOM
 * （同 CSS/同 Zotero flex 级联），在窄车道 + 折叠→展开后断言长段落全文
 * 无「布局空洞」、中段有矩形。数据 = 真实故障记录（item 4921 译文，348 字，三段）。
 * 与 repro-overflow.test.ts 互补：一个管「不撑爆父容器」，一个管「展开后全文可读」。
 */
describe("layout: history preview full-wrap (direct DOM)", function () {
  this.timeout(120000);

  const TRANSLATED_TEXT =
    "利用第一性原理计算，利用伪电位平面波法研究了NaCl的弹性常数、热力学性质以及B1 （岩盐）和B2 （氯化铯）相之间的结构相变。计算是在密度泛函理论的广义梯度近似中进行的，其中Perdew-Burke-Ernzerhof交换相关泛函。\n\n基于三阶Birch-Murnaghan状态方程，确定了NaCl的B1相和B2相之间的过渡压力Pt。计算值一般来说与实验和类似的理论计算非常吻合。从理论计算中推导出NaCl的剪切模量、杨氏模量、刚度模量和泊松比。\n\n根据准谐波德拜模型，我们从平均声速估计了NaCl的德拜温度。此外，还首次研究了NaCl晶体弹性常数的压力导数，即C11/P、C12/P、C44/P、S11/P、S12/P和S44/P。这是对NaCl弹性和热力学性质的定量理论预测，尚待实验证实。";
  const TITLE =
    "Characterization of the High-Pressure Structural Transition and Thermodynamic Properties in Sodium Chloride: A Computational Investigation on the Basis of the Density Functional Theory";

  async function buildPreview(win: any, bucket: HTMLElement) {
    const doc = win.document;
    const list = doc.createElement("div");
    list.className = "ztr-history-list";
    const item = doc.createElement("div");
    item.className = "ztr-history-item";
    const head = doc.createElement("div");
    head.className = "ztr-history-head";
    const t = doc.createElement("span");
    t.className = "ztr-muted";
    t.textContent = "2026-08-17 15:57";
    head.append(t);
    const eng = doc.createElement("span");
    eng.className = "ztr-badge ztr-badge-channel";
    eng.textContent = "MyMemory";
    head.append(eng);
    item.append(head);
    const src = doc.createElement("div");
    src.className = "ztr-history-source";
    src.textContent = TITLE;
    src.title = TITLE;
    item.append(src);
    const preview = doc.createElement("div");
    preview.className = "ztr-history-preview";
    renderContent(preview, TRANSLATED_TEXT, { mode: "markdown" });
    item.append(preview);
    list.append(item);
    bucket.append(list);
    return { preview, item };
  }

  function textNodeAtOffset(
    root: Node,
    offset: number,
  ): { node: Text; offset: number } | null {
    let current = 0;
    const walker = root.ownerDocument!.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
    );
    let node = walker.nextNode() as Text | null;
    while (node) {
      const len = node.length;
      if (offset < current + len) {
        return { node, offset: offset - current };
      }
      current += len;
      node = walker.nextNode() as Text | null;
    }
    return null;
  }

  /** 单文本节点内取样，避免跨 <p> 等块级边界时 Range 无矩形（Markdown 多段 DOM） */
  function rectsPainted(node: Text, start: number, end: number, doc: Document) {
    const r = doc.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    return Array.from(r.getClientRects() as DOMRectList).some(
      (x) => x.width > 0 && x.height > 0,
    );
  }

  function measure(preview: any) {
    const cs = getComputedStyle(preview);
    const doc = preview.ownerDocument as Document;
    const holes: string[] = [];
    const walker = doc.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
    let globalOffset = 0;
    let textNode = walker.nextNode() as Text | null;
    while (textNode) {
      const len = textNode.length;
      for (let i = 0; i < len; i += 12) {
        const end = Math.min(i + 12, len);
        if (!rectsPainted(textNode, i, end, doc)) {
          holes.push(
            `${globalOffset + i}..${globalOffset + end}「${textNode.data.slice(i, i + 8)}」`,
          );
        }
      }
      globalOffset += len;
      textNode = walker.nextNode() as Text | null;
    }
    // 几个关键锚点
    const anchors = [
      "计算值一般来说与实验和类似的理论计算非常吻合",
      "剪切模量、杨氏模量、刚度模量和泊松比",
      "NaCl晶体弹性常数的压力导数",
      "其中Perdew-Burke-Ernzerhof交换相关泛函",
      "性和热力学性质的定量理论预测",
    ];
    const anchorInfo: string[] = [];
    for (const a of anchors) {
      const i = preview.textContent.indexOf(a);
      if (i < 0) continue;
      const start = textNodeAtOffset(preview, i);
      const end = textNodeAtOffset(preview, i + a.length);
      if (!start || !end) {
        anchorInfo.push(`${a.slice(0, 10)}:MISSING(no-node)`);
        continue;
      }
      const r = preview.ownerDocument.createRange();
      r.setStart(start.node, start.offset);
      r.setEnd(end.node, end.offset);
      const rects = Array.from(r.getClientRects() as any);
      const painted = rects.some((x: any) => x.width > 0 && x.height > 0);
      anchorInfo.push(
        `${a.slice(0, 10)}:${painted ? "OK" : "MISSING"}(rects=${rects.length})`,
      );
    }
    return {
      display: cs.display,
      whiteSpace: cs.whiteSpace,
      wordBreak: cs.wordBreak,
      overflowY: cs.overflowY,
      overflowX: cs.overflowX,
      lineClamp: cs.webkitLineClamp,
      clientWidth: preview.clientWidth,
      scrollWidth: preview.scrollWidth,
      clientHeight: preview.clientHeight,
      scrollHeight: preview.scrollHeight,
      holes,
      anchors: anchorInfo,
    };
  }

  it("窄车道折叠→展开后长段落全文完整渲染（无布局空洞）", async function () {
    const win = Zotero.getMainWindows()[0] as any;
    if (!win || !win.ZoteroPane) {
      this.skip();
      return;
    }

    // 1. 选中条目 → 区块挂载（复用真实渲染链）
    const item = new Zotero.Item("journalArticle");
    item.setField("title", TITLE);
    await item.saveTx();
    win.ZoteroPane.selectItem(item.id);

    const deadline = Date.now() + 15000;
    let body: any = null;
    while (Date.now() < deadline) {
      const section = win.document.querySelector(
        'item-pane-custom-section[data-pane$="-translator-item"]',
      );
      body = section?.querySelector('[data-type="body"] .ztr-toolbar');
      if (body) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.ok(body, "区块工具栏应已渲染");

    const bucket = body.closest(".ztr-section");
    const { preview, item: histItem } = await buildPreview(win, bucket);

    // A. 关键序列复现：把区块正文压到真实窄车道（356px，贴近真实窄窗格/item-pane min）。
    //    item-pane 在 harness 中 width 被 flex 撑开，window.resizeTo 也压不窄，
    //    故直接用 section/body 内联宽度模拟窄车道。
    const sectionEl: any = bucket.closest("item-pane-custom-section");
    const bodyEl: any = sectionEl?.querySelector('[data-type="body"]');
    const origBodyStyle = bodyEl?.getAttribute("style") ?? "";
    if (bodyEl) bodyEl.style.width = "356px";
    if (sectionEl) sectionEl.style.width = "356px";
    await new Promise((r) => setTimeout(r, 400));

    // 窄车道先折叠再展开：触发 clamp 切换 + 线位重排（-webkit-box 空洞在此条件出现）
    histItem.classList.remove("expanded");
    await new Promise((r) => setTimeout(r, 300));
    histItem.classList.add("expanded");
    await new Promise((r) => setTimeout(r, 400));
    const afterExpand = measure(preview);

    const paneW = {
      paneClientW:
        (win.document.querySelector("item-pane") as any)?.clientWidth ?? -1,
      bodyClientW: bucket.clientWidth,
      winW: win.document.documentElement.clientWidth,
      metaZoom: win.devicePixelRatio,
    };
    // 恢复
    if (bodyEl) bodyEl.setAttribute("style", origBodyStyle);
    if (sectionEl) sectionEl.style.width = "";

    const fail =
      "afterExpand=" +
      JSON.stringify(afterExpand) +
      "\nsizes=" +
      JSON.stringify(paneW) +
      "\ntextLen=" +
      preview.textContent.length;

    // 主断言：展开态（窄车道）下全文不能有「空洞」——即每个自然段中间片段必须都有布局矩形。
    // 若 contain:inline-size 隔离被移除，窄车道下文本会被裁/产生空洞，此处即红灯。
    assert.ok(
      afterExpand.holes.length === 0,
      "展开态窄车道全文不得有布局空洞: " + fail,
    );
    // 关键中段（P2 第 2 句）必须已绘制
    assert.ok(
      afterExpand.anchors.some((a: string) =>
        a.startsWith("计算值一般来说与实验:OK"),
      ),
      "P2 中段应已绘制: " + fail,
    );
  });
});
