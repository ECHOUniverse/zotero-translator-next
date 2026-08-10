/**
 * 条目面板区块：选中条目的标题/摘要翻译 + 该条目历史
 */
import { config } from "../../package.json";
import { getLocaleID } from "../utils/locale";
import { TranslateManager } from "./translate";
import {
  buildSectionSkeleton,
  forceSectionOpenHeight,
  ensureSectionOpen,
  forceBodyVisible,
  renderResultCard,
  renderHistoryList,
  initialViewState,
  SectionViewState,
} from "./sectionUI";
import {
  listHistory,
  deleteHistory,
  deleteByItem,
  HistoryRecord,
} from "./history";
import { getString } from "../utils/locale";

const ITEM_PANE_ID = "translator-item";
const ITEM_SECTION_ID = "zotero-translator-next-item-section";

export class ItemPaneModule {
  private view: SectionViewState = initialViewState();
  private history: HistoryRecord[] = [];
  private currentItemID: number | null = null;
  private currentTitle = "";
  private currentAbstract = "";

  private translateMgr: TranslateManager;

  constructor(translateMgr: TranslateManager) {
    this.translateMgr = translateMgr;
  }

  register(): void {
    Zotero.ItemPaneManager.registerSection({
      paneID: ITEM_PANE_ID,
      pluginID: config.addonID,
      header: {
        l10nID: getLocaleID("item-section-head"),
        icon: "chrome://zotero/skin/16/universal/save.svg",
      },
      sidenav: {
        l10nID: getLocaleID("item-section-sidenav"),
        icon: "chrome://zotero/skin/20/universal/save.svg",
      },
      onInit: (props: any) => {
        // Zotero 9: props 含 { paneID, doc, body }；7 可能只有 { item }
        const body = props?.body;
        if (body) {
          this.mountSkeleton(body);
        }
        ztoolkit.log("item section init", { hasBody: Boolean(body) });
      },
      onItemChange: ({ setEnabled, tabType }) => {
        setEnabled(tabType === "library");
        return true;
      },
      onRender: ({ body, item }) => {
        const doc = body.ownerDocument!;
        // 兜底：onInit 未挂载时（老版本无 body props）在此挂载
        this.mountSkeleton(body);
        this.currentItemID = item?.id ?? null;
        this.currentTitle = item?.getField("title") ?? "";
        this.currentAbstract = item?.getField("abstractNote") ?? "";
        this.view = initialViewState();
        this.refreshView();
        void this.refreshHistory(doc);
      },
    });

    this.translateMgr.addEventListener((ev) => {
      if (ev.type === "chunk") {
        this.view.status = "processing";
        this.view.streaming += ev.delta ?? "";
        this.refreshView();
        return;
      }
      if (ev.type === "processing" || ev.type === "queued") {
        this.view.status = "processing";
        this.view.streaming = "";
        this.refreshView();
        return;
      }
      if (ev.type === "success" && ev.result) {
        this.view.status = "success";
        this.view.result = ev.result;
        this.view.streaming = "";
        this.refreshView();
        if (this.skeleton) {
          void this.refreshHistory(this.skeleton.root.ownerDocument!);
        }
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

  private skeleton: ReturnType<typeof buildSectionSkeleton> | null = null;

  /** 挂载骨架（幂等：已有内容则跳过） */
  private mountSkeleton(body: Element): void {
    const doc = body.ownerDocument!;
    let root = body.querySelector(`#${ITEM_SECTION_ID}`) as HTMLElement | null;
    if (!root) {
      root = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      ) as HTMLElement;
      root.id = ITEM_SECTION_ID;
      root.style.height = "100%";
      body.appendChild(root);
    }
    // 可见性三重保障前置：即使后续渲染步骤异常，内容也必定可见
    forceBodyVisible(body);
    forceSectionOpenHeight(body);
    ensureSectionOpen(body);
    if (root.firstChild) {
      return;
    }
    const skeleton = buildSectionSkeleton(doc);
    root.appendChild(skeleton.root);
    this.skeleton = skeleton;
    try {
      this.buildToolbar(doc, skeleton.toolbar);
    } catch (e) {
      console.error("[ZoteroTranslatorNext] item buildToolbar failed", e);
    }
    console.log("[ZoteroTranslatorNext] item section mounted");
  }

  private buildToolbar(doc: Document, toolbar: HTMLElement): void {
    toolbar.textContent = "";
    const titleBtn = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    );
    titleBtn.className = "ztr-btn";
    titleBtn.textContent = getString("btn-translate-title");
    titleBtn.addEventListener("click", () => this.translateField("title"));
    const absBtn = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    );
    absBtn.className = "ztr-btn";
    absBtn.textContent = getString("btn-translate-abstract");
    absBtn.addEventListener("click", () => this.translateField("abstract"));
    toolbar.append(titleBtn, absBtn);
  }

  private translateField(kind: "title" | "abstract"): void {
    const text = kind === "title" ? this.currentTitle : this.currentAbstract;
    if (!text) {
      new ztoolkit.ProgressWindow(config.addonName, { closeTime: 3000 })
        .createLine({
          text:
            kind === "title" ? getString("no-title") : getString("no-abstract"),
          type: "error",
        })
        .show();
      return;
    }
    this.view = initialViewState();
    this.refreshView();
    this.translateMgr.translate({
      sourceText: text,
      context: this.currentTitle, // LLM 渠道上下文
      itemID: this.currentItemID ?? undefined,
    });
  }

  private async refreshHistory(doc: Document): Promise<void> {
    if (!this.skeleton) return;
    const records =
      this.currentItemID != null
        ? await listHistory({ itemID: this.currentItemID, limit: 50 })
        : [];
    this.history = records;
    renderHistoryList(doc, this.skeleton.historyCard, records, {
      onDelete: (id) => {
        void deleteHistory(id).then(() => this.refreshHistory(doc));
      },
    });
    forceSectionOpenHeight(this.skeleton.historyCard);
    // 按条目删除（Q13）
    if (this.currentItemID != null) {
      const header =
        this.skeleton.historyCard.querySelector(".ztr-card-header");
      if (header && !header.querySelector("[data-act='clear-item']")) {
        const btn = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "button",
        );
        btn.className = "ztr-btn ztr-btn-danger";
        btn.setAttribute("data-act", "clear-item");
        btn.textContent = getString("history-clear-item");
        btn.addEventListener("click", () => {
          void deleteByItem(this.currentItemID!).then(() =>
            this.refreshHistory(doc),
          );
        });
        header.append(btn);
      }
    }
  }

  private refreshView(): void {
    if (!this.skeleton) return;
    const doc = this.skeleton.root.ownerDocument!;
    renderResultCard(doc, this.skeleton.resultCard, this.view, {
      onRetry: () => {
        if (this.view.result?.sourceText) {
          this.translateMgr.translate({
            sourceText: this.view.result.sourceText,
            context: this.currentTitle,
            itemID: this.currentItemID ?? undefined,
          });
        }
      },
      onCancel: () => this.translateMgr.cancelCurrent(),
      onCopy: (text) => {
        const clipboard = (globalThis as any).ClipboardHelper as
          | { copyString: (s: string) => void }
          | undefined;
        if (clipboard?.copyString) clipboard.copyString(text);
        else void navigator.clipboard?.writeText(text);
      },
      onSummary: () => void 0, // 条目面板不做总结（阅读器区块提供）
    });
  }
}
