# ZoteroTranslatorNext

Zotero 文献翻译插件：**格式优化 + 多渠道翻译 + 翻译历史 + AI 总结**。

## 功能

- **划选即译**：PDF 阅读器中选中文本 → 弹层「翻译」按钮 / 快捷键（默认 `Cmd/Ctrl+Shift+T`）→ 译文显示在侧栏
- **规则化格式化管线**：断行合并、连字符断词修复、引号/破折号/全半角/特殊符号正常化（每项可开关，原文/格式化/译文三段对照）
- **多渠道翻译**：必应（默认免费，Edge 匿名模式或 Azure key 双模式）+ DeepSeek + 自定义 OpenAI 兼容渠道；失败自动按序回退
- **流式体验**：AI 渠道逐字流式输出；队列 + 取消；划选自动翻译（可关、防抖）；LLM 渠道上下文感知
- **翻译历史**：持久化到 Zotero 数据库，单条/按条目/清空删除；相同文本自动命中缓存
- **AI 总结**：对译文流式总结（复用 AI 渠道，模型/提示词可配置），结果可存入历史
- **中英双语**（Fluent），跟随 Zotero 深浅主题

## 开发

```bash
npm install
npm run start      # 热重载开发（需 Zotero 7+）
npm run build      # 构建 + 类型检查
npm run test:unit  # 纯函数单测（格式化/分块/队列/SSE）
npm run release    # 发布（GitHub release + update.json）
```

## 文档

- `Doc/PLAN.md` — 方案文档（架构、数据模型、渠道协议、里程碑）
- `Doc/研究事实核查.md` — 调研事实与主来源

## 隐私

API key 明文存储于 Zotero 配置文件（Zotero 无加密存储 API）；翻译文本将发送至所选第三方服务。

## License

AGPL-3.0
