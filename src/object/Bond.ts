import { BondType, Vec2 } from "../types";
import type { Paint } from "../viewport";
import type { Mole } from "./Mole";

// 键宽（cm）：1 倍缩放下为 2px。和键长、双键间距一样属于图形几何，
// 随对象缩放按比例变化，保证整体比例不变
const BOND_WIDTH = 0.02;

// 双键间距（cm），1 倍缩放下为 10px
const DOUBLE_GAP = 0.1;

// 分子里的一条键（以前的 Edge）
export class Bond {
  mole: Mole;
  idx1: number;
  idx2: number;
  type: BondType;
  hovered: boolean = false;
  selected: boolean = false;

  constructor(mole: Mole, idx1: number, idx2: number, type: BondType) {
    this.mole = mole;
    this.idx1 = idx1;
    this.idx2 = idx2;
    this.type = type;
  }

  draw(p: Paint) {
    const ctx = p.ctx;
    // 选中优先于悬浮，都没有时用默认黑色
    ctx.strokeStyle = p.interactive && this.selected
      ? "rgba(0, 0, 255, 0.9)"
      : p.interactive && this.hovered
        ? "rgba(0, 0, 255, 0.45)"
        : "black";
    ctx.lineWidth = BOND_WIDTH;
    const atom1 = this.mole.get_atom(this.idx1);
    const atom2 = this.mole.get_atom(this.idx2);
    if (!atom1 || !atom2) return; // 原子已被合并/删除，跳过这条悬空的键
    const dist = atom1.pos.dist(atom2.pos);
    const [x1, y1] = atom1.pos.list();
    const [x2, y2] = atom2.pos.list();
    if (this.type == "单键") {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    if (this.type == "三键") {
      if (dist < 1e-6) return; // 两端重合时方向无意义
      const dx = (x2 - x1) / dist;
      const dy = (y2 - y1) / dist;
      const kx = -dy;
      const ky = dx;
      // 三键：中间一条主线，两侧各一条平行副线
      const gap = DOUBLE_GAP / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.moveTo(x1 + kx * gap, y1 + ky * gap);
      ctx.lineTo(x2 + kx * gap, y2 + ky * gap);
      ctx.moveTo(x1 - kx * gap, y1 - ky * gap);
      ctx.lineTo(x2 - kx * gap, y2 - ky * gap);
      ctx.stroke();
    }
    if (this.type.startsWith("双键-")) {
      if (dist < 1e-6) return; // 两端重合时方向无意义
      const dx = (x2 - x1) / dist;
      const dy = (y2 - y1) / dist;
      const kx = -dy;
      const ky = dx;
      const gap = DOUBLE_GAP;
      const nebs1 = atom1.nebs();
      const nebs2 = atom2.nebs();
      if (this.type.endsWith("-0")) {
        ctx.beginPath();
        ctx.moveTo(x1 + kx * gap / 2, y1 + ky * gap / 2);
        ctx.lineTo(x2 + kx * gap / 2, y2 + ky * gap / 2);
        ctx.moveTo(x1 - kx * gap / 2, y1 - ky * gap / 2);
        ctx.lineTo(x2 - kx * gap / 2, y2 - ky * gap / 2);
        ctx.stroke();
      }
      if (this.type.endsWith("-1") || this.type.endsWith("-2")) {
        const sign = this.type.endsWith("-2") ? -1 : 1;
        const nx = kx * sign;
        const ny = ky * sign;
        // 两端分别内收到与相邻同侧键的角平分线上
        const trim1 = this.bisector_trim(atom1.idx, nebs1, dx, dy, nx, ny, gap);
        const trim2 = this.bisector_trim(atom2.idx, nebs2, -dx, -dy, nx, ny, gap);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        if (trim1 + trim2 < dist) { // 收缩后长度不为负才画副键
          ctx.moveTo(x1 + nx * gap + dx * trim1, y1 + ny * gap + dy * trim1);
          ctx.lineTo(x2 + nx * gap - dx * trim2, y2 + ny * gap - dy * trim2);
        }
        ctx.stroke();
      }
    }
  }

  // 鼠标到这条键（线段）的距离；端点被合并/删除时返回 Infinity
  dist_to_pointer(pointer: Vec2): number {
    const atom1 = this.mole.get_atom(this.idx1);
    const atom2 = this.mole.get_atom(this.idx2);
    if (!atom1 || !atom2) return Infinity;
    const a = atom1.pos;
    const b = atom2.pos;
    const ab = b.sub(a);
    const len2 = ab.dot(ab);
    if (len2 < 1e-12) return pointer.dist(a); // 两端重合，退化成点
    const t = Math.max(0, Math.min(1, pointer.sub(a).dot(ab) / len2));
    const closest = new Vec2(a.x + ab.x * t, a.y + ab.y * t);
    return pointer.dist(closest);
  }

  // 命中容差（分子局部坐标）：双键/三键的平行线在主线上有偏移，要把这部分加上
  hit_tolerance(tol: number): number {
    const has_offset_lines = this.type.startsWith("双键") || this.type == "三键";
    return tol + (has_offset_lines ? DOUBLE_GAP / 2 : 0);
  }

  // 整条键都在矩形框内才算被框选
  in_rect(pos1: Vec2, pos2: Vec2): boolean {
    const atom1 = this.mole.get_atom(this.idx1);
    const atom2 = this.mole.get_atom(this.idx2);
    if (!atom1 || !atom2) return false;
    return atom1.in_rect(pos1, pos2) && atom2.in_rect(pos1, pos2);
  }

  // 返回副键端点沿该键方向需要内收的距离：副线距主线 gap 时，
  // 与夹角 θ 的邻接键的平分线交点到端点的距离为 gap / tan(θ/2)。
  // dx,dy 为该原子指向另一端的方向，nx,ny 为副线偏移方向，两者均为单位向量
  private bisector_trim(atom_idx: number, nebs: number[], dx: number, dy: number, nx: number, ny: number, gap: number): number {
    const atom = this.mole.get_atom(atom_idx);
    if (!atom) return 0;
    let trim = 0;
    for (const nb_idx of nebs) {
      if (nb_idx == this.idx1 || nb_idx == this.idx2) continue; // 跳过本键的另一端
      const nb = this.mole.get_atom(nb_idx);
      if (!nb) continue;
      const ux = nb.pos.x - atom.pos.x;
      const uy = nb.pos.y - atom.pos.y;
      const len = Math.hypot(ux, uy);
      if (len < 1e-6) continue;
      const ux1 = ux / len;
      const uy1 = uy / len;
      if (nx * ux1 + ny * uy1 <= 0) continue; // 邻接键在副键的另一侧，不需要内收
      const cos = Math.max(-1, Math.min(1, dx * ux1 + dy * uy1));
      const theta = Math.acos(cos);
      if (theta < 1e-6) continue;
      trim = Math.max(trim, gap / Math.tan(theta / 2));
    }
    return trim;
  }
}
