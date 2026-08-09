/**
 * 64 位 FNV-1a 哈希（纯函数）
 * 用于历史缓存键：原文 hash + 渠道 + 目标语言。
 * 注：非加密哈希，碰撞概率对缓存场景可接受（与 PLAN 中 SHA-256 的偏差，
 *     换用同步实现以适配 Zotero 无 WebCrypto 的旧环境）。
 */

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET_64;
  const bytes = new TextEncoder().encode(input);
  for (const b of bytes) {
    hash ^= BigInt(b);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}
