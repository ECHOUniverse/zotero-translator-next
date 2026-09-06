import { expect } from "chai";
import {
  TransmartService,
  toTransmartLang,
} from "../../src/services/transmart";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("TransmartService", function () {
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
      channelId: "transmart",
      token: createCancelToken(),
      ...overrides,
    };
  }

  it("toTransmartLang 只取主语言码", function () {
    expect(toTransmartLang("zh-CN")).to.equal("zh");
    expect(toTransmartLang("auto")).to.equal("auto");
  });

  it("成功解析 auto_translation", async function () {
    mockFetch((url, init) => {
      expect(url).to.include("transmart.qq.com");
      expect(init?.method).to.equal("POST");
      return new Response(JSON.stringify({ auto_translation: ["你好"] }), {
        status: 200,
      });
    });
    const result = await new TransmartService().translate(makeTask());
    expect(result.text).to.equal("你好");
  });
});
