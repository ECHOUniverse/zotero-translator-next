import { expect } from "chai";
import { signTC3, tc3Internals } from "../../src/utils/tc3";

describe("tc3", function () {
  it("sha256Hex 与腾讯云文档示例一致", async function () {
    const payload =
      '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}';
    const hash = await tc3Internals.sha256Hex(payload);
    expect(hash).to.equal(
      "35e9c5b0e3ae67532d3c9f17ead6c90222632e5b1ff7f6e89887f1398934f064",
    );
  });

  it("signTC3 生成完整 Authorization 与公共头", async function () {
    const payload = JSON.stringify({
      SourceText: "hello",
      Source: "en",
      Target: "zh",
      ProjectId: 0,
    });
    const signed = await signTC3({
      secretId: "AKID********************************",
      secretKey: "********************************",
      service: "tmt",
      host: "tmt.tencentcloudapi.com",
      action: "TextTranslate",
      version: "2018-03-21",
      region: "ap-guangzhou",
      payload,
      timestamp: 1551113065,
    });

    expect(signed.authorization).to.match(/^TC3-HMAC-SHA256 Credential=/);
    expect(signed.authorization).to.contain("SignedHeaders=content-type;host;x-tc-action");
    expect(signed.authorization).to.contain("Signature=");
    expect(signed.headers["Content-Type"]).to.equal(
      "application/json; charset=utf-8",
    );
    expect(signed.headers.Host).to.equal("tmt.tencentcloudapi.com");
    expect(signed.headers["X-TC-Action"]).to.equal("TextTranslate");
    expect(signed.headers["X-TC-Version"]).to.equal("2018-03-21");
    expect(signed.headers["X-TC-Timestamp"]).to.equal("1551113065");
    expect(signed.headers["X-TC-Region"]).to.equal("ap-guangzhou");
    expect(signed.headers.Authorization).to.equal(signed.authorization);
  });

  it("相同输入产生稳定签名", async function () {
    const opts = {
      secretId: "AKIDtest",
      secretKey: "secretkey",
      service: "tmt",
      host: "tmt.tencentcloudapi.com",
      action: "TextTranslate",
      version: "2018-03-21",
      region: "ap-beijing",
      payload: '{"SourceText":"hi","Source":"en","Target":"zh","ProjectId":0}',
      timestamp: 1700000000,
    };
    const a = await signTC3(opts);
    const b = await signTC3(opts);
    expect(a.authorization).to.equal(b.authorization);
  });
});
