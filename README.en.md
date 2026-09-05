# ZoteroTranslatorNext

> A Zotero translation plugin: **text formatting pipeline + multi-channel translation + translation history + AI summaries**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/ECHOUniverse/zotero-translator-next?label=release)](https://github.com/ECHOUniverse/zotero-translator-next/releases/latest)
[![Zotero](https://img.shields.io/badge/Zotero-7%2F8%2F9-green)](https://www.zotero.org)

[中文](./README.md)

## Features

- **Translate selection**: select text in the PDF reader → click "Translate selection" in the popup → the translation appears in the sidebar section
- **Rule-based formatting pipeline**: automatic line-break merging, hyphenation repair, quote/dash/full-width/symbol normalization (each toggleable; deterministic and free)
- **Multi-channel with automatic fallback**: MyMemory (free, no key) → DeepSeek → Bing (Edge free mode, optional Azure official) → Tencent Cloud TMT → custom OpenAI-compatible channels; failures fall back in configured order, with exponential backoff on 429 rate limits
- **Streaming experience**: token-by-token streaming for AI channels; translation queue with cancel; auto-translate on selection (off by default, debounce adjustable); context-aware prompts for LLM channels
- **Translation history**: persisted in the Zotero database; **the sidebar shows only the current item's history** (clearly separated from the current translation by section titles, with a “current” badge on the record matching the active task) + per-record deletion / clear item history; a **“View all history” window** browses all records per item via tabs; identical text automatically hits the cache (toggleable)
- **AI summaries**: stream a summary of the translation (reuses your AI channel; model/prompt independently configurable) and optionally save it to history
- **Three-pane comparison**: original / formatted / translated (collapsible)
- **Shortcuts**: `Cmd/Ctrl+Shift+T` to translate, `Cmd/Ctrl+Shift+S` to summarize (customizable, can be disabled)
- **Bilingual UI** (Fluent zh-CN / en-US), modern card style that follows Zotero's light/dark theme

## Installation

**Requirements**: Zotero 7 / 8 / 9 (manifest compatible with `6.999 – 9.0.*`)

1. Download `zotero-translator-next.xpi` from the [Releases](https://github.com/ECHOUniverse/zotero-translator-next/releases/latest) page
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…** and select the xpi
3. After installation the plugin **auto-updates** via update.json (Help → Check for Updates)

## Quick start

1. Open any PDF, **select a passage**, and click "Translate selection" in the popup (or press `Cmd/Ctrl+Shift+T`)
2. The translation streams into the "Translate" section on the right; it is written to history automatically when done
3. Click "AI Summary" to summarize the translation and optionally save it to history

**The default channel is MyMemory** (free, no configuration needed). For more stable or high-volume translation, configure a channel in the preferences:

| Channel     | Configuration          | Notes                                                                                                                    |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| MyMemory    | none                   | Free anonymous; ≤500 chars per request (auto-chunked); daily quota                                                       |
| Bing        | none (Edge mode)       | Edge built-in translate API, free anonymous; optional Azure Key official mode                                            |
| DeepSeek    | API Key                | `https://api.deepseek.com` + `deepseek-chat`, streaming                                                                  |
| Tencent TMT | SecretId + SecretKey   | Official Machine Translation API; ~5M free chars/month ([billing](https://cloud.tencent.com/document/product/551/35017)) |
| Custom      | Base URL + Key + Model | Any OpenAI-compatible service (multiple allowed)                                                                         |

Channel order is the fallback order (adjust with ↑↓ in settings); channels without a key are skipped automatically.

## Shortcuts & settings

- Settings: **Tools → Plugins → ZoteroTranslatorNext → Preferences**
- Shortcuts: click a field and press the keys to record
- Formatting rules, history capacity, cache toggle, auto-translate on selection / debounce are all configurable

## Development

```bash
npm install
npm run start       # hot-reload development (auto-launches Zotero)
npm run build       # build xpi + type-check
npm run test:unit   # pure-function unit tests (formatting/chunking/lang/hash)
ZOTERO_PLUGIN_ZOTERO_BIN_PATH="/path/to/zotero" npm run test   # Zotero integration tests
npm run release     # publish (version bump + tag + GitHub Release + update.json)
```

Architecture: `src/modules/` (formatting/chunking/queue/history/summary), `src/services/` (channel abstraction + fallback chain), `src/ui/` (section UI built on the official `ItemPaneManager.registerSection` API).

## Privacy

- API keys are stored in plain text in the Zotero profile prefs.js (Zotero has no encrypted storage API)
- Text to translate is sent to the selected third-party service (MyMemory / Bing / DeepSeek / Tencent Cloud TMT / custom)
- History data lives only in your local Zotero database

## License

[AGPL-3.0](./LICENSE)
