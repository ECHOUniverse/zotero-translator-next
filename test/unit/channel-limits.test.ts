import { expect } from "chai";
import {
  channelMaxChars,
  WEB_API_MAX_CHARS,
} from "../../src/utils/channel-limits";
import { MYMEMORY_MAX_CHARS } from "../../src/services/mymemory";
import { TMT_MAX_CHARS } from "../../src/services/tencent";
import { BAIDU_MAX_CHARS } from "../../src/services/baidu";
import { ALIYUN_MAX_CHARS } from "../../src/services/aliyun";

const PREFIX = "extensions.zotero.zotero-translator-next.";

describe("channelMaxChars", function () {
  beforeEach(function () {
    (globalThis as unknown as { Zotero: unknown }).Zotero = {
      Prefs: {
        get: (key: string) =>
          key === `${PREFIX}translate.chunkMaxChars` ? 10000 : undefined,
        set: () => {},
      },
    };
  });

  afterEach(function () {
    delete (globalThis as unknown as { Zotero?: unknown }).Zotero;
  });

  it("各渠道返回预期上限", function () {
    expect(channelMaxChars("mymemory")).to.equal(MYMEMORY_MAX_CHARS);
    expect(channelMaxChars("tencent")).to.equal(TMT_MAX_CHARS);
    expect(channelMaxChars("baidu")).to.equal(BAIDU_MAX_CHARS);
    expect(channelMaxChars("aliyun")).to.equal(ALIYUN_MAX_CHARS);
    expect(channelMaxChars("youdao")).to.equal(WEB_API_MAX_CHARS);
    expect(channelMaxChars("google")).to.equal(WEB_API_MAX_CHARS);
    expect(channelMaxChars("deepseek")).to.equal(10000);
  });
});
