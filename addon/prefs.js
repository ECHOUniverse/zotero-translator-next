// ZoteroTranslatorNext 默认偏好（键自动加 extensions.zotero.zotero-translator-next. 前缀）
pref("enable", true);

// 翻译
pref("targetLang", "zh-CN");
pref("sourceLang", "auto");
pref("translate.timeout", 30000);
pref("translate.chunkMaxChars", 10000);
pref("translate.autoOnSelect", false);
pref("translate.autoDebounceMs", 800);
pref("translate.contextAware", true);

// 历史与缓存
pref("cacheEnabled", true);
pref("historyCapacity", 500);

// 渠道
pref("mymemory.enabled", true);
pref("bing.enabled", true);
pref("bing.mode", "azure"); // Edge 匿名端点已关闭（2026），仅 Azure key 模式
pref("bing.azureKey", "");
pref("bing.azureRegion", "");
pref("deepseek.enabled", true);
pref("deepseek.apiKey", "");
pref("deepseek.baseURL", "https://api.deepseek.com");
pref("deepseek.model", "deepseek-v4-flash");
pref(
  "deepseek.prompt",
  "You are a professional academic translator. Translate the user-provided text from {sourceLang} into {targetLang}. Keep technical terms accurate, preserve citation markers, formulas and formatting. Output only the translation.",
);
pref("channelsOrder", '["mymemory","deepseek","bing"]');
pref("customChannels", "[]");

// 快捷键（JSON: {ctrl,shift,alt,meta,key}）
pref("shortcut.translate", '{"ctrl":true,"shift":true,"key":"T"}');
pref("shortcut.summary", '{"ctrl":true,"shift":true,"key":"S"}');

// 总结
pref("summary.lang", "auto"); // auto = 跟随翻译目标语言
pref("summary.model", "");
pref(
  "summary.prompt",
  "你是理工科文献阅读助手。输入通常是学术文献中的一个片段（方法、实验、结果或讨论的选段译文）。请用 {targetLang} 总结这段文字：\n- 第一行：一句话点明本段核心（做了什么 / 得到什么结果）。\n- 随后按片段实际内容列 3–5 条要点，优先涵盖：方法或算法、实验条件与关键参数、重要数据或性能指标、结论或启示；片段没有的维度直接省略，不要硬凑。\n- 保留关键数字、单位与专业术语；只依据给定文本，不编造、不补充外部知识。\n控制在 200 字以内。",
);

// 显示
pref("display.markdown", true);

// 格式化规则开关
pref("formatter.mergeLineBreaks", true);
pref("formatter.fixHyphenation", true);
pref("formatter.normalizeQuotes", true);
pref("formatter.normalizeDashes", true);
pref("formatter.normalizeWidth", true);
pref("formatter.collapseWhitespace", true);
pref("formatter.normalizeSymbols", true);
