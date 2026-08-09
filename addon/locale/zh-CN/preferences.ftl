# ZoteroTranslatorNext preferences (preferences.ftl)

pref-title = ZoteroTranslatorNext 设置

pref-channels = 翻译渠道
pref-channels-order = 渠道顺序（回退顺序，逗号分隔，如：bing,deepseek,myai）
pref-bing-enabled = 启用必应（默认免费渠道）
pref-bing-mode = 必应模式：
pref-bing-mode-edge = Edge 免费（无需 key）
pref-bing-mode-azure = Azure key（官方 F0 免费层）
pref-bing-azure-key = Azure 订阅密钥（Ocp-Apim-Subscription-Key）：
pref-bing-azure-region = Azure 区域（如 eastasia，可留空）：
pref-deepseek-enabled = 启用 DeepSeek（AI 渠道）
pref-deepseek-key = DeepSeek API key：
pref-deepseek-baseurl = Base URL：
pref-deepseek-model = 模型：
pref-deepseek-prompt = 翻译提示词（sourceLang/targetLang 为占位符）：
pref-custom-channels = 自定义渠道（OpenAI 兼容 JSON 数组，字段：id,name,baseURL,apiKey,model,prompt）：
pref-channels-validate = 校验并保存自定义渠道

pref-translate = 翻译
pref-source-lang = 原文语言：
pref-lang-auto = 自动检测
pref-lang-zhcn = 简体中文
pref-target-lang = 目标语言：
pref-timeout = 超时（毫秒）：
pref-chunk-max = 分块大小（字符）：
pref-auto-on-select = 划选后自动翻译（防抖）
pref-auto-debounce = 自动翻译防抖（毫秒）：
pref-context-aware = 上下文感知（AI 渠道附带上下文）

pref-history = 历史与缓存
pref-cache-enabled = 启用翻译缓存（相同文本直接返回历史结果）
pref-history-capacity = 历史容量上限（0 = 不限）：
pref-clear-history = 清空全部翻译历史

pref-formatter = 格式化规则
pref-fmt-merge-lines = 合并断行
pref-fmt-hyphen = 修复连字符断词
pref-fmt-quotes = 引号正常化
pref-fmt-dashes = 破折号正常化
pref-fmt-width = 全半角统一
pref-fmt-space = 空白压缩
pref-fmt-symbols = 特殊符号正常化

pref-shortcuts = 快捷键（JSON 对象，含 ctrl/shift/alt/meta/key 字段）
pref-shortcut-translate = 翻译选中内容：
pref-shortcut-summary = 总结最近译文：

pref-summary = AI 总结
pref-summary-model = 总结模型（留空 = 使用渠道默认）：
pref-summary-prompt = 总结提示词（targetLang 为占位符）：

pref-help = { $name } v{ $version }
pref-privacy = 隐私说明：API key 明文保存在 Zotero 配置文件中；翻译文本将发送至所选第三方服务。

prefs-history-cleared = 翻译历史已清空
prefs-channels-saved = 自定义渠道已保存
