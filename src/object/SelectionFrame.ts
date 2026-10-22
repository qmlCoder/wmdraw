import type { Scene } from "../scene";
import { Vec2 } from "../types";
import type { TextLike } from "./TextLike";

// Excalidraw 风格的选中辅助框：上面的圆旋转，四角等比缩放，四边单向缩放，内部拖动移动
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

const HANDLE_R = 4;        // 手柄半径（屏幕像素）
const HANDLE_HIT = 8;      // 手柄命中半径
const ROTATE_GAP = 18;     // 旋转手柄离上边中点的距离
const MOVE_THRESHOLD = 3;  // 小于这个位移算点击，不移动物体
const MIN_SIZE = 6;        // 缩放后的最小边尺寸（屏幕像素）
const BORDER_STYLE = "#6965db";

// 手柄顺序：旋转优先命中，其次四角，最后四边
const HANDLES: HandleId[] = ["rotate", "nw", "ne", "se", "sw", "n", "e", "s", "w"];

const add = (a: Vec2, b: Vec2) => new Vec2(a.x + b.x, a.y + b.y);
const mul = (a: Vec2, k: number) => new Vec2(a.x * k, a.y * k);
const mid = (a: Vec2, b: Vec2) => new Vec2((a.x + b.x) / 2, (a.y + b.y) / 2);

// 辅助框在画布像素坐标系里的九个控制点
interface Frame {
  corners: Vec2[]; // nw / ne / se / sw
  nw: Vec2; n: Vec2; ne: Vec2; e: Vec2; se: Vec2; s: Vec2; sw: Vec2; w: Vec2;
  center: Vec2;
  rotate: Vec2;
}

function frame_of(object: TextLike): Frame {
  const [nw, ne, se, sw] = object.canvas_corners();
  const center = mid(nw, se);
  const top = mid(nw, ne);
  // 旋转手柄沿「中心 → 上边中点」方向外移
  const dir = top.sub(center);
  const len = Math.hypot(dir.x, dir.y) || 1;
  const rotate = new Vec2(
    top.x + (dir.x / len) * ROTATE_GAP,
    top.y + (dir.y / len) * ROTATE_GAP,
  );
  return {
    corners: [nw, ne, se, sw],
    nw, n: top, ne, e: mid(ne, se), se, s: mid(se, sw), sw, w: mid(sw, nw),
    center, rotate,
  };
}

// 缩放指针方向：把「手柄朝外的方向」折算成四个对角指针之一
function resize_cursor(object: TextLike, handle: HandleId): string {
  const axes = object.screen_axes();
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const dir = add(mul(axes.x, sx), mul(axes.y, sy));
  // 缩放方向是双向的，角度折叠到 [0, π)
  const angle = ((Math.atan2(dir.y, dir.x) % Math.PI) + Math.PI) % Math.PI;
  if (angle < Math.PI / 8 || angle >= (Math.PI * 7) / 8) return "ew-resize";
  if (angle < (Math.PI * 3) / 8) return "nwse-resize";
  if (angle < (Math.PI * 5) / 8) return "ns-resize";
  return "nesw-resize";
}

// 一次拖拽的固定基准（按下时算好，过程中只读）
interface Drag {
  object: TextLike;
  targets: TextLike[]; // 移动时可能带上一起选中的其他物体
  mode: "move" | "rotate" | "scale";
  handle: HandleId | undefined;
  down_screen: Vec2;
  down_world: Vec2;
  origin: Vec2;  // 包围盒左上角（画布像素）
  width: number; // 按下时的包围盒尺寸（屏幕像素，含旋转前的原尺寸）
  height: number;
  axes: { x: Vec2; y: Vec2 };
  handle_local: Vec2; // 被拖手柄在局部包围盒里的位置
  anchor: Vec2;       // 缩放锚点（对角/对边中点）在局部包围盒里的位置
  anchor_screen: Vec2;
  center: Vec2;       // 旋转中心
  start_angle: number;
  moved: boolean;
}

export class SelectionFrame {
  private scene: Scene;
  drag: Drag | undefined = undefined;
  // 当前鼠标悬停的手柄，用于高亮
  hovered: HandleId | undefined = undefined;
  hovered_object: TextLike | undefined = undefined;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private frames(): { object: TextLike; frame: Frame }[] {
    const result: { object: TextLike; frame: Frame }[] = [];
    for (const object of this.scene.texts) {
      if (!object.selected) continue;
      result.push({ object, frame: frame_of(object) });
    }
    return result;
  }

  // 命中选中物体的手柄（旋转手柄优先，其次按距离取最近的）
  handle_at(screen: Vec2): { object: TextLike; handle: HandleId } | undefined {
    let best: { object: TextLike; handle: HandleId } | undefined;
    let best_dist = HANDLE_HIT;
    for (const { object, frame } of this.frames()) {
      for (const handle of HANDLES) {
        const d = frame[handle].dist(screen);
        if (d > best_dist) continue;
        best_dist = d;
        best = { object, handle };
      }
    }
    return best;
  }

  // 绘制所有选中物体的辅助框（画布像素坐标系，不受相机变换影响）
  draw() {
    const list = this.frames();
    if (list.length == 0) return;
    const ctx = this.scene.context;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = BORDER_STYLE;
    for (const { object, frame } of list) {
      ctx.beginPath();
      ctx.moveTo(frame.nw.x, frame.nw.y);
      ctx.lineTo(frame.ne.x, frame.ne.y);
      ctx.lineTo(frame.se.x, frame.se.y);
      ctx.lineTo(frame.sw.x, frame.sw.y);
      ctx.closePath();
      ctx.stroke();

      // 旋转手柄的引线
      ctx.beginPath();
      ctx.moveTo(frame.n.x, frame.n.y);
      ctx.lineTo(frame.rotate.x, frame.rotate.y);
      ctx.stroke();

      for (const handle of HANDLES) {
        const p = frame[handle];
        const active =
          (this.hovered_object === object && this.hovered === handle) ||
          (this.drag?.object === object && this.drag.handle === handle);
        ctx.beginPath();
        ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = active ? BORDER_STYLE : "#ffffff";
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 更新手柄悬浮态并返回应该显示的鼠标指针
  cursor_at(screen: Vec2, over_object: boolean): string | undefined {
    this.hovered = undefined;
    this.hovered_object = undefined;
    const hit = this.handle_at(screen);
    if (!hit) return over_object ? "move" : undefined;
    this.hovered = hit.handle;
    this.hovered_object = hit.object;
    return hit.handle === "rotate" ? "grab" : resize_cursor(hit.object, hit.handle);
  }

  clear_hover() {
    this.hovered = undefined;
    this.hovered_object = undefined;
  }

  // 按到辅助框手柄时开始旋转/缩放。命中返回 true
  begin_handle_drag(screen: Vec2, world: Vec2): boolean {
    const hit = this.handle_at(screen);
    if (!hit) return false;

    const object = hit.object;
    const handle = hit.handle;
    object.reset_preview();
    const origin = object.origin_screen();
    const { w, h } = object.measure_screen();
    const axes = object.screen_axes();
    const center = add(origin, add(mul(axes.x, w / 2), mul(axes.y, h / 2)));

    if (handle === "rotate") {
      this.drag = {
        object, targets: [object], mode: "rotate", handle,
        down_screen: screen, down_world: world,
        origin, width: w, height: h, axes,
        handle_local: center, anchor: center, anchor_screen: center,
        center,
        start_angle: Math.atan2(screen.y - center.y, screen.x - center.x),
        moved: false,
      };
      return true;
    }

    // 角手柄缩两个轴，边手柄只缩一个轴；锚点取对面
    const left = handle.includes("w");
    const right = handle.includes("e");
    const top = handle.includes("n");
    const bottom = handle.includes("s");
    const handle_local = new Vec2(
      left ? 0 : right ? w : w / 2,
      top ? 0 : bottom ? h : h / 2,
    );
    const anchor = new Vec2(
      right ? 0 : left ? w : w / 2,
      bottom ? 0 : top ? h : h / 2,
    );
    this.drag = {
      object, targets: [object], mode: "scale", handle,
      down_screen: screen, down_world: world,
      origin, width: w, height: h, axes,
      handle_local, anchor,
      anchor_screen: add(origin, add(mul(axes.x, anchor.x), mul(axes.y, anchor.y))),
      center,
      start_angle: 0,
      moved: false,
    };
    return true;
  }

  // 按到物体内部时开始移动（同一选中组一起动）
  begin_move(targets: TextLike[], screen: Vec2, world: Vec2) {
    const object = targets[targets.length - 1];
    if (!object) return;
    for (const target of targets) target.reset_preview();
    const origin = object.origin_screen();
    const { w, h } = object.measure_screen();
    const axes = object.screen_axes();
    this.drag = {
      object, targets, mode: "move", handle: undefined,
      down_screen: screen, down_world: world,
      origin, width: w, height: h, axes,
      handle_local: origin, anchor: origin, anchor_screen: origin,
      center: origin,
      start_angle: 0,
      moved: false,
    };
  }

  // 鼠标移动时更新预览变换
  move_to(screen: Vec2, world: Vec2) {
    const d = this.drag;
    if (!d) return;
    if (d.mode === "move") {
      if (!d.moved && screen.dist(d.down_screen) < MOVE_THRESHOLD) return;
      d.moved = true;
      const dx = world.x - d.down_world.x;
      const dy = world.y - d.down_world.y;
      for (const target of d.targets) target.pre_move = new Vec2(dx, dy);
      return;
    }

    const object = d.object;
    object.reset_preview();

    if (d.mode === "rotate") {
      const angle = Math.atan2(screen.y - d.center.y, screen.x - d.center.x);
      // 画布 y 轴向下（角度顺时针为正），世界旋转逆时针为正，所以取负
      const delta = -(angle - d.start_angle);
      object.pre_rotation = delta;
      // 物体绕左上角旋转，这里补偿位置让它看起来绕中心转
      const theta = object.rotation + delta;
      const cos = Math.cos(-theta);
      const sin = Math.sin(-theta);
      const top_left = new Vec2(
        d.center.x + cos * (-d.width / 2) - sin * (-d.height / 2),
        d.center.y + sin * (-d.width / 2) + cos * (-d.height / 2),
      );
      object.pre_move = this.world_of(top_left).sub(object.base_pos);
      return;
    }

    // 缩放在局部坐标系里做：把鼠标相对锚点的位移投影到两个轴上
    const rel = screen.sub(d.anchor_screen);
    const dx = rel.dot(d.axes.x);
    const dy = rel.dot(d.axes.y);
    const span_x = d.handle_local.x - d.anchor.x;
    const span_y = d.handle_local.y - d.anchor.y;
    const min_fx = Math.min(1, MIN_SIZE / d.width);
    const min_fy = Math.min(1, MIN_SIZE / d.height);
    let fx = 1;
    let fy = 1;
    if (span_x && span_y) {
      // 角手柄：鼠标在「锚点 → 手柄」对角线上的投影，等比缩放
      const factor = (dx * span_x + dy * span_y) / (span_x * span_x + span_y * span_y);
      fx = Math.max(factor, min_fx, min_fy);
      fy = fx;
    } else if (span_x) {
      fx = Math.max(dx / span_x, min_fx);
    } else if (span_y) {
      fy = Math.max(dy / span_y, min_fy);
    }
    // 锚点在缩放中保持不动 → 左上角相对锚点按同样比例移动
    const top_left = add(
      d.anchor_screen,
      add(mul(d.axes.x, -d.anchor.x * fx), mul(d.axes.y, -d.anchor.y * fy)),
    );
    object.pre_scale_x = fx;
    object.pre_scale_y = fy;
    object.pre_move = this.world_of(top_left).sub(object.base_pos);
  }

  // 结束拖拽：把预览变换合并进实际数据
  end_drag() {
    const d = this.drag;
    if (!d) return;
    for (const target of d.targets) target.commit();
    this.drag = undefined;
    this.clear_hover();
  }

  private world_of(screen: Vec2): Vec2 {
    const scene = this.scene;
    return scene.camera.canvas_to_world(
      screen.x, screen.y,
      scene.canvas.clientWidth, scene.canvas.clientHeight,
    );
  }
}
