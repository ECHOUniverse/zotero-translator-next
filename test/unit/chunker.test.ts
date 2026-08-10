import { expect } from "chai";
import { chunkText } from "../../src/utils/chunker.js";

describe("chunkText 分块策略", function () {
  it("空文本 → 空数组", function () {
    expect(chunkText("", 100)).to.deep.equal([]);
    expect(chunkText("   ", 100)).to.deep.equal([]);
  });

  it("短文本 → 单块", function () {
    expect(chunkText("hello world", 100)).to.deep.equal(["hello world"]);
  });

  it("按段落切块（段间空行）", function () {
    const text = "Para one is here.\n\nPara two is there.";
    expect(chunkText(text, 100)).to.deep.equal([
      "Para one is here.",
      "Para two is there.",
    ]);
  });

  it("超长段按句子边界切分", function () {
    const text = "Sentence one. Sentence two! Sentence three? Sentence four.";
    const chunks = chunkText(text, 30);
    expect(chunks.length).to.be.greaterThan(1);
    for (const c of chunks) expect(c.length).to.be.at.most(30);
    expect(chunks.join(" ")).to.equal(text);
  });

  it("中文句号/问号/感叹号作为边界", function () {
    const text = "第一句。第二句！第三句？第四句。";
    const chunks = chunkText(text, 8);
    for (const c of chunks) expect(c.length).to.be.at.most(8);
    expect(chunks.join("")).to.equal(text);
    expect(chunks.length).to.equal(4);
  });

  it("单句超长 → 硬切（保持拼接还原）", function () {
    const text = "a".repeat(250);
    const chunks = chunkText(text, 100);
    expect(chunks.length).to.equal(3);
    for (const c of chunks) expect(c.length).to.be.at.most(100);
    expect(chunks.join("")).to.equal(text);
  });

  it("句子边界后的引号/空白处理", function () {
    const text = 'He said "A. B." then left.';
    const chunks = chunkText(text, 15);
    for (const c of chunks) expect(c.length).to.be.at.most(15);
    expect(chunks.join(" ")).to.equal(text);
  });

  it("maxChars 为 0/负 → 单字符块", function () {
    const text = "abc";
    expect(chunkText(text, 0).join("")).to.equal(text);
    expect(chunkText(text, -5).join("")).to.equal(text);
  });

  it("段落+句切分混合场景", function () {
    const text =
      "Short para.\n\nLong para with several sentences. Second sentence here. Third one!";
    const chunks = chunkText(text, 25);
    expect(chunks[0]).to.equal("Short para.");
    for (const c of chunks) expect(c.length).to.be.at.most(25);
    const joined = chunks.join(" ");
    expect(joined).to.include("Second sentence here");
    expect(joined).to.include("Third one!");
  });

  it("保留换行段落结构（段内有换行不切分）", function () {
    const text = "Line one\nline two\n\nNew para";
    expect(chunkText(text, 50)).to.deep.equal([
      "Line one\nline two",
      "New para",
    ]);
  });
});
