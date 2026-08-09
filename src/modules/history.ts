/**
 * 翻译历史（Zotero 主库自定义表）
 * 说明：方案原计划用 Zotero.DataAccessObject，但该 API 在 zotero-types 与
 * Zotero 9 源码中均不可验证，改用官方稳定且带类型的 Zotero.DB 直接建表/查询，
 * 同样满足"数据库自定义表 + 缓存复用 + 容量清理"的意图。
 */
import { fnv1a64 } from "../utils/hash";
import { getPref } from "../utils/prefs";

const TABLE = "translation_history";

export interface HistoryRecord {
  id: number;
  itemID: number | null;
  sourceHash: string;
  sourceText: string;
  formattedText: string | null;
  translatedText: string;
  summary: string | null;
  sourceLang: string;
  targetLang: string;
  engine: string;
  createdAt: number;
}

export type NewHistoryRecord = Omit<
  HistoryRecord,
  "id" | "createdAt" | "sourceHash"
> & { createdAt?: number };

export function hashSource(text: string): string {
  return fnv1a64(text);
}

/** 建表（启动时调用；幂等） */
export async function ensureHistoryTable(): Promise<void> {
  if (await Zotero.DB.tableExists(TABLE)) return;
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemID INTEGER,
        sourceHash TEXT NOT NULL,
        sourceText TEXT NOT NULL,
        formattedText TEXT,
        translatedText TEXT NOT NULL,
        summary TEXT,
        sourceLang TEXT DEFAULT 'auto',
        targetLang TEXT DEFAULT 'zh-CN',
        engine TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )`,
    );
    await Zotero.DB.queryAsync(
      `CREATE INDEX IF NOT EXISTS idx_${TABLE}_item ON ${TABLE} (itemID)`,
    );
    await Zotero.DB.queryAsync(
      `CREATE INDEX IF NOT EXISTS idx_${TABLE}_created ON ${TABLE} (createdAt)`,
    );
    await Zotero.DB.queryAsync(
      `CREATE INDEX IF NOT EXISTS idx_${TABLE}_cache ON ${TABLE} (sourceHash, targetLang, engine)`,
    );
  });
}

function rowToRecord(row: any): HistoryRecord {
  return {
    id: Number(row.id),
    itemID: row.itemID == null ? null : Number(row.itemID),
    sourceHash: String(row.sourceHash),
    sourceText: String(row.sourceText),
    formattedText: row.formattedText == null ? null : String(row.formattedText),
    translatedText: String(row.translatedText),
    summary: row.summary == null ? null : String(row.summary),
    sourceLang: String(row.sourceLang),
    targetLang: String(row.targetLang),
    engine: String(row.engine),
    createdAt: Number(row.createdAt),
  };
}

/** 新增历史记录，返回 id；插入后执行容量清理 */
export async function addHistory(rec: NewHistoryRecord): Promise<number> {
  const createdAt = rec.createdAt ?? Date.now();
  const sourceHash = hashSource(rec.sourceText);
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(
      `INSERT INTO ${TABLE}
        (itemID, sourceHash, sourceText, formattedText, translatedText, summary,
         sourceLang, targetLang, engine, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rec.itemID ?? null,
        sourceHash,
        rec.sourceText,
        rec.formattedText ?? null,
        rec.translatedText,
        rec.summary ?? null,
        rec.sourceLang,
        rec.targetLang,
        rec.engine,
        createdAt,
      ],
    );
  });
  const max = getPref("historyCapacity");
  if (max > 0) await enforceCapacity(max);
  const row = (await Zotero.DB.rowQueryAsync(
    `SELECT id FROM ${TABLE} WHERE createdAt = ? ORDER BY id DESC LIMIT 1`,
    [createdAt],
  )) as { id: number } | false;
  return row ? Number(row.id) : -1;
}

/**
 * 缓存命中查询：相同（原文 hash + 目标语言）在任一已启用渠道下命中即返回。
 * @param engines 当前渠道 id 列表（按回退顺序）
 */
export async function findCache(
  sourceHash: string,
  targetLang: string,
  engines: string[],
): Promise<HistoryRecord | null> {
  if (engines.length === 0) return null;
  const placeholders = engines.map(() => "?").join(",");
  const rows = await Zotero.DB.queryAsync(
    `SELECT * FROM ${TABLE}
     WHERE sourceHash = ? AND targetLang = ? AND engine IN (${placeholders})
     ORDER BY id DESC LIMIT 1`,
    [sourceHash, targetLang, ...engines],
  );
  if (!rows || rows.length === 0) return null;
  return rowToRecord(rows[0]);
}

export interface ListOptions {
  itemID?: number;
  limit?: number;
  offset?: number;
}

/** 历史列表（按时间倒序） */
export async function listHistory(opts: ListOptions = {}): Promise<HistoryRecord[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.itemID != null) {
    conds.push("itemID = ?");
    params.push(opts.itemID);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const limit = opts.limit ? `LIMIT ${Number(opts.limit)}` : "";
  const offset = opts.offset ? `OFFSET ${Number(opts.offset)}` : "";
  const rows = await Zotero.DB.queryAsync(
    `SELECT * FROM ${TABLE} ${where} ORDER BY createdAt DESC ${limit} ${offset}`,
    params,
  );
  return (rows ?? []).map(rowToRecord);
}

/** 单条删除 */
export async function deleteHistory(id: number): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  });
}

/** 按条目删除 */
export async function deleteByItem(itemID: number): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(`DELETE FROM ${TABLE} WHERE itemID = ?`, [itemID]);
  });
}

/** 清空全部 */
export async function clearAllHistory(): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(`DELETE FROM ${TABLE}`);
  });
}

/** 容量清理：删除最旧的超出部分，返回删除条数 */
export async function enforceCapacity(max: number): Promise<number> {
  if (max <= 0) return 0;
  const count = await Zotero.DB.valueQueryAsync<number>(
    `SELECT COUNT(*) FROM ${TABLE}`,
  );
  const total = Number(count ?? 0);
  if (total <= max) return 0;
  const toDelete = total - max;
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(
      `DELETE FROM ${TABLE} WHERE id IN (
         SELECT id FROM ${TABLE} ORDER BY createdAt ASC, id ASC LIMIT ?
       )`,
      [toDelete],
    );
  });
  return toDelete;
}

/** 更新总结 */
export async function updateSummary(id: number, summary: string): Promise<void> {
  await Zotero.DB.executeTransaction(async () => {
    await Zotero.DB.queryAsync(`UPDATE ${TABLE} SET summary = ? WHERE id = ?`, [
      summary,
      id,
    ]);
  });
}
