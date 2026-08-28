/**
 * 轻量 Markdown → DOM（安全：仅用 createElementNS，禁止 innerHTML）。
 * 支持：h1–h6、ul/ol、段落、**bold**、*italic*。
 */

const HTML_NS = "http://www.w3.org/1999/xhtml";

export type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; text: string };

type Block = MarkdownBlock;

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const UL_RE = /^[-*]\s+(.+)$/;
const OL_RE = /^(\d+)\.\s+(.+)$/;

function el(doc: Document, tag: string): HTMLElement {
  return doc.createElementNS(HTML_NS, tag) as HTMLElement;
}

/** 块级 Markdown 解析（可单测） */
export function parseBlocks(text: string): Block[] {
  const lines = (text ?? "").split("\n");
  const blocks: Block[] = [];
  let ulItems: string[] | null = null;
  let olItems: string[] | null = null;

  const flushList = (): void => {
    if (ulItems) {
      blocks.push({ kind: "ul", items: ulItems });
      ulItems = null;
    }
    if (olItems) {
      blocks.push({ kind: "ol", items: olItems });
      olItems = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) {
      flushList();
      continue;
    }

    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flushList();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      continue;
    }

    const ul = UL_RE.exec(trimmed);
    if (ul) {
      if (olItems) {
        blocks.push({ kind: "ol", items: olItems });
        olItems = null;
      }
      ulItems ??= [];
      ulItems.push(ul[1]);
      continue;
    }

    const ol = OL_RE.exec(trimmed);
    if (ol) {
      if (ulItems) {
        blocks.push({ kind: "ul", items: ulItems });
        ulItems = null;
      }
      olItems ??= [];
      olItems.push(ol[2]);
      continue;
    }

    flushList();
    blocks.push({ kind: "p", text: trimmed });
  }

  flushList();
  return blocks;
}

/** 行内 **bold** / *italic* → DOM 子节点 */
function appendInline(doc: Document, parent: HTMLElement, text: string): void {
  let i = 0;
  while (i < text.length) {
    const boldStart = text.indexOf("**", i);
    const italicStart = findItalicStart(text, i);

    let next = -1;
    let kind: "bold" | "italic" | null = null;
    if (boldStart !== -1 && (italicStart === -1 || boldStart <= italicStart)) {
      next = boldStart;
      kind = "bold";
    } else if (italicStart !== -1) {
      next = italicStart;
      kind = "italic";
    }

    if (next === -1 || kind === null) {
      if (i < text.length) {
        parent.append(text.slice(i));
      }
      break;
    }

    if (next > i) {
      parent.append(text.slice(i, next));
    }

    if (kind === "bold") {
      const end = text.indexOf("**", next + 2);
      if (end === -1) {
        parent.append(text.slice(next));
        break;
      }
      const strong = el(doc, "strong");
      appendInline(doc, strong, text.slice(next + 2, end));
      parent.append(strong);
      i = end + 2;
      continue;
    }

    const end = findItalicEnd(text, next + 1);
    if (end === -1) {
      parent.append(text.slice(next));
      break;
    }
    const em = el(doc, "em");
    appendInline(doc, em, text.slice(next + 1, end));
    parent.append(em);
    i = end + 1;
  }
}

function findItalicStart(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] !== "*") continue;
    if (text[i + 1] === "*") {
      i++;
      continue;
    }
    if (i > 0 && text[i - 1] === "*") continue;
    return i;
  }
  return -1;
}

function findItalicEnd(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] !== "*") continue;
    if (text[i + 1] === "*") {
      i++;
      continue;
    }
    if (i > from && text[i - 1] === "*") continue;
    return i;
  }
  return -1;
}

function appendBlock(doc: Document, parent: HTMLElement, block: Block): void {
  switch (block.kind) {
    case "heading": {
      const level = Math.min(Math.max(block.level, 1), 6);
      const tag = `h${level}`;
      const node = el(doc, tag);
      appendInline(doc, node, block.text);
      parent.append(node);
      break;
    }
    case "ul": {
      const ul = el(doc, "ul");
      for (const item of block.items) {
        const li = el(doc, "li");
        appendInline(doc, li, item);
        ul.append(li);
      }
      parent.append(ul);
      break;
    }
    case "ol": {
      const ol = el(doc, "ol");
      for (const item of block.items) {
        const li = el(doc, "li");
        appendInline(doc, li, item);
        ol.append(li);
      }
      parent.append(ol);
      break;
    }
    case "p": {
      const p = el(doc, "p");
      appendInline(doc, p, block.text);
      parent.append(p);
      break;
    }
  }
}

export function parseMarkdownToFragment(
  doc: Document,
  text: string,
): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const wrapper = el(doc, "div");
  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    const p = el(doc, "p");
    p.textContent = text ?? "";
    wrapper.append(p);
  } else {
    for (const block of blocks) {
      appendBlock(doc, wrapper, block);
    }
  }
  while (wrapper.firstChild) {
    fragment.appendChild(wrapper.firstChild);
  }
  return fragment;
}
