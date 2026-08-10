import { expect } from "chai";
import { detectLang, normalizeLangCode } from "../../src/utils/lang";

describe("lang 语言检测", function () {
  it("中文检测", function () {
    expect(detectLang("这是一个测试文本")).to.equal("zh-CN");
  });

  it("英文检测", function () {
    expect(detectLang("This is an English text.")).to.equal("en");
  });

  it("日文检测（假名占优）", function () {
    expect(detectLang("これはテストです。カタカナテスト")).to.equal("ja");
  });

  it("韩文检测", function () {
    expect(detectLang("이것은 테스트입니다")).to.equal("ko");
  });

  it("空文本返回 other", function () {
    expect(detectLang("")).to.equal("other");
  });

  it("语言码规范化", function () {
    expect(normalizeLangCode("zh")).to.equal("zh-CN");
    expect(normalizeLangCode("ZH-HANS")).to.equal("zh-CN");
    expect(normalizeLangCode("zh-tw")).to.equal("zh-TW");
    expect(normalizeLangCode("auto")).to.equal("auto");
    expect(normalizeLangCode("en")).to.equal("en");
  });
});
