import { Vec2 } from "../types";
import type { Viewport } from "../viewport";

type Data = {
  nodes: [number, number][]
  edges: [number, number][]
}

export class Rect {
  scene: Viewport
  position: Vec2
  width: number
  height: number
  visible: boolean
  if_dash: boolean // 控制是否显示虚线
  if_fill: boolean // 控制是否填充
  fill_style: string // 填充样式
  if_line: boolean // 控制是否显示边框
  line_style: string // 边框样式
  data: Data = {nodes: [], edges: []}

  constructor(scene: Viewport, position: Vec2, width: number, height: number) {
    this.scene = scene
    this.position = position
    this.width = width
    this.height = height
    this.visible = true
    this.if_dash = false
    this.if_fill = false
    this.fill_style = "white"
    this.if_line = false
    this.line_style = "black"
    this.update_data()
  }

  update_data() {
    const w = this.width
    const h = this.height
    const x = this.position.x
    const y = this.position.y
    this.data = {
      nodes: [
        [x-w/2,y-h/2],
        [x+w/2,y-h/2],
        [x+w/2,y+h/2],
        [x-w/2,y+h/2]
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0]
      ]
    }
  }

  // 判断一个点是否在这个矩形里面
  point_in(point: Vec2) {
    const nodes = this.data.nodes
    const edges = this.data.edges
    for (const edge of edges) {
      const i0 = edge[0]
      const i1 = edge[1]
      const [x0, y0] = nodes[i0]
      const [x1, y1] = nodes[i1]
      const vec_0 = new Vec2(x1 - x0, y1 - y0)
      const vec_1 = new Vec2(point.x - x0, point.y - y0)
      if (vec_0.cross(vec_1) < 0) return false
    }
    return true
  }

  set_by_2p(p1: Vec2, p2: Vec2) {
    this.position = new Vec2((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
    this.width = p2.x - p1.x
    this.height = p2.y - p1.y
    this.update_data()
  }

  // 绘制这个矩形
  draw() {
    if (!this.visible) return
    const ctx = this.scene.context
    ctx.save() // 避免 fillStyle/strokeStyle/虚线等状态泄漏到下一帧
    ctx.beginPath()
    const nodes = this.data.nodes
    // const edges = this.data.edges
    for (let i = 0; i < nodes.length; i++) {
      const [x, y] = nodes[i]
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.lineWidth = this.scene.px(1)
    if (this.if_dash) {
      ctx.setLineDash([this.scene.px(4), this.scene.px(4)])
    }
    if (this.if_line) {
      ctx.strokeStyle = this.line_style
      ctx.stroke()
    }
    if (this.if_fill) {
      ctx.fillStyle = this.fill_style
      ctx.fill()
    }
    ctx.restore()
  }
}
