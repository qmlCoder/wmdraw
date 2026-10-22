import { Camera } from "../camera";
import { Vec2 } from "../types";
import { PX_PER_CM } from "../units";
import { useAppStore } from "../stores/app";
import { add_fragment } from "../frags";
import * as maths from "../maths";
import type { Viewport, Paint } from "../viewport";
import { Mole } from "./Mole";
import { Atom } from "./Atom";
import { Bond } from "./Bond";
import { Rect } from "./Rect";
import { Axis } from "./Axis";

// 默认键长（cm），即 50 px
const BOND_LEN = 0.5;

// 选中辅助框（和主画布一致的外观）
const FRAME_PAD = 8;      // 屏幕像素：点状选择也留出一圈可拖区域
const HANDLE_R = 4;       // 手柄半径
const HANDLE_HIT = 8;     // 手柄命中半径
const ROTATE_GAP = 18;    // 旋转手柄离上边的距离
const FRAME_COLOR = "#6965db";
const MOVE_THRESHOLD = 3; // 小于这个位移算点击
const MIN_SCALE = 0.05;   // 缩放保留下限

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

// 旋转手柄优先命中，其次四角，最后四边
const HANDLE_ORDER: HandleId[] = ["rotate", "nw", "ne", "se", "sw", "n", "e", "s", "w"];

// 选中框几何：绕原子质心旋转，旋转过程中框和原子一起转
interface FrameBox {
  center: Vec2;      // 画布像素，框中心（= 原子质心，也是旋转中心）
  angle: number;     // 画布角度（y 轴向下，顺时针为正）
  half: Vec2;        // 本地半宽/半高（含留白）
  handles: Record<HandleId, Vec2>; // 手柄在画布像素里的位置
  corners: Vec2[];   // nw / ne / se / sw（画布像素）
}

// 拖动辅助框手柄：移动 / 旋转 / 缩放选中原子
interface FrameDrag {
  mode: "move" | "rotate" | "scale";
  handle: HandleId;
  down_screen: Vec2;
  down_world: Vec2;
  frame: FrameBox;         // 按下时的框
  anchor_local: Vec2;      // 缩放锚点（框的本地坐标，取对边/对角）
  handle_local: Vec2;      // 被拖手柄（框的本地坐标）
  start_angle: number;     // 按下时鼠标相对框中心的角度
  start_frame_angle: number;
  center_world: Vec2;      // 框中心的世界坐标
  targets: Atom[];
  moved: boolean;
}

// m / r / s 模态调节：进入时的鼠标位置 mp 作为基准
interface ModalTransform {
  mode: "move" | "rotate" | "scale";
  mp: Vec2;              // 世界坐标
  center: Vec2;          // 世界坐标
  start_frame_angle: number;
  targets: Atom[];
}

// 分子属性面板里那块专用画布的编辑器：原子/键的所有绘制交互都在这里。
// 坐标就是分子的局部坐标（cm），和主画布上 Mole 对象的渲染完全一致。
export class MoleEditor implements Viewport {
  declare canvas: HTMLCanvasElement;
  declare context: CanvasRenderingContext2D;
  camera: Camera = new Camera();
  mole: Mole | null = null;
  // 选中的原子/键变化时通知面板（面板据此显示属性编辑器）
  on_selection_change: ((atoms: Atom[], bonds: Bond[]) => void) | undefined = undefined;

  down_pos: Vec2 | undefined = undefined;
  move_pos: Vec2 | undefined = undefined;
  up_pos: Vec2 | undefined = undefined;
  mouse_down: boolean = false;
  moved_node: boolean = false;
  hovered_atom: Atom | undefined = undefined;
  hovered_bond: Bond | undefined = undefined;
  select_rect: Rect;
  axis: Axis;
  space_down: boolean = false;
  panning: boolean = false;
  last_mouse: Vec2 | undefined = undefined;
  suppress_click: boolean = false;
  // 选中辅助框 / 模态调节
  frame_drag: FrameDrag | undefined = undefined;
  frame_hover: HandleId | undefined = undefined;
  frame_angle: number = 0; // 选中框自身的旋转（画布角度）
  frame_key: string = "";  // 当前选中集合的签名，换选择时把框摆正
  frame_cursor: string | undefined = undefined;
  transform: ModalTransform | undefined = undefined;
  mouse_screen: Vec2 | undefined = undefined;
  mouse_world: Vec2 | undefined = undefined;
  suppress_pick: boolean = false; // 确认调节后那次 mouseup 不再结算选择
  // 拖动成键时的起点原子位置（固定角度/长度都相对它算）
  bond_from: Vec2 | undefined = undefined;

  private raf: number = 0;
  private on_down = (e: MouseEvent) => this.on_mouse_down(e);
  private on_up = (e: MouseEvent) => this.on_mouse_up(e);
  private on_move = (e: MouseEvent) => this.on_mouse_move(e);
  private bound_click = (e: MouseEvent) => this.on_click(e);
  private bound_wheel = (e: WheelEvent) => this.on_wheel(e);
  private bound_key_down = (e: KeyboardEvent) => this.on_key_down(e);
  private bound_key_up = (e: KeyboardEvent) => this.on_key_up(e);
  private on_blur = () => {
    this.space_down = false;
    this.panning = false;
    this.last_mouse = undefined;
  };
  private on_window_up = () => {
    this.mouse_down = false;
    this.moved_node = false;
    // 鼠标在画布外抬起时也把辅助框拖拽收尾
    if (this.frame_drag) {
      this.end_frame_drag();
      this.notify_selection();
    }
    if (this.panning) {
      this.panning = false;
      this.last_mouse = undefined;
      this.suppress_click = true;
      this.clear_hover();
    }
  };

  constructor() {
    this.select_rect = new Rect(this, new Vec2(0, 0), 0, 0);
    this.select_rect.visible = false;
    this.select_rect.if_dash = true;
    this.select_rect.if_line = true;
    this.select_rect.line_style = "rgba(64, 128, 255, 0.9)";
    this.select_rect.if_fill = true;
    this.select_rect.fill_style = "rgba(64, 128, 255, 0.12)";
    this.axis = new Axis(this);
  }

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d")!;
    canvas.addEventListener("mousedown", this.on_down);
    canvas.addEventListener("mouseup", this.on_up);
    canvas.addEventListener("mousemove", this.on_move);
    canvas.addEventListener("click", this.bound_click);
    canvas.addEventListener("wheel", this.bound_wheel, { passive: false });
    window.addEventListener("keydown", this.bound_key_down);
    window.addEventListener("keyup", this.bound_key_up);
    window.addEventListener("blur", this.on_blur);
    window.addEventListener("mouseup", this.on_window_up);
    this.raf = requestAnimationFrame(this.draw);
    this.fit();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas?.removeEventListener("mousedown", this.on_down);
    this.canvas?.removeEventListener("mouseup", this.on_up);
    this.canvas?.removeEventListener("mousemove", this.on_move);
    this.canvas?.removeEventListener("click", this.bound_click);
    this.canvas?.removeEventListener("wheel", this.bound_wheel);
    window.removeEventListener("keydown", this.bound_key_down);
    window.removeEventListener("keyup", this.bound_key_up);
    window.removeEventListener("blur", this.on_blur);
    window.removeEventListener("mouseup", this.on_window_up);
  }

  set_mole(mole: Mole | null) {
    this.mole = mole;
    this.clear_hover();
    this.fit(); // 换分子时把视野对准它
    this.notify_selection();
  }

  private notify_selection() {
    const mole = this.mole;
    this.on_selection_change?.(
      mole ? mole.atoms.filter(atom => atom.selected) : [],
      mole ? mole.bonds.filter(bond => bond.selected) : [],
    );
  }

  // 把编辑区视野调整到能看全整个分子
  fit() {
    this.camera = new Camera();
    const mole = this.mole;
    // 画布还没布局出尺寸时先把镜头留在默认值，等尺寸确定后由 ResizeObserver 再调一次
    if (!mole || !this.canvas || !this.canvas.clientWidth || !this.canvas.clientHeight) return;
    if (mole.atoms.length == 0) return;
    const { min, max } = mole.bbox();
    const w = Math.max(max.x - min.x, 0.5);
    const h = Math.max(max.y - min.y, 0.5);
    this.camera.pos = new Vec2((min.x + max.x) / 2, (min.y + max.y) / 2);
    this.camera.scale = Math.min(
      this.canvas.clientWidth / (w * 1.6),
      this.canvas.clientHeight / (h * 1.6),
      PX_PER_CM * 2,
    );
  }

  // 画布尺寸变化时把相机反向平移同样距离，
  // 让画面内容在屏幕上保持不动（拖动改高度时不会上下跳）
  keep_view_on_resize(dw: number, dh: number) {
    const s = this.camera.scale || 1;
    this.camera.pos = new Vec2(
      this.camera.pos.x + dw / (2 * s),
      this.camera.pos.y - dh / (2 * s),
    );
  }

  private clear_hover() {
    this.hovered_atom = undefined;
    this.hovered_bond = undefined;
    if (this.mole) {
      for (const atom of this.mole.atoms) atom.hovered = false;
      for (const bond of this.mole.bonds) bond.hovered = false;
    }
  }

  // 命中半径：5 个屏幕像素对应的局部长度
  private get tol(): number {
    return this.px(5);
  }

  private paint(): Paint {
    return {
      ctx: this.context,
      px: (n) => this.px(n),
      show_mrp: useAppStore().show_mrp,
      interactive: true,
    };
  }

  // 换一批原子/键时要让主画布上的对象也随之重绘，主画布本来就是每帧重绘，无需通知

  private draw = () => {
    this.raf = requestAnimationFrame(this.draw);
    this.render();
  };

  // 立刻重画一帧（改画布尺寸后调用，避免画布被清空后等到下一帧才恢复）
  redraw() {
    this.render();
  }

  private render() {
    const ctx = this.context;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.camera.apply(ctx, this.canvas.clientWidth, this.canvas.clientHeight);
    this.axis.draw();
    const mole = this.mole;
    if (mole) {
      const paint = this.paint();
      for (const bond of mole.bonds) bond.draw(paint);
      for (const atom of mole.atoms) atom.draw(paint);
      if (mole.atoms.length == 0) this.draw_empty_hint();
    }
    // 框选只属于「选择」工具，成键/片段时不该冒出选择框
    if (useAppStore().mole_tool == '选择') {
      this.show_select_rect();
      this.draw_frame();
    } else {
      this.select_rect.visible = false;
    }
  };

  // 还没画原子/键时的提示（画布像素坐标系）
  private draw_empty_hint() {
    const ctx = this.context;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const text = "尚未绘制分子";
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // 垫一层浅底，避免和坐标轴叠在一起看不清
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(cw / 2 - w / 2 - 8, ch / 2 - 11, w + 16, 22);
    ctx.fillStyle = "#909399";
    ctx.fillText(text, cw / 2, ch / 2);
    ctx.restore();
  }

  private show_select_rect() {    // 拖辅助框（旋转/缩放/移动）时不画框选矩形
    if (this.frame_drag) {
      this.select_rect.visible = false;
      return;
    }
    const down_pos = this.down_pos;
    const move_pos = this.move_pos;
    if (!this.mouse_down || !down_pos || !move_pos) {
      this.select_rect.visible = false;
      return;
    }
    const w = Math.abs(move_pos.x - down_pos.x);
    const h = Math.abs(move_pos.y - down_pos.y);
    if (w < this.px(1) && h < this.px(1)) { // 没有拖动，不画框
      this.select_rect.visible = false;
      return;
    }
    const p1 = new Vec2(Math.min(down_pos.x, move_pos.x), Math.min(down_pos.y, move_pos.y));
    const p2 = new Vec2(p1.x + w, p1.y + h);
    this.select_rect.set_by_2p(p1, p2);
    this.select_rect.visible = true;
    this.select_rect.draw();
  }

  // ---- 选中辅助框：和主画布一致的交互（内部拖动移动、四角等比缩放、四边单向缩放、上方圆点旋转）----

  // 参与调节的原子：选中的原子 + 选中键的两个端点
  private selection_targets(): Atom[] {
    const mole = this.mole;
    if (!mole) return [];
    const set = new Set<Atom>(mole.atoms.filter(atom => atom.selected));
    for (const bond of mole.bonds) {
      if (!bond.selected) continue;
      const a1 = mole.get_atom(bond.idx1);
      const a2 = mole.get_atom(bond.idx2);
      if (a1) set.add(a1);
      if (a2) set.add(a2);
    }
    return [...set];
  }

  private atom_screen(atom: Atom): Vec2 {
    return this.camera.world_to_canvas(
      atom.pos.x, atom.pos.y,
      this.canvas.clientWidth, this.canvas.clientHeight,
    );
  }

  private screen_of(e: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return new Vec2(e.clientX - rect.left, e.clientY - rect.top);
  }

  // 画布坐标 → 框的本地坐标（框本身可能带旋转）
  private to_local(p: Vec2, frame: FrameBox): Vec2 {
    const cos = Math.cos(frame.angle);
    const sin = Math.sin(frame.angle);
    const dx = p.x - frame.center.x;
    const dy = p.y - frame.center.y;
    return new Vec2(dx * cos + dy * sin, -dx * sin + dy * cos);
  }

  private to_canvas(local: Vec2, frame: FrameBox): Vec2 {
    const cos = Math.cos(frame.angle);
    const sin = Math.sin(frame.angle);
    return new Vec2(
      frame.center.x + local.x * cos - local.y * sin,
      frame.center.y + local.x * sin + local.y * cos,
    );
  }

  // 选中原子的包围盒：以原子质心为旋转中心，四周留 FRAME_PAD 保证点状选择也有可拖的手柄
  private selection_frame(): FrameBox | undefined {
    const targets = this.selection_targets();
    if (targets.length == 0) {
      this.frame_key = "";
      this.frame_angle = 0;
      return undefined;
    }
    // 换了选择就把框摆正；同一个选择里旋转过的角度保留下来
    const key = targets.map(atom => atom.idx).sort((a, b) => a - b).join(",");
    if (key !== this.frame_key) {
      this.frame_key = key;
      this.frame_angle = 0;
    }

    const points = targets.map(atom => this.atom_screen(atom));
    const center = maths.points_center(points);
    const cos = Math.cos(this.frame_angle);
    const sin = Math.sin(this.frame_angle);
    let half_w = FRAME_PAD;
    let half_h = FRAME_PAD;
    for (const p of points) {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const lx = Math.abs(dx * cos + dy * sin);
      const ly = Math.abs(-dx * sin + dy * cos);
      half_w = Math.max(half_w, lx + FRAME_PAD);
      half_h = Math.max(half_h, ly + FRAME_PAD);
    }

    const frame: FrameBox = {
      center,
      angle: this.frame_angle,
      half: new Vec2(half_w, half_h),
      handles: {} as Record<HandleId, Vec2>,
      corners: [],
    };
    const local_handles: [HandleId, Vec2][] = [
      ["nw", new Vec2(-half_w, -half_h)],
      ["n", new Vec2(0, -half_h)],
      ["ne", new Vec2(half_w, -half_h)],
      ["e", new Vec2(half_w, 0)],
      ["se", new Vec2(half_w, half_h)],
      ["s", new Vec2(0, half_h)],
      ["sw", new Vec2(-half_w, half_h)],
      ["w", new Vec2(-half_w, 0)],
      ["rotate", new Vec2(0, -half_h - ROTATE_GAP)],
    ];
    for (const [handle, local] of local_handles) {
      frame.handles[handle] = this.to_canvas(local, frame);
    }
    frame.corners = [frame.handles.nw, frame.handles.ne, frame.handles.se, frame.handles.sw];
    return frame;
  }

  private frame_handle_at(screen: Vec2): HandleId | undefined {
    const frame = this.selection_frame();
    if (!frame) return undefined;
    let best: HandleId | undefined;
    let best_dist = HANDLE_HIT;
    for (const handle of HANDLE_ORDER) {
      const dist = frame.handles[handle].dist(screen);
      if (dist > best_dist) continue;
      best_dist = dist;
      best = handle;
    }
    return best;
  }

  private in_frame(screen: Vec2, frame: FrameBox): boolean {
    const local = this.to_local(screen, frame);
    return Math.abs(local.x) <= frame.half.x && Math.abs(local.y) <= frame.half.y;
  }

  // 按到辅助框手柄时开始拖动
  private begin_frame_drag(handle: HandleId, screen: Vec2, world: Vec2) {
    const frame = this.selection_frame();
    const targets = this.selection_targets();
    if (!frame || targets.length == 0) return;
    for (const atom of targets) atom.pre_move = undefined;

    const left = handle.includes("w");
    const right = handle.includes("e");
    const top = handle.includes("n");
    const bottom = handle.includes("s");
    const handle_local = new Vec2(
      right ? frame.half.x : left ? -frame.half.x : 0,
      bottom ? frame.half.y : top ? -frame.half.y : 0,
    );

    this.frame_drag = {
      mode: handle === "rotate" ? "rotate" : "scale",
      handle,
      down_screen: screen,
      down_world: world,
      frame,
      anchor_local: handle === "rotate" ? new Vec2(0, 0) : new Vec2(-handle_local.x, -handle_local.y),
      handle_local,
      start_angle: Math.atan2(screen.y - frame.center.y, screen.x - frame.center.x),
      start_frame_angle: frame.angle,
      center_world: this.camera.canvas_to_world(
        frame.center.x, frame.center.y,
        this.canvas.clientWidth, this.canvas.clientHeight,
      ),
      targets,
      moved: false,
    };
  }

  private begin_frame_move(screen: Vec2, world: Vec2) {
    this.begin_frame_drag("nw", screen, world);
    if (this.frame_drag) this.frame_drag.mode = "move";
  }

  // 鼠标移动时更新预览（每次都从 base_pos 重新算）
  private update_frame_drag(screen: Vec2, world: Vec2) {
    const drag = this.frame_drag;
    if (!drag) return;
    for (const atom of drag.targets) atom.pre_move = undefined;

    if (drag.mode === "move") {
      if (!drag.moved && screen.dist(drag.down_screen) < MOVE_THRESHOLD) return;
      drag.moved = true;
      const delta = world.sub(drag.down_world);
      for (const atom of drag.targets) atom.pre_move = delta;
      return;
    }

    if (drag.mode === "rotate") {
      const center = drag.frame.center;
      const angle = Math.atan2(screen.y - center.y, screen.x - center.x) - drag.start_angle;
      // 框跟着一起转，原子按同样的角度绕框中心转
      this.frame_angle = drag.start_frame_angle + angle;
      for (const atom of drag.targets) {
        const [rotated] = maths.points_rotate([atom.base_pos], -angle, drag.center_world);
        atom.pre_move = rotated.sub(atom.base_pos);
      }
      return;
    }

    // 缩放：角手柄等比、边手柄单向；锚点（对边/对角）保持不动
    const frame = drag.frame;
    const local = this.to_local(screen, frame);
    const span_x = drag.handle_local.x - drag.anchor_local.x;
    const span_y = drag.handle_local.y - drag.anchor_local.y;
    const dx = local.x - drag.anchor_local.x;
    const dy = local.y - drag.anchor_local.y;
    let fx = 1;
    let fy = 1;
    if (span_x && span_y) {
      // 鼠标在「锚点 → 手柄」对角线上的投影，保证等比
      const factor = (dx * span_x + dy * span_y) / (span_x * span_x + span_y * span_y);
      fx = Math.max(factor, MIN_SCALE);
      fy = fx;
    } else if (span_x) {
      fx = Math.max(dx / span_x, MIN_SCALE);
    } else if (span_y) {
      fy = Math.max(dy / span_y, MIN_SCALE);
    }
    for (const atom of drag.targets) {
      const atom_local = this.to_local(this.atom_screen(atom), frame);
      const next = this.to_canvas(new Vec2(
        drag.anchor_local.x + (atom_local.x - drag.anchor_local.x) * fx,
        drag.anchor_local.y + (atom_local.y - drag.anchor_local.y) * fy,
      ), frame);
      atom.pre_move = this.camera.canvas_to_world(
        next.x, next.y,
        this.canvas.clientWidth, this.canvas.clientHeight,
      ).sub(atom.base_pos);
    }
  }

  private end_frame_drag() {
    const drag = this.frame_drag;
    if (!drag) return;
    for (const atom of drag.targets) atom.commit();
    this.frame_drag = undefined;
    this.frame_hover = undefined;
  }

  // ---- m / r / s 模态调节：记录基准鼠标位置，鼠标一动就地更新，左键确认、Esc 取消 ----

  private begin_transform(mode: ModalTransform["mode"]) {
    const targets = this.selection_targets();
    if (targets.length == 0) return;
    for (const atom of targets) atom.pre_move = undefined;
    const center = maths.points_center(targets.map(atom => atom.base_pos));
    this.transform = {
      mode,
      mp: this.mouse_world ?? center,
      center,
      start_frame_angle: this.frame_angle,
      targets,
    };
    this.frame_hover = undefined;
    this.update_cursor();
  }

  private apply_transform(world: Vec2) {
    const tr = this.transform;
    if (!tr) return;
    for (const atom of tr.targets) atom.pre_move = undefined;

    if (tr.mode === "move") {
      const delta = world.sub(tr.mp);
      for (const atom of tr.targets) atom.pre_move = delta;
      return;
    }

    if (tr.mode === "rotate") {
      const from = tr.mp.sub(tr.center);
      if (from.dist(new Vec2(0, 0)) < this.px(1)) return; // 基准点落在中心上，角度无意义
      const angle = from.angle(world.sub(tr.center));
      this.frame_angle = tr.start_frame_angle - angle; // 世界角度逆时针为正，画布角度顺时针为正
      for (const atom of tr.targets) {
        const [rotated] = maths.points_rotate([atom.base_pos], angle, tr.center);
        atom.pre_move = rotated.sub(atom.base_pos);
      }
      return;
    }

    const d0 = tr.mp.dist(tr.center);
    if (d0 < this.px(1)) return;
    const factor = world.dist(tr.center) / d0;
    for (const atom of tr.targets) {
      const p = atom.base_pos;
      atom.pre_move = new Vec2((p.x - tr.center.x) * (factor - 1), (p.y - tr.center.y) * (factor - 1));
    }
  }

  private confirm_transform() {
    const tr = this.transform;
    if (!tr) return;
    for (const atom of tr.targets) atom.commit();
    this.transform = undefined;
    this.notify_selection();
  }

  private cancel_transform() {
    const tr = this.transform;
    if (!tr) return;
    for (const atom of tr.targets) atom.pre_move = undefined;
    this.frame_angle = tr.start_frame_angle;
    this.transform = undefined;
  }

  // 画选中辅助框（画布像素坐标系，框可以带旋转）
  private draw_frame() {
    const frame = this.selection_frame();
    if (!frame) return;
    const ctx = this.context;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = FRAME_COLOR;

    const [nw, ne, se, sw] = frame.corners;
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(sw.x, sw.y);
    ctx.closePath();
    ctx.stroke();

    // 旋转手柄的引线
    ctx.beginPath();
    ctx.moveTo(frame.handles.n.x, frame.handles.n.y);
    ctx.lineTo(frame.handles.rotate.x, frame.handles.rotate.y);
    ctx.stroke();

    for (const handle of HANDLE_ORDER) {
      const p = frame.handles[handle];
      // 拖动框内部（移动）时不该点亮任何手柄
      const active = this.frame_hover === handle
        || (this.frame_drag?.mode !== "move" && this.frame_drag?.handle === handle);
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = active ? FRAME_COLOR : "#ffffff";
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 手柄的鼠标指针：按手柄朝外的方向（含框的旋转）换算
  private handle_cursor(handle: HandleId, frame: FrameBox): string {
    if (handle === "rotate") return "grab";
    const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
    const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
    const cos = Math.cos(frame.angle);
    const sin = Math.sin(frame.angle);
    const dx = sx * cos - sy * sin;
    const dy = sx * sin + sy * cos;
    // 缩放方向是双向的，角度折叠到 [0, π)
    const angle = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI;
    if (angle < Math.PI / 8 || angle >= (Math.PI * 7) / 8) return "ew-resize";
    if (angle < (Math.PI * 3) / 8) return "nwse-resize";
    if (angle < (Math.PI * 5) / 8) return "ns-resize";
    return "nesw-resize";
  }

  private frame_cursor_at(screen: Vec2): string | undefined {
    this.frame_hover = this.frame_handle_at(screen);
    const frame = this.selection_frame();
    if (!frame) return undefined;
    if (this.frame_hover) return this.handle_cursor(this.frame_hover, frame);
    return this.in_frame(screen, frame) ? "move" : undefined;
  }

  private on_mouse_down(e: MouseEvent) {
    const appStore = useAppStore();
    const mole = this.mole;
    if (!mole) return;
    // 空格 + 左键：平移编辑区，优先级高于所有工具
    if (this.space_down && e.button === 0) {
      e.preventDefault();
      this.panning = true;
      this.last_mouse = new Vec2(e.clientX, e.clientY);
      this.clear_hover();
      return;
    }
    this.suppress_click = false;
    this.suppress_pick = false;

    const pos = this.c2s_pos(e.clientX, e.clientY);
    const screen = this.screen_of(e);
    this.mouse_world = pos;
    this.mouse_screen = screen;
    this.down_pos = pos;
    this.mouse_down = true;
    useAppStore().focus_surface = 'mole';

    // 模态调节中：左键确认，随后那次 mouseup 不再结算选择
    if (this.transform) {
      if (e.button === 0) {
        this.confirm_transform();
        this.suppress_pick = true;
      }
      return;
    }

    if (appStore.mole_tool == '成键') {
      if (!this.hovered_atom) {
        mole.add_atom(pos);
      }
      return;
    }

    if (appStore.mole_tool == '选择') {
      // 辅助框手柄优先，其次框内拖动移动
      const handle = this.frame_handle_at(screen);
      if (handle) {
        this.begin_frame_drag(handle, screen, pos);
        return;
      }
      const frame = this.selection_frame();
      if (frame && this.in_frame(screen, frame)) {
        this.begin_frame_move(screen, pos);
      }
    }
  }

  private on_mouse_up(e: MouseEvent) {
    // 确认调节时的那次 mouseup：只收尾，不让它去改选择
    if (this.suppress_pick) {
      this.suppress_pick = false;
      this.mouse_down = false;
      return;
    }
    if (this.panning) {
      this.panning = false;
      this.last_mouse = undefined;
      this.mouse_down = false;
      this.suppress_click = true;
      this.clear_hover();
      return;
    }

    const appStore = useAppStore();
    const mole = this.mole;
    const pos = this.c2s_pos(e.clientX, e.clientY);
    this.up_pos = pos;
    if (!mole) {
      this.mouse_down = false;
      return;
    }

    // 辅助框拖拽结束：把预览位移合并进原子位置
    if (this.frame_drag) {
      this.end_frame_drag();
      this.notify_selection();
      this.mouse_down = false;
      return;
    }

    if (appStore.mole_tool == '成键') {
      const x = pos.x;
      const y = pos.y;
      if (this.moved_node == false) { // 视为点击：连出一条默认长度的键
        const len = this.bond_length();
        if (this.hovered_atom) {
          const base = this.hovered_atom.pos;
          const dir = this.fix_direction(this.hovered_atom.max_rep_dir());
          mole.add_atom(new Vec2(base.x + dir.x * len, base.y + dir.y * len));
        } else {
          mole.add_atom(new Vec2(x + len, y));
        }
        const atom_count = mole.atoms.length - 1;
        if (this.hovered_atom) {
          mole.add_bond(this.hovered_atom.idx, atom_count, appStore.bond_type);
        } else {
          mole.add_bond(atom_count - 1, atom_count, appStore.bond_type);
        }
      } else {
        this.moved_node = false;
      }
      // 画环收口：新原子落回已有原子上时合并
      mole.merge_last_atom(this.px(10));
      this.bond_from = undefined;
    }

    if (appStore.mole_tool == '选择') {
      const dist = this.down_pos!.dist(this.up_pos!);
      if (dist < this.px(5)) { // 点击（而不是拖动）
        const hit_atom = mole.atoms.find(atom => atom.pos.dist(this.up_pos!) < this.tol)
          ?? this.hovered_atom;
        const hit_bond = hit_atom ? undefined : (this.hovered_bond ?? this.bond_at(this.up_pos!));
        if (!e.shiftKey) {
          for (const atom of mole.atoms) atom.selected = false;
          for (const bond of mole.bonds) bond.selected = false;
        }
        if (hit_atom) hit_atom.selected = true;
        if (hit_bond) hit_bond.selected = true;
      }
      // 点选和框选都在这里统一结算给面板
      this.notify_selection();
    }

    this.mouse_down = false;
  }

  // 固定长度：开时用面板里的键长，否则回到默认键长
  private bond_length(): number {
    const appStore = useAppStore();
    return appStore.fix_len ? appStore.fix_len_cm : BOND_LEN;
  }

  // 单位方向；开了固定角度时吸附到面板设定的角度网格（15° 步长之类）
  private fix_direction(dir: Vec2): Vec2 {
    const len = dir.dist(new Vec2(0, 0));
    if (len < 1e-6) return new Vec2(1, 0);
    let ux = dir.x / len;
    let uy = dir.y / len;
    const appStore = useAppStore();
    const step = (appStore.fix_ang_step * Math.PI) / 180;
    if (appStore.fix_ang && step > 0) {
      const snapped = Math.round(Math.atan2(uy, ux) / step) * step;
      ux = Math.cos(snapped);
      uy = Math.sin(snapped);
    }
    return new Vec2(ux, uy);
  }

  // 拖动成键时新原子的位置：方向吸附 + 长度固定；两个开关都关着就跟着鼠标走
  private fix_bond_pos(from: Vec2, target: Vec2): Vec2 {
    const appStore = useAppStore();
    if (!appStore.fix_ang && !appStore.fix_len) return target;
    const dir = this.fix_direction(target.sub(from));
    const len = appStore.fix_len ? appStore.fix_len_cm : target.dist(from);
    return new Vec2(from.x + dir.x * len, from.y + dir.y * len);
  }

  // 离鼠标最近的键（在容差内）
  private bond_at(pos: Vec2): Bond | undefined {    const mole = this.mole;
    if (!mole) return undefined;
    let best: Bond | undefined = undefined;
    let best_dist = Infinity;
    for (const bond of mole.bonds) {
      const dist = bond.dist_to_pointer(pos);
      if (dist <= bond.hit_tolerance(this.tol) && dist < best_dist) {
        best_dist = dist;
        best = bond;
      }
    }
    return best;
  }

  private on_mouse_move(e: MouseEvent) {
    const mole = this.mole;
    const appStore = useAppStore();
    if (this.panning) {
      if (!this.last_mouse) return;
      const dx = e.clientX - this.last_mouse.x;
      const dy = e.clientY - this.last_mouse.y;
      this.last_mouse = new Vec2(e.clientX, e.clientY);
      this.camera.move_by_canvas(-dx, -dy);
      return;
    }

    const pos = this.c2s_pos(e.clientX, e.clientY);
    const screen = this.screen_of(e);
    this.move_pos = pos;
    this.mouse_world = pos;
    this.mouse_screen = screen;
    if (!mole) return;

    // 模态调节 / 辅助框拖拽中：只更新预览
    if (this.transform) {
      this.apply_transform(pos);
      return;
    }
    if (this.frame_drag) {
      this.update_frame_drag(screen, pos);
      return;
    }

    if (appStore.mole_tool == '成键' && this.mouse_down) {
      // 移动超过几个像素才算「拖拽成键」；否则当成点击，交给 mouseup 处理，
      // 这样带一点点抖动的点击也能正常连出键
      const moved = this.down_pos ? pos.dist(this.down_pos) : 0;
      if (this.moved_node == false && moved > this.px(4)) {
        this.moved_node = true;
        // 从鼠标按下时所在的原子（或刚按下创建的原子）连出去
        const from_atom = this.hovered_atom ?? mole.atoms[mole.atoms.length - 1];
        this.bond_from = from_atom ? from_atom.pos : undefined;
        const new_atom = mole.add_atom(this.bond_from ? this.fix_bond_pos(this.bond_from, pos) : pos);
        if (from_atom) {
          mole.add_bond(from_atom.idx, new_atom.idx, appStore.bond_type);
        }
      } else if (this.moved_node) {
        const last_atom = mole.atoms[mole.atoms.length - 1];
        if (last_atom) {
          last_atom.pos = this.bond_from ? this.fix_bond_pos(this.bond_from, pos) : pos;
        }
      }
    }

    if (appStore.mole_tool == '选择' && this.mouse_down) {
      const pos0 = this.down_pos;
      if (pos0) {
        for (const atom of mole.atoms) {
          if (atom.in_rect(pos0, pos)) atom.selected = true;
          else if (!e.shiftKey) atom.selected = false;
        }
        for (const bond of mole.bonds) {
          if (bond.in_rect(pos0, pos)) bond.selected = true;
          else if (!e.shiftKey) bond.selected = false;
        }
      }
    }

    if (!this.mouse_down) {
      const mouse = pos;
      this.hovered_atom = mole.atoms.find(atom => atom.pos.dist(mouse) < this.tol);
      this.hovered_bond = this.hovered_atom ? undefined : this.bond_at(mouse);
      for (const atom of mole.atoms) atom.hovered = atom === this.hovered_atom;
      for (const bond of mole.bonds) bond.hovered = bond === this.hovered_bond;
      // 辅助框手柄 / 框内的鼠标指针
      if (appStore.mole_tool == '选择' && !this.transform) {
        this.frame_cursor = this.frame_cursor_at(screen);
      } else {
        this.frame_hover = undefined;
        this.frame_cursor = undefined;
      }
      this.update_cursor();
    }
  }

  private on_wheel(e: WheelEvent) {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.canvas.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey) {
      const factor = Math.exp(-dy * 0.001);
      const rect = this.canvas.getBoundingClientRect();
      this.camera.zoom_at(
        factor,
        e.clientX - rect.left,
        e.clientY - rect.top,
        this.canvas.clientWidth,
        this.canvas.clientHeight,
      );
      return;
    }
    if (e.shiftKey) {
      this.camera.move_by_canvas(dy + dx, 0);
    } else {
      this.camera.move_by_canvas(dx, dy);
    }
  }

  private on_click(e: MouseEvent) {
    if (this.suppress_click) {
      this.suppress_click = false;
      return;
    }
    const mole = this.mole;
    const appStore = useAppStore();
    if (!mole) return;
    if (appStore.mole_tool == '片段') {
      // 鼠标在键上时贴键，否则贴原子/落在点击处
      add_fragment(mole, appStore.frag_name, this.c2s_pos(e.clientX, e.clientY), this.hovered_atom, this.hovered_bond);
    }
  }

  private on_key_down(e: KeyboardEvent) {
    if (this.is_editing(e.target)) return;
    const appStore = useAppStore();
    if (appStore.focus_surface != 'mole') return;

    // 模态调节中只认 Esc（取消）和回车（确认）
    if (this.transform) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel_transform();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.confirm_transform();
      }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.mole?.delete_selected();
      this.notify_selection();
      return;
    }

    // 和主画布一致：m / r / s 进入模态调节
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'm' || key === 'r' || key === 's') {
        e.preventDefault();
        this.begin_transform(key === 'm' ? 'move' : key === 'r' ? 'rotate' : 'scale');
        return;
      }
    }

    if (e.code !== 'Space') return;
    e.preventDefault();
    if (this.space_down) return;
    this.space_down = true;
    this.update_cursor();
  }

  private on_key_up(e: KeyboardEvent) {
    if (e.code !== 'Space') return;
    this.space_down = false;
    this.update_cursor();
  }

  private update_cursor() {
    this.canvas.style.cursor = this.panning ? "grabbing"
      : this.space_down ? "grab"
        : this.frame_cursor ?? "default";
  }

  // 只有真正在输入文字时才屏蔽快捷键
  private is_editing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    const type = (el as HTMLInputElement).type;
    return ["text", "search", "email", "number", "password", "tel", "url"].includes(type);
  }

  // 屏幕坐标 → 分子局部坐标
  c2s_pos(client_x: number, client_y: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.canvas_to_world(
      client_x - rect.left,
      client_y - rect.top,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
    );
  }

  px(n: number): number {
    return n / this.camera.scale;
  }
}
