# ZoteroTranslatorNext preferences strings

pref-title = ZoteroTranslatorNext
pref-general-title = 常规
pref-enable = 启用插件
pref-target-lang = 目标语言
pref-source-lang = 源语言（auto 或语言码）
pref-timeout = 超时（毫秒）
pref-chunk-size = 分块大小（字符）
pref-auto-on-select = 划选即译（默认关闭）
pref-auto-debounce = 划选防抖（毫秒）
pref-context-aware = LLM 渠道附加上下文

pref-channels-title = 渠道与回退顺序
pref-channels-order-hint = 顺序即回退顺序（↑ 优先）。未配置 key 的渠道会被跳过。
pref-bing-enabled = 启用必应渠道（Azure key）
pref-mymemory-enabled = 启用 MyMemory 免费渠道（无需 key）
pref-azure-key = Azure key
pref-azure-region = Region（如 global/eastasia）
pref-deepseek-enabled = 启用 DeepSeek 渠道
pref-deepseek-key = API Key
pref-deepseek-baseurl = Base URL
pref-deepseek-model = 模型

pref-custom-channels-title = 自定义 OpenAI 兼容渠道
pref-add-channel = 添加
pref-privacy-hint = 注意：API Key 明文保存在 Zotero profile 的 prefs.js 中；待翻译文本会发送至对应服务。

pref-shortcuts-title = 快捷键（点击输入框后按键）
pref-shortcut-translate = 翻译
pref-shortcut-summary = 总结

pref-summary-title = 总结
pref-summary-lang = 总结语言
pref-summary-lang-auto = 跟随目标语言
pref-summary-lang-custom = 自定义…
pref-summary-model = 总结模型
pref-summary-model-hint = 留空 = 使用当前 LLM 渠道默认模型
pref-summary-prompt = 总结提示词
pref-summary-prompt-hint = 留空 = 默认结构化模板（研究问题/方法/主要发现/结论/局限）；{targetLang} 会被替换为实际语言名

pref-format-title = 格式化规则
pref-fmt-merge = 合并硬换行
pref-fmt-hyphen = 修复连字符断词
pref-fmt-quotes = 统一引号
pref-fmt-dashes = 破折号正常化
pref-fmt-width = 全半角统一
pref-fmt-space = 压缩空白
pref-fmt-symbols = 数学符号正常化

pref-history-title = 历史与缓存
pref-cache-enabled = 启用缓存复用
pref-history-capacity = 容量上限（条）
pref-clear-history = 清空全部历史
