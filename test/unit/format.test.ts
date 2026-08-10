import { expect } from "chai";
import { formatText, DEFAULT_FORMAT_OPTIONS } from "../../src/utils/format.js";

// 注意：tsx 以 ESM 加载；源码导入路径用 .js 后缀（NodeNext 解析）

describe("formatText 格式化管线", () => {
  describe("合并硬换行 (mergeLineBreaks)", () => {
    it("段落内的换行合并为空格", () => {
      expect(
        formatText("The quick brown fox\njumps over the lazy dog.", {
          mergeLineBreaks: true,
        }),
      ).to.equal("The quick brown fox jumps over the lazy dog.");
    });
    it("保留段落边界（空行）", () => {
      expect(
        formatText("First paragraph.\n\nSecond paragraph.", {
          mergeLineBreaks: true,
        }),
      ).to.equal("First paragraph.\n\nSecond paragraph.");
    });
    it("多行连续合并", () => {
      expect(formatText("a\nb\nc", { mergeLineBreaks: true })).to.equal(
        "a b c",
      );
    });
    it("CRLF 归一化", () => {
      expect(formatText("a\r\nb\r\n\r\nc", { mergeLineBreaks: true })).to.equal(
        "a b\n\nc",
      );
    });
  });

  describe("修复连字符断词 (fixHyphenation)", () => {
    it("inter-\\nnational → international", () => {
      expect(formatText("inter-\nnational", { fixHyphenation: true })).to.equal(
        "international",
      );
    });
    it("state-of-\\nthe-art → state-of-the-art", () => {
      expect(
        formatText("state-of-\nthe-art", { fixHyphenation: true }),
      ).to.equal("state-of-the-art");
    });
    it("保留真实连字符（不在行尾）", () => {
      expect(
        formatText("well-known method", { fixHyphenation: true }),
      ).to.equal("well-known method");
    });
    it("数字范围连字符不动", () => {
      expect(formatText("pages 10-\n20", { fixHyphenation: true })).to.equal(
        "pages 10-20",
      );
    });
  });

  describe("引号正常化 (normalizeQuotes)", () => {
    it("英文双引号 → 中文成对引号", () => {
      expect(
        formatText('He said "hello" to me.', { normalizeQuotes: true }),
      ).to.equal("He said “hello” to me.");
    });
    it("英文单引号 → 中文单引号", () => {
      expect(formatText("'quoted' text", { normalizeQuotes: true })).to.equal(
        "‘quoted’ text",
      );
    });
    it("撇号（词内）不参与配对", () => {
      expect(
        formatText("don't can't it's", { normalizeQuotes: true }),
      ).to.equal("don’t can’t it’s");
    });
    it("嵌套引号配对正确", () => {
      expect(
        formatText("He said \"she told me, 'hi',\" loudly.", {
          normalizeQuotes: true,
        }),
      ).to.equal("He said “she told me, ‘hi’,” loudly.");
    });
    it("已正确的中文引号保持不变", () => {
      expect(
        formatText("他说“你好”后离开。", { normalizeQuotes: true }),
      ).to.equal("他说“你好”后离开。");
    });
    it("«» 转为中文引号", () => {
      expect(formatText("«bonjour»", { normalizeQuotes: true })).to.equal(
        "“bonjour”",
      );
    });
    it("孤立的闭引号修复为开引号", () => {
      expect(formatText("he said”hello", { normalizeQuotes: true })).to.equal(
        "he said“hello",
      );
    });
  });

  describe("破折号正常化 (normalizeDashes)", () => {
    it("-- → —", () => {
      expect(formatText("a -- b", { normalizeDashes: true })).to.equal("a — b");
    });
    it("连写 word--word → word—word", () => {
      expect(formatText("word--word", { normalizeDashes: true })).to.equal(
        "word—word",
      );
    });
    it("en dash – → —", () => {
      expect(formatText("a – b", { normalizeDashes: true })).to.equal("a — b");
    });
    it("单连字符保留", () => {
      expect(formatText("well-known", { normalizeDashes: true })).to.equal(
        "well-known",
      );
    });
  });

  describe("全半角统一 (normalizeWidth)", () => {
    it("全角字母数字 → 半角", () => {
      expect(formatText("ＡＢＣ１２３", { normalizeWidth: true })).to.equal(
        "ABC123",
      );
    });
    it("全角空格 → 半角空格", () => {
      expect(formatText("a\u3000b", { normalizeWidth: true })).to.equal("a b");
    });
    it("中文标点不受影响", () => {
      expect(formatText("你好，世界！", { normalizeWidth: true })).to.equal(
        "你好，世界！",
      );
    });
  });

  describe("空白压缩 (collapseWhitespace)", () => {
    it("多空格 → 单空格", () => {
      expect(formatText("a   b    c", { collapseWhitespace: true })).to.equal(
        "a b c",
      );
    });
    it("多空行 → 单空行", () => {
      expect(formatText("a\n\n\n\nb", { collapseWhitespace: true })).to.equal(
        "a\n\nb",
      );
    });
    it("去除零宽字符与 BOM", () => {
      expect(
        formatText("\uFEFFa\u200Bb\u200Dc\u00AD", {
          collapseWhitespace: true,
        }),
      ).to.equal("abc");
    });
    it("首尾去空白", () => {
      expect(formatText("  padded  ", { collapseWhitespace: true })).to.equal(
        "padded",
      );
    });
  });

  describe("特殊符号正常化 (normalizeSymbols)", () => {
    it("数学减号 − → -", () => {
      expect(formatText("a − b", { normalizeSymbols: true })).to.equal("a - b");
    });
    it("全角连字符 － → -", () => {
      expect(formatText("a－b", { normalizeSymbols: true })).to.equal("a-b");
    });
    it("⋮ 省略号变体 → …", () => {
      expect(formatText("a⋯b", { normalizeSymbols: true })).to.equal("a…b");
    });
  });

  describe("保护清单", () => {
    it("URL 中的 -- 不被改写", () => {
      expect(
        formatText("see https://example.com/a--b for details", {
          normalizeDashes: true,
        }),
      ).to.equal("see https://example.com/a--b for details");
    });
    it("DOI 与邮箱完整保留", () => {
      const input = "mail a-b@example.com doi:10.1000/x--y";
      expect(
        formatText(input, {
          normalizeDashes: true,
          normalizeQuotes: true,
          collapseWhitespace: true,
        }),
      ).to.equal(input);
    });
    it("LaTeX 公式段不被规则改写", () => {
      expect(
        formatText("公式 $x -- y$ 结尾", {
          normalizeDashes: true,
        }),
      ).to.equal("公式 $x -- y$ 结尾");
    });
  });

  describe("整体流程", () => {
    it("默认选项全开时多规则叠加正确", () => {
      const input =
        "The model's accuracy -- as shown in [12] --\nwas remarkable.\n\n" +
        'It reached ＡＢＣ level.\n\nSecond paragraph\'s "quoted" term.';
      const out = formatText(input, DEFAULT_FORMAT_OPTIONS);
      expect(out).to.equal(
        "The model’s accuracy — as shown in [12] — was remarkable.\n\n" +
          "It reached ABC level.\n\n" +
          "Second paragraph’s “quoted” term.",
      );
    });
    it("选项可单独关闭", () => {
      expect(
        formatText("a -- b\nc", {
          mergeLineBreaks: false,
          normalizeDashes: false,
          collapseWhitespace: false,
        }),
      ).to.equal("a -- b\nc");
    });
  });
});
