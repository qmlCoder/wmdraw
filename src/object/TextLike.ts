import { Scene } from "../scene";
import { Vec2 } from "../types";

// 文字类对象的默认字号（cm），随相机缩放
export const DEFAULT_FONT_SIZE = 0.5;

// 逐轴缩放的保留下限，防止压成 0 之后再也选不中
const MIN_AXIS_SCALE = 0.02;

// 空内容占位框的尺寸（相对字号）：和分子占位框看起来一样大
export const EMPTY_BOX_W = 2.2;
export const EMPTY_BOX_H = 1.4;

// 画布上「左上角定位、可平移/旋转/缩放」的文字类对象：文本和公式共用这套几何与交互。
// pos 是左上角的世界坐标（cm），rotation 绕该点旋转，font_size 单位 cm。
export abstract class TextLike {
  scene: Scene;
  protected _pos: Vec2;
  rotation: number = 0; // 弧度，世界坐标逆时针为正
  font_size: number;
  selected: boolean = false;
  hovered: boolean = false;
  // 在 font_size 之外的逐轴拉伸（选中辅助框的边手柄会改它），1 表示不拉伸
  scale_x: number = 1;
  scale_y: number = 1;

  // 调节（m/r/s）的预览变换，确认时由 commit() 合并进上面的实际数据
  pre_move: Vec2 | undefined = undefined;
  pre_rotation: number = 0;
  pre_scale: number = 1;
  pre_scale_x: number = 1;
  pre_scale_y: number = 1;

  constructor(scene: Scene, pos: Vec2, font_size: number = DEFAULT_FONT_SIZE) {
    this.scene = scene;
    this._pos = pos;
    this.font_size = font_size;
  }

  // 未叠加预览变换的位置，做旋转/缩放时以它为基准
  get base_pos(): Vec2 {
    return this._pos;
  }

  get pos(): Vec2 {
    if (this.pre_move) {
      return this._pos.add(this.pre_move);
    }
    return this._pos;
  }

  set pos(pos: Vec2) {
    this._pos = pos;
  }

  // 视觉中心的世界坐标（不含预览变换），作为旋转/缩放的基准
  base_center(): Vec2 {
    const scene = this.scene;
    const cw = scene.canvas.clientWidth;
    const ch = scene.canvas.clientHeight;
    const p = scene.camera.world_to_canvas(this._pos.x, this._pos.y, cw, ch);
    const natural = this.measure(this.font_size * scene.camera.scale);
    const w = natural.w * this.scale_x;
    const h = natural.h * this.scale_y;
    // 局部中心转到屏幕（局部 → 屏幕是 rotate(-θ)）
    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    const cx = p.x + (w / 2) * cos - (h / 2) * sin;
    const cy = p.y + (w / 2) * sin + (h / 2) * cos;
    return scene.camera.canvas_to_world(cx, cy, cw, ch);
  }

  // 应用中的旋转/字号（含预览）
  protected get render_rotation(): number {
    return this.rotation + this.pre_rotation;
  }

  protected get render_font_size(): number {
    return this.font_size * this.pre_scale;
  }

  // 应用中的逐轴缩放（含预览）
  get render_scale_x(): number {
    return this.scale_x * this.pre_scale_x;
  }

  get render_scale_y(): number {
    return this.scale_y * this.pre_scale_y;
  }

  protected font_px(): number {
    return this.render_font_size * this.scene.camera.scale;
  }

  // 以 font_px 为字号时的包围盒（屏幕像素，未旋转、不含逐轴拉伸）
  abstract measure(font_px: number): { w: number; h: number };

  // 未旋转时的屏幕包围盒尺寸（像素，含预览与逐轴拉伸）
  measure_screen() {
    const { w, h } = this.measure(this.font_px());
    return { w: w * this.render_scale_x, h: h * this.render_scale_y };
  }

  // 包围盒左上角的画布像素位置（含预览位移）
  origin_screen(): Vec2 {
    const scene = this.scene;
    return scene.camera.world_to_canvas(
      this.pos.x, this.pos.y,
      scene.canvas.clientWidth, scene.canvas.clientHeight,
    );
  }

  // 屏幕空间的局部坐标轴方向（局部 +x 向右、+y 向下），辅助框拖拽时用
  screen_axes(): { x: Vec2; y: Vec2 } {
    const cos = Math.cos(-this.render_rotation);
    const sin = Math.sin(-this.render_rotation);
    return { x: new Vec2(cos, sin), y: new Vec2(-sin, cos) };
  }

  // 空内容的占位提示：蓝色虚线框 + 居中小字（和分子占位样式一致）
  protected draw_empty_placeholder(text: string) {
    const ctx = this.scene.context;
    const p = this.origin_screen();
    const { w, h } = this.measure_screen();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(p.x, p.y);
    ctx.rotate(-this.render_rotation);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(105, 101, 219, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(105, 101, 219, 0.75)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "12px sans-serif";
    ctx.fillText(text, w / 2, h / 2);
    ctx.restore();
  }

  // 悬浮时的虚线包围框；选中时的辅助框由 SelectionFrame 统一绘制
  protected draw_hover_box() {    // 选中的物体已经有辅助框了，不再叠加虚线框
    if (!this.hovered || this.selected) return;
    const ctx = this.scene.context;
    const p = this.origin_screen();
    const { w, h } = this.measure_screen();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(p.x, p.y);
    ctx.rotate(-this.render_rotation);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(64, 128, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-2, -2, w + 4, h + 4);
    ctx.restore();
  }

  // 世界坐标 → 对象局部坐标（像素，未旋转的文本框，原点在左上角）
  protected world_to_local(pos: Vec2): Vec2 {
    const scene = this.scene;
    const anchor = scene.camera.world_to_canvas(
      this.pos.x, this.pos.y,
      scene.canvas.clientWidth, scene.canvas.clientHeight,
    );
    const p = scene.camera.world_to_canvas(
      pos.x, pos.y,
      scene.canvas.clientWidth, scene.canvas.clientHeight,
    );
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    // 绘制时用了 rotate(-θ)，这里反向旋转回去
    const cos = Math.cos(this.render_rotation);
    const sin = Math.sin(this.render_rotation);
    return new Vec2(dx * cos - dy * sin, dx * sin + dy * cos);
  }

  abstract draw(): void;

  // 旋转后的四个角（画布像素，顺序 nw / ne / se / sw）
  canvas_corners(): Vec2[] {
    const anchor = this.origin_screen();
    const { w, h } = this.measure_screen();
    const cos = Math.cos(-this.render_rotation);
    const sin = Math.sin(-this.render_rotation);
    return [[0, 0], [w, 0], [w, h], [0, h]].map(([lx, ly]) =>
      new Vec2(anchor.x + lx * cos - ly * sin, anchor.y + lx * sin + ly * cos),
    );
  }

  // 世界坐标点是否落在对象上
  contains(pos: Vec2): boolean {
    const local = this.world_to_local(pos);
    const { w, h } = this.measure_screen();
    const pad = 4; // 屏幕像素的容差
    // 缩放得很小的对象也要保留一个最小命中区域
    const hit_w = Math.max(w, 8);
    const hit_h = Math.max(h, 8);
    return local.x >= -pad && local.x <= hit_w + pad
      && local.y >= -pad && local.y <= hit_h + pad;
  }

  // 框选：对象（含旋转）与选择框相交即算选中
  in_rect(pos1: Vec2, pos2: Vec2): boolean {
    const scene = this.scene;
    const cw = scene.canvas.clientWidth;
    const ch = scene.canvas.clientHeight;
    const a = scene.camera.world_to_canvas(pos1.x, pos1.y, cw, ch);
    const b = scene.camera.world_to_canvas(pos2.x, pos2.y, cw, ch);
    const minx = Math.min(a.x, b.x);
    const maxx = Math.max(a.x, b.x);
    const miny = Math.min(a.y, b.y);
    const maxy = Math.max(a.y, b.y);

    const rect = [
      new Vec2(minx, miny),
      new Vec2(maxx, miny),
      new Vec2(maxx, maxy),
      new Vec2(minx, maxy),
    ];
    const quad = this.canvas_corners();

    const project = (pts: Vec2[], axis: Vec2) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        const v = p.dot(axis);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return [lo, hi] as const;
    };

    // 分离轴定理：两个矩形只要存在一条分离轴就不相交
    const cos = Math.cos(-this.render_rotation);
    const sin = Math.sin(-this.render_rotation);
    const axes = [
      new Vec2(1, 0),
      new Vec2(0, 1),
      new Vec2(cos, sin),
      new Vec2(-sin, cos),
    ];
    for (const axis of axes) {
      const [rlo, rhi] = project(rect, axis);
      const [qlo, qhi] = project(quad, axis);
      if (rhi < qlo || qhi < rlo) return false;
    }
    return true;
  }

  // 清掉预览变换（每次拖动开始时）
  reset_preview() {
    this.pre_move = undefined;
    this.pre_rotation = 0;
    this.pre_scale = 1;
    this.pre_scale_x = 1;
    this.pre_scale_y = 1;
  }

  // 把预览变换合并进实际数据
  commit() {
    if (this.pre_move) {
      this._pos = this.pos; // pos getter 已叠加预览位移
    }
    this.rotation += this.pre_rotation;
    // 防止拖到缩放中心时字号被压成 0（之后就选不中了）
    this.font_size = Math.max(this.font_size * this.pre_scale, 0.02);
    this.scale_x = Math.max(this.scale_x * this.pre_scale_x, MIN_AXIS_SCALE);
    this.scale_y = Math.max(this.scale_y * this.pre_scale_y, MIN_AXIS_SCALE);
    this.reset_preview();
  }
}
