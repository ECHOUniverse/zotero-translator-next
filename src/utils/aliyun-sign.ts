/**
 * 阿里云 RPC API 签名（HMAC-SHA1 + Base64）。
 * @see https://help.aliyun.com/zh/machine-translation/developer-reference/api-alimt-2018-10-12-endpoint
 */

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function hmacSha1(key: string, message: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
}

/** RFC3986 编码（阿里云签名用） */
export function encodeRFC3986URIComponent(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function randomNonce(length = 12): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export interface AliyunTranslateGeneralParams {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint?: string;
  sourceText: string;
  targetLang: string;
  action?: string;
  scene?: string;
}

export interface AliyunSignedForm {
  url: string;
  body: string;
}

/** 构建 TranslateGeneral 已签名的 form body */
export async function signAliyunTranslateGeneral(
  params: AliyunTranslateGeneralParams,
): Promise<AliyunSignedForm> {
  const endpoint = params.endpoint?.trim() || "https://mt.aliyuncs.com/";
  const url = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  const action = params.action?.trim() || "TranslateGeneral";
  const scene = params.scene?.trim() || "general";

  const encodedBody = `AccessKeyId=${params.accessKeyId}&Action=${action}&Format=JSON&FormatType=text&Scene=${scene}&SignatureMethod=HMAC-SHA1&SignatureNonce=${encodeURIComponent(
    randomNonce(12),
  )}&SignatureVersion=1.0&SourceLanguage=auto&SourceText=${encodeRFC3986URIComponent(
    params.sourceText,
  )}&TargetLanguage=${toAliyunLang(params.targetLang)}&Timestamp=${encodeURIComponent(
    new Date().toISOString(),
  )}&Version=2018-10-12`;

  const stringToSign = `POST&%2F&${encodeURIComponent(encodedBody)}`;
  const signature = toBase64(
    await hmacSha1(`${params.accessKeySecret}&`, stringToSign),
  );

  return {
    url,
    body: `${encodedBody}&Signature=${encodeURIComponent(signature)}`,
  };
}

/** 插件语言码 → 阿里云 TargetLanguage */
export function toAliyunLang(code: string): string {
  const c = code.trim().toLowerCase();
  if (c === "zh-tw" || c === "zh-hk" || c === "zh-mo" || c === "zh-hant") {
    return "zh-tw";
  }
  if (c === "zh-cn" || c === "zh-hans" || c === "zh") return "zh";
  return c.split("-")[0];
}
