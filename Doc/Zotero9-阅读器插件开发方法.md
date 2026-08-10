# Zotero 9 阅读器插件开发方法

> 研究来源：Zotero 官方开发者文档（https://www.zotero.org/support/dev 体系）与官方源码
> （`zotero/zotero` 仓库 `chrome/content/zotero/xpcom/reader.js`、`chrome/content/zotero/reader.xhtml`，及 `zotero/reader` 子模块 `src/common/`）。

---

## 一、Zotero 9 插件总体架构

### 1.1 版本背景（7 → 8 → 9）

| 版本         | 底层 Firefox     | 关键变化                                                                   |
| ------------ | ---------------- | -------------------------------------------------------------------------- |
| Zotero 7     | FF 60 → 115      | 插件体系全面重写：install.rdf/XUL 覆盖 → manifest.json + bootstrap.js      |
| Zotero 8     | FF 115 → 140     | 全部 JSM → ESM（`.mjs`），Bluebird → 原生 Promise，`Zotero.spawn()` 移除   |
| **Zotero 9** | 9.0.6（2026-07） | **官方明确：无重大开发者向变更**，仅需把 `strict_max_version` 改为 `9.0.*` |

Zotero 9 官方页面原话："Zotero 9 introduced various new features but **did not include any major developer-facing changes**"。新功能（如朗读 Read Aloud）都在 reader 子模块内部实现，不改变插件 API。

### 1.2 插件文件结构（必备三件套）

```
my-plugin/
├── manifest.json      # 插件元数据（WebExtension 风格）
├── bootstrap.js       # 生命周期钩子
├── prefs.js           # 默认偏好（可选）
├── locale/...         # Fluent 本地化（.ftl）
└── prefs.xhtml        # 偏好面板（可选）
```

**manifest.json 关键点**：

```json
{
  "manifest_version": 2,
  "name": "My Plugin",
  "version": "1.0.0",
  "applications": {
    "zotero": {
      "id": "my-plugin@example.com",
      "strict_min_version": "6.999",
      "strict_max_version": "9.0.*"
    }
  }
}
```

- `applications.zotero` 必须存在，否则无法安装
- `strict_max_version` 写 `x.x.*` 形式，后续可通过 update manifest 调整兼容性而不必发新版

**bootstrap.js 生命周期钩子**（Zotero 7+ 全部可用；Zotero 9 中 `Zotero`、`Services`、`Cc`/`Ci` 在 startup 时已自动就绪）：

| 钩子                                       | 时机          | 职责                                               |
| ------------------------------------------ | ------------- | -------------------------------------------------- |
| `startup({id, version, rootURI}, reason)`  | 插件加载      | 注册一切全局功能                                   |
| `shutdown({id, version, rootURI}, reason)` | 插件卸载/禁用 | **必须清理所有功能**（插件可无重启禁用）           |
| `install() / uninstall()`                  | 安装/卸载     |                                                    |
| `onMainWindowLoad({window})`               | 主窗口打开    | **所有窗口级 UI 修改必须放这里**（窗口可多次开关） |
| `onMainWindowUnload({window})`             | 主窗口关闭    | 清除窗口引用、定时器，防内存泄漏                   |

- `rootURI` 以 `/` 结尾，直接拼接相对路径即可加载资源（`rootURI + 'content/panel.xhtml'`）
- `shutdown()` 中要遍历 `Zotero.getMainWindows()` 清理窗口 DOM

### 1.3 其他官方基础设施

- **本地化**：Fluent（`.ftl`），放在 `locale/<lang>/` 下自动注册；共享文档中的 l10n-id 必须加插件名前缀防冲突
- **偏好面板**：`Zotero.PreferencePanes.register({ pluginID, src: 'prefs.xhtml', scripts, stylesheets })`
- **偏好读写**：`Zotero.Prefs.get()/set()`（Z7 起 `<preference>` 标签绑定直连键名）
- **注册表 API**（Z7+ 官方，按 pluginID 自动清理）：
  - `Zotero.ItemTreeManager.registerColumn`（条目列表自定义列）
  - `Zotero.ItemPaneManager.registerSection / registerInfoRow`（主窗口信息栏）
  - `Zotero.MenuManager.registerMenu`（Z8+，含阅读器窗口菜单栏 `reader/menubar/*` 目标）

---

## 二、阅读器（Reader）架构：为什么内容窗格特殊

### 2.1 双层结构

```
阅读器窗口 (reader.xhtml, 特权 XUL 窗口)
└── <browser id="reader" src="resource://zotero/reader/reader.html">
    └── iframe 内容窗格（React 应用，zotero/reader 独立子模块）
        ├── 顶部工具栏 (toolbar.js)
        ├── 左侧栏：注释/缩略图/大纲/搜索
        ├── 中央内容区：PDF (pdfjs) / EPUB (epubjs) / 快照
        ├── 选中文字弹出层 (selection-popup.js)
        └── 右键上下文菜单 (context-menu.js)
```

**核心约束**：阅读器 UI 全部在 iframe 内，无法直接注入 DOM。官方只提供一条受控通道——事件桥：

```
iframe 内 React 组件派发 customEvent
  → ReaderInstance._customEventHandler（reader.js 捕获）
  → Zotero.Reader._dispatchEvent(event)
  → 插件注册的 handler(event) 被调用
```

### 2.2 事件桥的实现细节（源码级）

- iframe 内的 `CustomSections` 组件（`src/common/components/common/custom-sections.js`）渲染时派发 `customEvent`，`append` 回调把插件注入的节点包进 `<div class="section">`
- **`append` 必须同步调用**：事件处理返回后 `finished = true`，异步调用会抛错 `'Append must be called directly and synchronously in the event'`
- 上下文菜单通过 `appendCustomItemGroups` 收集插件菜单项，返回后由宿主 `_openContextMenu` 转为 XUL menupopup 显示

---

## 三、阅读器插件官方 API（核心）

### 3.1 事件注册

```js
// startup() 中注册；插件禁用/卸载时按 pluginID 自动注销
Zotero.Reader.registerEventListener(type, handler, pluginID);
Zotero.Reader.unregisterEventListener(type, handler); // 手动注销
```

### 3.2 八种事件类型

**DOM 注入类**（事件对象含 `{ reader, doc, params, append }`）：

| 类型                            | 触发时机             | params 关键字段              |
| ------------------------------- | -------------------- | ---------------------------- |
| `renderToolbar`                 | 阅读器顶部工具栏渲染 | reader 实例                  |
| `renderTextSelectionPopup`      | 选中文字弹出层渲染   | `annotation`（选中注释对象） |
| `renderSidebarAnnotationHeader` | 左侧栏注释头部行渲染 | 注释对象                     |

**菜单类**（事件对象含 `{ reader, params, append }`，append 接收菜单项对象）：

| 类型                          | 对应菜单                                               |
| ----------------------------- | ------------------------------------------------------ |
| `createColorContextMenu`      | 工具栏颜色选择器                                       |
| `createViewContextMenu`       | 内容区右键菜单                                         |
| `createAnnotationContextMenu` | 左侧栏注释右键菜单（`params.ids` 为选中注释 key 数组） |
| `createThumbnailContextMenu`  | 左侧栏缩略图右键菜单                                   |
| `createSelectorContextMenu`   | 标签选择器右键菜单                                     |

### 3.3 使用示例（官方）

**注入选中翻译浮层**：

```js
Zotero.Reader.registerEventListener(
  "renderTextSelectionPopup",
  (event) => {
    let { reader, doc, params, append } = event;
    let container = doc.createElement("div");
    container.append("Loading…");
    append(container);
    setTimeout(
      () => container.replaceChildren("译文: " + params.annotation.text),
      1000,
    );
  },
  "my-plugin@example.com",
);
```

**加右键菜单项**：

```js
Zotero.Reader.registerEventListener(
  "createAnnotationContextMenu",
  (event) => {
    let { reader, params, append } = event;
    append({
      label: "导出注释",
      onCommand() {
        /* 此处是特权上下文，可调 Zotero API */
      },
    });
  },
  "my-plugin@example.com",
);
```

菜单项对象支持字段：`label`、`onCommand`、`disabled`、`checked`（checkbox 样式）、`color`（颜色图标）、`persistent`、`groups`（嵌套子菜单）。

### 3.4 访问与操控阅读器实例

```js
// 获取当前选中的阅读器（最常用）
let tabID = Zotero_Tabs.selectedID;
let reader = Zotero.Reader.getByTabID(tabID);

// 打开/定位
await Zotero.Reader.open(itemID, location, {
  openInBackground,
  openInWindow,
  allowDuplicate,
});
await Zotero.Reader.openURI(uri, location, options);
```

**ReaderInstance 的关键设计——Proxy 转发**：ReaderInstance 是一个 Proxy，插件访问其未定义属性时**自动转发到 `_internalReader`**（iframe 内 reader 实例的方法和属性）。因此可以：

```js
reader._iframeWindow; // iframe 窗口（需 wrappedJSObject 访问其全局）
reader.itemID; // 附件条目 ID
reader.navigate(location);
reader.setAnnotations(items); // 覆盖注释
reader.unsetAnnotations(keys);
```

⚠️ **注意**：iframe 与特权代码之间是隔离的，跨界传递对象需要 `Components.utils.cloneInto`（Zotero 内部已处理）；直接调用 iframe 内部 API（如 `pdfPage.getTextContent()`）会返回 `"Restricted"` 拒绝——官方在 zotero-dev 明确表示：有需求可发帖，官方可能加专用 API。

---

## 四、"内容窗格"插件实战模式

按目标区域分四类（结合官方 API 与社区主流实现）：

**① 工具栏按钮**（官方 API）
`renderToolbar` 注入按钮，配 `createViewContextMenu` 提供右键菜单。

**② 选中文字浮层**（官方 API，最典型，如 zotero-pdf-translate）
`renderTextSelectionPopup` + `params.annotation.text` 拿选中文本 → 异步翻译 → `replaceChildren` 更新。

**③ 侧栏注释头部**（官方 API）
`renderSidebarAnnotationHeader` 在每条注释标题行追加元素。

**④ 整页级覆盖/右侧 tabpanel**（无官方 API 时，社区用 `onMainWindowLoad` 手动 DOM 注入）
遍历阅读器窗口，向右侧栏 `<tabpanels>` 追加 `<tabpanel>`；zotero-plugin-toolkit 的 `ReaderTabPanelManager.register(tabLabel, renderPanelHook, ...)` 封装了这种注入；主窗口右侧信息栏则用官方 `Zotero.ItemPaneManager.registerSection`（zotero-pdf-translate 的翻译面板即此方式）。

**建议优先级**：能用 `Zotero.Reader.registerEventListener` 就用官方 API；缺失的场景在 zotero-dev 发帖请求官方支持，比 monkey-patch 更可靠。

---

## 五、开发环境与工具链

```bash
# 1. 源码直载（开发模式）：profile 的 extensions/ 目录建代理文件
echo "/abs/path/to/plugin/src" > ~/Zotero/profile/extensions/my-plugin@example.com
# 2. 清缓存启动 + 调试输出 + 打开 Browser Toolbox
zotero -purgecaches -ZoteroDebugText -jsconsole -jsdebugger
```

- **模板**：`windingwind/zotero-plugin-template`（TypeScript + esbuild + 自动构建 xpi + GitHub Actions 发布），已适配 Zotero 9（bump `strict_max_version` 到 `9.*`）
- **类型定义**：`zotero-types`（含 Reader 全套类型）
- **工具库**：`zotero-plugin-toolkit`（ReaderTool：`getReader(waitTime)`、`getSelectedText(reader)`、`getSelectedAnnotationData(reader)` 等）
- **调试**：`Zotero.debug()`、Browser Toolbox（DOM 断点/网络面板，适用于阅读器 iframe）、Error Console
- **源码参考**：
  - `chrome/content/zotero/xpcom/reader.js`（Zotero.Reader 全部实现）
  - `chrome/content/zotero/reader.xhtml`（阅读器窗口骨架）
  - `zotero/reader` 仓库 `src/common/`（内容窗格 React 实现）

---

## 六、Zotero 9 迁移清单（插件作者）

1. `manifest.json`：`strict_max_version` → `"9.0.*"`（无代码改动时只更新 update manifest 即可）
2. 确认无 `ChromeUtils.import()`（旧 JSM 同步导入，Zotero 8 起废弃）；Zotero 9 基于更新 Firefox 内核，ESM 是唯一导入方式
3. 阅读器 API 全部兼容：8 种事件类型、`getByTabID`、`open`、Proxy 转发机制在 9.x 未变
4. Zotero 9 新增朗读功能不影响既有注入点；但注意 reader 子模块升级可能改变 iframe 内 DOM 结构，依赖内部 CSS 选择器的 hack 需回归测试

---

## 结论

Zotero 9 的阅读器内容窗格插件开发 = **官方事件桥 API（8 种事件）** + **ReaderInstance 操控** + **bootstrap 生命周期管理**。内容窗格在 iframe 内、只能通过 `registerEventListener` 注入，这是与 Zotero 6 时代（直接 DOM 注入）最本质的区别。开发时以官方 API 为第一选择，缺口场景去 zotero-dev 请求官方支持。

---

## 参考资料

- Zotero 开发者门户：https://www.zotero.org/support/dev
- 插件开发入门：https://www.zotero.org/support/dev/client_coding/plugin_development
- Zotero 7 for Developers：https://www.zotero.org/support/dev/zotero_7_for_developers
- Zotero 8 for Developers：https://www.zotero.org/support/dev/zotero_8_for_developers
- Zotero 9 for Developers：https://www.zotero.org/support/dev/zotero_9_for_developers
- 官方示例插件 Make-It-Red：https://github.com/zotero/make-it-red
- Zotero.Reader 源码：`zotero/zotero` → `chrome/content/zotero/xpcom/reader.js`
- 阅读器窗口骨架：`chrome/content/zotero/reader.xhtml`
- 阅读器子模块（内容窗格 React 实现）：https://github.com/zotero/reader → `src/common/`
- 社区模板/工具：windingwind/zotero-plugin-template、zotero-plugin-toolkit、zotero-types
