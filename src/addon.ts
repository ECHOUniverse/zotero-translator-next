import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import { TranslateManager } from "./modules/translate";
import { ReaderModule } from "./modules/reader";
import { ItemPaneModule } from "./modules/itemPane";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    /** 翻译管线 */
    translate: TranslateManager;
    /** 阅读器区块模块 */
    reader: ReaderModule;
    /** 条目面板区块模块 */
    itemPane: ItemPaneModule;
    prefs?: {
      window: Window;
    };
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: object;

  constructor() {
    const translate = new TranslateManager();
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
      translate,
      reader: new ReaderModule(translate),
      itemPane: new ItemPaneModule(translate),
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
