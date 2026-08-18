# Zotero 10 适配完整文档

> 版本：v1.0（2026-08）
> 状态：方案已通过 grilling 收敛，待执行
> 用途：**自包含执行手册** —— 任一会话窗口的 agent 读本文档即可独立完成 Zotero 10 适配，无需本会话上下文。

---

## 0. 一句话结论

Zotero 10 的适配**基本没有代码级破坏**：Firefox 内核不变（仍是 140 ESR），官方 breaking 清单几乎不触碰本插件。核心动作 = **manifest 放宽 + 升级三件套依赖（含一处 import 路径改动）+ 4 个风险点定向核对 + 回归 + 发版 0.6.0**。

---

## 1. 已核实事实（F1–F9，含来源）

| # | 事实 | 来源 |
|---|------|------|
| F1 | Zotero 10 目前是 **beta**（官方页 2026-08-06：`currently in beta`） | [zotero_10_for_developers](https://www.zotero.org/support/dev/zotero_10_for_developers) |
| F2 | **Firefox 内核不变**：`Zotero 10 uses the same Firefox 140 ESR base as Zotero 9, so there are no changes to the Mozilla platform itself.` → **esbuild `target: "firefox115"` 无需改** | 同上 |
| F3 | 官方指引：确认兼容后把 `strict_max_version` 改为 `10.0.*`；**beta/source 版不再强制 `strict_max_version`**（可直接在 10 beta 测试，无需改 manifest；stable 仍强制） | 同上 |
| F4 | 官方 breaking 清单，**本插件基本全部不沾边**（收藏多选、搜索/全文 FTS5、本地 HTTP server、`setType`/`attachmentPath` 校验、`CookieSandbox` 移除、`Zotero.HTTP.download()` 重写、ItemTree 拆分——`getSelectedItems()` 仍可用） | 同上 + 代码比对 |
| F5 | **唯一命中点：本地化**。Zotero 10 重做了插件 FTL 注册（合并为单一 localization source + per-locale 回退）。本插件现状是手动 `new Localization([...])` + `MozXULElement.insertFTLIfNeeded` | 同上 + `src/utils/locale.ts` |
| F6 | 工具链最新稳定：`zotero-plugin-toolkit@5.2.0`（含破坏变更：`ZoteroToolkit` 仅从 `/ztoolkit` 导出；移除 z6 代码）、`zotero-types@4.1.3`、`zotero-plugin-scaffold@0.8.8`。**无 Zotero-10 专属版本**（内核没变，本就不需要） | GitHub releases + npm registry |
| F7 | 本插件触碰的 `Reader.registerEventListener` / `ItemPaneManager.registerSection` / `getSelectedItems()` / `Zotero.DB` / `Zotero.Prefs` / `getMainWindows` 均**不在** breaking 清单；`MenuManager` 仅 `collectionTreeRow` 属性被移除（本插件用 `context.items`，未在移除之列，需实测） | 官方页 + 代码 |
| F8 | 工具链升级目标：`scaffold 0.8.2 → 0.8.8`、`toolkit 5.1.0-beta.13 → 5.2.0`、`types 4.1.0-beta.4 → 4.1.3` | npm registry |
| F9 | **Zotero 10 自动注册插件全部 `locale/*/*.ftl`**（`plugins.js` 的 `registerLocales()` → 统一 L10n source + 按 locale 回退）。本插件手动 `new Localization(...)` + `insertFTLIfNeeded` 在 10 上**大概率已冗余**；本地化若坏，兜底 = 直接依赖这套自动注册 | [zotero/zotero `10.0` 分支 `chrome/content/zotero/xpcom/plugins.js`](https://github.com/zotero/zotero/blob/10.0/chrome/content/zotero/xpcom/plugins.js) |

---

## 2. 决策记录（grilling 收敛结果）

| # | 决策 | 结论 |
|---|------|------|
| Q1 | 目标与时机 | 现在适配 Zotero 10 beta（用户本机已是 10） |
| Q2/Q8 | 兼容范围 | 双支持：`strict_min_version: "6.999"` + `strict_max_version: "10.*"`（7/8/9/10 全覆盖；10.x 内 minor/patch 默认放行；11+ 列入计划再评估） |
| Q3 | 改动范围 | 定向审核适配性：manifest + 4 风险点核对 + 回归，不做全量重写 |
| Q4 | 工具链 | 升级 `scaffold 0.8.8` / `toolkit 5.2.0` / `types 4.1.3`，吸收 `ZoteroToolkit` 导入路径变更 |
| Q5 | 本地化 | 保守：先核实现有做法是否仍工作，坏才迁移（兜底 = Zotero 10 自动注册，F9）；主动迁移列入计划 |
| Q6 | 验证 | 源码 diff（`9.0`↔`10.0` 分支）+ 实机冒烟；CI 暂不加 Zotero 10 job |
| Q7 | 新能力 | undo/redo、多选、`viewMode` 等暂不适配，列入计划 |
| Q9 | 版本号 | `0.6.0` |
| Q10 | 文档 | 本文档 + 更新 `Doc/PLAN.md` §2 决策表（Q23–Q28） |
| Q11 | 验收 | 见 §6 验收清单；冒烟在用户本机 Zotero 10 上做 |

---

## 3. 执行步骤（按序）

### 步骤 1：manifest 放宽

`addon/manifest.json`：

```json
"applications": {
  "zotero": {
    "id": "__addonID__",
    "update_url": "__updateURL__",
    "strict_min_version": "6.999",
    "strict_max_version": "10.*"          // 原 "9.0.*"
  }
}
```

### 步骤 2：依赖升级

`package.json`：

| 包 | 原版本 | 新版本 |
|----|--------|--------|
| `zotero-plugin-toolkit`（dependencies） | `^5.1.0-beta.13` | `^5.2.0` |
| `zotero-plugin-scaffold`（devDependencies） | `^0.8.2` | `^0.8.8` |
| `zotero-types`（devDependencies） | `^4.1.0-beta.4` | `^4.1.3` |

然后 `npm install` 更新 lockfile。

### 步骤 3：toolkit 5.2.0 破坏变更

`src/utils/ztoolkit.ts` 第 1 行：

```ts
// 原
import { ZoteroToolkit } from "zotero-plugin-toolkit";
// 新
import { ZoteroToolkit } from "zotero-plugin-toolkit/ztoolkit";
```

**同时确认** `src/index.ts` 第 1 行 `import { BasicTool } from "zotero-plugin-toolkit";` —— `BasicTool` 在 5.2.0 仍从主入口导出（若 `tsc`/构建报错说明也迁移了，则改为从对应子路径导入，参照 toolkit `dist/index.d.ts` 实际导出）。

### 步骤 4：4 风险点核对（详见 §5）

### 步骤 5：回归

```bash
npm run build          # 含 tsc --noEmit
npm run test:unit      # 纯单测
npm run test           # CI=true 时跳过网络用例
```

### 步骤 6：文档固化

1. `Doc/PLAN.md` §2「已确认决策记录」追加 Q23–Q28（见 §7 建议文案）。
2. 本文档留存（已是最终版）。

### 步骤 7：发版

- 版本号 `0.6.0`
- 走 `npm run release`（zotero-plugin release：bumpp 版本 + 生成 update.json + GitHub release + .xpi）
- 确认生成的 update.json 里 `strict_max_version` 为 `"10.*"`（scaffold 通常从 manifest 派生，如有出入手工修正）

---

## 4. 全量 API 面清单（供定向审核，均已确认不在 Zotero 10 breaking 清单）

| API | 使用位置 | Zotero 10 状态 |
|-----|----------|----------------|
| `Zotero.Reader.registerEventListener("renderTextSelectionPopup")` | `src/modules/reader.ts` | 不在 breaking 清单，需冒烟 |
| `Zotero.Reader.getByTabID()` / `reader.itemID` / `reader.navigate()` | `reader.ts` / `src/ui/sections.ts` | 同上 |
| `Zotero.ItemPaneManager.registerSection`（`bodyXHTML`/`onInit`/`onItemChange`/`onRender`/`onAsyncRender`/`header`/`sidenav`） | `src/ui/sections.ts` | 同上 |
| `Zotero.MenuManager.registerMenu`（`target: "main/library/item"`，读 `context.items`） | `src/modules/itemPane.ts` | 仅 `collectionTreeRow` 被移除（读它才抛错）；`context.items` 需实测 |
| `Zotero.PreferencePanes.register` / `Zotero.Utilities.Internal.openPreferences` | `src/modules/settings.ts` | 不在 breaking 清单 |
| `Zotero.getMainWindows()` / `win.openDialog` / `win.MozXULElement.insertFTLIfNeeded` | `hooks.ts` / `settings.ts` / `sections.ts` | 不在 breaking 清单（`insertFTLIfNeeded` 受 F5/F9 影响，见 §5-①） |
| `Zotero.getActiveZoteroPane()` / `pane.getSelectedItems()` | `sections.ts` | dev 文档明确 `getSelectedItems()` 仍可用 |
| `Zotero.Items.get()` / `item.getField` / `item.getNotes` / `item.setNote` / `item.saveTx` / `new Zotero.Item("note")` | `reader.ts` / `summary.ts` / `sections.ts` / `itemPane.ts` | 不在 breaking 清单；`saveTx()` 可选新增 `undoAction`（本次不做，Q7） |
| `Zotero.DB.executeTransaction` / `queryAsync` / `rowQueryAsync` / `valueQueryAsync` | `src/modules/history.ts` | 不在 breaking 清单；WAL 模式不影响 DB API，需冒烟 |
| `Zotero.Prefs.get/set` | `src/prefs.ts` / `history.ts` | 不在 breaking 清单 |
| `Zotero.Prompt.confirm` | `reader.ts` / `sections.ts` | 不在 breaking 清单 |
| `Cc["@mozilla.org/widget/clipboardhelper;1"]` / `Ci.nsIClipboardHelper` | `sections.ts` | Mozilla 平台无变更（F2），无碍 |
| 原生 `fetch`（`src/utils/network.ts`） | 全部网络请求 | 非 `Zotero.HTTP`，不受其重写影响 |

---

## 5. 4 风险点核对清单（逐个执行）

### ① 本地化 FTL（唯一真正命中官方 breaking 清单）

- **现状**：
  - `src/utils/locale.ts` `initLocale()`：手动 `new Localization([`${addonRef}-addon.ftl`], true)`；`getString()` 用 `addon.data.locale.current.formatMessagesSync(...)`。
  - `src/hooks.ts` `onMainWindowLoad()`：`win.MozXULElement.insertFTLIfNeeded(`${addonRef}-mainWindow.ftl`)`。
  - `.ftl` 源：`addon/locale/zh-CN/{addon,mainWindow,preferences}.ftl`、`addon/locale/en-US/...`。
- **Zotero 10 变化（F9）**：`registerLocales()` 自动把 `locale/*/*.ftl` 注册进统一 L10n source，含 per-locale 回退（exact → 同语言 → en-US → 首个可用）。
- **核对动作**：
  1. source-diff `zotero/zotero` 的 `9.0`↔`10.0` 分支 `chrome/content/zotero/xpcom/plugins.js`，确认 `registerLocales` 为新增。
  2. 冒烟：Zotero 10 上打开侧栏区块 + 偏好面板，确认中文/英文文案正常解析（`getString()` 不返回裸 `zotero-translator-next-*` 前缀串）。
- **判定**：若文案正常 → 保持现状（Q5 保守）；若解析失败 → 改为依赖自动注册：移除手动 `Localization` 实例，`getString` 改用 window 级 `document.l10n` 或 Zotero 统一 source（执行时以 `plugins.js` 实际注册方式为准）。主动迁移**不在本次范围**。

### ② MenuManager 的 `context.items`

- **现状**：`src/modules/itemPane.ts` `registerContextMenu()` 注册 `target: "main/library/item"`，`onCommand` 读 `context.items?.[0]`。
- **Zotero 10 变化**：`main/library/item` 与 `main/library/collection` 上下文的 `collectionTreeRow` 属性**读取时抛错**（改用 `collectionTreeRows`）。`context.items` 未在移除之列。
- **核对动作**：冒烟——条目列表右键 → 本插件菜单项「翻译摘要」能正常取到当前条目并翻译。
- **判定**：本插件不读 `collectionTreeRow`，预计无碍；仅当右键菜单不出现或 `context.items` 为空时，查 Zotero 10 `MenuManager` 实际 context 字段并适配。

### ③ 阅读器划选 `renderTextSelectionPopup` 的 annotation 字段

- **现状**：`src/modules/reader.ts` 读 `params.annotation.text`、`.position.pageIndex`、`.sortIndex`、`.pageLabel`；`sections.ts` 读 `reader.itemID`、`reader.navigate({pageIndex})`。
- **Zotero 10 变化**：阅读器子模块可能升级（官方 dev 页提示"reader 子模块升级可能改变 iframe 内 DOM"），但 8 种事件与 `params.annotation` 未列入 breaking 清单。
- **核对动作**：冒烟——PDF 划选 → 弹层「翻译选中内容」「加入选区」正常出现、`annotation.text` 取到选中文本、跨区域选区页码/排序正确。
- **判定**：字段缺失则按 Zotero 10 `reader` 子模块实际结构适配（`pageIndex/sortIndex/pageLabel` 是 `position` 与注释对象的字段，重点核对 `annotation` 对象形态）。

### ④ Zotero.DB 自定义表在 WAL 模式下的读写

- **现状**：`src/modules/history.ts` 用 `Zotero.DB.executeTransaction` / `queryAsync` / `rowQueryAsync` / `valueQueryAsync` 操作自定义表 `translation_history`（建表 + 索引 + 增删查）。
- **Zotero 10 变化**：WAL 模式启用（`-wal`/`-shm` 文件）；新增 `Zotero.DB.loadExtension()` / `onIdle()` / `addCorruptionHandler()`。DB API 本身未变。
- **核对动作**：冒烟——翻译一次 → 历史落库 → 侧栏历史可见 → 重启 Zotero 历史仍在 → 清空/按条目删除正常。
- **判定**：本插件走 DB API 而非直接读文件，预计无碍；若建表/查询报错，核对 Zotero 10 `Zotero.DB` 方法签名（`zotero-types@4.1.3` 应已覆盖）。

---

## 6. 验收清单（"适配完成"定义）

- [ ] `npm run build` 通过（含 `tsc --noEmit`）
- [ ] 现有 `test/` 用例全绿（`npm run test:unit` + `npm run test`）
- [ ] Zotero 10 上冒烟五项全通：
  1. **划选翻译**（PDF 划选 → 弹层翻译 → 侧栏显示）
  2. **条目翻译**（条目右键/区块按钮 → 翻译标题摘要）
  3. **历史读写**（落库 → 侧栏历史 → 重启仍在 → 删除/清空）
  4. **AI 总结**（有 LLM 渠道时流式总结 → 存历史/写笔记）
  5. **设置面板**（打开偏好面板，中/英文案正常，渠道/快捷键/清空历史可操作）

---

## 7. PLAN.md §2 决策记录（建议追加文案）

```markdown
| Q23 | Zotero 10 基线 | 双支持 `6.999 ~ 10.*`；现在适配 beta（官方：FF 140 ESR 与 9 相同，无 Mozilla 平台变更） |
| Q24 | strict_max 策略 | `strict_max_version: "10.*"`（10.x 默认放行；11+ 计划再评估）；update.json 同步 `10.*` |
| Q25 | 改动范围 | manifest + 4 风险点定向核对 + 回归，不做全量重写 |
| Q26 | 工具链 | 升级 scaffold 0.8.8 / toolkit 5.2.0 / types 4.1.3；吸收 `ZoteroToolkit` 从 `/ztoolkit` 导入的破坏变更 |
| Q27 | 本地化 | 保守核实；坏则迁移到 Zotero 10 自动注册（plugins.js registerLocales）；主动迁移列入计划 |
| Q28 | 范围外 | undo/redo、多选/viewMode、CI 的 Zotero 10 job、Zotero 11+ 再评估 —— 全部列入 v2/计划 |
```

---

## 8. 范围外 / 后续计划

- undo/redo：`saveTx({undoAction})` 接入写笔记/清历史（官方新增能力）
- 本地化主动迁移到 Zotero 10 自动注册（若 §5-① 判定仍可用则不动）
- CI 增加 Zotero 10 测试 job（等 10 GA 且 zotero-plugin 测试镜像可用）
- Zotero 11+ 的 `strict_max_version` 再评估（`"10.*"` 之外）
- 上 Zotero 官方插件市场（原 PLAN §13 v2 已有）

---

## 9. 参考资料

- 官方《Zotero 10 for Developers》：https://www.zotero.org/support/dev/zotero_10_for_developers
- 官方《Zotero 9 for Developers》（对照）：https://www.zotero.org/support/dev/zotero_9_for_developers
- Zotero 官方仓库 `10.0` 分支：https://github.com/zotero/zotero/tree/10.0
  - 插件本地化：`chrome/content/zotero/xpcom/plugins.js`（`registerLocales`）
- zotero-plugin-toolkit releases：https://github.com/windingwind/zotero-plugin-toolkit/releases （v5.2.0 破坏变更）
- zotero-types releases：https://github.com/windingwind/zotero-types/releases
- npm：`zotero-plugin-scaffold@0.8.8` / `zotero-plugin-toolkit@5.2.0` / `zotero-types@4.1.3`
