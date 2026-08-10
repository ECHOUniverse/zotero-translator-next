import { expect } from "chai";
import { fnv1a64 } from "../../src/utils/hash";

describe("fnv1a64 哈希", function () {
  it("确定性：同一输入同一输出", function () {
    expect(fnv1a64("hello world")).to.equal(fnv1a64("hello world"));
  });

  it("不同输入不同输出", function () {
    expect(fnv1a64("hello")).to.not.equal(fnv1a64("hello "));
  });

  it("输出 16 位十六进制", function () {
    const out = fnv1a64("zotero-translator-next");
    expect(out).to.match(/^[0-9a-f]{16}$/);
  });

  it("空字符串可哈希", function () {
    expect(fnv1a64("")).to.match(/^[0-9a-f]{16}$/);
  });
});
