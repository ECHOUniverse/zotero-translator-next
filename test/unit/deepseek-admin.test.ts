import { expect } from "chai";
import {
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_BUILTIN_MODELS,
  deepseekUrl,
  getDeepSeekBalance,
  isDeepSeekLegacyModel,
  listDeepSeekModels,
} from "../../src/services/deepseek-admin";
import { HttpError } from "../../src/utils/network";

describe("deepseek-admin", function () {
  let originalFetch: typeof fetch;

  beforeEach(function () {
    originalFetch = globalThis.fetch;
  });

  afterEach(function () {
    globalThis.fetch = originalFetch;
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

  it("默认模型为 deepseek-v4-flash", function () {
    expect(DEEPSEEK_DEFAULT_MODEL).to.equal("deepseek-v4-flash");
    expect(DEEPSEEK_BUILTIN_MODELS).to.include("deepseek-v4-pro");
  });

  it("识别旧版模型别名", function () {
    expect(isDeepSeekLegacyModel("deepseek-chat")).to.equal(true);
    expect(isDeepSeekLegacyModel("deepseek-reasoner")).to.equal(true);
    expect(isDeepSeekLegacyModel("deepseek-v4-flash")).to.equal(false);
  });

  it("拼接路径并去掉尾斜杠，不含 /v1", function () {
    expect(deepseekUrl("https://api.deepseek.com/", "/models")).to.equal(
      "https://api.deepseek.com/models",
    );
    expect(deepseekUrl("https://api.deepseek.com", "user/balance")).to.equal(
      "https://api.deepseek.com/user/balance",
    );
  });

  it("GET /models 解析 id 列表", async function () {
    let calledUrl = "";
    let auth = "";
    mockFetch((url, init) => {
      calledUrl = url;
      auth = String(
        (init?.headers as Record<string, string>)?.Authorization ?? "",
      );
      return new Response(
        JSON.stringify({
          object: "list",
          data: [
            { id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" },
            { id: "deepseek-v4-pro", object: "model", owned_by: "deepseek" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const models = await listDeepSeekModels(
      "https://api.deepseek.com/",
      "sk-test",
    );
    expect(calledUrl).to.equal("https://api.deepseek.com/models");
    expect(auth).to.equal("Bearer sk-test");
    expect(models).to.deep.equal(["deepseek-v4-flash", "deepseek-v4-pro"]);
  });

  it("GET /user/balance 解析余额", async function () {
    let calledUrl = "";
    mockFetch((url) => {
      calledUrl = url;
      return new Response(
        JSON.stringify({
          is_available: true,
          balance_infos: [
            {
              currency: "CNY",
              total_balance: "10.00",
              granted_balance: "2.00",
              topped_up_balance: "8.00",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const balance = await getDeepSeekBalance(
      "https://api.deepseek.com",
      "sk-test",
    );
    expect(calledUrl).to.equal("https://api.deepseek.com/user/balance");
    expect(balance.is_available).to.equal(true);
    expect(balance.balance_infos[0]?.total_balance).to.equal("10.00");
  });

  it("非 2xx 抛出 HttpError", async function () {
    mockFetch(() => new Response("unauthorized", { status: 401 }));
    try {
      await listDeepSeekModels("https://api.deepseek.com", "bad");
      expect.fail("should throw");
    } catch (e) {
      expect(e).to.be.instanceOf(HttpError);
      expect((e as HttpError).status).to.equal(401);
    }
  });
});
