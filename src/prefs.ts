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

/** 内置渠道 id（顺序用于迁移补全） */
export const BUILTIN_CHANNEL_IDS = [
  "mymemory",
  "youdao",
  "transmart",
  "volcengine",
  "bing",
  "google",
  "deepseek",
  "tencent",
  "baidu",
  "aliyun",
  "qwenmt",
] as const;

function mergeBuiltinChannels(order: string[]): string[] {
  const merged = [...order];
  for (const id of BUILTIN_CHANNEL_IDS) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

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
  get youdaoEnabled() {
    return get<boolean>("youdao.enabled");
  },
  set youdaoEnabled(v: boolean) {
    set("youdao.enabled", v);
  },
  get transmartEnabled() {
    return get<boolean>("transmart.enabled");
  },
  set transmartEnabled(v: boolean) {
    set("transmart.enabled", v);
  },
  get volcengineEnabled() {
    return get<boolean>("volcengine.enabled");
  },
  set volcengineEnabled(v: boolean) {
    set("volcengine.enabled", v);
  },
  get googleEnabled() {
    return get<boolean>("google.enabled");
  },
  set googleEnabled(v: boolean) {
    set("google.enabled", v);
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
  get tencentEnabled() {
    return get<boolean>("tencent.enabled");
  },
  set tencentEnabled(v: boolean) {
    set("tencent.enabled", v);
  },
  get tencentSecretId() {
    return get<string>("tencent.secretId");
  },
  set tencentSecretId(v: string) {
    set("tencent.secretId", v);
  },
  get tencentSecretKey() {
    return get<string>("tencent.secretKey");
  },
  set tencentSecretKey(v: string) {
    set("tencent.secretKey", v);
  },
  get tencentRegion() {
    return get<string>("tencent.region");
  },
  set tencentRegion(v: string) {
    set("tencent.region", v);
  },
  get baiduEnabled() {
    return get<boolean>("baidu.enabled");
  },
  set baiduEnabled(v: boolean) {
    set("baidu.enabled", v);
  },
  get baiduAppId() {
    return get<string>("baidu.appId");
  },
  set baiduAppId(v: string) {
    set("baidu.appId", v);
  },
  get baiduAppKey() {
    return get<string>("baidu.appKey");
  },
  set baiduAppKey(v: string) {
    set("baidu.appKey", v);
  },
  get baiduAction() {
    return get<string>("baidu.action");
  },
  set baiduAction(v: string) {
    set("baidu.action", v);
  },
  get aliyunEnabled() {
    return get<boolean>("aliyun.enabled");
  },
  set aliyunEnabled(v: boolean) {
    set("aliyun.enabled", v);
  },
  get aliyunAccessKeyId() {
    return get<string>("aliyun.accessKeyId");
  },
  set aliyunAccessKeyId(v: string) {
    set("aliyun.accessKeyId", v);
  },
  get aliyunAccessKeySecret() {
    return get<string>("aliyun.accessKeySecret");
  },
  set aliyunAccessKeySecret(v: string) {
    set("aliyun.accessKeySecret", v);
  },
  get aliyunEndpoint() {
    return get<string>("aliyun.endpoint");
  },
  set aliyunEndpoint(v: string) {
    set("aliyun.endpoint", v);
  },
  get aliyunAction() {
    return get<string>("aliyun.action");
  },
  set aliyunAction(v: string) {
    set("aliyun.action", v);
  },
  get aliyunScene() {
    return get<string>("aliyun.scene");
  },
  set aliyunScene(v: string) {
    set("aliyun.scene", v);
  },
  get qwenmtEnabled() {
    return get<boolean>("qwenmt.enabled");
  },
  set qwenmtEnabled(v: boolean) {
    set("qwenmt.enabled", v);
  },
  get qwenmtApiKey() {
    return get<string>("qwenmt.apiKey");
  },
  set qwenmtApiKey(v: string) {
    set("qwenmt.apiKey", v);
  },
  get qwenmtBaseURL() {
    return get<string>("qwenmt.baseURL");
  },
  set qwenmtBaseURL(v: string) {
    set("qwenmt.baseURL", v);
  },
  get qwenmtModel() {
    return get<string>("qwenmt.model");
  },
  set qwenmtModel(v: string) {
    set("qwenmt.model", v);
  },
  get qwenmtDomains() {
    return get<string>("qwenmt.domains");
  },
  set qwenmtDomains(v: string) {
    set("qwenmt.domains", v);
  },
  get channelsOrder(): string[] {
    return mergeBuiltinChannels(getJSON<string[]>("channelsOrder"));
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
  get summaryLang() {
    return get<string>("summary.lang");
  },
  set summaryLang(v: string) {
    set("summary.lang", v);
  },

  // 显示
  get markdownRender() {
    return get<boolean>("display.markdown");
  },
  set markdownRender(v: boolean) {
    set("display.markdown", v);
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
