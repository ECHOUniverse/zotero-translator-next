/**
 * AI 总结：复用当前启用的 LLM（OpenAI 兼容）渠道。
 * @see PLAN.md §10
 * - 模型/提示词可独立覆盖（prefs.summary.model / summary.prompt）
 * - 总结语言独立设置（prefs.summary.lang，默认 auto 跟随目标语言）
 * - SSE 流式显示；可存入历史（translation_history.summary）与文献笔记
 */

import { prefs } from "../prefs";
import { consumeSSE } from "../utils/sse";
import { requestStream } from "../utils/network";
import type { CancelToken } from "../utils/cancel";
import { langDisplayName } from "../utils/lang";
import { channelRegistry } from "../services";
import { updateSummary } from "./history";

export interface SummaryResult {
  text: string;
  channelId: string;
}

/** 默认总结提示词（D7：中文结构化模板；{targetLang} 在 buildPrompt 中插值） */
export const DEFAULT_SUMMARY_PROMPT = `你是学术助理。请用 {targetLang} 对以下翻译文本进行结构化总结：
## 研究问题
## 研究方法
## 主要发现
## 结论
## 局限（如原文提及）
控制在 300 字以内，基于文本内容，不要编造。`;

/**
 * 构建总结 system prompt（纯函数，可单测）：
 * - 自定义提示词非空时覆盖默认模板
 * - `{targetLang}` 用语言名替换（zh-CN → 中文、en-US → English；未知代号回退原文）
 */
export function buildPrompt(prompt: string | undefined, lang: string): string {
  const template = (prompt ?? "").trim() || DEFAULT_SUMMARY_PROMPT;
  return template.replaceAll("{targetLang}", langDisplayName(lang));
}

/**
 * 解析总结语言（纯函数）：
 * `auto` 或空 → 跟随翻译目标语言；否则使用指定语言码。
 */
export function resolveSummaryLang(
  summaryLang: string | undefined,
  targetLang: string,
): string {
  const lang = (summaryLang ?? "").trim();
  if (!lang || lang === "auto") return targetLang || "zh-CN";
  return lang;
}

/** 总结笔记固定标题（Zotero 笔记标题取自首个标题元素） */
export const NOTE_TITLE = "AI 总结";

/** 解析笔记 HTML 的首个标题文本（h1–h6，剥标签与实体） */
export function parseNoteTitle(noteHTML: string): string {
  const m = noteHTML.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (!m) return "";
  return m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** 是否为"AI 总结"笔记（标题判定，纯函数） */
export function isSummaryNote(noteHTML: string): boolean {
  return parseNoteTitle(noteHTML) === NOTE_TITLE;
}

/** 构建总结笔记 HTML：`<h1>AI 总结</h1><p>…总结文本…</p>` */
export function buildNoteHTML(summary: string): string {
  const body = summary
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<h1>${NOTE_TITLE}</h1><p>${body}</p>`;
}

export class SummaryManager {
  /** 是否有可用的 LLM 渠道 */
  hasAvailableLLM(): boolean {
    return channelRegistry
      .listEnabled()
      .some((m) => m.kind === "llm" && m.configured);
  }

  /**
   * 流式总结。全量发送（D9），不截断。
   * @param text 待总结文本（译文）
   * @param onChunk 流式增量回调
   */
  async summarize(
    text: string,
    onChunk: (delta: string) => void,
    token: CancelToken,
  ): Promise<SummaryResult> {
    const metas = channelRegistry.listEnabled();
    const llmMeta = metas.find((m) => m.kind === "llm" && m.configured);
    if (!llmMeta) {
      throw new Error("No available LLM channel configured");
    }
    const svc = channelRegistry.get(llmMeta.id);
    if (!svc) {
      throw new Error(`Channel ${llmMeta.id} not found`);
    }

    // 若自定义了总结模型，克隆配置并覆盖
    const customModel = prefs.summaryModel.trim();
    // 总结语言：auto → 跟随翻译目标语言
    const lang = resolveSummaryLang(prefs.summaryLang, prefs.targetLang);
    const prompt = buildPrompt(prefs.summaryPrompt, lang);

    let baseURL: string | undefined;
    let apiKey: string | undefined;
    let model: string | undefined;
    if (llmMeta.id === "deepseek") {
      baseURL = prefs.deepseekBaseURL;
      apiKey = prefs.deepseekApiKey;
      model = customModel || prefs.deepseekModel;
    } else if (llmMeta.id.startsWith("custom:")) {
      const cfg = prefs.customChannels.find(
        (c) => `custom:${c.id}` === llmMeta.id,
      );
      baseURL = cfg?.baseURL;
      apiKey = cfg?.apiKey;
      model = customModel || cfg?.model;
    }

    if (!baseURL || !apiKey) {
      throw new Error(`Channel ${llmMeta.id} is not fully configured`);
    }

    const messages = [
      { role: "system" as const, content: prompt },
      { role: "user" as const, content: text },
    ];

    const url = `${baseURL.replace(/\/+$/, "")}/chat/completions`;
    const response = await requestStream({
      url,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      json: {
        model,
        messages,
        stream: true,
        temperature: 0.3,
      },
      token,
      timeoutMs: prefs.timeout,
    });

    let fullText = "";
    await consumeSSE(
      response.body,
      (data) => {
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // 忽略解析失败行
        }
      },
      token,
    );

    return { text: fullText, channelId: llmMeta.id };
  }

  /** 保存总结到历史记录 */
  async saveSummary(historyID: number, summary: string): Promise<void> {
    await updateSummary(historyID, summary);
  }

  /**
   * 写入/更新文献笔记（D8）：
   * 1. itemID 为 null → 返回 null（UI 层已禁用按钮，双保险）
   * 2. 遍历 `item.getNotes()`，解析首行标题查找固定标题"AI 总结"
   * 3. 存在 → `setNote()` 覆盖更新（保留原 noteID）
   * 4. 不存在 → 新建子笔记（`new Zotero.Item("note")` + parentItemID）
   * @returns 笔记条目；无关联条目/条目不存在时为 null
   */
  async saveNote(
    itemID: number | null,
    summary: string,
  ): Promise<Zotero.Item | null> {
    if (itemID == null) return null;
    let item: Zotero.Item;
    try {
      item = Zotero.Items.get(itemID);
    } catch {
      return null;
    }
    if (!item) return null;

    const html = buildNoteHTML(summary);
    for (const noteID of item.getNotes()) {
      const note = Zotero.Items.get(noteID);
      if (!note) continue;
      try {
        if (isSummaryNote(note.getNote())) {
          note.setNote(html);
          await note.saveTx();
          return note;
        }
      } catch {
        // 单个笔记读取失败不阻断后续
      }
    }

    const note = new Zotero.Item("note");
    note.parentItemID = itemID;
    note.setNote(html);
    await note.saveTx();
    return note;
  }
}
