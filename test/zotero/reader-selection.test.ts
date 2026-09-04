import { assert } from "chai";
import { config } from "../package.json";

/**
 * 阅读器翻译链路回归测试：
 * 阅读器打开 → 侧栏区块渲染 → 翻译入口（快捷键/弹层按钮共用 translateSelection）
 * → 任务成功 → 侧栏卡片显示译文 → 历史按父条目落库。
 *
 * 回归根因（v0.4.0）：ReaderModule 直接用 reader.itemID（附件 id）作为任务
 * itemID，而阅读器 tab 中区块 ctx.itemID 为父条目 id（Zotero contextPane
 * 会把附件提升为 parentItem），条目隔离逻辑（D10）将结果卡片替换为空态，
 * 表现为"点击翻译无动作"。修复：logicalItemID 归一化为父条目 id。
 *
 * 注意：任务 itemID 与区块 ctx.itemID 必须一致（父条目），否则隔离逻辑
 * 会显示空态；翻译落库的 itemID 也必须是父条目，历史按文章隔离才能命中。
 */
describe("reader selection translate", function () {
  this.timeout(180000);

  it("阅读器翻译：任务关联父条目，侧栏卡片显示译文，历史按文章落库", async function () {
    const win = Zotero.getMainWindows()[0] as any;
    if (!win) {
      this.skip();
      return;
    }

    // 1. 创建 PDF 附件（真实 PDF，可被 pdf.js 渲染出文本层）
    const pdfBytes = Uint8Array.from(atob(PDF_BASE64), (c) => c.charCodeAt(0));
    const pdfPath = PathUtils.join(
      PathUtils.tempDir,
      `ztr-selection-${Date.now()}.pdf`,
    );
    await IOUtils.write(pdfPath, pdfBytes);

    const parent = new Zotero.Item("journalArticle");
    parent.setField("title", `Selection Test ${Date.now()}`);
    await parent.saveTx();
    const attachment = await Zotero.Attachments.importFromFile({
      file: pdfPath,
      parentItemID: parent.id,
    });
    assert.ok(attachment?.id, "附件创建成功");

    // 2. 打开阅读器 tab
    await (Zotero.Reader as any).open(attachment.id);

    // 3. 等待阅读器 iframe + 文本层渲染完成（PDF 视图在嵌套 iframe 中）
    let reader: any = null;
    let pdfDoc: Document | null = null;
    let lastDiag = "";
    const deadline = Date.now() + 60000;
    const collectDocs = (root: Document, depth = 0): Document[] => {
      if (depth > 3) return [];
      const out = [root];
      for (const f of Array.from(root.querySelectorAll("iframe"))) {
        const fd = (f as HTMLIFrameElement).contentDocument;
        if (fd) out.push(...collectDocs(fd, depth + 1));
      }
      return out;
    };
    while (Date.now() < deadline) {
      reader = ((Zotero.Reader as any)._readers ?? []).find(
        (r: any) => r.itemID === attachment.id,
      );
      if (reader) {
        try {
          const rootDoc = reader._iframeWindow?.document;
          if (rootDoc) {
            const docs = collectDocs(rootDoc);
            pdfDoc =
              docs.find((d) =>
                d.querySelector(
                  ".textLayer span, .text-layer span, [data-section-index] span",
                ),
              ) ?? null;
            if (pdfDoc) break;
            // 诊断 + 推动文本层渲染（测试环境 pdf.js 文本层偶发不自动挂载）
            try {
              const viewerFrame = Array.from(
                rootDoc.querySelectorAll("iframe"),
              )[0] as HTMLIFrameElement | null;
              const w = viewerFrame
                ? (Components as any).utils.waiveXrays(
                    viewerFrame.contentWindow,
                  )
                : null;
              if (w) {
                const state = w.eval(`JSON.stringify((() => {
                  const app = PDFViewerApplication;
                  const pv = app?.pdfViewer?.getPageView?.(0);
                  const tl = pv?.textLayer;
                  if (pv && tl && !tl.div.isConnected) {
                    try { pv.render({ viewport: pv.viewport }); } catch {
        // 忽略（测试环境不稳定的 UI 辅助操作）
      }
                  }
                  return {
                    hasApp: !!app,
                    hasPv: !!pv,
                    hasTl: !!tl,
                    tlConnected: tl ? tl.div.isConnected : null,
                  };
                })())`);
                lastDiag = `viewer=${state}`;
              }
            } catch {
              // 忽略（测试环境不稳定的 UI 辅助操作）
            }
          } else {
            lastDiag = "no iframeWindow yet";
          }
        } catch (e) {
          lastDiag = `access err: ${(e as Error).message}`;
        }
      } else {
        lastDiag = "no reader instance";
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(
      reader && pdfDoc,
      `阅读器 iframe 与文本层应在 60s 内就绪; reader=${!!reader} doc=${!!pdfDoc}; ${lastDiag}`,
    );

    // 4. 打开侧栏并强制渲染阅读器 item-details（测试环境侧栏默认折叠，
    //    collapsed 时 itemDetails.render() 会跳过区块渲染）
    try {
      const toggle =
        reader._iframeWindow.document.getElementById("sidebarToggle");
      toggle?.click();
    } catch {
      // 忽略（测试环境不稳定的 UI 辅助操作）
    }
    try {
      const itemDetails = win.document.querySelector(
        `item-details[data-tab-id="${reader.tabID}"]`,
      );
      if (itemDetails?.render) {
        try {
          (itemDetails as any)._collapsed = false;
        } catch {
          // 忽略（测试环境不稳定的 UI 辅助操作）
        }
        try {
          const parentPane = itemDetails.closest("context-pane, item-pane");
          if (parentPane) parentPane.collapsed = false;
        } catch {
          // 忽略（测试环境不稳定的 UI 辅助操作）
        }
        await itemDetails.render();
      }
    } catch {
      // 忽略（测试环境不稳定的 UI 辅助操作）
    }

    // 5. 等待区块渲染完成（onRender → 工具栏出现）
    const deadlineSidebar = Date.now() + 15000;
    let sectionRendered = false;
    while (Date.now() < deadlineSidebar) {
      const sec = readerSection(win);
      if (sec?.querySelector(".ztr-toolbar select")) {
        sectionRendered = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.ok(sectionRendered, "阅读器侧栏区块应渲染（工具栏出现）");

    // 6. 模拟弹层按钮/快捷键入口：设置最近划选文本，调用 translateSelection()。
    //    该入口内部会把附件 itemID 归一化为父条目 id（logicalItemID）。
    const instance: any = (Zotero as any)[config.addonInstance];
    // stub 渠道：覆盖默认 mymemory，避免 CI/本地打真网络（429 误报）。
    // 必须走插件实例上的同一份 registry（esbuild 打包后与 test import 不是同一单例）。
    const registry = instance.data.channelRegistry;
    registry.register({
      id: "mymemory",
      name: "Stub",
      kind: "rule",
      supportsStreaming: false,
      isConfigured: () => true,
      async translate(
        task: { sourceText: string },
        onChunk?: (chunk: {
          index: number;
          total: number;
          text: string;
        }) => void,
      ) {
        const text = `[stub] ${task.sourceText}`;
        onChunk?.({ index: 0, total: 1, text });
        return { text };
      },
    });

    try {
      // 随机文本避免跨运行缓存命中（缓存命中不落库，且任务瞬态结束）
      const sourceText =
        "Hello world, this is a translation pipeline test. " + Date.now();
      const rm: any = instance.data.reader;
      rm.lastSelectionText = sourceText;
      const seenTasks: any[] = [];
      const unsub = instance.data.translate.subscribe((t: any) =>
        seenTasks.push(t),
      );
      await rm.translateSelection();
      unsub();

      // 7. 等待任务成功，侧栏结果卡片出现译文
      const deadline3 = Date.now() + 45000;
      let task: any = null;
      let cardText = "";
      while (Date.now() < deadline3) {
        task = seenTasks.find((t) => t.status !== "cancelled") ?? null;
        const textEl = readerSection(win)?.querySelector(
          ".ztr-result .ztr-result-text",
        );
        if (textEl) cardText = (textEl as HTMLElement).textContent ?? "";
        if (task && ["success", "fail"].includes(task.status)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      assert.ok(task, "应创建翻译任务");
      assert.equal(
        task.status,
        "success",
        `任务应成功; error=${task.error ?? ""} source="${task.sourceText}"`,
      );
      assert.ok(task.translatedText.trim().length > 0, "译文不应为空");
      assert.ok(
        cardText.length > 0 && !cardText.includes("在 PDF 中划选"),
        `侧栏结果卡片应显示译文而非空态; cardText=${JSON.stringify(
          cardText.slice(0, 60),
        )}`,
      );

      // 8. 回归断言：任务 itemID 必须是父条目（与区块 ctx.itemID 一致）
      const parentID = (Zotero.Items.get(attachment.id) as any)?.parentID;
      assert.ok(
        parentID != null,
        "附件应有父条目（测试 PDF 挂载于 parent 下）",
      );
      assert.equal(
        task.itemID,
        parentID,
        `任务应关联父条目而非附件; task.itemID=${task.itemID} parentID=${parentID}`,
      );

      // 9. 历史落库验证：按父条目查询应命中（阅读器翻译关联文章）
      const { getHistoryByItem } = await import("../src/modules/history");
      const parentHistory = await getHistoryByItem(parentID, 10);
      assert.ok(
        parentHistory.some((h) => h.sourceText === sourceText),
        "按父条目查询历史应命中",
      );
    } finally {
      registry.invalidate("mymemory");
      try {
        win.Zotero_Tabs?.closeTab?.(reader.tabID);
      } catch {
        // 忽略（测试环境不稳定的 UI 辅助操作）
      }
    }
  });
});

/** 当前可见的阅读器区块（阅读器 tab 的 context pane 中 hidden=false 的那个） */
function readerSection(win: any): Element | null {
  return (
    Array.from(win.document.querySelectorAll("item-pane-custom-section")).find(
      (s: any) =>
        !(s as HTMLElement).hidden &&
        String(s.getAttribute("data-pane") ?? "").includes("translator-reader"),
    ) ?? null
  );
}

/** 测试用 PDF（reportlab 生成，含 3 行英文文本），base64 内嵌避免 node 依赖 */
const PDF_BASE64 =
  "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDgxMzE3MDcwMyswOCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDgxMzE3MDcwMyswOCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMjUwCj4+CnN0cmVhbQpHYXMzLF8vQCtEJGpQV086W29PW0tOTmo8aixDP1ojQiZUKzZMJUg5KUwkPStmMCk4R20nJFJjcm9KY15sKkVbPGEnPylsSjtxT2tdN0YsIzxcVl9tJnBCMGw0OEomV0lZbFpGOicnKldxRVo4MUhLZGFWNmBPOk9qLGM7PDI3VVI7ZDtobTIsOWAySHElTioscEEnX05nZEc/WzUwclJrZlFZYjY8OlolL1xTMmZMNzojbVkjanU9ai4+UHNyQzQ0IUNTZ2MiaGZWPCFNVUcwSlY8N1s7TSQ7LzgsSkEtMTUxcSVgWyNMbE1oLU44RkRhVFxyLz5KQ34+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDA5MiAwMDAwMCBuIAowMDAwMDAwMTk5IDAwMDAwIG4gCjAwMDAwMDA0MDIgMDAwMDAgbiAKMDAwMDAwMDQ3MCAwMDAwMCBuIAowMDAwMDAwNzMxIDAwMDAwIG4gCjAwMDAwMDA3OTAgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8N2E3MjA3MzdiMzU5YzQ1NWNiMWJlZTgyY2Y2ZjBlMzM+PDdhNzIwNzM3YjM1OWM0NTVjYjFiZWU4MmNmNmYwZTMzPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA1IDAgUgovUm9vdCA0IDAgUgovU2l6ZSA4Cj4+CnN0YXJ0eHJlZgoxMTMwCiUlRU9GCg==";
