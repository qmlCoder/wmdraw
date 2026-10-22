import { Vec2 } from "../types";
import * as maths from "../maths";
import type { Paint } from "../viewport";
import type { Mole } from "./Mole";

// 元素标签字号（cm），随对象/画布缩放
const LABEL_SIZE = 0.32;
// 量字体度量用的字号：小字号下 actualBoundingBox 会被取整到 1 个用户单位，必须放大再按比例缩回
const LABEL_PROBE = 100;

// 标签度量缓存（字体固定，同一符号只要量一次）
const METRICS_CACHE = new Map<string, { half_w: number; ascent: number; descent: number }>();

function label_metrics(ctx: CanvasRenderingContext2D, label: string) {
  const cached = METRICS_CACHE.get(label);
  if (cached) return cached;
  ctx.font = `${LABEL_PROBE}px sans-serif`;
  const metrics = ctx.measureText(label);
  const k = LABEL_SIZE / LABEL_PROBE;
  const result = {
    half_w: (metrics.width * k) / 2,
    ascent: (metrics.actualBoundingBoxAscent ?? LABEL_PROBE * 0.72) * k,
    descent: (metrics.actualBoundingBoxDescent ?? LABEL_PROBE * 0.03) * k,
  };
  METRICS_CACHE.set(label, result);
  return result;
}

// 分子里的一个原子（以前的 Node）。pos 是分子局部坐标（cm）。
export class Atom {
  mole: Mole;
  idx: number;
  // 元素标签，空字符串表示骨架上的碳节点（只画一个点）
  label: string = "";
  private _pos: Vec2;
  hovered: boolean = false;
  selected: boolean = false;
  pre_move: Vec2 | undefined = undefined;

  constructor(mole: Mole, idx: number, pos: Vec2) {
    this.mole = mole;
    this.idx = idx;
    this._pos = pos;
  }

  get pos(): Vec2 {
    if (this.pre_move) {
      const [mx, my] = this.pre_move.list();
      return new Vec2(mx + this._pos.x, my + this._pos.y);
    }
    return this._pos;
  }

  // 未应用预览位移的位置，做旋转/缩放时要以它为基准
  get base_pos(): Vec2 {
    return this._pos;
  }

  set pos(pos: Vec2) {
    this._pos = pos;
  }

  // 把预览位移合并进实际位置
  commit() {
    if (!this.pre_move) return;
    this._pos = this.pos; // pos getter 已叠加 preview
    this.pre_move = undefined;
  }

  draw(p: Paint) {
    const ctx = p.ctx;
    const selected = p.interactive && this.selected;
    const hovered = p.interactive && this.hovered;
    ctx.fillStyle = "black";
    ctx.lineWidth = p.px(1);
    if (this.label) {
      // 坐标系已经按 cm 缩放，字号也用 cm 就能跟着缩放；y 轴是翻转的，文字要再翻回来
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.scale(1, -1);
      // 先用大字号取字体度量（按符号缓存），再按比例换算回 cm
      const { half_w, ascent, descent } = label_metrics(ctx, this.label);

      ctx.font = `${LABEL_SIZE}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      // 先把符号周围的圆形区域擦掉，避免键线穿过符号
      const radius = Math.max(half_w, LABEL_SIZE * 0.5) + LABEL_SIZE * 0.15;
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "black";
      // middle 是按 em 框对中的，字母墨迹会偏下；这里按墨迹的上下沿把符号摆正
      ctx.fillText(this.label, 0, (ascent - descent) / 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, p.px(1), 0, 2 * Math.PI);
      ctx.fill();
    }
    if (selected) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0, 0, 255, 0.8)";
      ctx.arc(this.pos.x, this.pos.y, p.px(7), 0, 2 * Math.PI);
      ctx.stroke();
    }
    if (hovered && !selected) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(0, 0, 255, 0.3)";
      ctx.arc(this.pos.x, this.pos.y, p.px(7), 0, 2 * Math.PI);
      ctx.fill();
    }
    if (p.show_mrp) {
      const mrp = this.max_rep_dir();
      ctx.strokeStyle = "black";
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(this.pos.x + mrp.x * p.px(5), this.pos.y + mrp.y * p.px(5));
      ctx.stroke();
    }
  }

  hover_check(mouse_pos: Vec2, tol: number): boolean {
    this.hovered = this.pos.dist(mouse_pos) <= tol;
    return this.hovered;
  }

  // 返回与该原子相连的原子索引
  nebs(): number[] {
    const nebs: number[] = [];
    for (const bond of this.mole.bonds) {
      if (bond.idx1 == this.idx) nebs.push(bond.idx2);
      if (bond.idx2 == this.idx) nebs.push(bond.idx1);
    }
    return nebs;
  }

  // 该原子是否在矩形区域内（矩形/坐标同为分子局部坐标）
  in_rect(pos1: Vec2, pos2: Vec2): boolean {
    const [x1, y1] = pos1.list();
    const [x2, y2] = pos2.list();
    const minx = Math.min(x1, x2);
    const maxx = Math.max(x1, x2);
    const miny = Math.min(y1, y2);
    const maxy = Math.max(y1, y2);
    const [x, y] = this.pos.list();
    return x >= minx && x <= maxx && y >= miny && y <= maxy;
  }

  max_rep_dir(): Vec2 {
    const dirs: Vec2[] = [];
    for (const idx of this.nebs()) {
      const nb = this.mole.get_atom(idx);
      if (!nb) continue;
      dirs.push(nb.pos.sub(this.pos));
    }
    return maths.max_rep_dir(dirs);
  }

  rotate(angle: number, center: Vec2) {
    const rotated = maths.points_rotate([this.pos], angle, center);
    this.pos = rotated[0];
  }
}
