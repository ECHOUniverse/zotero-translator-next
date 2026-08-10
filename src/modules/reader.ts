/**
 * 阅读器模块：侧栏区块（ItemPaneManager.registerSection）+ 划选弹层 + 自动翻译
 */
import { config } from "../../package.json";
import { getLocaleID, getString } from "../utils/locale";
import { getPref, getPrefJSON, setPref, setPrefJSON } from "../utils/prefs";
import { getChannels } from "../services";
import { TranslateManager } from "./translate";
import {
  el,
  buildSectionSkeleton,
  renderResultCard,
  renderHistoryList,
  renderSummaryCard,
  updateStreamingText,
  initialViewState,
  SectionViewState,
} from "./sectionUI";
import { listHistory, deleteHistory, HistoryRecord } from "./history";
import { summarize } from "./summary";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

const READER_PANE_ID = "translator-reader";

/** 目标语言快捷切换选项 */
const TARGET_LANGS: Array<[string, string]> = [
  ["zh-CN", "中文"],
  ["en", "English"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["de", "Deutsch"],
  ["fr", "Français"],
];
const READER_SECTION_ID = "zotero-translator-next-reader-section";

export class ReaderModule {
  private view: SectionViewState = initialViewState();
  private history: HistoryRecord[] = [];
  private historyItemID: number | null = null;
  private lastResultText = "";
  private lastHistoryId: number | undefined;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private summaryState: {
    status: "idle" | "processing" | "done" | "fail";
    text: string;
    error?: string;
  } = { status: "idle", text: "" };
  private summaryAbort: AbortController | null = null;

  private translateMgr: TranslateManager;

  constructor(translateMgr: TranslateManager) {
    this.translateMgr = translateMgr;
  }

  /** 注册阅读器侧栏区块 + 划选事件 */
  register(): void {
    Zotero.ItemPaneManager.registerSection({
      paneID: READER_PANE_ID,
      pluginID: config.addonID,
      header: {
        l10nID: getLocaleID("reader-section-head"),
        icon: "chrome://zotero/skin/16/universal/book.svg",
      },
      sidenav: {
        l10nID: getLocaleID("reader-section-sidenav"),
        icon: "chrome://zotero/skin/20/universal/book.svg",
      },
      bodyXHTML: `<html:div id="${READER_SECTION_ID}"></html:div>`,
      onInit: () => {
        this.wireEvents();
      },
      onItemChange: ({ setEnabled, tabType }) => {
        setEnabled(tabType === "reader");
        return true;
      },
      onRender: ({ body }) => {
        const doc = body.ownerDocument!;
        // 自愈：bodyXHTML 在部分版本解析失败时直接创建根元素
        let root = body.querySelector(
          `#${READER_SECTION_ID}`,
        ) as HTMLElement | null;
        if (!root) {
          root = doc.createElementNS(XHTML_NS, "div") as HTMLElement;
          root.id = READER_SECTION_ID;
          root.style.height = "100%";
          body.appendChild(root);
        }
        // 挂载骨架（仅一次）
        if (!root.firstChild) {
          const skeleton = buildSectionSkeleton(doc);
          root.appendChild(skeleton.root);
          this.skeleton = skeleton;
          this.buildToolbar(doc, skeleton.toolbar);
          this.refreshView();
        }
        void this.refreshHistory(doc);
        ztoolkit.log("reader section rendered", {
          bodyChildren: body.children.length,
          rootFound: Boolean(root),
        });
      },
    });

    // 划选弹层：注入"翻译"按钮
    Zotero.Reader.registerEventListener(
      "renderTextSelectionPopup",
      (event: any) => {
        try {
          const { doc, params, append } = event;
          const text: string = (params?.annotation?.text ?? "").trim();
          if (!text) return;
          this.translateMgr.selectedText = text;
          this.refreshSelectionButtons(doc);
          if (getPref("translate.autoOnSelect")) {
            this.scheduleAutoTranslate();
          }
          const btn = doc.createElementNS(XHTML_NS, "button");
          btn.className = "ztr-popup-btn";
          btn.textContent = getString("btn-translate");
          btn.addEventListener("click", () => {
            void this.translateSelection();
          });
          append(btn);
        } catch (e) {
          ztoolkit.log("popup handler error", e);
        }
      },
      config.addonID,
    );
  }

  private skeleton: ReturnType<typeof buildSectionSkeleton> | null = null;
  private doc: Document | null = null;

  /** 构建工具栏（渠道/目标语言快捷切换 = 侧栏简版设置） */
  private buildToolbar(doc: Document, toolbar: HTMLElement): void {
    toolbar.textContent = "";
    const sel = el(doc, "select", {
      class: "ztr-select",
      "data-act": "channel",
    });
    for (const ch of getChannels()) {
      const opt = doc.createElement("option");
      opt.value = ch.id;
      opt.textContent = ch.name;
      sel.append(opt);
    }
    sel.addEventListener("change", () => {
      // 简版设置：切换时写入当前使用的渠道顺序（将选中渠道置顶）
      const order = getPrefJSON<string[]>("channelsOrder", [
        "bing",
        "deepseek",
      ]);
      const next = [sel.value, ...order.filter((x) => x !== sel.value)];
      setPrefJSON("channelsOrder", next);
    });
    const langSel = el(doc, "select", {
      class: "ztr-select",
      "data-act": "lang",
    });
    for (const [code, label] of TARGET_LANGS) {
      const opt = doc.createElement("option");
      opt.value = code;
      opt.textContent = label;
      langSel.append(opt);
    }
    langSel.value = getPref("targetLang");
    langSel.addEventListener("change", () =>
      setPref("targetLang", langSel.value),
    );
    toolbar.append(sel, langSel);
  }

  private wireEvents(): void {
    this.translateMgr.addEventListener((ev) => {
      if (ev.type === "chunk") {
        this.view.status = "processing";
        this.view.streaming += ev.delta ?? "";
        this.refreshView();
        return;
      }
      if (ev.type === "processing") {
        this.view.status = "processing";
        this.view.streaming = "";
        this.refreshView();
        return;
      }
      if (ev.type === "queued") {
        this.view.status = "processing";
        this.view.streaming = "";
        this.refreshView();
        return;
      }
      if (ev.type === "success" && ev.result) {
        this.view.status = "success";
        this.view.result = ev.result;
        this.view.streaming = "";
        this.lastResultText = ev.result.text;
        this.lastHistoryId = ev.result.historyId;
        this.summaryState = { status: "idle", text: "" };
        this.refreshView();
        if (this.doc) void this.refreshHistory(this.doc);
        return;
      }
      if (ev.type === "fail") {
        this.view.status = "fail";
        this.view.error = ev.error;
        this.view.streaming = "";
        this.refreshView();
        return;
      }
      if (ev.type === "cancelled") {
        this.view.status = "cancelled";
        this.view.streaming = "";
        this.refreshView();
      }
    });
  }

  private refreshSelectionButtons(doc: Document): void {
    this.doc = doc;
    // 更新工具栏按钮可用态（阅读器区块内）
    this.refreshView();
  }

  private scheduleAutoTranslate(): void {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = setTimeout(() => {
      void this.translateSelection();
    }, getPref("translate.autoDebounceMs"));
  }

  /** 翻译当前选中文本 */
  async translateSelection(): Promise<void> {
    const text = this.translateMgr.selectedText?.trim();
    if (!text) {
      new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
        .createLine({ text: getString("no-selection"), type: "error" })
        .show();
      return;
    }
    this.view = initialViewState();
    this.refreshView();
    this.translateMgr.translate({
      sourceText: text,
      itemID: undefined, // 划选翻译不绑定条目（保持历史为全局可见）
    });
  }

  /** 重试最近一次翻译 */
  private retryLast(): void {
    const text = this.translateMgr.selectedText?.trim();
    if (!text) return;
    this.translateMgr.translate({ sourceText: text });
  }

  private async refreshHistory(doc: Document): Promise<void> {
    const records = await listHistory({
      itemID: this.historyItemID ?? undefined,
      limit: 50,
    });
    this.history = records;
    if (this.skeleton) {
      renderHistoryList(doc, this.skeleton.historyCard, records, {
        onDelete: (id) => {
          void deleteHistory(id).then(() => this.refreshHistory(doc));
        },
        onSummarize: (r) => {
          this.lastResultText = r.translatedText;
          this.lastHistoryId = r.id;
          this.summaryState = { status: "idle", text: "" };
          void this.startSummary();
        },
      });
    }
  }

  private refreshView(): void {
    if (!this.skeleton) return;
    const doc = this.skeleton.root.ownerDocument!;
    renderResultCard(doc, this.skeleton.resultCard, this.view, {
      onRetry: () => this.retryLast(),
      onCancel: () => this.translateMgr.cancelCurrent(),
      onCopy: (text) => {
        const clipboard = requireClipboard();
        clipboard.setData("text/plain", text);
      },
      onSummary: () => void this.startSummary(),
    });
    if (this.view.status === "processing") {
      updateStreamingText(doc, this.skeleton.resultCard, this.view.streaming);
    }
  }

  /** 保存总结到历史（按钮入口；无 historyId 时新建历史记录） */
  private async saveSummary(): Promise<void> {
    const text = this.summaryState.text;
    if (!text) return;
    try {
      if (this.lastHistoryId != null) {
        const { updateSummary } = await import("./history");
        await updateSummary(this.lastHistoryId, text);
      } else if (this.lastResultText) {
        const { addHistory } = await import("./history");
        await addHistory({
          itemID: null,
          sourceText: this.lastResultText,
          formattedText: null,
          translatedText: this.lastResultText,
          summary: text,
          sourceLang: "auto",
          targetLang: getPref("targetLang"),
          engine: "summary",
        });
      }
      new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
        .createLine({ text: getString("summary-saved"), type: "success" })
        .show();
      if (this.doc) void this.refreshHistory(this.doc);
    } catch (e) {
      ztoolkit.log("save summary failed", e);
    }
  }

  /** 总结最近一次译文（快捷键入口） */
  async summaryFromShortcut(): Promise<void> {
    if (!this.lastResultText) {
      new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
        .createLine({ text: "请先完成一次翻译", type: "error" })
        .show();
      return;
    }
    await this.startSummary();
  }

  /** 启动总结（对最近一次译文） */
  private async startSummary(): Promise<void> {
    if (!this.lastResultText) return;
    this.summaryState = { status: "processing", text: "" };
    this.summaryAbort = new AbortController();
    if (this.skeleton) {
      renderSummaryCard(
        this.skeleton.root.ownerDocument!,
        this.skeleton.summaryCard,
        this.summaryState,
        {
          onClose: () => void 0,
          onSave: () => void this.saveSummary(),
          onRegenerate: () => void this.startSummary(),
        },
      );
    }
    try {
      const res = await summarize(
        this.lastResultText,
        { signal: this.summaryAbort.signal, historyId: this.lastHistoryId },
        (delta) => {
          this.summaryState.text += delta;
          if (this.skeleton) {
            const card = this.skeleton.summaryCard;
            const body = card.querySelector(".ztr-text");
            if (body) body.textContent = this.summaryState.text;
          }
        },
      );
      this.summaryState = { status: "done", text: res.text };
    } catch (e) {
      this.summaryState = {
        status: "fail",
        text: "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
    if (this.skeleton) {
      renderSummaryCard(
        this.skeleton.root.ownerDocument!,
        this.skeleton.summaryCard,
        this.summaryState,
        {
          onClose: () => void 0,
          onSave: () => void this.saveSummary(),
          onRegenerate: () => void this.startSummary(),
        },
      );
      if (this.doc) void this.refreshHistory(this.doc);
    }
  }
}

/** 剪贴板访问（Zotero 主窗口 chrome 上下文） */
function requireClipboard(): {
  setData: (type: string, value: string) => void;
} {
  const clipboard = (globalThis as any).ClipboardHelper as
    | { copyString: (s: string) => void }
    | undefined;
  if (clipboard?.copyString) {
    return {
      setData: (type, value) => {
        void type;
        clipboard.copyString(value);
      },
    };
  }
  // 兜底：navigator.clipboard（可能不可用）
  return {
    setData: (type, value) => {
      void type;
      void navigator.clipboard?.writeText(value);
    },
  };
}
