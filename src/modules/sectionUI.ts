/**
 * 区块 UI 共享视图控制器（阅读器侧栏区块 / 条目面板区块共用）
 * 管理：结果卡片（原文/格式化/译文三段对照）、流式输出、历史列表、总结面板
 */
import { HistoryRecord } from "./history";
import { getString } from "../utils/locale";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

export interface ResultView {
  text: string;
  engine: string;
  fromCache: boolean;
  formattedText?: string | null;
  sourceText?: string;
  detectedLang?: string;
  historyId?: number;
}

export interface SectionViewState {
  status: "idle" | "processing" | "success" | "fail" | "cancelled";
  streaming: string; // 流式累积
  result: ResultView | null;
  error?: string;
}

export function initialViewState(): SectionViewState {
  return { status: "idle", streaming: "", result: null };
}

/** 创建 XHTML 元素（XUL 文档内使用） */
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs?: Record<string, string>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElementNS(XHTML_NS, tag) as HTMLElementTagNameMap[K];
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.setAttribute("class", v);
      else if (k.startsWith("on")) {
        // 事件属性不在此设置
      } else node.setAttribute(k, v);
    }
  }
  if (text != null) node.textContent = text;
  return node;
}

/** 在 XHTML 根元素上建立区块骨架，返回各数据钩子元素 */
export function buildSectionSkeleton(doc: Document): {
  root: HTMLElement;
  toolbar: HTMLElement;
  resultCard: HTMLElement;
  summaryCard: HTMLElement;
  historyCard: HTMLElement;
} {
  const root = el(doc, "div", { class: "ztr-section" });
  const toolbar = el(doc, "div", { class: "ztr-toolbar" });
  const resultCard = el(doc, "div", { class: "ztr-card ztr-result-card" });
  const summaryCard = el(doc, "div", {
    class: "ztr-card ztr-summary-card",
    hidden: "true",
  });
  const historyCard = el(doc, "div", { class: "ztr-card ztr-history-card" });
  root.append(toolbar, resultCard, summaryCard, historyCard);
  return { root, toolbar, resultCard, summaryCard, historyCard };
}

/** 渲染结果卡片（幂等重绘） */
export function renderResultCard(
  doc: Document,
  container: HTMLElement,
  view: SectionViewState,
  handlers: {
    onRetry?: () => void;
    onCancel?: () => void;
    onCopy?: (text: string) => void;
    onSummary?: () => void;
  },
): void {
  container.textContent = "";

  const header = el(doc, "div", { class: "ztr-card-header" });
  const statusLabel = el(doc, "span", {
    class: `ztr-status ztr-status-${view.status}`,
  });
  switch (view.status) {
    case "idle":
      statusLabel.textContent = getString("status-idle");
      break;
    case "processing":
      statusLabel.textContent = getString("status-processing");
      break;
    case "success":
      statusLabel.textContent = getString("status-success");
      break;
    case "fail":
      statusLabel.textContent = getString("status-fail");
      break;
    case "cancelled":
      statusLabel.textContent = getString("status-cancelled");
      break;
  }
  header.append(statusLabel);

  if (view.result?.engine) {
    const badge = el(doc, "span", { class: "ztr-badge" }, view.result.engine);
    if (view.result.fromCache) badge.textContent += " ⚡";
    header.append(badge);
  }
  if (view.result?.detectedLang && view.result.detectedLang !== "auto") {
    header.append(
      el(doc, "span", { class: "ztr-lang" }, `↔ ${view.result.detectedLang}`),
    );
  }
  if (view.status === "processing") {
    const cancelBtn = el(
      doc,
      "button",
      { class: "ztr-btn", "data-act": "cancel" },
      getString("btn-cancel"),
    );
    cancelBtn.addEventListener("click", () => handlers.onCancel?.());
    header.append(cancelBtn);
  }
  container.append(header);

  if (view.status === "fail" && view.error) {
    container.append(el(doc, "div", { class: "ztr-error" }, view.error));
    const retryBtn = el(
      doc,
      "button",
      { class: "ztr-btn", "data-act": "retry" },
      getString("btn-retry"),
    );
    retryBtn.addEventListener("click", () => handlers.onRetry?.());
    container.append(retryBtn);
  }

  // 三段对照
  if (view.status === "success" && view.result) {
    const tabs = el(doc, "div", { class: "ztr-tabs" });
    const modes: Array<[string, string]> = [
      ["trans", getString("tab-translated")],
      ["src", getString("tab-source")],
      ["fmt", getString("tab-formatted")],
    ];
    let mode = "trans";
    const textBox = el(doc, "div", { class: "ztr-text" });
    textBox.textContent = view.result.text;

    const renderTab = () => {
      if (mode === "src") textBox.textContent = view.result?.sourceText ?? "";
      else if (mode === "fmt")
        textBox.textContent = view.result?.formattedText ?? "";
      else textBox.textContent = view.result?.text ?? "";
    };
    for (const [m, label] of modes) {
      const b = el(
        doc,
        "button",
        { class: "ztr-tab" + (m === mode ? " active" : "") },
        label,
      );
      b.addEventListener("click", () => {
        mode = m;
        tabs
          .querySelectorAll(".ztr-tab")
          .forEach((x: Element) => x.classList.remove("active"));
        b.classList.add("active");
        renderTab();
      });
      tabs.append(b);
    }
    container.append(tabs, textBox);

    const actions = el(doc, "div", { class: "ztr-actions" });
    const copyBtn = el(
      doc,
      "button",
      { class: "ztr-btn", "data-act": "copy" },
      getString("btn-copy"),
    );
    copyBtn.addEventListener("click", () =>
      handlers.onCopy?.(textBox.textContent ?? ""),
    );
    actions.append(copyBtn);
    if (handlers.onSummary) {
      const sumBtn = el(
        doc,
        "button",
        { class: "ztr-btn", "data-act": "summary" },
        getString("btn-summarize"),
      );
      sumBtn.addEventListener("click", () => handlers.onSummary?.());
      actions.append(sumBtn);
    }
    container.append(actions);
  } else if (view.status === "processing") {
    const textBox = el(doc, "div", { class: "ztr-text ztr-streaming" });
    textBox.textContent = view.streaming;
    container.append(textBox);
  }
}

/** 流式更新（不重建 DOM） */
export function updateStreamingText(
  doc: Document,
  container: HTMLElement,
  text: string,
): void {
  const box = container.querySelector(".ztr-streaming") as HTMLElement | null;
  if (box) box.textContent = text;
}

/** 强制区块内容高度自适应（collapsible-section 首次打开时测量高度≈0，
 * 后续挂载的内容会被 max-height: var(--open-height) 裁剪不可见） */
export function forceSectionOpenHeight(body: Element): void {
  const section = body.closest("collapsible-section") as HTMLElement | null;
  if (section) {
    section.style.setProperty("--open-height", "auto");
  }
}

/** 确保区块处于展开状态（防止 panes.<paneID>.open pref 意外为 false 导致内容不可见） */
export function ensureSectionOpen(body: Element): void {
  const section = body.closest("collapsible-section") as any;
  if (section && !section.open && !section.empty) {
    section.open = true;
  }
}

/** 渲染历史列表 */
export function renderHistoryList(
  doc: Document,
  container: HTMLElement,
  records: HistoryRecord[],
  handlers: {
    onDelete?: (id: number) => void;
    onSummarize?: (r: HistoryRecord) => void;
  },
): void {
  container.textContent = "";
  container.append(
    el(doc, "div", { class: "ztr-card-header" }, getString("history-title")),
  );
  if (records.length === 0) {
    container.append(
      el(doc, "div", { class: "ztr-empty" }, getString("history-empty")),
    );
    return;
  }
  for (const rec of records) {
    const item = el(doc, "div", { class: "ztr-history-item" });
    const head = el(doc, "div", { class: "ztr-history-head" });
    head.append(
      el(doc, "span", { class: "ztr-badge" }, rec.engine),
      el(
        doc,
        "span",
        { class: "ztr-history-time" },
        new Date(rec.createdAt).toLocaleString(),
      ),
    );
    const body = el(doc, "div", { class: "ztr-history-body" });
    const trans = el(doc, "div", { class: "ztr-history-trans" });
    trans.textContent =
      rec.translatedText.slice(0, 200) +
      (rec.translatedText.length > 200 ? "…" : "");
    body.append(trans);
    if (rec.summary) {
      body.append(
        el(
          doc,
          "div",
          { class: "ztr-history-summary" },
          `📝 ${rec.summary.slice(0, 150)}${rec.summary.length > 150 ? "…" : ""}`,
        ),
      );
    }
    const actions = el(doc, "div", { class: "ztr-history-actions" });
    if (handlers.onSummarize) {
      const sumBtn = el(
        doc,
        "button",
        { class: "ztr-btn", "data-act": "sum" },
        getString("btn-summarize"),
      );
      sumBtn.addEventListener("click", () => handlers.onSummarize?.(rec));
      actions.append(sumBtn);
    }
    const delBtn = el(
      doc,
      "button",
      { class: "ztr-btn ztr-btn-danger", "data-act": "del" },
      "🗑",
    );
    delBtn.title = getString("history-delete");
    delBtn.addEventListener("click", () => handlers.onDelete?.(rec.id));
    actions.append(delBtn);
    item.append(head, body, actions);
    container.append(item);
  }
}

/** 渲染总结卡片 */
export function renderSummaryCard(
  doc: Document,
  container: HTMLElement,
  state: {
    status: "idle" | "processing" | "done" | "fail";
    text: string;
    error?: string;
  },
  handlers: {
    onClose?: () => void;
    onSave?: () => void;
    onRegenerate?: () => void;
  },
): void {
  container.textContent = "";
  container.hidden = false;
  const header = el(doc, "div", { class: "ztr-card-header" });
  header.append(
    el(doc, "span", { class: "ztr-status" }, getString("summary-title")),
  );
  const closeBtn = el(
    doc,
    "button",
    { class: "ztr-btn", "data-act": "close" },
    "✕",
  );
  closeBtn.addEventListener("click", () => {
    container.hidden = true;
    handlers.onClose?.();
  });
  header.append(closeBtn);
  container.append(header);

  const body = el(doc, "div", { class: "ztr-text" });
  body.textContent = state.text || (state.status === "processing" ? "…" : "");
  container.append(body);
  if (state.status === "fail" && state.error) {
    container.append(el(doc, "div", { class: "ztr-error" }, state.error));
  }
  if (state.status === "done" && state.text) {
    const saveBtn = el(
      doc,
      "button",
      { class: "ztr-btn", "data-act": "save" },
      getString("btn-save-summary"),
    );
    saveBtn.addEventListener("click", () => handlers.onSave?.());
    container.append(saveBtn);
  }
}
