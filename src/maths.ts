import { Vec2 } from "./types";

// 计算一堆点的中心点
export const points_center = (points: Vec2[]): Vec2 => {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return new Vec2(x / points.length, y / points.length);
}

// 一堆点绕某个点的旋转
export const points_rotate = (points: Vec2[], angle: number, center: Vec2): Vec2[] => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(point => {
    const x = point.x - center.x;
    const y = point.y - center.y;
    return new Vec2(x * cos - y * sin + center.x, x * sin + y * cos + center.y);
  });
}

// 获取与当前一堆向量平均夹角最大的方向（返回单位向量）
// 平均夹角 f(θ) = Σ acos(cos(θ - φi)) / n 是关于 θ 的分段线性函数，
// 拐点只可能落在各个 φi 和 φi + π 上，所以最大值一定出现在拐点或两个拐点之间的中点上
export const max_rep_dir = (points: Vec2[]): Vec2 => {
  const angles: number[] = [];
  for (const point of points) {
    if (Math.hypot(point.x, point.y) < 1e-6) continue; // 零向量没有方向
    const angle = Math.atan2(point.y, point.x);
    angles.push(angle < 0 ? angle + 2 * Math.PI : angle);
  }
  if (angles.length == 0) return new Vec2(1, 0); // 没有参考方向时给个默认方向

  const average_angle = (theta: number): number => {
    let sum = 0;
    for (const angle of angles) {
      let diff = Math.abs(theta - angle) % (2 * Math.PI);
      if (diff > Math.PI) diff = 2 * Math.PI - diff; // 无向夹角取 0~π
      sum += diff;
    }
    return sum / angles.length;
  };

  const breaks: number[] = [];
  for (const angle of angles) {
    breaks.push(angle, (angle + Math.PI) % (2 * Math.PI));
  }
  breaks.sort((a, b) => a - b);

  const mids: number[] = [];
  for (let i = 0; i < breaks.length; i++) {
    const next = i + 1 < breaks.length ? breaks[i + 1] : breaks[0] + 2 * Math.PI;
    mids.push((breaks[i] + next) / 2);
  }

  let best = 0;
  let best_value = -1;
  for (const theta of [...mids, ...breaks]) { // 中点优先，整段都是最优时就取中点
    const value = average_angle(theta);
    if (value > best_value + 1e-9) {
      best_value = value;
      best = theta;
    }
  }
  return new Vec2(Math.cos(best), Math.sin(best));
}