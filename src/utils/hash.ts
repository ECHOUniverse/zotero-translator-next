/**
 * FNV-1a 64-bit 哈希（同步、零依赖）。
 *
 * 方案原定 SHA-256，但 Zotero 旧环境（Firefox 60+）无 WebCrypto 同步 API，
 * 且历史表缓存键只需唯一性/低碰撞，FNV-1a64 足够（配合引擎+目标语言组合键）。
 * @see PLAN.md §5 实施偏差
 */

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }
  // 输出 16 位十六进制（8 字节）
  return hash.toString(16).padStart(16, "0");
}
