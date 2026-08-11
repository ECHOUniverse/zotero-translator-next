/**
 * 翻译历史：Zotero.DB 自定义表（PLAN §5 实施偏差：DataAccessObject 不可验证，
 * 改用官方稳定且有类型的 Zotero.DB）。
 *
 * 表 translation_history：
 * - sourceHash = FNV-1a64(格式化后文本)，缓存查询索引
 * - 缓存命中：精确匹配 (engine, targetLang, sourceHash)
 * - 容量：默认 500 条，超限清理最旧
 * - 删除：单条 / 按条目 / 清空
 */

import { fnv1a64 } from "../utils/hash";
import type { TranslateChannelId } from "../services/base";

export interface HistoryEntry {
  id: number;
  itemID: number | null;
  sourceHash: string;
  sourceText: string;
  formattedText: string | null;
  translatedText: string;
  summary: string | null;
  sourceLang: string;
  targetLang: string;
  engine: TranslateChannelId;
  createdAt: number;
}

const TABLE = "translation_history";
const SCHEMA = `CREATE TABLE IF NOT EXISTS ${TABLE} (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  itemID        INTEGER,
  sourceHash    TEXT NOT NULL,
  sourceText    TEXT NOT NULL,
  formattedText TEXT,
  translatedText TEXT NOT NULL,
  summary       TEXT,
  sourceLang    TEXT DEFAULT 'auto',
  targetLang    TEXT DEFAULT 'zh-CN',
  engine        TEXT NOT NULL,
  createdAt     INTEGER NOT NULL
)`;
const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_history_item ON ${TABLE} (itemID)`,
  `CREATE INDEX IF NOT EXISTS idx_history_created ON ${TABLE} (createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_history_cache ON ${TABLE} (engine, targetLang, sourceHash)`,
];

export function hashSource(text: string): string {
  return fnv1a64(text);
}

let initialized = false;

/** 建表（幂等；startup 时调用） */
export async function ensureHistoryTable(): Promise<void> {
  if (initialized) return;
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(SCHEMA);
    for (const sql of INDEXES) {
      await Zotero.DB.queryAsync(sql);
    }
  });
  initialized = true;
}

/** 插入历史记录，返回新行 id */
export async function addHistory(
  entry: Omit<HistoryEntry, "id" | "createdAt">,
): Promise<number> {
  const createdAt = Date.now();
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(
      `INSERT INTO ${TABLE}
        (itemID, sourceHash, sourceText, formattedText, translatedText,
         summary, sourceLang, targetLang, engine, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.itemID ?? null,
        entry.sourceHash,
        entry.sourceText,
        entry.formattedText ?? null,
        entry.translatedText,
        entry.summary ?? null,
        entry.sourceLang,
        entry.targetLang,
        entry.engine,
        createdAt,
      ],
    );
    // 容量清理：超限删除最旧
    await trimHistory();
  });
  return createdAt;
}

/** 容量清理（事务内调用） */
async function trimHistory(): Promise<void> {
  const capacity = Zotero.Prefs.get(
    "extensions.zotero.zotero-translator-next.historyCapacity",
    true,
  ) as number;
  if (!capacity || capacity <= 0) return;
  await Zotero.DB.queryAsync(
    `DELETE FROM ${TABLE}
     WHERE id IN (
       SELECT id FROM ${TABLE}
       ORDER BY createdAt DESC
       LIMIT -1 OFFSET ?
     )`,
    [capacity],
  );
}

/** 缓存查询：精确命中返回历史译文 */
export async function queryCache(
  sourceHash: string,
  targetLang: string,
  engine: TranslateChannelId,
): Promise<HistoryEntry | null> {
  const row = await Zotero.DB.rowQueryAsync(
    `SELECT * FROM ${TABLE}
     WHERE engine = ? AND targetLang = ? AND sourceHash = ?
     ORDER BY createdAt DESC LIMIT 1`,
    [engine, targetLang, sourceHash],
  );
  return row ? (row as HistoryEntry) : null;
}

/** 按条目查询历史（最新在前）；itemID 为 null 时返回全局最近历史 */
export async function getHistoryByItem(
  itemID: number | null,
  limit = 50,
): Promise<HistoryEntry[]> {
  const rows =
    itemID == null
      ? await Zotero.DB.queryAsync(
          `SELECT * FROM ${TABLE}
         ORDER BY createdAt DESC LIMIT ?`,
          [limit],
        )
      : // SQLite `IS` 运算符：正确匹配 NULL（`= NULL` 恒为 false）
        await Zotero.DB.queryAsync(
          `SELECT * FROM ${TABLE}
         WHERE itemID IS ?
         ORDER BY createdAt DESC LIMIT ?`,
          [itemID, limit],
        );
  return (rows ?? []) as HistoryEntry[];
}

/** 全局历史（最新在前，分页） */
export async function getHistory(
  offset = 0,
  limit = 50,
): Promise<HistoryEntry[]> {
  const rows = await Zotero.DB.queryAsync(
    `SELECT * FROM ${TABLE}
     ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return (rows ?? []) as HistoryEntry[];
}

/** 历史总数 */
export async function getHistoryCount(): Promise<number> {
  const value = await Zotero.DB.valueQueryAsync<number>(
    `SELECT COUNT(*) FROM ${TABLE}`,
  );
  return Number(value ?? 0);
}

/** 删除单条 */
export async function deleteHistory(id: number): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  });
}

/** 按条目删除（itemID 为 null 时删除未关联条目的记录） */
export async function deleteHistoryByItem(
  itemID: number | null,
): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    if (itemID == null) {
      await Zotero.DB.queryAsync(`DELETE FROM ${TABLE} WHERE itemID IS NULL`);
    } else {
      await Zotero.DB.queryAsync(`DELETE FROM ${TABLE} WHERE itemID IS ?`, [
        itemID,
      ]);
    }
  });
}

/** 清空全部 */
export async function clearHistory(): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(`DELETE FROM ${TABLE}`);
  });
}

/** 更新总结 */
export async function updateSummary(
  id: number,
  summary: string,
): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(`UPDATE ${TABLE} SET summary = ? WHERE id = ?`, [
      summary,
      id,
    ]);
  });
}
