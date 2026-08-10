import { expect } from "chai";
import { parseSSE } from "../../src/utils/sse.js";
import { detectLanguage, normalizeLangCode } from "../../src/utils/lang.js";
import { fnv1a64 } from "../../src/utils/hash.js";
import { createAbortController, isAborted } from "../../src/utils/abort.js";

describe("utils 工具函数", function () {
  describe("parseSSE SSE 流解析", function () {
    it("单事件", function () {
      const { events, rest } = parseSSE('data: {"a":1}\n\n');
      expect(events).to.deep.equal([{ data: '{"a":1}' }]);
      expect(rest).to.equal("");
    });

    it("多事件 + [DONE]", function () {
      const { events } = parseSSE('data: {"x":"y"}\n\ndata: [DONE]\n\n');
      expect(events).to.deep.equal([{ data: '{"x":"y"}' }, { data: "[DONE]" }]);
    });

    it("跨 buffer 残留（rest 保留未完成事件）", function () {
      const { events, rest } = parseSSE("data: partial");
      expect(events).to.deep.equal([]);
      expect(rest).to.equal("data: partial");
      const next = parseSSE(rest + "\n\n");
      expect(next.events).to.deep.equal([{ data: "partial" }]);
      expect(next.rest).to.equal("");
    });

    it("多行 data 合并", function () {
      const { events } = parseSSE("data: line1\ndata: line2\n\n");
      expect(events).to.deep.equal([{ data: "line1\nline2" }]);
    });

    it("event 字段与注释行", function () {
      const { events } = parseSSE(": comment\nevent: done\ndata: x\n\n");
      expect(events).to.deep.equal([{ event: "done", data: "x" }]);
    });

    it("CRLF 分隔", function () {
      const { events } = parseSSE("data: a\r\n\r\ndata: b\r\n\r\n");
      expect(events).to.deep.equal([{ data: "a" }, { data: "b" }]);
    });

    it("空数据块", function () {
      const { events } = parseSSE("\n\n");
      expect(events).to.deep.equal([]);
    });
  });

  describe("detectLanguage 语言检测", function () {
    it("中文文本 → zh", function () {
      expect(detectLanguage("这是一个测试句子，用来检测语言。")).to.equal("zh");
    });

    it("英文文本 → en", function () {
      expect(detectLanguage("This is a test sentence for detection.")).to.equal(
        "en",
      );
    });

    it("日文（假名占比高）→ ja", function () {
      expect(detectLanguage("これはテストです。")).to.equal("ja");
    });

    it("韩文（谚文）→ ko", function () {
      expect(detectLanguage("이것은 테스트입니다.")).to.equal("ko");
    });

    it("混合文本按主要占比", function () {
      expect(detectLanguage("中文中文 English words here 中文中文")).to.equal(
        "zh",
      );
    });

    it("无法判断 → auto", function () {
      expect(detectLanguage("12345 !!!")).to.equal("auto");
    });
  });

  describe("normalizeLangCode 语言码", function () {
    it("zh-CN → zh-Hans（必应友好）", function () {
      expect(normalizeLangCode("zh-CN", "bing")).to.equal("zh-Hans");
    });

    it("zh-TW → zh-Hant", function () {
      expect(normalizeLangCode("zh-TW", "bing")).to.equal("zh-Hant");
    });

    it("en → en", function () {
      expect(normalizeLangCode("en", "bing")).to.equal("en");
    });

    it("auto 保持", function () {
      expect(normalizeLangCode("auto", "bing")).to.equal("auto");
    });
  });

  describe("fnv1a64 内容 hash", function () {
    it("确定性：同输入同输出", function () {
      expect(fnv1a64("hello world")).to.equal(fnv1a64("hello world"));
    });

    it("不同输入不同输出", function () {
      expect(fnv1a64("hello world")).to.not.equal(fnv1a64("hello worle"));
    });

    it("输出为 16 位十六进制", function () {
      expect(fnv1a64("abc")).to.match(/^[0-9a-f]{16}$/);
    });

    it("空字符串有确定值", function () {
      expect(fnv1a64("")).to.match(/^[0-9a-f]{16}$/);
    });
  });

  describe("abort 安全工厂（Zotero 9 沙盒无 AbortController）", function () {
    it("有 AbortController 时返回实例", function () {
      const c = createAbortController();
      expect(c).to.not.equal(null);
      expect(c!.signal.aborted).to.equal(false);
    });

    it("无 AbortController 时返回 null（不抛错）", function () {
      const orig = (globalThis as any).AbortController;
      delete (globalThis as any).AbortController;
      try {
        expect(createAbortController()).to.equal(null);
        expect(isAborted(null)).to.equal(false);
      } finally {
        (globalThis as any).AbortController = orig;
      }
    });
  });
});
