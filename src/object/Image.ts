import { Scene } from "../scene";
import { Vec2 } from "../types";
import { TextLike } from "./TextLike";

// 图像默认高度（cm），宽度按图片比例换算
export const DEFAULT_IMAGE_SIZE = 2.4;

// 空图像的占位框（cm，和文本/公式的空状态看起来差不多大）
const EMPTY_W_CM = 1.6;
const EMPTY_H_CM = 1.0;

// 单侧最多裁掉的比例，留一点可见区域免得对象被裁没
const MAX_CROP = 0.98;

// 画布上的图像对象：内容来自本地导入的图片文件，主画布按比例绘制，可控制投影阴影。
export class Image extends TextLike {
  name: string = "";
  source: string | undefined = undefined; // 原始图片的 data URL
  img: HTMLImageElement | undefined = undefined;
  aspect: number = 1;

  // 裁剪：从四边各裁掉原始图片的比例（0~1），同一轴两侧加起来不超过 MAX_CROP
  crop_left: number = 0;
  crop_right: number = 0;
  crop_top: number = 0;
  crop_bottom: number = 0;

  // 阴影参数（屏幕像素，不随缩放/拉伸变化）
  shadow: boolean = true;
  shadow_color: string = "#00000066";
  shadow_blur: number = 12;
  shadow_offset_x: number = 0;
  shadow_offset_y: number = 6;

  constructor(scene: Scene, pos: Vec2) {
    super(scene, pos, DEFAULT_IMAGE_SIZE);
  }

  get has_image(): boolean {
    return this.img !== undefined;
  }

  // 面板导入图片后调用（图片已经解码好）
  set_image(img: HTMLImageElement, source: string, name: string) {
    // 换图时先清掉旧裁剪（同时把位置还原）
    this.set_crop(0, 0, 0, 0);
    this.img = img;
    this.source = source;
    this.name = name;
    this.aspect =
      img.naturalWidth && img.naturalHeight
        ? img.naturalWidth / img.naturalHeight
        : 1;
  }

  // 未裁剪时的尺寸（cm），用来算裁剪引起的位置补偿
  private full_size_cm() {
    return {
      w: this.font_size * this.aspect * this.scale_x,
      h: this.font_size * this.scale_y,
    };
  }

  // 改裁剪：和 PPT 一样，裁掉的部分收进框内，画面内容本身不动
  set_crop(left: number, right: number, top: number, bottom: number) {
    const clamp = (v: number) => Math.min(MAX_CROP, Math.max(0, v || 0));
    let l = clamp(left);
    let r = clamp(right);
    let t = clamp(top);
    let b = clamp(bottom);
    if (l + r > MAX_CROP) {
      const k = MAX_CROP / (l + r);
      l *= k;
      r *= k;
    }
    if (t + b > MAX_CROP) {
      const k = MAX_CROP / (t + b);
      t *= k;
      b *= k;
    }

    const full = this.full_size_cm();
    const dl = (l - this.crop_left) * full.w;
    const dt = (t - this.crop_top) * full.h;
    if (dl || dt) {
      // 本地 +x 向右、+y 向下（屏幕），转到世界坐标（世界 y 向上）
      const cos = Math.cos(this.rotation);
      const sin = Math.sin(this.rotation);
      this._pos = this._pos.add(
        new Vec2(dl * cos + dt * sin, dl * sin - dt * cos),
      );
    }

    this.crop_left = l;
    this.crop_right = r;
    this.crop_top = t;
    this.crop_bottom = b;
  }

  // 未旋转时的屏幕包围盒尺寸；font_px 就是未裁剪时图片的高度
  measure(font_px: number) {
    if (!this.img) {
      // 还没导入：用固定 cm 尺寸的占位框，不跟着字高（这里是图片高度）变
      const px_per_cm = font_px / this.font_size;
      return { w: EMPTY_W_CM * px_per_cm, h: EMPTY_H_CM * px_per_cm };
    }
    return {
      w: font_px * this.aspect * (1 - this.crop_left - this.crop_right),
      h: font_px * (1 - this.crop_top - this.crop_bottom),
    };
  }

  draw() {
    const img = this.img;
    if (!img) {
      this.draw_empty_placeholder("尚未导入图像");
      this.draw_hover_box();
      return;
    }

    const ctx = this.scene.context;
    const p = this.origin_screen();
    const font_px = this.font_px();
    const l = this.crop_left;
    const t = this.crop_top;
    const keep_w = 1 - l - this.crop_right;
    const keep_h = 1 - t - this.crop_bottom;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(p.x, p.y);
    ctx.rotate(-this.render_rotation);
    ctx.scale(this.render_scale_x, this.render_scale_y);
    if (this.shadow) {
      // 阴影参数不受当前变换影响，单位就是屏幕像素
      ctx.shadowColor = this.shadow_color;
      ctx.shadowBlur = this.shadow_blur;
      ctx.shadowOffsetX = this.shadow_offset_x;
      ctx.shadowOffsetY = this.shadow_offset_y;
    }
    // 只取原始图片里保留下来的那一块，缩放绘制到可见框内
    ctx.drawImage(
      img,
      img.naturalWidth * l,
      img.naturalHeight * t,
      img.naturalWidth * keep_w,
      img.naturalHeight * keep_h,
      0,
      0,
      font_px * this.aspect * keep_w,
      font_px * keep_h,
    );
    ctx.restore();

    this.draw_hover_box();
  }
}
