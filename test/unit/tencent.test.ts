import { expect } from "chai";
import {
  TencentService,
  toTmtLang,
  TMT_MAX_CHARS,
} from "../../src/services/tencent";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("TencentService", function () {
  let originalFetch: typeof fetch;
  let store: Record<string, string | number | boolean>;

  beforeEach(function () {
    originalFetch = globalThis.fetch;
    store = {
      [`${PREFIX}tencent.enabled`]: true,
      [`${PREFIX}tencent.secretId`]: "",
      [`${PREFIX}tencent.secretKey`]: "",
      [`${PREFIX}tencent.region`]: "ap-guangzhou",
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

  function mockFetch(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  ): void {
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
      sourceText: "Hello world",
      sourceLang: "en",
      targetLang: "zh-CN",
      channelId: "tencent",
      token: createCancelToken(),
      ...overrides,
    };
  }

  it("TMT_MAX_CHARS 为 5500", function () {
    expect(TMT_MAX_CHARS).to.equal(5500);
  });

  it("toTmtLang 映射 zh-CN → zh", function () {
    expect(toTmtLang("zh-CN")).to.equal("zh");
    expect(toTmtLang("zh-TW")).to.equal("zh-TW");
    expect(toTmtLang("auto")).to.equal("auto");
    expect(toTmtLang("en")).to.equal("en");
  });

  it("未配置密钥时 isConfigured 为 false", function () {
    const svc = new TencentService();
    expect(svc.isConfigured()).to.equal(false);
    store[`${PREFIX}tencent.secretId`] = "AKIDxxx";
    expect(svc.isConfigured()).to.equal(false);
    store[`${PREFIX}tencent.secretKey`] = "secret";
    expect(svc.isConfigured()).to.equal(true);
  });

  it("成功翻译：POST tmt 端点，body 含映射后语言码", async function () {
    store[`${PREFIX}tencent.secretId`] = "AKIDxxx";
    store[`${PREFIX}tencent.secretKey`] = "secret";

    let calledUrl = "";
    let body = "";
    let auth = "";
    mockFetch((url, init) => {
      calledUrl = url;
      body = String(init?.body ?? "");
      auth = String(
        (init?.headers as Record<string, string>)?.Authorization ?? "",
      );
      return new Response(
        JSON.stringify({
          Response: {
            TargetText: "你好世界",
            Source: "en",
            Target: "zh",
            RequestId: "req-1",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const svc = new TencentService();
    const result = await svc.translate(makeTask());

    expect(calledUrl).to.equal("https://tmt.tencentcloudapi.com");
    expect(auth).to.match(/^TC3-HMAC-SHA256/);
    const parsed = JSON.parse(body);
    expect(parsed.SourceText).to.equal("Hello world");
    expect(parsed.Source).to.equal("en");
    expect(parsed.Target).to.equal("zh");
    expect(parsed.ProjectId).to.equal(0);
    expect(result.text).to.equal("你好世界");
    expect(result.detectedLang).to.equal("en");
  });

  it("Response.Error 抛错；RequestLimitExceeded 带 status 429", async function () {
    store[`${PREFIX}tencent.secretId`] = "AKIDxxx";
    store[`${PREFIX}tencent.secretKey`] = "secret";

    mockFetch(() =>
      new Response(
        JSON.stringify({
          Response: {
            Error: {
              Code: "RequestLimitExceeded",
              Message: "rate limit",
            },
            RequestId: "req-2",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const svc = new TencentService();
    try {
      await svc.translate(makeTask());
      expect.fail("should throw");
    } catch (e) {
      expect((e as Error).message).to.contain("RequestLimitExceeded");
      expect((e as { status?: number }).status).to.equal(429);
    }
  });

  it("空译文抛错", async function () {
    store[`${PREFIX}tencent.secretId`] = "AKIDxxx";
    store[`${PREFIX}tencent.secretKey`] = "secret";

    mockFetch(() =>
      new Response(
        JSON.stringify({ Response: { RequestId: "req-3" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const svc = new TencentService();
    try {
      await svc.translate(makeTask());
      expect.fail("should throw");
    } catch (e) {
      expect((e as Error).message).to.equal("Tencent TMT empty response");
    }
  });
});
