import { expect } from "chai";
import { AliyunService, ALIYUN_MAX_CHARS } from "../../src/services/aliyun";
import { toAliyunLang } from "../../src/utils/aliyun-sign";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("AliyunService", function () {
  let originalFetch: typeof fetch;
  let store: Record<string, string | number | boolean>;

  beforeEach(function () {
    originalFetch = globalThis.fetch;
    store = {
      [`${PREFIX}aliyun.enabled`]: true,
      [`${PREFIX}aliyun.accessKeyId`]: "",
      [`${PREFIX}aliyun.accessKeySecret`]: "",
      [`${PREFIX}aliyun.endpoint`]: "https://mt.aliyuncs.com/",
      [`${PREFIX}aliyun.action`]: "TranslateGeneral",
      [`${PREFIX}aliyun.scene`]: "general",
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
      channelId: "aliyun",
      token: createCancelToken(),
      ...overrides,
    };
  }

  it("ALIYUN_MAX_CHARS 为 5000", function () {
    expect(ALIYUN_MAX_CHARS).to.equal(5000);
  });

  it("toAliyunLang 映射 zh-CN → zh", function () {
    expect(toAliyunLang("zh-CN")).to.equal("zh");
    expect(toAliyunLang("zh-TW")).to.equal("zh-tw");
  });

  it("未配置密钥时 isConfigured 为 false", function () {
    expect(new AliyunService().isConfigured()).to.equal(false);
    store[`${PREFIX}aliyun.accessKeyId`] = "id";
    store[`${PREFIX}aliyun.accessKeySecret`] = "secret";
    expect(new AliyunService().isConfigured()).to.equal(true);
  });

  it("成功解析 Translated 字段", async function () {
    store[`${PREFIX}aliyun.accessKeyId`] = "id";
    store[`${PREFIX}aliyun.accessKeySecret`] = "secret";
    mockFetch((url, init) => {
      expect(url).to.include("mt.aliyuncs.com");
      expect(init?.method).to.equal("POST");
      expect(String(init?.body)).to.include("Signature=");
      return new Response(
        JSON.stringify({ Code: "200", Data: { Translated: "你好" } }),
        { status: 200 },
      );
    });
    const result = await new AliyunService().translate(makeTask());
    expect(result.text).to.equal("你好");
  });
});
