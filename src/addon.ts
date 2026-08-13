import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import { TranslateManager } from "./modules/tasks";
import { SummaryManager } from "./modules/summary";
import { ReaderModule } from "./modules/reader";
import { ItemPaneModule } from "./modules/itemPane";
import { summarizeTaskIn } from "./ui/sections";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    /** 翻译管线（队列 + 取消 + 状态机） */
    translate: TranslateManager;
    /** AI 总结 */
    summary: SummaryManager;
    /** 阅读器输入源 */
    reader: ReaderModule;
    /** 条目面板输入源 */
    itemPane: ItemPaneModule;
  };
  public hooks: typeof hooks;
  public api: object;

  constructor() {
    const translate = new TranslateManager();
    const summary = new SummaryManager();
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
      translate,
      summary,
      reader: new ReaderModule(translate, summary, {
        // 总结快捷键桥（D6）：渲染到对应窗格
        onSummarize: (task, kind) => {
          summarizeTaskIn(kind, task);
        },
      }),
      itemPane: new ItemPaneModule(translate),
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
