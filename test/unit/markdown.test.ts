import { expect } from "chai";
import { parseBlocks, parseMarkdownToFragment } from "../../src/utils/markdown";

type MockNode = {
  nodeType: number;
  nodeName: string;
  textContent: string;
  childNodes: MockNode[];
  parent: MockNode | null;
  append: (...nodes: Array<string | MockNode>) => void;
  firstChild: MockNode | null;
};

function createMockDoc(): Document {
  function createElement(tag: string): MockNode {
    const el: MockNode = {
      nodeType: 1,
      nodeName: tag.toUpperCase(),
      textContent: "",
      childNodes: [],
      parent: null,
      firstChild: null,
      append(...nodes: Array<string | MockNode>) {
        for (const n of nodes) {
          if (typeof n === "string") {
            const t: MockNode = {
              nodeType: 3,
              nodeName: "#text",
              textContent: n,
              childNodes: [],
              parent: this,
              append: () => {},
              firstChild: null,
            };
            this.childNodes.push(t);
            this.textContent += n;
          } else {
            n.parent = this;
            this.childNodes.push(n);
            this.textContent += n.textContent;
          }
        }
        this.firstChild = this.childNodes[0] ?? null;
      },
    };
    return el;
  }

  return {
    createDocumentFragment() {
      const nodes: MockNode[] = [];
      const frag = {
        childNodes: nodes,
        appendChild(node: MockNode) {
          if (node.parent) {
            node.parent.childNodes = node.parent.childNodes.filter(
              (c) => c !== node,
            );
            node.parent.firstChild = node.parent.childNodes[0] ?? null;
            node.parent.textContent = node.parent.childNodes
              .map((c) => c.textContent)
              .join("");
          }
          node.parent = null;
          nodes.push(node);
          return node;
        },
      };
      return frag as unknown as DocumentFragment;
    },
    createElementNS(_ns: string, tag: string) {
      return createElement(tag) as unknown as HTMLElement;
    },
  } as unknown as Document;
}

function walk(node: MockNode): string {
  if (node.nodeType === 3) return node.textContent;
  const inner = node.childNodes.map((c) => walk(c)).join("");
  return `<${node.nodeName.toLowerCase()}>${inner}</${node.nodeName.toLowerCase()}>`;
}

describe("markdown 解析", function () {
  describe("parseBlocks", function () {
    it("解析 h1–h3 标题", function () {
      const blocks = parseBlocks("# 一级\n## 二级\n### 三级");
      expect(blocks).to.deep.equal([
        { kind: "heading", level: 1, text: "一级" },
        { kind: "heading", level: 2, text: "二级" },
        { kind: "heading", level: 3, text: "三级" },
      ]);
    });

    it("合并连续无序列表", function () {
      expect(parseBlocks("- 第一项\n- 第二项")).to.deep.equal([
        { kind: "ul", items: ["第一项", "第二项"] },
      ]);
    });

    it("合并连续有序列表", function () {
      expect(parseBlocks("1. 一\n2. 二")).to.deep.equal([
        { kind: "ol", items: ["一", "二"] },
      ]);
    });

    it("普通段落（无 Markdown 语法）", function () {
      const text = "利用第一性原理计算，研究了 NaCl 的弹性常数。";
      expect(parseBlocks(text)).to.deep.equal([{ kind: "p", text }]);
    });

    it("空行分隔段落", function () {
      expect(parseBlocks("第一段\n\n第二段")).to.deep.equal([
        { kind: "p", text: "第一段" },
        { kind: "p", text: "第二段" },
      ]);
    });
  });

  describe("parseMarkdownToFragment", function () {
    it("解析 **粗体** 与 *斜体*", function () {
      const doc = createMockDoc();
      const fragment = parseMarkdownToFragment(
        doc,
        "这是 **粗体** 和 *斜体* 文本",
      ) as unknown as { childNodes: MockNode[] };
      const p = fragment.childNodes[0];
      expect(p.nodeName).to.equal("P");
      expect(walk(p)).to.equal(
        "<p>这是 <strong>粗体</strong> 和 <em>斜体</em> 文本</p>",
      );
    });

    it("含 < > 的文本不注入 HTML", function () {
      const doc = createMockDoc();
      const text = "a < b > c";
      const fragment = parseMarkdownToFragment(doc, text) as unknown as {
        childNodes: MockNode[];
      };
      expect(fragment.childNodes[0].textContent).to.equal(text);
      expect(fragment.childNodes[0].childNodes[0].nodeName).to.equal("#text");
    });

    it("空文本回退为单段落", function () {
      const doc = createMockDoc();
      const fragment = parseMarkdownToFragment(doc, "") as unknown as {
        childNodes: MockNode[];
      };
      expect(fragment.childNodes[0].nodeName).to.equal("P");
      expect(fragment.childNodes[0].textContent).to.equal("");
    });
  });
});
