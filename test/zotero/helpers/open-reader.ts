/**
 * 打开阅读器 tab 并等到 translator-reader 区块可见。
 * 布局回归与划选测试共用同一份内嵌 PDF，避免各用例复制附件流程。
 */

/** 当前可见的阅读器区块（阅读器 tab 的 context pane 中 hidden=false 的那个） */
export function visibleReaderSection(win: any): HTMLElement | null {
  return (
    (Array.from(win.document.querySelectorAll("item-pane-custom-section")).find(
      (s: any) =>
        !(s as HTMLElement).hidden &&
        String(s.getAttribute("data-pane") ?? "").includes("translator-reader"),
    ) as HTMLElement | undefined) ?? null
  );
}

export async function openTestReader(
  win: any,
  title = `ZTR Reader ${Date.now()}`,
): Promise<{
  reader: any;
  parent: any;
  attachment: any;
  section: HTMLElement;
}> {
  const pdfBytes = Uint8Array.from(atob(TEST_PDF_BASE64), (c) =>
    c.charCodeAt(0),
  );
  const pdfPath = PathUtils.join(
    PathUtils.tempDir,
    `ztr-reader-${Date.now()}.pdf`,
  );
  await IOUtils.write(pdfPath, pdfBytes);

  const parent = new Zotero.Item("journalArticle");
  parent.setField("title", title);
  await parent.saveTx();
  const attachment = await Zotero.Attachments.importFromFile({
    file: pdfPath,
    parentItemID: parent.id,
  });
  if (!attachment?.id) {
    throw new Error("附件创建失败");
  }

  await (Zotero.Reader as any).open(attachment.id);

  const deadline = Date.now() + 30000;
  let reader: any = null;
  while (Date.now() < deadline) {
    reader = ((Zotero.Reader as any)._readers ?? []).find(
      (r: any) => r.itemID === attachment.id,
    );
    if (reader?._iframeWindow) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!reader) {
    throw new Error("阅读器实例未就绪");
  }

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
        // 忽略
      }
      try {
        const parentPane = itemDetails.closest("context-pane, item-pane");
        if (parentPane) parentPane.collapsed = false;
      } catch {
        // 忽略
      }
      await itemDetails.render();
    }
  } catch {
    // 忽略
  }

  const sidebarDeadline = Date.now() + 15000;
  let section: HTMLElement | null = null;
  while (Date.now() < sidebarDeadline) {
    const sec = visibleReaderSection(win);
    if (sec?.querySelector(".ztr-toolbar")) {
      section = sec;
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!section) {
    throw new Error("阅读器侧栏区块未渲染");
  }

  return { reader, parent, attachment, section };
}

export function closeReaderTab(win: any, reader: any): void {
  try {
    win.Zotero_Tabs?.closeTab?.(reader.tabID);
  } catch {
    // 忽略（测试环境不稳定的 UI 辅助操作）
  }
}

/** 测试用 PDF（reportlab 生成，含 3 行英文文本），base64 内嵌避免 node 依赖 */
export const TEST_PDF_BASE64 =
  "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDgxMzE3MDcwMyswOCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDgxMzE3MDcwMyswOCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMjUwCj4+CnN0cmVhbQpHYXMzLF8vQCtEJGpQV086W29PW0tOTmo8aixDP1ojQiZUKzZMJUg5KUwkPStmMCk4R20nJFJjcm9KY15sKkVbPGEnPylsSjtxT2tdN0YsIzxcVl9tJnBCMGw0OEomV0lZbFpGOicnKldxRVo4MUhLZGFWNmBPOk9qLGM7PDI3VVI7ZDtobTIsOWAySHElTioscEEnX05nZEc/WzUwclJrZlFZYjY8OlolL1xTMmZMNzojbVkjanU9ai4+UHNyQzQ0IUNTZ2MiaGZWPCFNVUcwSlY8N1s7TSQ7LzgsSkEtMTUxcSVgWyNMbE1oLU44RkRhVFxyLz5KQ34+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDA5MiAwMDAwMCBuIAowMDAwMDAwMTk5IDAwMDAwIG4gCjAwMDAwMDA0MDIgMDAwMDAgbiAKMDAwMDAwMDQ3MCAwMDAwMCBuIAowMDAwMDAwNzMxIDAwMDAwIG4gCjAwMDAwMDA3OTAgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8N2E3MjA3MzdiMzU5YzQ1NWNiMWJlZTgyY2Y2ZjBlMzM+PDdhNzIwNzM3YjM1OWM0NTVjYjFiZWU4MmNmNmYwZTMzPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA1IDAgUgovUm9vdCA0IDAgUgovU2l6ZSA4Cj4+CnN0YXJ0eHJlZgoxMTMwCiUlRU9GCg==";
