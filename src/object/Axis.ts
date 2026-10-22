import type { Viewport } from "../viewport";

// 网格间隔（cm）：每 1cm 一条细灰线，每 10cm 一条粗黑线（原点自然落在粗线上）
const MINOR_STEP = 1;
const MAJOR_STEP = 10;
// 1cm 线在屏幕上小于这个间距就没必要画了，避免缩得很小时糊成一片
const MIN_GAP_PX = 4;

export class Axis {
  scene: Viewport;
  constructor(scene: Viewport) {
    this.scene = scene;
  }

  draw() {
    const ctx = this.scene.context;
    const camera = this.scene.camera;
    const width = this.scene.canvas.clientWidth;
    const height = this.scene.canvas.clientHeight;
    const scale = camera.scale;
    if (!width || !height) return;

    // 当前可见范围（cm），网格只画这一块
    const left = camera.pos.x - width / (2 * scale);
    const right = camera.pos.x + width / (2 * scale);
    const bottom = camera.pos.y - height / (2 * scale);
    const top = camera.pos.y + height / (2 * scale);

    ctx.save();
    ctx.beginPath(); // 路径要显式重置，否则会跨帧累积

    // 1cm 细网格（整 10cm 的位置留给粗线）
    if (MINOR_STEP * scale >= MIN_GAP_PX) {
      ctx.strokeStyle = "rgba(134, 142, 150, 0.45)";
      ctx.lineWidth = this.scene.px(1);
      for (
        let i = Math.floor(left / MINOR_STEP);
        i <= Math.ceil(right / MINOR_STEP);
        i++
      ) {
        if (i % (MAJOR_STEP / MINOR_STEP) === 0) continue;
        const x = i * MINOR_STEP;
        ctx.moveTo(x, bottom);
        ctx.lineTo(x, top);
      }
      for (
        let i = Math.floor(bottom / MINOR_STEP);
        i <= Math.ceil(top / MINOR_STEP);
        i++
      ) {
        if (i % (MAJOR_STEP / MINOR_STEP) === 0) continue;
        const y = i * MINOR_STEP;
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
      ctx.stroke();
      ctx.beginPath();
    }

    // 10cm 粗网格（黑色，粗一点）
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = this.scene.px(1);
    for (
      let i = Math.floor(left / MAJOR_STEP);
      i <= Math.ceil(right / MAJOR_STEP);
      i++
    ) {
      const x = i * MAJOR_STEP;
      ctx.moveTo(x, bottom);
      ctx.lineTo(x, top);
    }
    for (
      let i = Math.floor(bottom / MAJOR_STEP);
      i <= Math.ceil(top / MAJOR_STEP);
      i++
    ) {
      const y = i * MAJOR_STEP;
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}
