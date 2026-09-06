import { expect } from "chai";
import { GoogleService, toGoogleLang } from "../../src/services/google";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("GoogleService", function () {
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

  function mockFetch(handler: (url: string) => Response) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return handler(url);
    }) as typeof fetch;
  }

  function makeTask(overrides?: Partial<TranslateTask>): TranslateTask {
    return {
      id: "t1",
      sourceText: "Hello",
      sourceLang: "en",
      targetLang: "zh-CN",
      channelId: "google",
      token: createCancelToken(),
      ...overrides,
    };
  }

  it("toGoogleLang 映射 pt-BR → pt", function () {
    expect(toGoogleLang("pt-BR")).to.equal("pt");
    expect(toGoogleLang("auto")).to.equal("auto");
  });

  it("成功解析 translate_a/single 响应", async function () {
    mockFetch((url) => {
      expect(url).to.include("client=gtx");
      expect(url).to.include("translate.googleapis.com");
      return new Response(JSON.stringify([[["你好", null, null, 0]]]), {
        status: 200,
      });
    });
    const result = await new GoogleService().translate(makeTask());
    expect(result.text).to.equal("你好");
  });
});
