/**
 * 类型化偏好封装。
 * 键自动加 `extensions.zotero.zotero-translator-next.` 前缀（config.prefsPrefix）。
 * @see addon/prefs.js 默认值
 */

import { config } from "../package.json";

export type { TranslateChannelId } from "./services/base";

export interface CustomChannelConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  prompt: string;
}

export interface ShortcutConfig {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

const PREFIX = config.prefsPrefix;

function get<T = string | number | boolean>(key: string): T {
  return Zotero.Prefs.get(`${PREFIX}.${key}`, true) as T;
}

function set(key: string, value: string | number | boolean): void {
  Zotero.Prefs.set(`${PREFIX}.${key}`, value, true);
}

function getJSON<T>(key: string): T {
  const raw = get<string>(key);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return [] as unknown as T;
  }
}

function setJSON(key: string, value: unknown): void {
  set(key, JSON.stringify(value));
}

export const prefs = {
  // 基础
  get enabled() {
    return get<boolean>("enable");
  },
  set enabled(v: boolean) {
    set("enable", v);
  },

  // 翻译
  get targetLang() {
    return get<string>("targetLang");
  },
  set targetLang(v: string) {
    set("targetLang", v);
  },
  get sourceLang() {
    return get<string>("sourceLang");
  },
  set sourceLang(v: string) {
    set("sourceLang", v);
  },
  get timeout() {
    return get<number>("translate.timeout");
  },
  set timeout(v: number) {
    set("translate.timeout", v);
  },
  get chunkMaxChars() {
    return get<number>("translate.chunkMaxChars");
  },
  set chunkMaxChars(v: number) {
    set("translate.chunkMaxChars", v);
  },
  get autoOnSelect() {
    return get<boolean>("translate.autoOnSelect");
  },
  set autoOnSelect(v: boolean) {
    set("translate.autoOnSelect", v);
  },
  get autoDebounceMs() {
    return get<number>("translate.autoDebounceMs");
  },
  set autoDebounceMs(v: number) {
    set("translate.autoDebounceMs", v);
  },
  get contextAware() {
    return get<boolean>("translate.contextAware");
  },
  set contextAware(v: boolean) {
    set("translate.contextAware", v);
  },

  // 历史与缓存
  get cacheEnabled() {
    return get<boolean>("cacheEnabled");
  },
  set cacheEnabled(v: boolean) {
    set("cacheEnabled", v);
  },
  get historyCapacity() {
    return get<number>("historyCapacity");
  },
  set historyCapacity(v: number) {
    set("historyCapacity", v);
  },

  // 渠道
  get mymemoryEnabled() {
    return get<boolean>("mymemory.enabled");
  },
  set mymemoryEnabled(v: boolean) {
    set("mymemory.enabled", v);
  },
  get bingEnabled() {
    return get<boolean>("bing.enabled");
  },
  set bingEnabled(v: boolean) {
    set("bing.enabled", v);
  },
  get bingMode() {
    return get<string>("bing.mode") as "edge" | "azure";
  },
  set bingMode(v: "edge" | "azure") {
    set("bing.mode", v);
  },
  get bingAzureKey() {
    return get<string>("bing.azureKey");
  },
  set bingAzureKey(v: string) {
    set("bing.azureKey", v);
  },
  get bingAzureRegion() {
    return get<string>("bing.azureRegion");
  },
  set bingAzureRegion(v: string) {
    set("bing.azureRegion", v);
  },
  get deepseekEnabled() {
    return get<boolean>("deepseek.enabled");
  },
  set deepseekEnabled(v: boolean) {
    set("deepseek.enabled", v);
  },
  get deepseekApiKey() {
    return get<string>("deepseek.apiKey");
  },
  set deepseekApiKey(v: string) {
    set("deepseek.apiKey", v);
  },
  get deepseekBaseURL() {
    return get<string>("deepseek.baseURL");
  },
  set deepseekBaseURL(v: string) {
    set("deepseek.baseURL", v);
  },
  get deepseekModel() {
    return get<string>("deepseek.model");
  },
  set deepseekModel(v: string) {
    set("deepseek.model", v);
  },
  get deepseekPrompt() {
    return get<string>("deepseek.prompt");
  },
  set deepseekPrompt(v: string) {
    set("deepseek.prompt", v);
  },
  get channelsOrder(): string[] {
    return getJSON<string[]>("channelsOrder");
  },
  set channelsOrder(v: string[]) {
    setJSON("channelsOrder", v);
  },
  get customChannels(): CustomChannelConfig[] {
    return getJSON<CustomChannelConfig[]>("customChannels");
  },
  set customChannels(v: CustomChannelConfig[]) {
    setJSON("customChannels", v);
  },

  // 快捷键
  get shortcutTranslate(): ShortcutConfig {
    return getJSON<ShortcutConfig>("shortcut.translate");
  },
  set shortcutTranslate(v: ShortcutConfig) {
    setJSON("shortcut.translate", v);
  },
  get shortcutSummary(): ShortcutConfig {
    return getJSON<ShortcutConfig>("shortcut.summary");
  },
  set shortcutSummary(v: ShortcutConfig) {
    setJSON("shortcut.summary", v);
  },

  // 总结
  get summaryModel() {
    return get<string>("summary.model");
  },
  set summaryModel(v: string) {
    set("summary.model", v);
  },
  get summaryPrompt() {
    return get<string>("summary.prompt");
  },
  set summaryPrompt(v: string) {
    set("summary.prompt", v);
  },

  // 格式化规则开关
  get formatterMergeLineBreaks() {
    return get<boolean>("formatter.mergeLineBreaks");
  },
  get formatterFixHyphenation() {
    return get<boolean>("formatter.fixHyphenation");
  },
  get formatterNormalizeQuotes() {
    return get<boolean>("formatter.normalizeQuotes");
  },
  get formatterNormalizeDashes() {
    return get<boolean>("formatter.normalizeDashes");
  },
  get formatterNormalizeWidth() {
    return get<boolean>("formatter.normalizeWidth");
  },
  get formatterCollapseWhitespace() {
    return get<boolean>("formatter.collapseWhitespace");
  },
  get formatterNormalizeSymbols() {
    return get<boolean>("formatter.normalizeSymbols");
  },
};
