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
pref("bing.enabled", true);
pref("bing.mode", "edge"); // edge | azure
pref("bing.azureKey", "");
pref("bing.azureRegion", "");
pref("deepseek.enabled", true);
pref("deepseek.apiKey", "");
pref("deepseek.baseURL", "https://api.deepseek.com");
pref("deepseek.model", "deepseek-chat");
pref(
  "deepseek.prompt",
  "You are a professional academic translator. Translate the user-provided text from {sourceLang} into {targetLang}. Keep technical terms accurate, preserve citation markers, formulas and formatting. Output only the translation."
);
pref("channelsOrder", "[\"bing\",\"deepseek\"]");
pref("customChannels", "[]");

// 快捷键（JSON: {ctrl,shift,alt,meta,key}）
pref("shortcut.translate", "{\"ctrl\":true,\"shift\":true,\"key\":\"T\"}");
pref("shortcut.summary", "{\"ctrl\":true,\"shift\":true,\"key\":\"S\"}");

// 总结
pref("summary.model", "");
pref(
  "summary.prompt",
  "You are an academic assistant. Summarize the following translated text in {targetLang}: key findings, methods and conclusions. Be concise (within 300 words)."
);

// 格式化规则开关
pref("formatter.mergeLineBreaks", true);
pref("formatter.fixHyphenation", true);
pref("formatter.normalizeQuotes", true);
pref("formatter.normalizeDashes", true);
pref("formatter.normalizeWidth", true);
pref("formatter.collapseWhitespace", true);
pref("formatter.normalizeSymbols", true);
