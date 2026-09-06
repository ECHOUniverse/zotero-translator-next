import { expect } from "chai";
import {
  VolcengineService,
  toVolcengineLang,
} from "../../src/services/volcengine";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("VolcengineService", function () {
  let originalFetch: typeof fetch;

  beforeEach(function () {
    originalFetch = globalThis.fetch;
    (globalThis as unknown as { Zotero: unknown }).Zotero = {
      Prefs: {
        get: (key: string) =>
          key === `${PREFIX}translate.timeout` ? 30000 : undefined,
        set: () => {},
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
      channelId: "volcengine",
      token: createCancelToken(),
      ...overrides,
    };
  }

  it("toVolcengineLang 只取主语言码", function () {
    expect(toVolcengineLang("zh-CN")).to.equal("zh");
  });

  it("成功解析 translation 字段", async function () {
    mockFetch((url) => {
      expect(url).to.include("translate.volcengine.com");
      return new Response(
        JSON.stringify({ translation: "你好", detected_language: "en" }),
        { status: 200 },
      );
    });
    const result = await new VolcengineService().translate(makeTask());
    expect(result.text).to.equal("你好");
    expect(result.detectedLang).to.equal("en");
  });
});
