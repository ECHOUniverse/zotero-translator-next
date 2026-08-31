# ZoteroTranslatorNext preferences strings

pref-title = ZoteroTranslatorNext
pref-tab-general =
    .label = 通用
pref-tab-translate =
    .label = 翻译
pref-tab-channels =
    .label = 渠道
pref-tab-summary =
    .label = 总结
pref-translate-title = 语言与行为
pref-enable =
    .label = 启用插件
pref-target-lang = 目标语言
pref-source-lang = 源语言
pref-source-lang-auto = 自动检测
pref-lang-custom = 自定义…
pref-timeout = 超时（毫秒）
pref-chunk-size = 分块大小（字符）
pref-auto-on-select =
    .label = 划选即译（默认关闭）
pref-auto-debounce = 划选防抖（毫秒）
pref-context-aware =
    .label = LLM 渠道附加上下文

pref-channels-title = 渠道与回退顺序
pref-channels-order-hint = 勾选启用；↑ 提高优先级。未配置 key 的渠道会被跳过。
pref-bing-section = 必应（Azure）
pref-azure-key = Azure key
pref-azure-region = Region（如 global/eastasia）
pref-deepseek-section = DeepSeek
pref-deepseek-key = API Key
pref-deepseek-baseurl = Base URL
pref-deepseek-baseurl-hint = 官方 OpenAI 兼容地址为 https://api.deepseek.com（不要加 /v1）
pref-deepseek-model = 模型
pref-deepseek-model-custom = 自定义…
pref-deepseek-fetch-models = 获取模型
pref-deepseek-fetch-balance = 查询余额
pref-deepseek-key-required = 请先填写 API Key
pref-deepseek-status-loading = 正在请求…
pref-deepseek-fetch-error = 获取失败：{ $message }
pref-deepseek-balance-line = { $currency } { $total }（赠送 { $granted } / 充值 { $topped }）
pref-deepseek-balance-unavailable = 余额不足，API 可能无法调用
pref-deepseek-legacy-hint = 当前模型 { $model } 为旧版别名，建议改用 deepseek-v4-flash 或 deepseek-v4-pro

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

pref-display-title = 显示
pref-display-markdown =
    .label = 内容区 Markdown 渲染
    .tooltiptext = 在侧栏与历史窗口中渲染标题、列表、粗体等简单 Markdown 语法

pref-format-title = 格式化规则
pref-fmt-merge =
    .label = 合并硬换行
pref-fmt-hyphen =
    .label = 修复连字符断词
pref-fmt-quotes =
    .label = 统一引号
pref-fmt-dashes =
    .label = 破折号正常化
pref-fmt-width =
    .label = 全半角统一
pref-fmt-space =
    .label = 压缩空白
pref-fmt-symbols =
    .label = 数学符号正常化

pref-history-title = 历史与缓存
pref-cache-enabled =
    .label = 启用缓存复用
pref-history-capacity = 容量上限（条）
pref-clear-history = 清空全部历史
