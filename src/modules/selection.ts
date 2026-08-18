/**
 * 跨区域选区（多选拼段翻译）数据层。
 *
 * 内存级 Map<itemID, SelectionRegion[]>：
 * - 切换标签页/文献不丢（按文献隔离）；手动「清空」重置；翻译后不自动清空
 * - 上限 50 段（add 拒绝 + reason='limit'）
 * - 排序：pageIndex 升序 → sortIndex 升序（与添加顺序无关）
 * - 去重：同「页+位置」（pageIndex + sortIndex）静默去重
 *
 * 纯逻辑、无 Zotero 依赖（可单测）；ztoolkit 兜底防单测环境无全局。
 * @see docs/plans/更新实施-跨区域选择.md §5/§6.5
 */

export interface SelectionRegion {
  /** 添加顺序号（从 1 起；数据模型字段，列表展示序号用排序后位置 ordinal） */
  seq: number;
  /** 页码（0 基，来自 annotation.position.pageIndex） */
  pageIndex: number;
  /** 页内文档序（来自 annotation.sortIndex） */
  sortIndex: number;
  /** 页签文案（来自 annotation.pageLabel，如 "p. 3"） */
  pageLabel: string;
  /** 区域原文 */
  text: string;
  /** 去重键：pageIndex + sortIndex */
  key: string;
}

export type SelectionAddResult =
  | { added: true; count: number }
  | { added: false; reason: "dup" | "limit"; count: number };

/** 文档顺序比较器：pageIndex 升序 → sortIndex 升序（get/joinRegions 共享） */
export function compareRegion(
  a: Pick<SelectionRegion, "pageIndex" | "sortIndex">,
  b: Pick<SelectionRegion, "pageIndex" | "sortIndex">,
): number {
  return a.pageIndex - b.pageIndex || a.sortIndex - b.sortIndex;
}

export class SelectionManager {
  private regions = new Map<number, SelectionRegion[]>();
  private listeners = new Set<() => void>();
  static readonly MAX_REGIONS = 50;

  /**
   * 加入区域。
   * - 已存在（同 key）→ { added: false, reason: 'dup' }
   * - 超上限 → { added: false, reason: 'limit' }
   * - 成功 → { added: true, count }（count 为加入后总数）
   *
   * sortIndex 可缺省（旧环境 annotation 无此字段，规格 §6.2 兜底）：
   * 缺失时取添加顺序号，key 保持唯一，排序退化为添加顺序。
   */
  add(
    itemID: number,
    region: Omit<SelectionRegion, "seq" | "key" | "sortIndex"> & {
      sortIndex?: number;
    },
  ): SelectionAddResult {
    const list = this.regions.get(itemID) ?? [];
    const sortIndex = region.sortIndex ?? list.length + 1;
    const key = `${region.pageIndex}:${sortIndex}`;
    if (list.some((r) => r.key === key)) {
      return { added: false, reason: "dup", count: list.length };
    }
    if (list.length >= SelectionManager.MAX_REGIONS) {
      return { added: false, reason: "limit", count: list.length };
    }
    list.push({ ...region, sortIndex, key, seq: list.length + 1 });
    this.regions.set(itemID, list);
    this.emit();
    return { added: true, count: list.length };
  }

  /** 移除指定区域（key 不存在时无副作用） */
  remove(itemID: number, key: string): void {
    const list = this.regions.get(itemID);
    if (!list) return;
    const next = list.filter((r) => r.key !== key);
    if (next.length === list.length) return;
    if (next.length === 0) {
      this.regions.delete(itemID);
    } else {
      this.regions.set(itemID, next);
    }
    this.emit();
  }

  /** 清空某文献全部区域 */
  clear(itemID: number): void {
    if (!this.regions.delete(itemID)) return;
    this.emit();
  }

  /** 按文档顺序返回排序后的副本（pageIndex → sortIndex） */
  get(itemID: number): SelectionRegion[] {
    return [...(this.regions.get(itemID) ?? [])].sort(compareRegion);
  }

  has(itemID: number): boolean {
    return (this.regions.get(itemID)?.length ?? 0) > 0;
  }

  /** 区块订阅：add/remove/clear 后触发（区块据此 setEnabled + 重绘） */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (e) {
        (globalThis as any).ztoolkit?.log?.(
          `selection listener error: ${(e as Error).message}`,
        );
      }
    }
  }
}

/**
 * 拼接为完整段落（翻译全部入口）：
 * - 按文档顺序（pageIndex → sortIndex）拼接
 * - 区域边界连字符修复：前段以 "字母-" 结尾且后段小写字母开头 → 直接相连
 *   （双栏/跨页拆词，如 "transla-" + "tion" → "translation"）
 * - 其余以空格拼接；空文本跳过
 */
export function joinRegions(regions: SelectionRegion[]): string {
  const sorted = [...regions].sort(compareRegion);
  let out = "";
  for (const r of sorted) {
    const t = r.text.trim();
    if (!t) continue;
    if (!out) {
      out = t;
      continue;
    }
    if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(t)) {
      out = out.slice(0, -1) + t;
    } else {
      out += " " + t;
    }
  }
  return out;
}
