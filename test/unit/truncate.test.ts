import { expect } from "chai";
import { headTail } from "../../src/utils/truncate";

describe("headTail 头尾摘要", function () {
  it("短文本：不截断，原样返回", function () {
    expect(headTail("short text")).to.equal("short text");
    expect(headTail("")).to.equal("");
  });

  it("恰好等于头+尾长度：不截断", function () {
    const text = "a".repeat(48);
    expect(headTail(text, 24, 24)).to.equal(text);
  });

  it("超长：头 24 + … + 尾 24", function () {
    const text = "a".repeat(60);
    const out = headTail(text, 24, 24);
    expect(out).to.equal("a".repeat(24) + "…" + "a".repeat(24));
    expect(Array.from(out)).to.have.length(49); // 24 + 1 + 24
  });

  it("按 code point 截断：不切断代理对（emoji）", function () {
    const text = "😀".repeat(60);
    const out = headTail(text, 24, 24);
    // 每个 emoji 是 1 个 code point，不应出现半个代理对（�）
    expect(out).to.not.include("\uFFFD");
    expect(Array.from(out)).to.have.length(49);
    expect(out).to.equal("😀".repeat(24) + "…" + "😀".repeat(24));
  });

  it("中文：按字符截断，头尾保留", function () {
    const text = "我们进一步绘制了图4和图3中所有相关结构的焓作为压力的函数。";
    const out = headTail(text, 10, 10);
    expect(out).to.equal("我们进一步绘制了图4…的焓作为压力的函数。");
  });

  it("自定义头尾长度", function () {
    const text = "abcdefghij";
    expect(headTail(text, 3, 2)).to.equal("abc…ij");
    expect(headTail(text, 3, 2)).to.have.length(6);
  });
});
