import { expect } from "chai";
import {
  BaiduService,
  toBaiduLang,
  computeBaiduSign,
  BAIDU_MAX_CHARS,
} from "../../src/services/baidu";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("BaiduService", function () {
  let originalFetch: typeof fetch;
  let store: Record<string, string | number | boolean>;

  beforeEach(function () {
    originalFetch = globalThis.fetch;
    store = {
      [`${PREFIX}baidu.enabled`]: true,
      [`${PREFIX}baidu.appId`]: "",
      [`${PREFIX}baidu.appKey`]: "",
      [`${PREFIX}baidu.action`]: "0",
      [`${PREFIX}translate.timeout`]: 30000,
    };
    (globalThis as unknown as { Zotero: unknown }).Zotero = {
      Prefs: {
        get: (key: string) => store[key],
        set: (key: string, value: string | number | boolean) => {
          store[key] = value;
        },
      },
      Utilities: {
        Internal: {
          md5: (s: string) => `md5:${s}`,
        },
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
      channelId: "baidu",
      token: createCancelToken(),
      ...overrides,
    };
  }

  it("BAIDU_MAX_CHARS 为 900", function () {
    expect(BAIDU_MAX_CHARS).to.equal(900);
  });

  it("toBaiduLang 映射 zh-CN → zh", function () {
    expect(toBaiduLang("zh-CN")).to.equal("zh");
    expect(toBaiduLang("zh-TW")).to.equal("cht");
  });

  it("computeBaiduSign 使用 MD5", function () {
    expect(computeBaiduSign("app", "hi", 123, "key")).to.equal(
      "md5:apphi123key",
    );
  });

  it("未配置密钥时 isConfigured 为 false", function () {
    expect(new BaiduService().isConfigured()).to.equal(false);
    store[`${PREFIX}baidu.appId`] = "id";
    store[`${PREFIX}baidu.appKey`] = "key";
    expect(new BaiduService().isConfigured()).to.equal(true);
  });

  it("成功解析 trans_result", async function () {
    store[`${PREFIX}baidu.appId`] = "appid";
    store[`${PREFIX}baidu.appKey`] = "secret";
    mockFetch((url) => {
      expect(url).to.include("appid=appid");
      expect(decodeURIComponent(url)).to.include("sign=md5:");
      return new Response(JSON.stringify({ trans_result: [{ dst: "你好" }] }), {
        status: 200,
      });
    });
    const result = await new BaiduService().translate(makeTask());
    expect(result.text).to.equal("你好");
  });

  it("54003 附带 status 429", async function () {
    store[`${PREFIX}baidu.appId`] = "appid";
    store[`${PREFIX}baidu.appKey`] = "secret";
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ error_code: "54003", error_msg: "rate limit" }),
          { status: 200 },
        ),
    );
    try {
      await new BaiduService().translate(makeTask());
      expect.fail("should throw");
    } catch (e) {
      expect((e as Error & { status?: number }).status).to.equal(429);
    }
  });
});
