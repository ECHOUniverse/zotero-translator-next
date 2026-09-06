/**
 * Google 非官方网页翻译渠道（免费、无需 key）。
 * @see https://github.com/windingwind/zotero-pdf-translate/blob/main/src/modules/services/google.ts
 *
 * - GET https://translate.googleapis.com/translate_a/single?client=gtx&...
 * - 2026-09-06 国内探测超时；海外环境通常可用
 * - ⚠️ 未文档化端点，大陆常不可达；失败时走回退链
 */

import { prefs } from "../prefs";
import { requestJson } from "../utils/network";
import { detectLang } from "../utils/lang";
import type {
  TranslateChannelId,
  TranslateChunk,
  TranslateResult,
  TranslateService,
  TranslateTask,
} from "./base";

const GOOGLE_API = "https://translate.googleapis.com/translate_a/single";

const LANG_MAP: Record<string, string> = {
  "pt-BR": "pt",
};

/** Google translate_a 语言码 */
export function toGoogleLang(code: string): string {
  const c = code.trim();
  if (!c || c === "auto") return "auto";
  return LANG_MAP[c] ?? c.split("-")[0];
}

type GoogleTranslateResponse = Array<
  Array<[string, ...unknown[]] | null> | unknown
>;

function parseGoogleResponse(data: GoogleTranslateResponse): string {
  const segments = data?.[0];
  if (!Array.isArray(segments)) return "";
  let out = "";
  for (const seg of segments) {
    if (seg && Array.isArray(seg) && typeof seg[0] === "string") {
      out += seg[0];
    }
  }
  return out;
}

export class GoogleService implements TranslateService {
  readonly id: TranslateChannelId = "google";
  readonly name = "Google";
  readonly kind = "rule" as const;
  readonly supportsStreaming = false;

  isConfigured(): boolean {
    return true;
  }

  async translate(
    task: TranslateTask,
    onChunk?: (chunk: TranslateChunk) => void,
  ): Promise<TranslateResult> {
    let sourceLang = task.sourceLang;
    if (!sourceLang || sourceLang === "auto") {
      sourceLang = detectLang(task.sourceText);
    }

    const url = new URL(GOOGLE_API);
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", toGoogleLang(sourceLang));
    url.searchParams.set("tl", toGoogleLang(task.targetLang));
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", task.sourceText);

    const data = await requestJson<GoogleTranslateResponse>({
      url: url.toString(),
      method: "GET",
      token: task.token,
      timeoutMs: prefs.timeout,
    });

    const translated = parseGoogleResponse(data).trim();
    if (!translated) {
      throw new Error("Google empty response");
    }

    onChunk?.({ index: 0, total: 1, text: translated });
    return { text: translated, detectedLang: sourceLang };
  }
}
