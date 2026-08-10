import { expect } from "chai";
import {
  formatText,
  mergeLineBreaks,
  fixHyphenation,
  normalizeQuotes,
  normalizeDashes,
  collapseWhitespace,
  normalizeSymbols,
} from "../../src/modules/formatter";

describe("formatter 格式化管线", function () {
  it("合并硬换行：行尾无标点且下行小写开头 → 空格", function () {
    expect(mergeLineBreaks("This is a line\nthat continues")).to.equal(
      "This is a line that continues",
    );
  });

  it("不合并：行尾有标点", function () {
    expect(mergeLineBreaks("First sentence.\nSecond sentence.")).to.equal(
      "First sentence.\nSecond sentence.",
    );
  });

  it("修复连字符断词：word-⏎word → wordword（真实连字符保留）", function () {
    expect(fixHyphenation("hy-\nphenation")).to.equal("hyphenation");
    // 真实连字符（非断行）不处理
    expect(fixHyphenation("well-known\nword")).to.equal("well-known\nword");
  });

  it("统一引号：英文弯引号 → 中文引号", function () {
    expect(normalizeQuotes("\u201chello\u201d world")).to.equal(
      "\u201chello\u201d world",
    );
    expect(normalizeQuotes('"quoted" text')).to.equal(
      "\u201cquoted\u201d text",
    );
    expect(normalizeQuotes("«bonjour»")).to.equal("\u201cbonjour\u201d");
  });

  it("破折号正常化：-- 和 en dash → em dash（数字范围保留）", function () {
    expect(normalizeDashes("a -- b")).to.equal("a — b");
    expect(normalizeDashes("1990\u20132000")).to.equal("1990\u20132000");
    expect(normalizeDashes("a \u2013 b")).to.equal("a — b");
  });

  it("压缩空白：多空格、空行、零宽字符", function () {
    expect(collapseWhitespace("a   b\n\n\nc\u200B")).to.equal("a b\n\nc");
    expect(collapseWhitespace("\uFEFFBOM")).to.equal("BOM");
  });

  it("数学符号正常化", function () {
    expect(normalizeSymbols("3✕4")).to.equal("3×4");
    expect(normalizeSymbols("a\u2212b")).to.equal("a−b");
  });

  it("保护清单：URL/DOI/文献引用不被改写", function () {
    const out = formatText(
      "See https://example.com/a--b?x=1--2 for details [12,34].",
    );
    expect(out).to.include("https://example.com/a--b?x=1--2");
    expect(out).to.include("[12,34]");
  });

  it("完整管线：多规则组合", function () {
    const out = formatText(
      'The term "deep-\nlearning" --\u2014 a key concept\u200B -- is widely used.',
    );
    expect(out).to.not.include("\u200B");
    expect(out).to.not.include("\n");
  });
});
