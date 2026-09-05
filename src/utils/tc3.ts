/**
 * 腾讯云 API 3.0 TC3-HMAC-SHA256 签名（零依赖，Web Crypto）。
 * @see https://cloud.tencent.com/document/product/551/30636
 */

export interface TC3SignOptions {
  secretId: string;
  secretKey: string;
  service: string;
  host: string;
  action: string;
  version: string;
  region: string;
  payload: string;
  /** Unix 秒级时间戳；测试可注入固定值 */
  timestamp?: number;
}

export interface TC3SignedRequest {
  headers: Record<string, string>;
  authorization: string;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  return toHex(digest);
}

async function hmacSha256(
  key: string | ArrayBuffer,
  message: string,
): Promise<ArrayBuffer> {
  const keyBytes =
    typeof key === "string"
      ? new TextEncoder().encode(key)
      : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
}

/** 构建 TC3 Authorization 头及配套公共请求头 */
export async function signTC3(
  options: TC3SignOptions,
): Promise<TC3SignedRequest> {
  const {
    secretId,
    secretKey,
    service,
    host,
    action,
    version,
    region,
    payload,
  } = options;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const contentType = "application/json; charset=utf-8";
  const hashedPayload = await sha256Hex(payload);

  const canonicalHeaders =
    `content-type:${contentType}\n` + `host:${host}\n` + `x-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";

  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  const secretDate = await hmacSha256(`TC3${secretKey}`, date);
  const secretService = await hmacSha256(secretDate, service);
  const secretSigning = await hmacSha256(secretService, "tc3_request");
  const signature = toHex(await hmacSha256(secretSigning, stringToSign));

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    authorization,
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": region,
    },
  };
}

/** 导出供单测校验中间步骤 */
export const tc3Internals = {
  sha256Hex,
  hmacSha256,
  toHex,
};
