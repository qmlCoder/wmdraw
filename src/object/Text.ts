import { Scene } from "../scene";
import { Vec2 } from "../types";
import { DEFAULT_FONT_SIZE, EMPTY_BOX_H, EMPTY_BOX_W, TextLike } from "./TextLike";

export { DEFAULT_FONT_SIZE };
export const DEFAULT_TEXT_COLOR = "#000000";

// 还没有内容时画布上显示的占位提示
const EMPTY_TEXT = "尚未设置文本";

// 面板可选的字体，value 直接用作 canvas 的 font-family
export const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "无衬线", value: "sans-serif" },
  { label: "衬线", value: "serif" },
  { label: "等宽", value: "monospace" },
  { label: "雅黑", value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: "宋体", value: '"SimSun", "Songti SC", serif' },
  { label: "楷体", value: '"KaiTi", "Kaiti SC", serif' },
];
export const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0].value;

// 画布上的文本对象。pos 是文本左上角的世界坐标（cm），rotation 绕该点旋转。
export class Text extends TextLike {
  content: string;
  font_family: string;
  color: string;

  constructor(scene: Scene, pos: Vec2, content: string = "") {
    super(scene, pos);
    this.content = content;
    this.font_family = DEFAULT_FONT_FAMILY;
    this.color = DEFAULT_TEXT_COLOR;
  }

  // canvas 的 font 简写，字号用像素
  private font_spec(font_px: number): string {
    return `${font_px}px ${this.font_family}`;
  }

  // 未旋转时的屏幕包围盒尺寸（像素）
  measure(font_px: number) {
    // 没内容时按占位框计算，和分子占位的观感一致
    if (!this.content) {
      return { w: font_px * EMPTY_BOX_W, h: font_px * EMPTY_BOX_H };
    }
    const ctx = this.scene.context;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = this.font_spec(font_px);
    const width = ctx.measureText(this.content).width;
    ctx.restore();
    return { w: Math.max(width, font_px * 0.5), h: font_px * 1.2 };
  }

  draw() {
    if (!this.content) {
      this.draw_empty_placeholder(EMPTY_TEXT);
      this.draw_hover_box();
      return;
    }

    const scene = this.scene;
    const ctx = scene.context;
    const p = scene.camera.world_to_canvas(
      this.pos.x, this.pos.y,
      scene.canvas.clientWidth, scene.canvas.clientHeight,
    );
    const font_px = this.font_px();

    // 相机变换带 y 轴翻转，文本直接画会上下镜像，所以回到屏幕空间绘制
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(p.x, p.y);
    ctx.rotate(-this.render_rotation); // 画布 y 轴向下，世界逆时针 = 屏幕顺时针取负
    ctx.scale(this.render_scale_x, this.render_scale_y); // 辅助框边手柄的逐轴拉伸
    ctx.font = this.font_spec(font_px);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = this.color;
    ctx.fillText(this.content, 0, 0);
    ctx.restore();
    this.draw_hover_box();
  }
}
