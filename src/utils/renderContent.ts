/**
 * 内容区统一渲染：纯文本或 Markdown DOM。
 */

import { prefs } from "../prefs";
import { parseMarkdownToFragment } from "./markdown";

export type RenderMode = "plain" | "markdown";

export function renderContent(
  container: HTMLElement,
  text: string,
  options: { mode: RenderMode },
): void {
  const useMarkdown =
    options.mode === "markdown" && prefs.markdownRender && (text ?? "") !== "";

  if (!useMarkdown) {
    container.classList.remove("ztr-md");
    container.textContent = text ?? "";
    return;
  }

  container.classList.add("ztr-md");
  const doc = container.ownerDocument;
  if (!doc) {
    container.textContent = text;
    return;
  }
  container.replaceChildren(parseMarkdownToFragment(doc, text));
}

/** 流式结束后从纯文本切换到 Markdown（若 pref 开启） */
export function finalizeMarkdownContent(
  container: HTMLElement,
  text: string,
): void {
  renderContent(container, text, { mode: "markdown" });
}
