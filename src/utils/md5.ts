/**
 * MD5 十六进制摘要（百度翻译签名等）。
 * 优先使用 Zotero.Utilities.Internal.md5；单测环境可注入 globalThis 上的 Zotero stub。
 */

export function md5Hex(input: string): string {
  const z = (
    globalThis as {
      Zotero?: {
        Utilities?: {
          Internal?: { md5?: (s: string, raw?: boolean) => string };
        };
      };
    }
  ).Zotero;
  const fn = z?.Utilities?.Internal?.md5;
  if (typeof fn === "function") {
    return fn(input, false);
  }
  throw new Error("MD5 unavailable: Zotero.Utilities.Internal.md5 not found");
}
