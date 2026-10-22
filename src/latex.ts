import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
// 除 base 外的 TeX 扩展必须先 import 对应的 Configuration 模块才会注册
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js";
import "mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js";
import "mathjax-full/js/input/tex/color/ColorConfiguration.js";
import "mathjax-full/js/input/tex/html/HtmlConfiguration.js";
import "mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js";

// 生成 SVG 时假定的字号（px）；绘制时按实际字号等比缩放，矢量不会糊
export const EM_PX = 40;

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  // 常用公式包 + mhchem（化学式 \ce{...}）
  packages: ["base", "ams", "newcommand", "noundefined", "color", "html", "mhchem"],
});
const svg = new SVG({ fontCache: "local" });
const doc = mathjax.document("", { InputJax: tex, OutputJax: svg });

export interface LatexSvg {
  url: string; // data URL，可直接赋给 Image.src
  width: number; // px（EM_PX 字号下）
  height: number;
}

// 把 LaTeX 源码用 MathJax 排成一张独立的 SVG 图片
export function render_latex_svg(latex: string, color: string): LatexSvg {
  const html = adaptor.outerHTML(doc.convert(latex, { display: true }));
  const markup = html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6);

  // viewBox 的单位是 1/1000 em，用它算尺寸比解析 ex 更准
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(markup);
  const w_em = vb ? Number(vb[3]) / 1000 : 4;
  const h_em = vb ? Number(vb[4]) / 1000 : 1.2;
  const width = w_em * EM_PX;
  const height = h_em * EM_PX;

  const sized = markup
    .replace(/width="[\d.]+ex"/, `width="${width.toFixed(2)}px"`)
    .replace(/height="[\d.]+ex"/, `height="${height.toFixed(2)}px"`)
    // 作为独立图片加载时没有外部命名空间声明，用 SVG2 的 href 更稳
    .replace(/xlink:href/g, "href")
    // 字形路径用 currentColor 取色，独立图片里没有继承，直接换成实际颜色
    .replace(/currentColor/g, color);

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`,
    width,
    height,
  };
}
