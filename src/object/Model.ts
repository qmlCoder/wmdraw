import { Scene } from "../scene";
import { Vec2 } from "../types";
import { TextLike } from "./TextLike";

// 主画布上 3D 模型的默认高度（cm）。宽高按快照的宽高比换算。
export const DEFAULT_MODEL_SIZE = 1.2;

// 相机视角：以模型包围球半径为单位的球坐标，切走再切回来可以恢复
export interface ModelView {
  azimuth: number;
  polar: number;
  distance: number;
}

// 3D 模型对象。three.js 的实时渲染在属性面板里做，主画布只绘制面板拍出的快照图，
// 这样主画布仍然是普通的 2D 物体（可平移/旋转/缩放）。
export class Model extends TextLike {
  name: string = "";
  // 原始文件内容，面板重新挂载时据此重建 three.js 场景
  data: ArrayBuffer | undefined = undefined;
  snapshot: HTMLImageElement | undefined = undefined;
  aspect: number = 1; // 快照的宽高比
  view: ModelView | undefined = undefined;

  constructor(scene: Scene, pos: Vec2) {
    super(scene, pos, DEFAULT_MODEL_SIZE);
  }

  get has_model(): boolean {
    return this.data !== undefined;
  }

  // 未旋转时的屏幕包围盒尺寸；font_px 就是快照的高度
  measure(font_px: number) {
    return { w: font_px * this.aspect, h: font_px };
  }

  // 面板每次重绘都会推一张新快照过来
  set_snapshot(img: HTMLImageElement, aspect: number) {
    this.snapshot = img;
    this.aspect = aspect > 0 ? aspect : 1;
  }

  draw() {
    const ctx = this.scene.context;
    const p = this.origin_screen();
    const font_px = this.font_px();
    const { w, h } = this.measure_screen();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(p.x, p.y);
    ctx.rotate(-this.render_rotation);
    if (this.snapshot) {
      ctx.scale(this.render_scale_x, this.render_scale_y);
      ctx.drawImage(this.snapshot, 0, 0, font_px * this.aspect, font_px);
    } else {
      // 还没导入模型：画个虚线占位框，提示去属性面板导入
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(105, 101, 219, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(105, 101, 219, 0.75)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "12px sans-serif";
      ctx.fillText("尚未导入模型", w / 2, h / 2 - 8);
    }
    ctx.restore();

    this.draw_hover_box();
  }
}
