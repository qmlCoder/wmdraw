import { Vec2 } from "./types";
import { PX_PER_CM } from "./units";

// 缩放范围：0.1 倍 ~ 10 倍
const MIN_SCALE = PX_PER_CM / 10;
const MAX_SCALE = PX_PER_CM * 10;

// 相机：记录视口中心对应的世界坐标，负责世界坐标(cm) ⇄ 画布像素(px) 的换算。
// 画布坐标 = (世界坐标 - 相机位置) * scale，且画布 y 轴向下、世界 y 轴向上。
export class Camera {
  pos: Vec2 = new Vec2(0, 0); // 视口中心的世界坐标，单位 cm
  scale: number = PX_PER_CM;  // 每个 cm 对应的像素数（为将来的缩放预留）

  // 把相机变换应用到绘图上下文，之后所有绘制都用世界坐标
  apply(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const s = this.scale;
    ctx.setTransform(
      s, 0, 0, -s,
      width / 2 - s * this.pos.x,
      height / 2 + s * this.pos.y,
    );
  }

  // 画布像素 → 世界坐标（cm）
  canvas_to_world(x: number, y: number, width: number, height: number): Vec2 {
    return new Vec2(
      (x - width / 2) / this.scale + this.pos.x,
      -(y - height / 2) / this.scale + this.pos.y,
    );
  }

  // 世界坐标（cm）→ 画布像素
  world_to_canvas(x: number, y: number, width: number, height: number): Vec2 {
    return new Vec2(
      width / 2 + (x - this.pos.x) * this.scale,
      height / 2 - (y - this.pos.y) * this.scale,
    );
  }

  // 按画布像素移动相机：dx>0 相机右移，dy>0 相机下移（画面内容朝反方向移动）
  move_by_canvas(dx: number, dy: number) {
    this.pos = new Vec2(
      this.pos.x + dx / this.scale,
      this.pos.y - dy / this.scale,
    );
  }

  // 以画布上的点 (x, y) 为锚点缩放：缩放前后该点对应的世界坐标保持不变
  zoom_at(factor: number, x: number, y: number, width: number, height: number) {
    const anchor = this.canvas_to_world(x, y, width, height);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    this.pos = new Vec2(
      anchor.x - (x - width / 2) / this.scale,
      anchor.y + (y - height / 2) / this.scale,
    );
  }
}
