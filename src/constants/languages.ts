/** 工具栏与设置面板共用的目标语言列表 */
export const TARGET_LANGUAGES = [
  ["zh-CN", "中文（简体）"],
  ["zh-TW", "中文（繁體）"],
  ["en", "English"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["ru", "Русский"],
  ["es", "Español"],
] as const;

export const TARGET_LANGUAGE_CODES: readonly string[] = TARGET_LANGUAGES.map(
  ([code]) => code,
);

export const SOURCE_LANGUAGE_CODES: readonly string[] = [
  "auto",
  ...TARGET_LANGUAGE_CODES,
];

export function languageLabel(code: string): string | undefined {
  return TARGET_LANGUAGES.find(([c]) => c === code)?.[1];
}
