import { expect } from "chai";
import {
  notifyChannelPrefsChanged,
  resetExplicitChannelForTests,
  resolveActiveChannelId,
  setExplicitChannelId,
  subscribeChannelPrefsChanged,
} from "../../src/modules/active-channel";
import { channelRegistry } from "../../src/services";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("active-channel", function () {
  let store: Record<string, string | number | boolean>;

  beforeEach(function () {
    resetExplicitChannelForTests();
    channelRegistry.invalidate();
    store = {
      [`${PREFIX}channelsOrder`]: '["bing","mymemory","deepseek","tencent"]',
      [`${PREFIX}mymemory.enabled`]: true,
      [`${PREFIX}bing.enabled`]: true,
      [`${PREFIX}bing.mode`]: "edge",
      [`${PREFIX}bing.azureKey`]: "",
      [`${PREFIX}deepseek.enabled`]: true,
      [`${PREFIX}deepseek.apiKey`]: "",
      [`${PREFIX}deepseek.baseURL`]: "https://api.deepseek.com",
      [`${PREFIX}tencent.enabled`]: true,
      [`${PREFIX}tencent.secretId`]: "",
      [`${PREFIX}tencent.secretKey`]: "",
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
    resetExplicitChannelForTests();
    channelRegistry.invalidate();
    delete (globalThis as unknown as { Zotero?: unknown }).Zotero;
  });

  it("未点选时返回顺序中第一个已启用且已配置的渠道", function () {
    expect(resolveActiveChannelId()).to.equal("bing");
  });

  it("用户点选后粘住该渠道", function () {
    setExplicitChannelId("mymemory");
    expect(resolveActiveChannelId()).to.equal("mymemory");
  });

  it("点选渠道被禁用或未配置时回落到第一个可用渠道", function () {
    setExplicitChannelId("deepseek");
    store[`${PREFIX}deepseek.enabled`] = false;
    channelRegistry.invalidate();
    expect(resolveActiveChannelId()).to.equal("bing");
  });

  it("notifyChannelPrefsChanged 触发订阅回调", function () {
    let called = 0;
    const unsub = subscribeChannelPrefsChanged(() => {
      called++;
    });
    notifyChannelPrefsChanged();
    unsub();
    expect(called).to.equal(1);
  });
});
