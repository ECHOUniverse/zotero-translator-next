import { expect } from "chai";
import {
  DEFAULT_SUMMARY_PROMPT,
  LEGACY_SUMMARY_PROMPT,
  buildPrompt,
  resolveSummaryLang,
  NOTE_TITLE,
  parseNoteTitle,
  isSummaryNote,
  buildNoteHTML,
} from "../../src/modules/summary";

describe("summary 模块", function () {
  describe("summary buildPrompt 提示词构建", function () {
    it("默认模板含理工科片段总结关键要素", function () {
      for (const keyword of [
        "一句话",
        "3–5 条要点",
        "性能指标",
        "保留关键数字",
        "不编造",
      ]) {
        expect(DEFAULT_SUMMARY_PROMPT).to.include(keyword);
      }
    });

    it("默认模板不含旧版全文五段式小节", function () {
      expect(DEFAULT_SUMMARY_PROMPT).to.not.include("研究问题");
      expect(DEFAULT_SUMMARY_PROMPT).to.not.include("300 字");
    });

    it("默认模板含 {targetLang} 占位符", function () {
      expect(DEFAULT_SUMMARY_PROMPT).to.include("{targetLang}");
    });

    it("{targetLang} 插值：zh-CN → 中文", function () {
      const prompt = buildPrompt(undefined, "zh-CN");
      expect(prompt).to.include("请用 中文");
      expect(prompt).to.not.include("{targetLang}");
    });

    it("{targetLang} 插值：en-US → English", function () {
      const prompt = buildPrompt(undefined, "en-US");
      expect(prompt).to.include("请用 English");
    });

    it("未知语言代号回退原文", function () {
      const prompt = buildPrompt(undefined, "xx-XX");
      expect(prompt).to.include("请用 xx-XX");
    });

    it("自定义提示词覆盖默认模板", function () {
      const custom = "Summarize in {targetLang}: conclusions only.";
      const prompt = buildPrompt(custom, "en");
      expect(prompt).to.include("Summarize in English");
      expect(prompt).to.not.include("研究问题");
      expect(prompt).to.not.include("{targetLang}");
    });

    it("空/空白自定义提示词回落默认模板", function () {
      expect(buildPrompt("   ", "zh-CN")).to.equal(
        buildPrompt(undefined, "zh-CN"),
      );
    });

    it("旧版默认模板视为未自定义，回落新默认模板", function () {
      expect(buildPrompt(LEGACY_SUMMARY_PROMPT, "zh-CN")).to.equal(
        buildPrompt(undefined, "zh-CN"),
      );
      expect(buildPrompt(` ${LEGACY_SUMMARY_PROMPT} `, "zh-CN")).to.equal(
        buildPrompt(undefined, "zh-CN"),
      );
    });

    it("默认模板插值结果不含旧模板小节", function () {
      const prompt = buildPrompt(undefined, "zh-CN");
      expect(prompt).to.include("请用 中文 总结这段文字");
      expect(prompt).to.not.include("研究问题");
    });
  });

  describe("summary resolveSummaryLang 总结语言解析", function () {
    it("auto 跟随目标语言", function () {
      expect(resolveSummaryLang("auto", "zh-CN")).to.equal("zh-CN");
      expect(resolveSummaryLang("auto", "en")).to.equal("en");
    });

    it("空值跟随目标语言", function () {
      expect(resolveSummaryLang("", "zh-CN")).to.equal("zh-CN");
      expect(resolveSummaryLang(undefined, "zh-CN")).to.equal("zh-CN");
    });

    it("目标语言为空时回退 zh-CN", function () {
      expect(resolveSummaryLang("auto", "")).to.equal("zh-CN");
    });

    it("指定语言码优先于目标语言", function () {
      expect(resolveSummaryLang("en", "zh-CN")).to.equal("en");
    });
  });

  describe("summary 笔记逻辑", function () {
    it("笔记标题固定为 AI 总结", function () {
      expect(NOTE_TITLE).to.equal("AI 总结");
    });

    it("解析首行标题（h1）", function () {
      expect(parseNoteTitle("<h1>AI 总结</h1><p>正文</p>")).to.equal("AI 总结");
    });

    it("解析首行标题（h2 + 属性）", function () {
      expect(parseNoteTitle('<div><h2 class="x">AI 总结</h2></div>')).to.equal(
        "AI 总结",
      );
    });

    it("剥除标题内标签与 HTML 实体", function () {
      expect(parseNoteTitle("<h1>AI <b>总结</b> &amp; 更多</h1>")).to.equal(
        "AI 总结 & 更多",
      );
    });

    it("无标题返回空串", function () {
      expect(parseNoteTitle("<p>只有正文</p>")).to.equal("");
      expect(parseNoteTitle("")).to.equal("");
    });

    it("标题判定匹配/不匹配", function () {
      expect(isSummaryNote("<h1>AI 总结</h1><p>x</p>")).to.equal(true);
      expect(isSummaryNote("<h1>阅读笔记</h1><p>x</p>")).to.equal(false);
    });

    it("HTML 构建：h1 + 转义正文", function () {
      const html = buildNoteHTML('第一段 <b>加粗</b> & 引号"x"');
      expect(html).to.equal(
        "<h1>AI 总结</h1><p>第一段 &lt;b&gt;加粗&lt;/b&gt; &amp; 引号&quot;x&quot;</p>",
      );
      // 构建产物可被标题判定识别
      expect(isSummaryNote(html)).to.equal(true);
    });
  });
});
