# ZoteroTranslatorNext preferences (preferences.ftl)

pref-title = ZoteroTranslatorNext Settings

pref-channels = Translation Channels
pref-channels-order = Channel order (fallback order, comma separated, e.g. bing,deepseek,myai)
pref-bing-enabled = Enable Bing (default free channel)
pref-bing-mode = Bing mode:
pref-bing-mode-edge = Edge free (no key)
pref-bing-mode-azure = Azure key (official F0 free tier)
pref-bing-azure-key = Azure subscription key (Ocp-Apim-Subscription-Key):
pref-bing-azure-region = Azure region (e.g. eastasia, optional):
pref-deepseek-enabled = Enable DeepSeek (AI channel)
pref-deepseek-key = DeepSeek API key:
pref-deepseek-baseurl = Base URL:
pref-deepseek-model = Model:
pref-deepseek-prompt = Translation prompt (sourceLang/targetLang placeholders):
pref-custom-channels = Custom channels (OpenAI-compatible JSON array; fields: id,name,baseURL,apiKey,model,prompt):
pref-channels-validate = Validate & save custom channels

pref-translate = Translation
pref-source-lang = Source language:
pref-lang-auto = Auto-detect
pref-lang-zhcn = Simplified Chinese
pref-target-lang = Target language:
pref-timeout = Timeout (ms):
pref-chunk-max = Chunk size (chars):
pref-auto-on-select = Auto-translate on selection (debounced)
pref-auto-debounce = Auto-translate debounce (ms):
pref-context-aware = Context-aware (attach context for AI channels)

pref-history = History & Cache
pref-cache-enabled = Enable translation cache (same text returns cached result)
pref-history-capacity = History capacity (0 = unlimited):
pref-clear-history = Clear all translation history

pref-formatter = Formatting Rules
pref-fmt-merge-lines = Merge line breaks
pref-fmt-hyphen = Fix hyphenated word breaks
pref-fmt-quotes = Normalize quotes
pref-fmt-dashes = Normalize dashes
pref-fmt-width = Full/half width
pref-fmt-space = Collapse whitespace
pref-fmt-symbols = Normalize special symbols

pref-shortcuts = Shortcuts (JSON object with ctrl/shift/alt/meta/key fields)
pref-shortcut-translate = Translate selection:
pref-shortcut-summary = Summarize last translation:

pref-summary = AI Summary
pref-summary-model = Summary model (empty = channel default):
pref-summary-prompt = Summary prompt (targetLang placeholder):

pref-help = { $name } v{ $version }
pref-privacy = Privacy: API keys are stored in plaintext in the Zotero profile; translated text is sent to the selected third-party services.

prefs-history-cleared = Translation history cleared
prefs-channels-saved = Custom channels saved
