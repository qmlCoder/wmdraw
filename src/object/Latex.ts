import { Scene } from "../scene";
import { Vec2 } from "../types";
import { EM_PX, render_latex_svg } from "../latex";
import { EMPTY_BOX_H, EMPTY_BOX_W, TextLike } from "./TextLike";
export const DEFAULT_LATEX_COLOR = "#000000";

// 还没有内容时画布上显示的占位提示
const EMPTY_LATEX = "尚未设置公式";

interface Render {
  key: string;
  img: HTMLImageElement;
  w: number;
  h: number;
}

// 公式对象：内容交给 MathJax 排成 SVG，几何/交互和文本完全一致
export class Latex extends TextLike {
  content: string;
  color: string;
  private render: Render | undefined = undefined;
  private pending: string | undefined = undefined;

  constructor(scene: Scene, pos: Vec2, content: string = "") {
    super(scene, pos);
    this.content = content;
    this.color = DEFAULT_LATEX_COLOR;
  }

  private get empty(): boolean {
    return !this.content.trim();
  }

  private get key(): string {
    return `${this.content}\u0000${this.color}`;
  }

  // 内容/颜色变了就重新排一次；图片是异步解码的，scene 每帧重绘，好了自然出现
  private ensure_render() {
    const key = this.key;
    if (this.render?.key === key || this.pending === key) return;
    if (!this.content.trim()) {
      this.render = undefined;
      this.pending = undefined;
      return;
    }
    this.pending = key;
    try {
      const { url, width, height } = render_latex_svg(this.content, this.color);
      const img = new Image();
      img.onload = () => {
        if (this.pending !== key) return;
        this.render = { key, img, w: width, h: height };
        this.pending = undefined;
      };
      img.onerror = () => {
        if (this.pending === key) this.pending = undefined;
      };
      img.src = url;
    } catch {
      // 语法错到 MathJax 直接抛异常时保留上一张图，不阻塞重绘
      this.pending = undefined;
    }
  }

  // 未旋转时的屏幕包围盒尺寸（像素）
  measure(font_px: number) {
    // 还没输入公式：按占位框计算，和分子占位的观感一致
    if (this.empty) {
      return { w: font_px * EMPTY_BOX_W, h: font_px * EMPTY_BOX_H };
    }
    this.ensure_render();
    const scale = font_px / EM_PX;
    if (!this.render) {
      return { w: font_px * 2, h: font_px * 1.2 }; // 还没排好版：占位尺寸
    }
    return { w: this.render.w * scale, h: this.render.h * scale };
  }

  draw() {
    if (this.empty) {
      this.draw_empty_placeholder(EMPTY_LATEX);
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
    this.ensure_render();

    // 和文本一样回到屏幕空间绘制，避免相机 y 翻转把图倒过来
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(p.x, p.y);
    ctx.rotate(-this.render_rotation);
    ctx.scale(this.render_scale_x, this.render_scale_y); // 辅助框边手柄的逐轴拉伸
    const scale = font_px / EM_PX;
    const r = this.render;
    if (r) {
      ctx.drawImage(r.img, 0, 0, r.w * scale, r.h * scale);
    }
    ctx.restore();
    this.draw_hover_box();
  }
}
