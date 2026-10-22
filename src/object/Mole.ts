import { Scene } from "../scene";
import { BondType, Vec2 } from "../types";
import { TextLike } from "./TextLike";
import { Atom } from "./Atom";
import { Bond } from "./Bond";
import type { Paint } from "../viewport";
import { useAppStore } from "../stores/app";

// 空分子留出的占位区（cm）：要放得下「尚未绘制分子」的提示
const EMPTY_MIN = new Vec2(-0.55, -0.35);
const EMPTY_MAX = new Vec2(0.55, 0.35);

// 画布上的分子对象：原子/键都在分子局部坐标（cm）里，整体可以平移/旋转/缩放。
// 编辑（画原子、连键、贴片段）在分子属性面板的专用画布上做，见 MoleEditor。
export class Mole extends TextLike {
  atoms: Atom[] = [];
  bonds: Bond[] = [];

  constructor(scene: Scene, pos: Vec2) {
    // font_size 在这里就是整体缩放倍率：1 表示按 1cm = 1 单位绘制
    super(scene, pos, 1);
  }

  add_atom(pos: Vec2): Atom {
    const atom = new Atom(this, this.atoms.length, pos);
    this.atoms.push(atom);
    return atom;
  }

  get_atom(idx: number): Atom | undefined {
    return this.atoms[idx];
  }

  add_bond(idx1: number, idx2: number, type: BondType): Bond {
    const bond = new Bond(this, idx1, idx2, type);
    this.bonds.push(bond);
    return bond;
  }

  get_bond(idx1: number, idx2: number): Bond | undefined {
    return this.bonds.find(bond => bond.idx1 === idx1 && bond.idx2 === idx2);
  }

  // 分子局部坐标下的包围盒
  bbox(): { min: Vec2; max: Vec2 } {
    if (this.atoms.length == 0) {
      return { min: EMPTY_MIN, max: EMPTY_MAX };
    }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const atom of this.atoms) {
      const [x, y] = atom.pos.list();
      minx = Math.min(minx, x);
      miny = Math.min(miny, y);
      maxx = Math.max(maxx, x);
      maxy = Math.max(maxy, y);
    }
    return { min: new Vec2(minx, miny), max: new Vec2(maxx, maxy) };
  }

  // 未旋转时的屏幕包围盒尺寸（像素）；font_px 同时是「每 cm 的像素数」
  measure(font_px: number) {
    const { min, max } = this.bbox();
    return { w: (max.x - min.x) * font_px, h: (max.y - min.y) * font_px };
  }

  // 绘制：把包围盒左上角对齐到对象位置，再按缩放倍率把 cm 映射到像素
  draw() {
    if (this.atoms.length == 0) {
      this.draw_empty_placeholder("尚未绘制分子");
      this.draw_hover_box();
      return;
    }

    const scene = this.scene;
    const ctx = scene.context;
    const p = scene.camera.world_to_canvas(
      this.pos.x, this.pos.y,
      scene.canvas.clientWidth, scene.canvas.clientHeight,
    );
    const px_per_cm = this.font_px();
    const { min, max } = this.bbox();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(p.x, p.y);
    ctx.rotate(-this.render_rotation); // 画布 y 轴向下，世界逆时针 = 屏幕顺时针取负
    // y 轴翻过来，让分子局部坐标（y 向上）和编辑画布、场景坐标的朝向一致
    ctx.scale(px_per_cm * this.render_scale_x, -px_per_cm * this.render_scale_y);
    ctx.translate(-min.x, -max.y);
    const paint: Paint = {
      ctx,
      px: (n: number) => n / px_per_cm,
      show_mrp: useAppStore().show_mrp,
      interactive: false, // 主画布只负责显示分子，不画编辑态的选中/悬浮
    };
    for (const bond of this.bonds) bond.draw(paint);
    for (const atom of this.atoms) atom.draw(paint);
    ctx.restore();

    this.draw_hover_box();
  }

  // 清掉原子上的预览位移（编辑画布每次拖动开始时调用）
  reset_atom_preview() {
    for (const atom of this.atoms) atom.pre_move = undefined;
  }

  // 删除选中的原子和键；与被删原子相连的键会一并删除
  delete_selected() {
    if (!this.atoms.some(atom => atom.selected) && !this.bonds.some(bond => bond.selected)) return;

    const keep_atoms = this.atoms.filter(atom => !atom.selected);
    // 原子数组重排后，旧索引 → 新索引的映射必须同步到键的端点上
    const idx_map = new Map<number, number>();
    keep_atoms.forEach((atom, i) => idx_map.set(atom.idx, i));

    this.atoms = keep_atoms;
    this.bonds = this.bonds
      .filter(bond => !bond.selected)
      .filter(bond => idx_map.has(bond.idx1) && idx_map.has(bond.idx2));
    for (const bond of this.bonds) {
      bond.idx1 = idx_map.get(bond.idx1)!;
      bond.idx2 = idx_map.get(bond.idx2)!;
    }
    // 维持 atoms[idx].idx === idx 的不变式
    keep_atoms.forEach((atom, i) => { atom.idx = i; });
  }

  // 最后一个原子如果和已有原子位置接近，就合并掉（画环收口时用）
  merge_last_atom(tol: number) {
    if (this.atoms.length < 3) return;
    const prev_atom = this.atoms[this.atoms.length - 2];
    const last_atom = this.atoms[this.atoms.length - 1];
    for (const atom of this.atoms) {
      if (atom.idx == last_atom.idx) continue;
      if (atom.pos.dist(last_atom.pos) >= tol) continue;
      const bond = this.get_bond(prev_atom.idx, last_atom.idx);
      if (!bond) continue;
      // 被合并的原子可能不止一条键，全部改接到保留的原子上，
      // 否则会留下指向已删除原子的悬空索引
      for (const b of this.bonds) {
        if (b.idx1 == last_atom.idx) b.idx1 = atom.idx;
        if (b.idx2 == last_atom.idx) b.idx2 = atom.idx;
      }
      // 两端被合并到同一个原子的键没有意义
      this.bonds = this.bonds.filter(b => b.idx1 != b.idx2);
      this.atoms.pop();
      return;
    }
  }
}
