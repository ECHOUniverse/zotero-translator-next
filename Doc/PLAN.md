# ZoteroTranslatorNext —— 方案文档

> 版本：v1.0（2026-08-09）
> 状态：已通过设计评审（grilling 会话收敛），待实施
> 配套事实核查：见 [`研究事实核查.md`](./研究事实核查.md)（含全部主来源 URL）

---

## 1. 项目定位

Zotero 文献翻译插件。与 zotero-pdf-translate 的差异化：

| 差异化能力           | 说明                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| ① 规则化格式优化管线 | 翻译前对选中内容做断行合并、连字符断词修复、特殊符号正常化（确定性、零成本） |
| ② 持久化翻译历史     | 数据库表存储，支持单条/按条目/清空删除，可复用为翻译缓存                     |
| ③ AI 总结侧边栏      | 翻译内容可用 AI 流式总结，结果可入历史                                       |
| ④ 渠道自定义         | 通用 OpenAI 兼容渠道（DeepSeek 为预置模板），失败自动回退                    |
| ⑤ 丝滑体验           | 流式输出、队列+取消、划选即译（可关）、上下文感知                            |
| ⑥ 界面美观           | 卡片式现代风、跟随 Zotero 深浅主题                                           |

---

## 2. 已确认决策记录

| #   | 决策       | 结论                                                                                                                                                                                 |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | 输入源     | PDF 阅读器划选文本 + 选中条目元数据（标题/摘要）                                                                                                                                     |
| Q2  | 版本基线   | **Zotero 9 基线**；`strict_min_version: "6.999"`，`strict_max_version: "9.0.*"`，update.json 滚动放行                                                                                |
| Q3  | 必应渠道   | Edge 匿名 token 流（默认）+ Azure key 可选（双模式）                                                                                                                                 |
| Q4  | 历史存储   | `Zotero.DataAccessObject` 自定义表                                                                                                                                                   |
| Q5  | 工程形态   | windingwind/zotero-plugin-template v3.1.0（TS + toolkit + scaffold）                                                                                                                 |
| Q6  | 界面布局   | 阅读器侧栏区块（`ItemPaneManager.registerSection`）+ 条目面板区块，双布局同数据源                                                                                                    |
| Q7  | 触发与呈现 | 划选弹层/右键菜单 + 可配置快捷键；结果在侧栏显示（PDF 覆盖显示 = v2）                                                                                                                |
| Q8  | 格式化     | 纯规则管线                                                                                                                                                                           |
| Q9  | 自定义渠道 | 通用 OpenAI 兼容渠道，DeepSeek 为预置模板                                                                                                                                            |
| Q10 | 总结       | 复用当前 AI 渠道、模型/提示词可覆盖、流式显示、可入历史                                                                                                                              |
| Q11 | 定位       | 功能差异化替代品（格式化/历史/总结/自定义渠道做深做透）                                                                                                                              |
| Q12 | 设置       | 官方偏好面板为主 + 侧栏简版设置                                                                                                                                                      |
| Q13 | 历史容量   | 500 条上限自动清理；单条/按条目/清空删除；缓存复用默认开                                                                                                                             |
| Q14 | 失败处理   | 按配置顺序自动回退 + 失败提示 + 手动重试                                                                                                                                             |
| Q15 | 丝滑体验   | 流式 + 队列/取消 + 划选即译(默认关,防抖) + 上下文感知，全做                                                                                                                          |
| Q16 | 界面风格   | 卡片式现代风，跟随 Zotero 深浅主题                                                                                                                                                   |
| Q17 | 发布       | 自用为主 + GitHub release（update.json 自动更新）                                                                                                                                    |
| Q18 | 文本选取   | 区块全部内容区显式 `user-select: text`（Zotero 7 默认允许选取，显式声明防回归；流式期间选区会被刷新冲掉，属预期）                                                                    |
| Q19 | 历史范围   | 侧栏历史**只显示当前文章**（按 `itemID` 过滤，无当前条目时显示空态，绝不回退全局）；每篇上限 20 条                                                                                   |
| Q20 | 当前/历史  | 分区标题+分隔线（「当前翻译」/「翻译历史」）；结果卡片**按条目隔离**（切换条目清空）；历史中与当前任务精确匹配（sourceHash+engine+targetLang）的记录标「当前」徽标                   |
| Q21 | 全部历史   | 独立窗口（`content/history.xhtml`）浏览全部历史：打开默认当前文章 tab，顶部横向滚动文章 tab 条 + 「未关联条目」tab，全量显示，操作与侧栏一致；标题栏提供「清空本条」「查看全部」入口 |
| Q22 | 任务 itemID 语义 | 翻译任务 itemID 一律用**逻辑条目 id**（附件→父条目，`logicalItemID` 归一化）：阅读器 tab 中区块 ctx.itemID 为父条目（Zotero contextPane 提升），任务若落附件 id 会触发条目隔离显示空态（v0.4.0 回归，v0.4.1 修复）。排查经验见 [`问题排查-阅读器翻译无动作.md`](./问题排查-阅读器翻译无动作.md) |
| Q23 | Zotero 10 基线 | 双支持 `6.999 ~ 10.*`；现在适配 beta（官方：FF 140 ESR 与 9 相同，无 Mozilla 平台变更） |
| Q24 | strict_max 策略 | `strict_max_version: "10.*"`（10.x 默认放行；11+ 计划再评估）；update.json 同步 `10.*` |
| Q25 | 改动范围 | manifest + 4 风险点定向核对 + 回归，不做全量重写 |
| Q26 | 工具链 | 升级 scaffold 0.8.8 / toolkit 5.2.0 / types 4.1.3；吸收 `ZoteroToolkit` 从 `/ztoolkit` 导入的破坏变更 |
| Q27 | 本地化 | 保守核实；坏则迁移到 Zotero 10 自动注册（plugins.js registerLocales）；主动迁移列入计划 |
| Q28 | 范围外 | undo/redo、多选/viewMode、CI 的 Zotero 10 job、Zotero 11+ 再评估 —— 全部列入 v2/计划 |

假设（无异议即生效）：快捷键默认 `Cmd/Ctrl+Shift+T` 翻译、`Cmd/Ctrl+Shift+S` 总结（可配置）；界面中英双语（Fluent）；原文语言自动检测 + 手动覆盖；默认目标语言中文（zh-CN）。

---

## 3. 技术基线

- **Zotero**：9.x 主测（8.x 兼容回归），manifest 兼容 6.999+
- **工程**：zotero-plugin-template v3.1.0 派生（TypeScript 5.9、esbuild 构建、zotero-plugin-toolkit 5.x、zotero-plugin-scaffold 0.8.x）
- **构建/发布**：`npm run serve`（热重载开发）、`npm run build`、`npm run release`（bumpp 版本 + update.json + GitHub release + .xpi）
- **插件元信息**（占位，实施时替换）：
  - 插件名：`ZoteroTranslatorNext`（名称 `zotero-translator-next`）
  - pluginID：`zotero-translator-next@<你的域名>`（决定 prefs 键前缀 `extensions.zotero.zotero-translator-next.*`）
  - manifest：WebExtension 风格 `manifest_version: 2` + `applications.zotero`
- **Zotero 8 规避项**（模板/toolkit 已处理，开发时注意）：JSM→ESM、Bluebird 移除、`Zotero.spawn()` 删除、偏好面板脚本独立 global scope（跨 pane 共享变量须显式挂 `window`）

---

## 4. 总体架构

```
┌──────────────────────────── ZoteroTranslatorNext ────────────────────────────┐
│                                                                              │
│  输入层                管线层                   渠道层                 历史层 │
│  ┌──────────┐   ┌───────────────┐   ┌──────────────────┐   ┌─────────────┐  │
│  │ 划选文本  │──▶│ ① 格式化(规则) │──▶│ BingService       │   │ translation_│  │
│  │ (reader  │   │ ② 语言检测     │   │  ├ Edge token 流  │   │  history 表 │  │
│  │  弹层事件)│   │ ③ 分块        │   │  └ Azure key 模式 │──▶│ (DAO)       │  │
│  │ 条目元数据│   │ ④ 缓存命中检查 │   │ OpenAIService     │   │  缓存复用    │  │
│  │ (条目面板)│   │ ⑤ 翻译调度     │   │  ├ DeepSeek 预置  │   │  容量清理    │  │
│  └──────────┘   │   队列/取消    │   │  └ 自定义渠道     │   └─────────────┘  │
│                 └───────┬───────┘   │  回退链           │                     │
│                         │ 流式输出   └──────────────────┘                     │
│                         ▼                                                    │
│  ┌──────────────────────────────────────────────┐                            │
│  │ UI 层：阅读器侧栏区块 / 条目面板区块 / 偏好面板 │◀── 总结功能(复用AI渠道)      │
│  └──────────────────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 源码目录结构（template 派生后）

```
ZoteroTranslatorNext/
├─ manifest.json                 # 插件清单（兼容 6.999+）
├─ prefs.js                      # 默认偏好
├─ src/
│  ├─ addon.ts                   # 入口：生命周期、模块装配
│  ├─ prefs.ts                   # Zotero.Prefs 封装（类型化）
│  ├─ modules/
│  │  ├─ formatter.ts            # 规则化格式化管线（纯函数，可单测）
│  │  ├─ lang.ts                 # 语言检测/目标语言
│  │  ├─ chunker.ts              # 分块策略
│  │  ├─ tasks.ts                # 翻译队列 + 取消 + 状态机
│  │  ├─ history.ts              # DataAccessObject + 缓存查询
│  │  ├─ summary.ts              # AI 总结
│  │  ├─ reader.ts               # 阅读器区块 + 划选弹层 + 快捷键
│  │  ├─ itemPane.ts             # 条目面板区块
│  │  └─ settings.ts             # 偏好面板桥接
│  ├─ services/
│  │  ├─ base.ts                 # TranslateService 抽象接口
│  │  ├─ bing.ts                 # 必应（Edge token 流 / Azure key）
│  │  ├─ openai.ts               # OpenAI 兼容（DeepSeek + 自定义）
│  │  └─ index.ts                # 注册表 + 回退链
│  ├─ ui/
│  │  ├─ readerSection.xhtml     # 阅读器侧栏区块
│  │  ├─ itemPaneSection.xhtml   # 条目面板区块
│  │  ├─ summaryWindow.xhtml     # 总结窗口
│  │  └─ style.css               # 卡片式主题（跟随深浅色）
│  └─ locale/                    # Fluent：zh-CN / en-US
└─ zotero-plugin.config.ts
```

---

## 5. 数据模型

`Zotero.DataAccessObject.register("translationHistory", ...)`，启动时建表（`Zotero.DB` migration）。

> **实施偏差（已在代码注释记录）**：`Zotero.DataAccessObject` 在 zotero-types 类型与 Zotero 9 源码中均不可验证，实施改用官方稳定且有类型的 `Zotero.DB`（`executeTransaction`/`queryAsync`/`rowQueryAsync`）直接建表与增删查，同样满足“数据库自定义表 + 缓存复用 + 容量清理”意图。

```sql
CREATE TABLE translation_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  itemID        INTEGER,             -- 关联条目（划选翻译可为空）
  sourceHash    TEXT NOT NULL,       -- SHA-256(原文)，缓存查询索引
  sourceText    TEXT NOT NULL,
  formattedText TEXT,                -- 格式化后文本（三段对照用）
  translatedText TEXT NOT NULL,
  summary       TEXT,                -- AI 总结（可空）
  sourceLang    TEXT DEFAULT 'auto',
  targetLang    TEXT DEFAULT 'zh-CN',
  engine        TEXT NOT NULL,       -- 渠道 id
  createdAt     INTEGER NOT NULL
);

CREATE INDEX idx_history_item   ON translation_history (itemID);
CREATE INDEX idx_history_created ON translation_history (createdAt);
CREATE INDEX idx_history_cache  ON translation_history (engine, targetLang, sourceHash);
```

**缓存策略**：查询 `(sourceHash, targetLang, engine)` 精确命中 → 直接返回历史译文（标记 `fromCache`）。`sourceHash` = **格式化后文本**的 FNV-1a64（实现偏差：方案原写 SHA-256，Zotero 旧环境无 WebCrypto，改用同步 FNV-1a64，见 `src/utils/hash.ts` 注释）。默认开启，设置可关。
**容量**：默认 500 条，超限清理最旧（`createdAt ASC` 裁剪）；上限可配置。
**删除粒度**：单条 / 按条目（itemID）/ 清空全部（设置面板含清空按钮）。

---

## 6. 渠道层设计

### 6.1 抽象接口

```ts
interface TranslateTask {
  id: string;
  sourceText: string; // 格式化后的文本
  context?: string; // 前后文（仅 LLM 渠道使用）
  sourceLang: string; // 'auto' 或具体语言码
  targetLang: string; // 默认 'zh-CN'
  channelId: string; // 目标渠道
  signal?: AbortSignal; // 取消
}

interface TranslateResult {
  text: string;
  detectedLang?: string;
  fromCache?: boolean;
}

abstract class TranslateService {
  readonly id: string; // 如 'bing' / 'deepseek' / 自定义 id
  readonly name: string;
  readonly kind: "rule" | "llm"; // llm 渠道启用上下文感知与总结
  readonly supportsStreaming: boolean;
  abstract translate(
    task: TranslateTask,
    onChunk?: (t: string) => void,
  ): Promise<TranslateResult>;
}
```

### 6.2 必应渠道（BingService，默认）

双模式（设置切换）：

1. **Edge 匿名模式（默认，无需 key）**
   - `GET https://edge.microsoft.com/translate/auth` → Bearer token（缓存约 5 分钟）
   - `POST https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=...&to=...`
     - 头：`Authorization: Bearer <token>`
     - 体：`[{ Text: "<分块文本>" }]`
   - ⚠️ 未文档化内部端点：可能 401/429/验证码/失效 → 失败走回退链（见 6.5）
2. **Azure key 模式（官方，F0 免费层 2M 字符/月）**
   - `POST https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=...`
   - 头：`Ocp-Apim-Subscription-Key`（+ `Ocp-Apim-Subscription-Region` 如适用）
   - 单请求上限 50,000 字符

语言：`from` 省略或 `auto-detect` 自动检测；流式：按句块逐块回流（`includeSentenceLength` 可用时按句切，否则按分块粒度回流）。

### 6.3 OpenAI 兼容渠道（OpenAIService）

- `POST {baseURL}/chat/completions`，`stream: true`（SSE 逐字解析，`AbortController` 取消）
- 消息模板：
  - system：翻译提示词（可配置，变量 `{sourceLang}` `{targetLang}`）
  - user：`{context 段落}\n\n待翻译内容：{sourceText}`（上下文感知：LLM 渠道默认附前后文 ±一段落，设置可关）
- **DeepSeek 预置模板**：`baseURL=https://api.deepseek.com`、`model=deepseek-chat`、默认翻译提示词
- **自定义渠道**：名称 / baseURL / API key / 模型 / 翻译提示词，全部用户配置，可增删多个

### 6.4 分块策略

- 按段落 → 句子边界切分；规则渠道单块 ≤ 10,000 字符（保守，远低于 Azure 50k 上限）
- LLM 渠道按估算 token 窗口分块（默认按 8k tokens/块，可配置）
- 逐块翻译 → 顺序拼接回流；任一块失败 → 整任务失败 → 回退链

### 6.5 回退链与失败处理

- 渠道列表在设置中**可拖拽排序** = 回退顺序，含启用开关
- 失败判定：HTTP 4xx/5xx、超时（默认 30s，可配）、网络错误、解析失败
- 当前渠道失败 → 自动尝试下一个已启用渠道 → 全部失败 → 侧栏错误提示 + **重试按钮**（重试 = 重新走完整回退链）
- 429/限流：指数退避（1s→2s→4s，最多 3 次）后仍失败才回退

---

## 7. 格式化管线（规则化，纯函数）

处理顺序（各规则可单独开关）：

| 阶段 | 规则                | 示例                                                         |
| ---- | ------------------- | ------------------------------------------------------------ |
| 1    | 合并硬换行          | 行尾无标点且下一个小写字母开头 → 合并为空格                  |
| 2    | 修复连字符断词      | `word-⏎word` → `wordword`（英文）；保留真实连字符            |
| 3    | 统一引号            | 英文弯引号/«» 规范化为成对中文引号（面向 zh 时）；孤引号修复 |
| 4    | 破折号/连字符正常化 | `--`/`–` → 统一为 `—`（按语境）；`-` 保留                    |
| 5    | 全半角统一          | 标点按语言语境归一（保留代码/URL/数学公式不破坏）            |
| 6    | 压缩空白            | 多空格/空行 → 单；去除零宽字符（U+200B 等）、BOM             |
| 7    | 数学/特殊符号       | `×`/`−`/`·` 等规范化；上标/下标 Unicode 保留                 |

**保护清单**：URL、DOI、邮箱、代码片段、LaTeX 公式、文献引用标记 `[12]` 等不参与规则改写。
输出 `formattedText` 入历史，UI 提供"原文 / 格式化 / 译文"三段对照。管线为纯函数，配 mocha 单测（模板自带测试链）。

---

## 8. 输入与触发

| 入口       | 实现                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF 划选   | `Zotero.Reader.registerEventListener("renderTextSelectionPopup", ...)` 取 `params.annotation.text`，注入自定义弹层按钮（"翻译选中内容"）；备用：toolkit `ReaderTool.getSelectedText(reader)` |
| 右键菜单   | 阅读器场景同上（自定义弹层）；Zotero 8+ 可增补 `Zotero.MenuManager.registerMenu` 注册原生右键项                                                                                              |
| 快捷键     | 主窗口 + 阅读器窗口 `keydown` 监听（无官方快捷键 API），默认 `Cmd/Ctrl+Shift+T` 翻译、`Cmd/Ctrl+Shift+S` 总结；忽略输入框/编辑态焦点；防冲突（设置可改/可关）                                |
| 划选即译   | 划选后自动翻译（默认关），防抖（默认 800ms，可配）                                                                                                                                           |
| 条目元数据 | 条目面板区块按钮：翻译标题/摘要 → 走同一管线 → 历史关联 `itemID`                                                                                                                             |

**队列**：`tasks.ts` 单消费者队列（FIFO），任务状态机 `waiting → processing → success/fail/cancelled`，侧栏实时显示进度；当前任务可取消；连续划选自动入队。

---

## 9. UI 设计

### 9.1 阅读器侧栏区块（`ItemPaneManager.registerSection`）

- 头部：渠道快捷切换（下拉）、目标语言快捷切换
- 分区标题 + 分隔线（「当前翻译」/「翻译历史」），历史标题栏右侧：「清空本条」「查看全部历史」
- 翻译结果卡片：译文（流式光标）、渠道彩色标识、检测语言、一键复制、重试/取消；**按条目隔离**（任务属于其他条目时显示空态）
- 三段对照（原文/格式化/译文，可折叠）
- **总结按钮 + 总结窗口**：复用当前 AI 渠道，模型/提示词可覆盖，SSE 流式显示，可"存入历史"
- 全部内容区显式 `user-select: text`（译文/对照/历史/总结均可手动选取）
- 历史列表（**只显示当前文献**，按 `itemID` 过滤，上限 20 条）：时间/渠道/译文摘要、「当前」徽标（与结果卡片精确匹配）、单条删除、内联总结

### 9.2 条目面板区块

- 选中条目摘要翻译按钮 + 该条目历史 + **「查看全部历史」独立窗口**（默认停在当前条目 tab，横向滚动文章 tab 条 + 「未关联条目」tab，已删除条目标「(已删除)」，全量显示，操作与侧栏一致）

### 9.3 风格（卡片式现代风）

- 跟随 Zotero 深浅色主题（`prefers-color-scheme` / toolkit 样式注入）
- 卡片圆角+阴影、渠道彩色徽章、空态插画/文案、加载骨架屏、复制按钮 hover 态
- 中英双语（Fluent：`src/locale/zh-CN.ftl`、`en-US.ftl`）

### 9.4 设置

- **官方偏好面板**（`Zotero.PreferencePanes.register`）：
  - 渠道管理：列表（启用开关 + 拖拽排序 = 回退顺序）、Bing 模式（Edge/Azure key+region）、DeepSeek（key/baseURL/model/提示词）、自定义渠道增删（名称/baseURL/key/model/提示词）
  - 翻译：目标语言（默认 zh-CN）、源语言（auto/手动）、超时、分块大小
  - 格式化：各规则开关
  - 历史：容量上限、清空全部（二次确认）
  - 快捷键：翻译/总结自定义
  - 缓存开关、划选即译开关 + 防抖毫秒
  - 隐私提示：key 明文存于 profile prefs.js、文本发送至第三方服务
- **侧栏简版设置**：渠道/目标语言/快捷键快捷入口
- 注意（Zotero 8+）：偏好面板脚本独立 global scope

---

## 10. 总结功能

- 入口：阅读器侧栏区块"总结"按钮；输入 = 最近一次翻译的 `translatedText`（或历史条目的译文）
- 渠道：复用当前启用的 AI（LLM）渠道；模型、总结提示词（如"概括研究结论、方法、贡献"）可独立覆盖
- 展示：总结窗口内 SSE 流式显示；"存入历史"写入 `translation_history.summary`；可重新生成
- 无可用 AI 渠道时按钮禁用并提示配置

---

## 11. 里程碑（M1–M6）

| 里程碑                | 内容                                                                                | 验收                             |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------------------- |
| **M1 脚手架**         | template 派生、manifest/prefs.js/pluginID 落地、骨架加载、两个区块占位渲染          | 9.x 启动无报错，区块可见         |
| **M2 输入+格式化**    | 划选弹层取文本、条目摘要入口、格式化管线 + 单测                                     | 选中→弹层→格式化结果正确         |
| **M3 必应渠道**       | **Edge 端点实测**（gap 项：401/429/验证码表现）→ BingService 双模式、队列/取消/进度 | 划选→翻译→侧栏显示               |
| **M4 历史**           | DAO 建表、增删查、缓存命中、容量清理、三段对照                                      | 历史持久/可删/缓存生效           |
| **M5 AI 渠道**        | DeepSeek 预置、自定义 OpenAI 渠道、流式、上下文感知、回退链                         | 多渠道切换/回退/流式正常         |
| **M6 总结+打磨+发布** | 总结窗口、设置面板、快捷键、i18n、卡片式美化、GitHub release                        | 全功能可用，update.json 更新链通 |

**M1–M6 每步结束打 tag**，release 走模板工作流。

---

## 12. 风险与对策

| 风险                                                                                     | 对策                                                                  |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Edge 端点可用性无 SLA（可能 401/429/验证码/失效）                                        | M3 首日实测；双模式 + 回退链兜底；设置引导用户填 Azure key            |
| 未文档化端点行为变化                                                                     | 抽象 `TranslateService` 隔离；只改 bing.ts                            |
| Zotero 9 的 ItemPaneManager 选项集与 7 有差异（`sectionButtons`/`onAsyncRender` 为后加） | 实施前对照 9.0 分支源码核对签名；以 9 为基线                          |
| Zotero 快速发版节奏（10/11 分支已存在）                                                  | 严守 `strict_max_version` 实测声明 + update.json 滚动放行；发布前回归 |
| API key 明文存储（Zotero 无加密 API）                                                    | 设置面板隐私提示；key 只在内存/请求头使用                             |
| 快捷键冲突（Zotero 内置/其他插件）                                                       | 默认组合选冷门键位；全可配置可关                                      |
| 自定义表与 Zotero 升级兼容                                                               | DAO + migration 版本化管理，升级时 `db.version` 迁移                  |
| 超长文本/多段落                                                                          | 分块 + 队列 + 取消；流式缓解等待感                                    |

---

## 13. v2 排期（不做入 v1）

- PDF 内覆盖显示译文（zotero-pdf-translate 式，复杂渲染）
- 译文写入条目 Extra 字段（`titleTranslation`/`abstractTranslation`，跨设备可见）
- 上 Zotero 官方插件市场
- 更多内置渠道（DeepL/Google/本地 Ollama 预置等）
- 历史导出（JSON/Markdown）

---

## 14. 实施首步（M1）

1. 在仓库根以 zotero-plugin-template v3.1.0 为模板初始化（保留现有 `.git`）
2. 占位 pluginID / 插件名替换为 `zotero-translator-next` + 自有域名
3. 对照 Zotero 9.0 分支核对 `ItemPaneManager.registerSection` 与 `Reader.registerEventListener` 签名
4. 骨架加载 + 双区块占位 → 提交 M1 tag
