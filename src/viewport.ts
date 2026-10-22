import type { Camera } from "./camera";

// 画布视口：主画布的 Scene 和分子面板的 MoleEditor 都满足这个接口，
// 这样 Axis / Rect 之类的绘制辅助类不用关心自己画在哪块画布上
export interface Viewport {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  camera: Camera;
  // 屏幕像素长度 → 当前坐标系的长度
  px(n: number): number;
}

// 分子内部的绘制参数：此时坐标系已经是分子的局部坐标（cm）
export interface Paint {
  ctx: CanvasRenderingContext2D;
  // n 个屏幕像素在当前坐标系下的长度
  px(n: number): number;
  // 是否画出节点排斥方向
  show_mrp: boolean;
  // 是否画出选中/悬浮高亮（编辑画布要，主画布上的分子对象不要）
  interactive: boolean;
}
