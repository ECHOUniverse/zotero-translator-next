// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // We disable this rule here because the template
        // contains some unused examples and variables
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
    {
      // 图标生成脚本运行在 Node 环境
      files: ["scripts/**/*.mjs"],
      languageOptions: {
        globals: {
          console: "readonly",
          process: "readonly",
          globalThis: "readonly",
        },
      },
    },
  ],
});
