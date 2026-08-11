// 参数化生成「结中藏文」图标:OpenAI 圆润笔触 + 汉字「文」笔画
// 设计:粗笔画圆头(OpenAI 质感)、横从撇捺上方穿过形成交织层次、点=泪滴
// 5 瓣放射经 16px 实测不可辨,改为笔画直接成「文」,任意尺寸可辨
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function renderPNG(svg, width) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return r.render().asPng();
}

function writeFile(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log("->", p);
}

const B = 512; // 设计基准尺寸(等比缩放导出各尺寸)

// 一键导出全部图标产物(项目根目录运行)
export function exportAll() {
  const icons = join(ROOT, "addon/content/icons");
  const assets = join(ROOT, "assets");
  // 侧栏 tab(SVG)
  writeFile(join(icons, "section-16.svg"), buildIconSVG(16));
  writeFile(join(icons, "section-20.svg"), buildIconSVG(20));
  // 插件列表 / 进度窗 / 设置面板(PNG)
  writeFile(join(icons, "favicon.png"), renderPNG(buildIconSVG(96), 96));
  writeFile(join(icons, "favicon@0.5x.png"), renderPNG(buildIconSVG(48), 48));
  // 设计源 + 仓库产物
  writeFile(join(assets, "logo-master.svg"), buildIconSVG(512));
  writeFile(join(assets, "icon-512.png"), renderPNG(buildIconSVG(512), 512));
  writeFile(join(assets, "banner.png"), renderPNG(buildBanner(), 1280));
}

export function buildBanner() {
  const W = 1280,
    H = 640;
  const icon = buildIconSVG(340, { rx: 74 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#4072e5"/>
  <g transform="translate(140 150)">${icon.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>
  <text x="570" y="330" font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="72" font-weight="700" fill="#ffffff">ZoteroTranslatorNext</text>
  <text x="572" y="402" font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="30" fill="#bcd0f7">Zotero 文献翻译插件 · 格式优化 · 多渠道翻译</text>
  <text x="572" y="452" font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="30" fill="#bcd0f7">翻译历史 · AI 总结</text>
</svg>`;
}

// 圆头粗线(带圆头端);sweep=0:弧从外侧绕行,凸圆头
function stroke(x1, y1, x2, y2, width) {
  const dx = x2 - x1,
    dy = y2 - y1,
    L = Math.hypot(dx, dy);
  const nx = (-dy / L) * width * 0.5,
    ny = (dx / L) * width * 0.5;
  const r = width / 2;
  return `M ${x1 + nx} ${y1 + ny} L ${x2 + nx} ${y2 + ny} A ${r} ${r} 0 0 0 ${x2 - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} A ${r} ${r} 0 0 0 ${x1 + nx} ${y1 + ny} Z`;
}

// 泪滴(点):圆头在下端,尖端朝上;由两条贝塞尔收拢
function teardrop(headX, headY, tipX, tipY, width, sweep = 0.42) {
  const dx = headX - tipX,
    dy = headY - tipY,
    L = Math.hypot(dx, dy);
  const nx = -dy / L,
    ny = dx / L; // 法向
  const hw = width / 2;
  const s1 = { x: headX + nx * hw - dx * 0.18, y: headY + ny * hw - dy * 0.18 };
  const s2 = { x: headX - nx * hw - dx * 0.18, y: headY - ny * hw - dy * 0.18 };
  const hc = { x: headX + dx * 0.36, y: headY + dy * 0.36 };
  const t1 = { x: tipX + nx * hw * sweep, y: tipY + ny * hw * sweep };
  const t2 = { x: tipX - nx * hw * sweep, y: tipY - ny * hw * sweep };
  const c1 = {
    x: s2.x - nx * width * 0.5 + dx * 0.14,
    y: s2.y - ny * width * 0.5 + dy * 0.14,
  };
  const c2 = {
    x: s1.x + nx * width * 0.5 + dx * 0.14,
    y: s1.y + ny * width * 0.5 + dy * 0.14,
  };
  return `M ${s1.x} ${s1.y} Q ${hc.x} ${hc.y} ${s2.x} ${s2.y}
  C ${c1.x} ${c1.y} ${t2.x} ${t2.y} ${tipX} ${tipY}
  C ${t1.x} ${t1.y} ${c2.x} ${c2.y} ${s1.x} ${s1.y} Z`;
}

// 「文」笔画(512 系):点 + 横 + 撇 + 捺
// 绘制顺序:撇捺(下) → 横(中,完全覆盖撇捺顶端=从横下缘长出) → 点(上)
// 撇捺顶端圆头藏入横内(顶端恰好切横上缘),无尖刺;末端凸圆头
const DOT = { headX: 256, headY: 150, tipX: 256, tipY: 90, width: 62 }; // 点:垂直水滴,居中(呼应 OpenAI 顶瓣)
const HENG = { x1: 140, y1: 250, x2: 372, y2: 250, width: 52 }; // 横:两端圆头
const PIE = { x1: 212, y1: 248, x2: 128, y2: 410, width: 48 }; // 撇:顶端圆头切横上缘(224)
const NA = { x1: 300, y1: 249, x2: 384, y2: 418, width: 50 }; // 捺:略长略粗

const parts = [
  stroke(PIE.x1, PIE.y1, PIE.x2, PIE.y2, PIE.width),
  stroke(NA.x1, NA.y1, NA.x2, NA.y2, NA.width),
  stroke(HENG.x1, HENG.y1, HENG.x2, HENG.y2, HENG.width),
  teardrop(DOT.headX, DOT.headY, DOT.tipX, DOT.tipY, DOT.width),
];

function buildIconSVG(size, { rx = size * 0.218 } = {}) {
  const k = size / B;
  const g = parts
    .map((d) => {
      // 按 token 缩放:坐标乘 k;A 命令的 flags(large-arc/sweep,第 4、5 参数)保持 0/1
      const toks = d.split(/\s+/);
      const out = [];
      let cmd = "";
      let ai = 0;
      for (const t of toks) {
        const n = Number(t);
        if (Number.isFinite(n)) {
          if (cmd === "A" && (ai === 3 || ai === 4)) {
            out.push(n.toFixed(2).replace(/\.?0+$/, ""));
          } else {
            out.push((n * k).toFixed(2).replace(/\.?0+$/, ""));
          }
          ai++;
        } else {
          cmd = t;
          ai = 0;
          out.push(t);
        }
      }
      return `<path d="${out.join(" ")}"/>`;
    })
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="#4072e5"/>
  <g fill="#ffffff">${g}</g>
</svg>`;
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = process.argv[2];
  if (arg === "--all") {
    exportAll();
  } else if (arg === "--banner") {
    writeFileSync(process.argv[3], buildBanner());
    console.log("banner ->", process.argv[3]);
  } else {
    const size = Number(arg ?? "512");
    const out = process.argv[3] ?? arg;
    writeFileSync(out, buildIconSVG(size));
    console.log("icon ->", out);
  }
}
