import { expect } from "chai";
import { BingService } from "../../src/services/bing";
import { HttpError } from "../../src/utils/network";
import { createCancelToken } from "../../src/utils/cancel";
import type { TranslateTask } from "../../src/services/base";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("BingService", function () {
  let originalFetch: typeof fetch;
  let store: Record<string, string | number | boolean>;

  beforeEach(function () {
    originalFetch = globalThis.fetch;
    store = {
      [`${PREFIX}bing.mode`]: "edge",
      [`${PREFIX}bing.azureKey`]: "",
      [`${PREFIX}bing.azureRegion`]: "",
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
      channelId: "bing",
      token: createCancelToken(),
      ...overrides,
    };
  }

  function edgeResponse(text: string): Response {
    return new Response(
      JSON.stringify([
        { translations: [{ text, to: "zh-Hans", sentLen: {} }] },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  it("edge 模式 isConfigured 恒真；azure 模式需要 key", function () {
    const svc = new BingService();
    expect(svc.isConfigured()).to.equal(true);

    store[`${PREFIX}bing.mode`] = "azure";
    expect(svc.isConfigured()).to.equal(false);
    store[`${PREFIX}bing.azureKey`] = "sk-test";
    expect(svc.isConfigured()).to.equal(true);
  });

  it("edge 模式：POST translatetext，query 与裸字符串数组 body", async function () {
    let calledUrl = "";
    let body = "";
    let method = "";
    mockFetch((url, init) => {
      calledUrl = url;
      method = init?.method ?? "GET";
      body = String(init?.body ?? "");
      return edgeResponse("你好世界");
    });
    const svc = new BingService();
    const result = await svc.translate(makeTask());

    expect(calledUrl).to.equal(
      "https://edge.microsoft.com/translate/translatetext?from=en&to=zh-CN&isEnterpriseClient=false",
    );
    expect(method).to.equal("POST");
    expect(body).to.equal('["Hello world"]');
    expect(result.text).to.equal("你好世界");
    expect(result.detectedLang).to.equal("en");
  });

  it("edge 模式：源语言 auto 时本地启发式检测", async function () {
    let calledUrl = "";
    mockFetch((url) => {
      calledUrl = url;
      return edgeResponse("你好世界");
    });
    const svc = new BingService();
    await svc.translate(
      makeTask({ sourceLang: "auto", sourceText: "你好世界" }),
    );
    expect(calledUrl).to.contain("from=zh-CN");
    expect(calledUrl).to.contain("to=zh-CN");
  });

  it("edge 模式：onChunk 收到完整译文", async function () {
    mockFetch(() => edgeResponse("你好世界"));
    const chunks: string[] = [];
    const svc = new BingService();
    await svc.translate(makeTask(), (chunk) => chunks.push(chunk.text));
    expect(chunks).to.deep.equal(["你好世界"]);
  });

  it("edge 模式：空译文抛错", async function () {
    mockFetch(() => edgeResponse(""));
    const svc = new BingService();
    try {
      await svc.translate(makeTask());
      expect.fail("should throw");
    } catch (e) {
      expect((e as Error).message).to.equal("Bing empty response");
    }
  });

  it("非 2xx 抛出 HttpError", async function () {
    mockFetch(
      () =>
        new Response("Client Browser Version not supported", { status: 400 }),
    );
    const svc = new BingService();
    try {
      await svc.translate(makeTask());
      expect.fail("should throw");
    } catch (e) {
      expect(e).to.be.instanceOf(HttpError);
      expect((e as HttpError).status).to.equal(400);
    }
  });

  it("azure 模式：走官方端点，Ocp-Apim 头与 [{Text}] body", async function () {
    store[`${PREFIX}bing.mode`] = "azure";
    store[`${PREFIX}bing.azureKey`] = "sk-azure";
    store[`${PREFIX}bing.azureRegion`] = "global";

    let calledUrl = "";
    let body = "";
    let headers: Record<string, string> = {};
    mockFetch((url, init) => {
      calledUrl = url;
      headers = (init?.headers ?? {}) as Record<string, string>;
      body = String(init?.body ?? "");
      return new Response(
        JSON.stringify([
          {
            translations: [{ text: "你好世界", to: "zh-Hans" }],
            detectedLanguage: { language: "en", score: 1 },
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const svc = new BingService();
    const result = await svc.translate(makeTask());

    expect(calledUrl).to.equal(
      "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=zh-CN&from=en",
    );
    expect(headers["Ocp-Apim-Subscription-Key"]).to.equal("sk-azure");
    expect(headers["Ocp-Apim-Subscription-Region"]).to.equal("global");
    expect(body).to.equal('[{"Text":"Hello world"}]');
    expect(result.text).to.equal("你好世界");
    expect(result.detectedLang).to.equal("en");
  });
});
