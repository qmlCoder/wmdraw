export class Vec2 {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  add(other: Vec2) {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  sub(other: Vec2) {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  dist(other: Vec2) {
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
  }

  cross(other: Vec2) {
    return this.x * other.y - this.y * other.x;
  }

  dot(other: Vec2) {
    return this.x * other.x + this.y * other.y;
  }

  angle(other: Vec2) {
    return Math.atan2(this.cross(other), this.dot(other));
  }

  list() {
    return [this.x, this.y];
  }
}

export class Object {
  draw() { }

}

export type BondType = '单键' | '双键-0' | '双键-1' | '双键-2' | '三键'
export type ToolType = '选择' | '文本' | '公式' | '分子' | '模型' | '图像'
// 分子属性面板里那块画布的工具（调节用选中框手柄 / m r s 快捷键，不再单列工具）
export type MoleTool = '选择' | '成键' | '片段'
export type MouseState = 'normal' | 'move'
