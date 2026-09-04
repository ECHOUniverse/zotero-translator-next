# ZoteroTranslatorNext preferences strings

pref-title = ZoteroTranslatorNext
pref-tab-general =
    .label = General
pref-tab-translate =
    .label = Translation
pref-tab-channels =
    .label = Channels
pref-tab-summary =
    .label = Summary
pref-translate-title = Language & behavior
pref-enable =
    .label = Enable plugin
pref-target-lang = Target language
pref-source-lang = Source language
pref-source-lang-auto = Auto detect
pref-lang-custom = Custom…
pref-timeout = Timeout (ms)
pref-chunk-size = Chunk size (chars)
pref-auto-on-select =
    .label = Auto-translate on selection (off by default)
pref-auto-debounce = Selection debounce (ms)
pref-context-aware =
    .label = Attach context for LLM channels

pref-channels-title = Channels & fallback order
pref-channels-order-hint = Check to enable; ↑ raises priority. Channels without a key are skipped.
pref-bing-section = Bing (Azure)
pref-azure-key = Azure key
pref-azure-region = Region (e.g. global / eastasia)
pref-deepseek-section = DeepSeek
pref-deepseek-key = API Key
pref-deepseek-baseurl = Base URL
pref-deepseek-baseurl-hint = Official OpenAI-compatible URL is https://api.deepseek.com (do not append /v1)
pref-deepseek-model = Model
pref-deepseek-model-custom = Custom…
pref-deepseek-fetch-models = Fetch models
pref-deepseek-fetch-balance = Check balance
pref-deepseek-key-required = Please enter an API Key first
pref-deepseek-status-loading = Requesting…
pref-deepseek-fetch-error = Request failed: { $message }
pref-deepseek-balance-line = { $currency } { $total } (granted { $granted } / topped up { $topped })
pref-deepseek-balance-unavailable = Balance is insufficient; API calls may fail
pref-deepseek-legacy-hint = Current model { $model } is a legacy alias. Switch to deepseek-v4-flash or deepseek-v4-pro.

pref-custom-channels-title = Custom OpenAI-compatible channels
pref-add-channel = Add
pref-privacy-hint = Note: API keys are stored in plain text in the Zotero profile prefs.js; text to translate is sent to the corresponding service.

pref-shortcuts-title = Shortcuts (click a field, then press keys)
pref-shortcut-translate = Translate
pref-shortcut-summary = Summary

pref-summary-title = Summary
pref-summary-lang = Summary language
pref-summary-lang-auto = Follow target language
pref-summary-lang-custom = Custom…
pref-summary-model = Summary model
pref-summary-model-hint = Leave empty to use the current LLM channel's default model
pref-summary-prompt = Summary prompt
pref-summary-prompt-hint = Leave empty for the default paragraph-level template (one-line takeaway + 3–5 bullets, tuned for STEM literature, keeps numbers and terms); {targetLang} is replaced with the actual language name

pref-display-title = Display
pref-display-markdown =
    .label = Markdown rendering in content panes
    .tooltiptext = Render headings, lists, bold, and other simple Markdown in the sidebar and history window

pref-format-title = Formatting rules
pref-fmt-merge =
    .label = Merge hard line breaks
pref-fmt-hyphen =
    .label = Fix hyphenated word breaks
pref-fmt-quotes =
    .label = Normalize quotes
pref-fmt-dashes =
    .label = Normalize dashes
pref-fmt-width =
    .label = Full/half-width normalization
pref-fmt-space =
    .label = Collapse whitespace
pref-fmt-symbols =
    .label = Normalize math symbols

pref-history-title = History & cache
pref-cache-enabled =
    .label = Enable cache reuse
pref-history-capacity = Capacity (entries)
pref-clear-history = Clear all history
