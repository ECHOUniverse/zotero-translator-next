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
