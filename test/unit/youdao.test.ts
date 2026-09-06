import { expect } from "chai";
import { YoudaoService, toYoudaoLang } from "../../src/services/youdao";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("YoudaoService", function () {
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
      channelId: "youdao",
      token: createCancelToken(),
      ...overrides,
    };
  }

  it("toYoudaoLang 映射 zh-CN → zh-CHS", function () {
    expect(toYoudaoLang("zh-CN")).to.equal("zh-CHS");
    expect(toYoudaoLang("zh-TW")).to.equal("zh-CHT");
    expect(toYoudaoLang("en")).to.equal("en");
  });

  it("isConfigured 恒真", function () {
    expect(new YoudaoService().isConfigured()).to.equal(true);
  });

  it("成功解析 translation 数组", async function () {
    mockFetch((_url, init) => {
      expect(init?.method).to.equal("POST");
      return new Response(
        JSON.stringify({ errorCode: "0", translation: ["你好"] }),
        { status: 200 },
      );
    });
    const result = await new YoudaoService().translate(makeTask());
    expect(result.text).to.equal("你好");
  });

  it("errorCode 非 0 时抛错", async function () {
    mockFetch(
      () => new Response(JSON.stringify({ errorCode: "20" }), { status: 200 }),
    );
    try {
      await new YoudaoService().translate(makeTask());
      expect.fail("should throw");
    } catch (e) {
      expect((e as Error).message).to.include("Youdao error");
    }
  });
});
