/**
 * 当前翻译渠道解析：显式用户选择 vs 设置顺序中第一个可用渠道。
 * 独立于 UI，供 sections / tasks / settings 共用。
 */

import { channelRegistry } from "../services";
import type { ChannelMeta } from "../services/base";

let explicitChannelId: string | null = null;

const listeners = new Set<() => void>();

function isChannelUsable(meta: ChannelMeta): boolean {
  return meta.enabled && meta.configured;
}

function firstUsableChannelId(): string {
  const usable = channelRegistry.listAll().find(isChannelUsable);
  return usable?.id ?? "mymemory";
}

/** 用户在下拉框中显式点选的渠道 */
export function setExplicitChannelId(id: string): void {
  explicitChannelId = id;
}

/** 解析当前应使用的渠道 id */
export function resolveActiveChannelId(): string {
  if (explicitChannelId) {
    const meta = channelRegistry
      .listAll()
      .find((m) => m.id === explicitChannelId);
    if (meta && isChannelUsable(meta)) {
      return explicitChannelId;
    }
  }
  return firstUsableChannelId();
}

/** 设置变更时通知 UI 刷新渠道下拉框 */
export function subscribeChannelPrefsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyChannelPrefsChanged(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      (
        globalThis as { ztoolkit?: { log: (msg: string) => void } }
      ).ztoolkit?.log?.(
        `[active-channel] prefs listener error: ${(e as Error).message}`,
      );
    }
  }
}

/** 测试用：重置显式选择 */
export function resetExplicitChannelForTests(): void {
  explicitChannelId = null;
}
