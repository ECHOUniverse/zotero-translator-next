import { describe, it } from "mocha";
import { expect } from "chai";
import { parseSSE } from "../../src/utils/sse.js";
import { detectLanguage, normalizeLangCode } from "../../src/utils/lang.js";
import { fnv1a64 } from "../../src/utils/hash.js";

describe("parseSSE SSE 流解析", () => {
  it("单事件", () => {
    const { events, rest } = parseSSE('data: {"a":1}\n\n');
    expect(events).to.deep.equal([{ data: '{"a":1}' }]);
    expect(rest).to.equal("");
  });

  it("多事件 + [DONE]", () => {
    const { events } = parseSSE(
      'data: {"x":"y"}\n\ndata: [DONE]\n\n',
    );
    expect(events).to.deep.equal([
      { data: '{"x":"y"}' },
      { data: "[DONE]" },
    ]);
  });

  it("跨 buffer 残留（rest 保留未完成事件）", () => {
    const { events, rest } = parseSSE('data: partial');
    expect(events).to.deep.equal([]);
    expect(rest).to.equal("data: partial");
    const next = parseSSE(rest + "\n\n");
    expect(next.events).to.deep.equal([{ data: "partial" }]);
    expect(next.rest).to.equal("");
  });

  it("多行 data 合并", () => {
    const { events } = parseSSE("data: line1\ndata: line2\n\n");
    expect(events).to.deep.equal([{ data: "line1\nline2" }]);
  });

  it("event 字段与注释行", () => {
    const { events } = parseSSE(": comment\nevent: done\ndata: x\n\n");
    expect(events).to.deep.equal([{ event: "done", data: "x" }]);
  });

  it("CRLF 分隔", () => {
    const { events } = parseSSE("data: a\r\n\r\ndata: b\r\n\r\n");
    expect(events).to.deep.equal([{ data: "a" }, { data: "b" }]);
  });

  it("空数据块", () => {
    const { events } = parseSSE("\n\n");
    expect(events).to.deep.equal([]);
  });
});

describe("detectLanguage 语言检测", () => {
  it("中文文本 → zh", () => {
    expect(detectLanguage("这是一个测试句子，用来检测语言。")).to.equal("zh");
  });
  it("英文文本 → en", () => {
    expect(detectLanguage("This is a test sentence for detection.")).to.equal(
      "en",
    );
  });
  it("日文（假名占比高）→ ja", () => {
    expect(detectLanguage("これはテストです。")).to.equal("ja");
  });
  it("韩文（谚文）→ ko", () => {
    expect(detectLanguage("이것은 테스트입니다.")).to.equal("ko");
  });
  it("混合文本按主要占比", () => {
    expect(detectLanguage("中文中文 English words here 中文中文")).to.equal("zh");
  });
  it("无法判断 → auto", () => {
    expect(detectLanguage("12345 !!!")).to.equal("auto");
  });
});

describe("normalizeLangCode 语言码", () => {
  it("zh-CN → zh-Hans（必应友好）", () => {
    expect(normalizeLangCode("zh-CN", "bing")).to.equal("zh-Hans");
  });
  it("zh-TW → zh-Hant", () => {
    expect(normalizeLangCode("zh-TW", "bing")).to.equal("zh-Hant");
  });
  it("en → en", () => {
    expect(normalizeLangCode("en", "bing")).to.equal("en");
  });
  it("auto 保持", () => {
    expect(normalizeLangCode("auto", "bing")).to.equal("auto");
  });
});

describe("fnv1a64 内容 hash", () => {
  it("确定性：同输入同输出", () => {
    expect(fnv1a64("hello world")).to.equal(fnv1a64("hello world"));
  });
  it("不同输入不同输出", () => {
    expect(fnv1a64("hello world")).to.not.equal(fnv1a64("hello worle"));
  });
  it("输出为 16 位十六进制", () => {
    expect(fnv1a64("abc")).to.match(/^[0-9a-f]{16}$/);
  });
  it("空字符串有确定值", () => {
    expect(fnv1a64("")).to.match(/^[0-9a-f]{16}$/);
  });
});
