import { expect } from "chai";
import { QwenMtService, toQwenMtLang } from "../../src/services/qwenmt";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("QwenMtService", function () {
  let originalFetch: typeof fetch;
  let store: Record<string, string | number | boolean>;

  beforeEach(function () {
    originalFetch = globalThis.fetch;
    store = {
      [`${PREFIX}qwenmt.enabled`]: true,
      [`${PREFIX}qwenmt.apiKey`]: "",
      [`${PREFIX}qwenmt.baseURL`]:
        "https://dashscope.aliyuncs.com/compatible-mode",
      [`${PREFIX}qwenmt.model`]: "qwen-mt-flash",
      [`${PREFIX}qwenmt.domains`]: "",
      [`${PREFIX}translate.timeout`]: 30000,
    };
    (globalThis as unknown as { Zotero: unknown }).Zotero = {
      Prefs: {
        get: (key: string) => store[key],
        set: (key: string, value: string | number | boolean) => {
          store[key] = value;
        },
      },
    };
  });

  afterEach(function () {
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { Zotero?: unknown }).Zotero;
  });

  function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return handler(url, init);
    }) as typeof fetch;
  }

  function makeTask(overrides?: Partial<TranslateTask>): TranslateTask {
    return {
      id: "t1",
      sourceText: "Hello",
      sourceLang: "en",
      targetLang: "zh-CN",
      channelId: "qwenmt",
      token: createCancelToken(),
      ...overrides,
    };
  }

  it("kind 为 rule（不可用于 AI 总结）", function () {
    expect(new QwenMtService().kind).to.equal("rule");
  });

  it("toQwenMtLang 映射为英文全称", function () {
    expect(toQwenMtLang("zh-CN")).to.equal("Chinese");
    expect(toQwenMtLang("en")).to.equal("English");
    expect(toQwenMtLang("auto")).to.equal("auto");
  });

  it("请求体含 translation_options", async function () {
    store[`${PREFIX}qwenmt.apiKey`] = "sk-test";
    mockFetch((url, init) => {
      expect(url).to.include("/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.translation_options.target_lang).to.equal("Chinese");
      expect(body.model).to.equal("qwen-mt-flash");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "你好" } }],
        }),
        { status: 200 },
      );
    });
    const result = await new QwenMtService().translate(makeTask());
    expect(result.text).to.equal("你好");
  });
});
