import { expect } from "chai";
import {
  chunkText,
  chunkTextByTokens,
  estimateTokens,
} from "../../src/modules/chunker";

describe("chunker 分块", function () {
  it("短文本单块", function () {
    expect(chunkText("short text", { maxChars: 10000 })).to.deep.equal([
      "short text",
    ]);
  });

  it("按段落切分", function () {
    const chunks = chunkText("para one\n\npara two", { maxChars: 10000 });
    expect(chunks).to.deep.equal(["para one\n\npara two"]);
  });

  it("超限段落按句子切", function () {
    const chunks = chunkText("AAAA BBBB CCCC DDDD EEEE", { maxChars: 10 });
    expect(chunks.length).to.be.greaterThan(1);
    chunks.forEach((c) => expect(c.length).to.be.at.most(10));
  });

  it("单句超限硬切", function () {
    const chunks = chunkText("x".repeat(25), { maxChars: 10 });
    expect(chunks.join("")).to.equal("x".repeat(25));
    chunks.forEach((c) => expect(c.length).to.be.at.most(10));
  });

  it("缩写句点不当边界：No. 68 不被拆开", function () {
    const chunks = chunkText(
      "At 110 GPa, our simulations identify the orthorhombic Ccca (No. 68) structure with 20 atoms in the conventional cell. The 16i atoms are based on the distorted hexagonal layers.",
      { maxChars: 100 },
    );
    // 两块都不得以 "(No." 结尾或以 "68)" 开头（编号不可被拦腰切开）
    for (const c of chunks) {
      expect(c).to.not.match(/\(No\.$/);
      expect(c).to.not.match(/^68\)/);
    }
    expect(chunks.join(" ")).to.contain("Ccca (No. 68) structure");
  });

  it("常见缩写不触发切分：e.g. / Fig. / et al.", function () {
    const sentences = chunkText(
      "The method (e.g. DFT) is standard, see Fig. 2 and refs therein; the results by A. Turing et al. agree with ours.",
      { maxChars: 10000 },
    );
    expect(sentences.length).to.equal(1);
    expect(sentences[0]).to.contain("e.g. DFT");
    expect(sentences[0]).to.contain("Fig. 2");
    expect(sentences[0]).to.contain("A. Turing et al.");
  });

  it("分号/冒号不是句子边界", function () {
    const sentences = chunkText(
      "positions: one group at 16i and another at 4a; both are special.",
      { maxChars: 10000 },
    );
    expect(sentences.length).to.equal(1);
  });

  it("硬切不回退时仍保证内容完整", function () {
    const chunks = chunkText("abcde fghij klmno", { maxChars: 6 });
    expect(chunks.join("")).to.equal("abcde fghij klmno");
    chunks.forEach((c) => expect(c.length).to.be.at.most(6));
  });

  it("硬切优先在空白/标点回退，不切开单词", function () {
    const chunks = chunkText("abcdefgh ijklmnop qrstuvw", { maxChars: 10 });
    expect(chunks.join("")).to.equal("abcdefgh ijklmnop qrstuvw");
    for (const c of chunks) {
      expect(c.trim()).to.match(/^[a-z]+$/); // 每块由完整单词组成
      expect(c.length).to.be.at.most(10);
    }
  });

  it("空文本返回空数组", function () {
    expect(chunkText("  \n\n ", { maxChars: 100 })).to.deep.equal([]);
  });

  it("token 估算：同字符数下 CJK 更多 token", function () {
    const cjk = estimateTokens("中文中文中文中文中文中文中文中文中文中文");
    const latin = estimateTokens("a".repeat(20));
    expect(cjk).to.be.greaterThan(latin);
  });

  it("按 token 分块", function () {
    const chunks = chunkTextByTokens("word ".repeat(400), 50);
    expect(chunks.length).to.be.greaterThan(1);
  });
});
