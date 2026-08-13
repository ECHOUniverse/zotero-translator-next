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
pref("deepseek.model", "deepseek-chat");
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
  "你是学术助理。请用 {targetLang} 对以下翻译文本进行结构化总结：\n## 研究问题\n## 研究方法\n## 主要发现\n## 结论\n## 局限（如原文提及）\n控制在 300 字以内，基于文本内容，不要编造。",
);

// 格式化规则开关
pref("formatter.mergeLineBreaks", true);
pref("formatter.fixHyphenation", true);
pref("formatter.normalizeQuotes", true);
pref("formatter.normalizeDashes", true);
pref("formatter.normalizeWidth", true);
pref("formatter.collapseWhitespace", true);
pref("formatter.normalizeSymbols", true);
