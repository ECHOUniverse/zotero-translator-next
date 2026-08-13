import { expect } from "chai";
import { SelectionManager, joinRegions } from "../../src/modules/selection";

/** 构造区域入参（省略 seq/key，由 manager 生成） */
function region(
  pageIndex: number,
  sortIndex: number,
  text: string,
  pageLabel?: string,
) {
  return {
    pageIndex,
    sortIndex,
    pageLabel: pageLabel ?? `p. ${pageIndex + 1}`,
    text,
  };
}

describe("SelectionManager 跨区域选区", function () {
  it("add：加入成功，count 递增，seq 从 1 起", function () {
    const m = new SelectionManager();
    const r1 = m.add(1, region(0, 0, "first"));
    expect(r1).to.deep.include({ added: true, count: 1 });
    const list = m.get(1);
    expect(list).to.have.length(1);
    expect(list[0].seq).to.equal(1);
    expect(list[0].key).to.equal("0:0");
    expect(list[0].text).to.equal("first");
    expect(list[0].pageLabel).to.equal("p. 1");

    const r2 = m.add(1, region(1, 5, "second"));
    expect(r2).to.deep.include({ added: true, count: 2 });
    expect(m.get(1)[1].seq).to.equal(2);
  });

  it("去重：同页+同 sortIndex 重复加入 → dup，列表不重复", function () {
    const m = new SelectionManager();
    m.add(1, region(2, 3, "text"));
    const dup = m.add(1, region(2, 3, "text again"));
    expect(dup).to.deep.equal({ added: false, reason: "dup", count: 1 });
    expect(m.get(1)).to.have.length(1);
    // 其他文献不受影响
    expect(m.has(2)).to.equal(false);
  });

  it("上限：第 51 段被拒 → limit", function () {
    const m = new SelectionManager();
    for (let i = 0; i < SelectionManager.MAX_REGIONS; i++) {
      const r = m.add(1, region(0, i, `t${i}`));
      expect(r.added).to.equal(true);
    }
    const over = m.add(1, region(0, SelectionManager.MAX_REGIONS, "over"));
    expect(over).to.deep.equal({
      added: false,
      reason: "limit",
      count: SelectionManager.MAX_REGIONS,
    });
  });

  it("排序：乱序加入，get 按 pageIndex 升序 → sortIndex 升序", function () {
    const m = new SelectionManager();
    m.add(1, region(2, 10, "p3-late"));
    m.add(1, region(0, 0, "p1"));
    m.add(1, region(1, 99, "p2-late"));
    m.add(1, region(1, 5, "p2-early"));
    const texts = m.get(1).map((r) => r.text);
    expect(texts).to.deep.equal(["p1", "p2-early", "p2-late", "p3-late"]);
  });

  it("remove：仅移除指定 key", function () {
    const m = new SelectionManager();
    m.add(1, region(0, 0, "a"));
    m.add(1, region(0, 1, "b"));
    m.remove(1, "0:0");
    const list = m.get(1);
    expect(list).to.have.length(1);
    expect(list[0].text).to.equal("b");
    // 移除不存在的 key 无副作用
    m.remove(1, "9:9");
    expect(m.get(1)).to.have.length(1);
  });

  it("clear：清空后 has=false、get 为空，其他文献隔离", function () {
    const m = new SelectionManager();
    m.add(1, region(0, 0, "a"));
    m.add(2, region(0, 0, "b"));
    m.clear(1);
    expect(m.has(1)).to.equal(false);
    expect(m.get(1)).to.deep.equal([]);
    expect(m.has(2)).to.equal(true);
    // 清空不存在的文献无副作用
    m.clear(99);
  });

  it("subscribe：add/remove/clear 均触发，unsubscribe 后不再触发", function () {
    const m = new SelectionManager();
    let calls = 0;
    const unsub = m.subscribe(() => calls++);
    m.add(1, region(0, 0, "a"));
    m.add(1, region(0, 1, "b"));
    m.remove(1, "0:0");
    m.clear(1);
    expect(calls).to.equal(4);
    unsub();
    m.add(1, region(0, 0, "c"));
    expect(calls).to.equal(4);
  });

  it("get 返回副本：外部修改不影响内部状态", function () {
    const m = new SelectionManager();
    m.add(1, region(0, 0, "a"));
    const list = m.get(1);
    list.length = 0;
    expect(m.has(1)).to.equal(true);
  });

  it("sortIndex 缺失兜底：按添加顺序编号，不误判去重", function () {
    const m = new SelectionManager();
    // 8.x 等旧环境 annotation 可能无 sortIndex（规格 §6.2 兜底）
    const r1 = m.add(1, {
      pageIndex: 0,
      pageLabel: "p. 1",
      text: "first",
      // 无 sortIndex
    } as any);
    expect(r1).to.deep.include({ added: true, count: 1 });
    const r2 = m.add(1, {
      pageIndex: 0,
      pageLabel: "p. 1",
      text: "second",
    } as any);
    expect(r2).to.deep.include({ added: true, count: 2 });
    // 兜底 sortIndex = 添加顺序，key 唯一，排序退化为添加顺序
    const list = m.get(1);
    expect(list.map((r) => r.text)).to.deep.equal(["first", "second"]);
    expect(list[0].sortIndex).to.equal(1);
    expect(list[1].sortIndex).to.equal(2);
  });

  describe("joinRegions 拼接", function () {
    it("按文档顺序以空格拼接", function () {
      const m = new SelectionManager();
      m.add(1, region(1, 0, "second part"));
      m.add(1, region(0, 0, "First part"));
      expect(joinRegions(m.get(1))).to.equal("First part second part");
    });

    it("区域边界连字符：transla- + tion → translation", function () {
      const m = new SelectionManager();
      m.add(1, region(0, 0, "transla-"));
      m.add(1, region(0, 1, "tion"));
      expect(joinRegions(m.get(1))).to.equal("translation");
    });

    it("大写开头不连：State-of-the- + Art 保留空格", function () {
      const m = new SelectionManager();
      m.add(1, region(0, 0, "State-of-the-"));
      m.add(1, region(0, 1, "Art"));
      expect(joinRegions(m.get(1))).to.equal("State-of-the- Art");
    });

    it("前后 trim + 空文本跳过", function () {
      const m = new SelectionManager();
      m.add(1, region(0, 0, "  padded  "));
      m.add(1, region(0, 1, "   "));
      m.add(1, region(1, 0, "next  "));
      expect(joinRegions(m.get(1))).to.equal("padded next");
    });

    it("空/无文本输入返回空串", function () {
      expect(joinRegions([])).to.equal("");
    });
  });
});
