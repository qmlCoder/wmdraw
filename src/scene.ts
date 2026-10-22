import { Vec2, MouseState } from "./types";
import { useAppStore } from "./stores/app";
import { Rect } from "./object/Rect";
import { Axis } from "./object/Axis";
import { Text } from "./object/Text";
import { Latex } from "./object/Latex";
import { Mole } from "./object/Mole";
import { Model } from "./object/Model";
import { Image } from "./object/Image";
import { TextLike } from "./object/TextLike";
import { SelectionFrame } from "./object/SelectionFrame";
import { Camera } from "./camera";
import type { Viewport } from "./viewport";

import * as maths from "./maths";

// Blender 风格的模态调节：m 移动 / r 旋转 / s 缩放。
// 进入时记录鼠标位置 mp 作为基准，之后鼠标一动就地更新预览，左键确认、Esc 取消。
interface TransformState {
  mode: 'move' | 'rotate' | 'scale';
  mp: Vec2;        // 进入调节时的鼠标位置（世界坐标）
  mp_screen: Vec2; // 同上，画布像素，画参考线用
  center: Vec2;    // 旋转/缩放的中心（世界坐标）
  screen: Vec2;    // 当前鼠标位置（画布像素）
  texts: TextLike[]; // 参与调节的物体
}

// 坐标约定：物体内部数据（pos 等）单位是 cm，
// 画布与鼠标事件用像素 px，换算关系 1 cm = 100 px（见 units.ts）。
// 相机（Camera）负责两者的映射：画布坐标 = (世界坐标 - 相机位置) * 比例。
//
// 分子本身的绘制/交互在分子属性面板里（object/MoleEditor.ts），
// 主画布上的 Mole 只是一个可以平移/旋转/缩放的独立物体。
export class Scene implements Viewport {
  declare canvas: HTMLCanvasElement;
  declare context: CanvasRenderingContext2D;
  texts: TextLike[];
  down_pos: Vec2 | undefined;
  move_pos: Vec2 | undefined;
  up_pos: Vec2 | undefined;
  mouse_down: boolean = false;
  hovered_text: TextLike | undefined = undefined;
  select_rect: Rect;
  axis: Axis;
  _mouse_state: MouseState = 'normal';
  // ---- 视图（相机）：负责世界坐标(cm) → 画布像素(px) 的变换 ----
  camera: Camera = new Camera();
  space_down: boolean = false; // 空格是否按下
  panning: boolean = false;    // 是否正在拖动平移
  last_mouse: Vec2 | undefined; // 上一次鼠标位置（画布像素），用于算拖动增量
  suppress_click: boolean = false; // 平移结束后浏览器会补发 click，需要吞掉
  frame: SelectionFrame; // 选中物体的辅助框（旋转/缩放/移动手柄）
  frame_cursor: string | undefined = undefined; // 悬浮在辅助框上的鼠标指针
  transform: TransformState | undefined = undefined; // 正在进行的模态调节
  mouse_world: Vec2 | undefined = undefined; // 当前鼠标的世界坐标
  mouse_screen: Vec2 | undefined = undefined; // 当前鼠标的画布像素坐标
  suppress_pick: boolean = false; // 确认调节后的那次 mouseup 不再结算选择
  constructor() {
    this.texts = [];
    this.down_pos = undefined; // 鼠标按下的位置
    this.move_pos = undefined; // 鼠标移动的位置
    this.up_pos = undefined; // 鼠标抬起的位置
    this.select_rect = new Rect(this, new Vec2(0, 0), 0, 0);
    this.select_rect.visible = false;
    this.select_rect.if_dash = true;
    this.select_rect.if_line = true;
    this.select_rect.line_style = "rgba(64, 128, 255, 0.9)";
    this.select_rect.if_fill = true;
    this.select_rect.fill_style = "rgba(64, 128, 255, 0.12)";
    this.axis = new Axis(this);
    this.frame = new SelectionFrame(this);
  }

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d")!;
    this.canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.canvas.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.canvas.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.canvas.addEventListener("click", this.onClick.bind(this));
    // 滚轮平移相机：默认上下，按住 shift 左右
    this.canvas.addEventListener("wheel", this.onWheel.bind(this), { passive: false });
    // canvas 默认不可聚焦，空格键必须绑在 window 上
    window.addEventListener("keydown", this.onKeyDown.bind(this));
    window.addEventListener("keyup", this.onKeyUp.bind(this));
    // 窗口失焦时收不到 keyup，主动复位，避免卡在平移状态
    window.addEventListener("blur", () => {
      this.space_down = false;
      this.panning = false;
      this.last_mouse = undefined;
      this.update_cursor();
    });
    // 鼠标在画布外抬起时 canvas 收不到 mouseup，兜底重置拖拽状态，避免状态卡住
    window.addEventListener("mouseup", () => {
      this.mouse_down = false;
      if (this.frame.drag) {
        this.frame.end_drag();
        this.sync_selection();
      }
      if (this.panning) {
        this.panning = false;
        this.last_mouse = undefined;
        this.suppress_click = true;
        this.hovered_text = undefined;
        this.update_cursor();
      }
    });
  }

  add_text(pos: Vec2): Text {
    const text = new Text(this, pos);
    this.texts.push(text);
    return text;
  }

  add_latex(pos: Vec2): Latex {
    const latex = new Latex(this, pos);
    this.texts.push(latex);
    return latex;
  }

  add_mole(pos: Vec2): Mole {
    const mole = new Mole(this, pos);
    this.texts.push(mole);
    return mole;
  }

  add_model(pos: Vec2): Model {
    const model = new Model(this, pos);
    this.texts.push(model);
    return model;
  }

  add_image(pos: Vec2): Image {
    const image = new Image(this, pos);
    this.texts.push(image);
    return image;
  }

  // 属性面板只显示“唯一被选中的文本/公式/分子/模型/图像”
  sync_selection() {
    const appStore = useAppStore();
    const selected = this.texts.filter(item => item.selected);
    const one = selected.length == 1 ? selected[0] : null;
    appStore.select_text(one instanceof Text ? one : null);
    appStore.select_latex(one instanceof Latex ? one : null);
    appStore.select_mole(one instanceof Mole ? one : null);
    appStore.select_model(one instanceof Model ? one : null);
    appStore.select_image(one instanceof Image ? one : null);
  }

  // 删除选中的对象
  delete_selected() {
    if (!this.texts.some(text => text.selected)) return;
    this.texts = this.texts.filter(text => !text.selected);
    this.hovered_text = undefined;
    this.sync_selection();
  }

  // 进入模态调节（m/r/s）：记录鼠标位置作为基准点
  begin_transform(mode: TransformState['mode']) {
    const texts = this.texts.filter(text => text.selected);
    if (texts.length == 0) return;
    for (const text of texts) text.reset_preview();

    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const screen = this.mouse_screen ?? new Vec2(cw / 2, ch / 2);
    const world = this.mouse_world ?? this.camera.canvas_to_world(screen.x, screen.y, cw, ch);
    this.transform = {
      mode,
      mp: world,
      mp_screen: screen,
      center: maths.points_center(texts.map(text => text.base_center())),
      screen,
      texts,
    };
    this.frame.clear_hover();
    this.frame_cursor = undefined;
    this.update_cursor();
  }

  // 按基准点 mp 和当前鼠标位置重算预览（每次移动都从原始数据重算）
  apply_transform(world: Vec2, screen: Vec2) {
    const tr = this.transform;
    if (!tr) return;
    tr.screen = screen;
    for (const text of tr.texts) text.reset_preview();

    if (tr.mode === 'move') {
      // 中心跟着鼠标位移走：以进入调节时的鼠标位置为起点
      const dx = world.x - tr.mp.x;
      const dy = world.y - tr.mp.y;
      for (const text of tr.texts) text.pre_move = new Vec2(dx, dy);
      return;
    }

    if (tr.mode === 'rotate') {
      const from = tr.mp.sub(tr.center);
      if (from.dist(new Vec2(0, 0)) < this.px(1)) return; // 基准点落在中心上，角度无意义
      const angle = from.angle(world.sub(tr.center));
      for (const text of tr.texts) {
        const [rotated] = maths.points_rotate([text.base_pos], angle, tr.center);
        text.pre_move = rotated.sub(text.base_pos);
        text.pre_rotation = angle; // 物体自身也跟着转
      }
      return;
    }

    // 缩放：当前鼠标到中心的距离 / 基准点到中心的距离
    const d0 = tr.mp.dist(tr.center);
    if (d0 < this.px(1)) return;
    const factor = world.dist(tr.center) / d0;
    for (const text of tr.texts) {
      const p = text.base_pos;
      text.pre_move = new Vec2((p.x - tr.center.x) * (factor - 1), (p.y - tr.center.y) * (factor - 1));
      text.pre_scale = factor; // 尺寸一起缩放
    }
  }

  // 左键 / 回车：确认调节
  confirm_transform() {
    const tr = this.transform;
    if (!tr) return;
    for (const text of tr.texts) text.commit();
    this.transform = undefined;
    this.sync_selection(); // 缩放改了字号，刷新面板镜像
  }

  // Esc：放弃这次调节
  cancel_transform() {
    const tr = this.transform;
    if (!tr) return;
    for (const text of tr.texts) text.reset_preview();
    this.transform = undefined;
  }

  // 调节中画参考线：基准点 → 当前鼠标，以及中心点
  private draw_transform_guide() {
    const tr = this.transform;
    if (!tr) return;
    const ctx = this.context;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const pivot = this.camera.world_to_canvas(tr.center.x, tr.center.y, cw, ch);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    if (tr.mode !== 'move') {
      // 进入调节时鼠标相对中心的参考线
      ctx.strokeStyle = 'rgba(105, 101, 219, 0.25)';
      ctx.beginPath();
      ctx.moveTo(pivot.x, pivot.y);
      ctx.lineTo(tr.mp_screen.x, tr.mp_screen.y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(105, 101, 219, 0.75)';
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(tr.screen.x, tr.screen.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#6965db';
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw() {
    requestAnimationFrame(this.draw.bind(this));

    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 清屏必须在单位变换下
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.apply_view(); // 切到场景空间：之后所有绘制都直接用场景坐标
    this.axis.draw();

    for (const text of this.texts) {
      text.draw();
    }
    if (useAppStore().tool_type == '选择') {
      this.show_select_rect();
    }
    this.frame.draw();
    this.draw_transform_guide();
  }

  onMouseDown(e: MouseEvent) {
    this.suppress_pick = false;
    this.mouse_screen = this.c2canvas_pos(e.clientX, e.clientY);
    this.mouse_world = this.c2s_pos(e.clientX, e.clientY);

    // 模态调节中：左键确认，随后那次 mouseup 不再结算选择
    if (this.transform) {
      if (e.button === 0) {
        this.confirm_transform();
        this.suppress_pick = true;
      }
      return;
    }

    // 空格 + 左键：平移画布，优先级高于所有工具
    if (this.space_down && e.button === 0) {
      e.preventDefault(); // 阻止拖拽时选中页面文字
      this.panning = true;
      this.last_mouse = new Vec2(e.clientX, e.clientY);
      // 平移时清掉残留的悬浮高亮，避免拖着画布时还亮着之前悬停的对象
      for (const text of this.texts) text.hovered = false;
      this.hovered_text = undefined;
      this.frame.clear_hover();
      this.frame_cursor = undefined;
      this.update_cursor();
      return; // 不设 mouse_down，框选等逻辑都不触发
    }
    this.suppress_click = false; // 清掉可能残留的平移 click 抑制标记

    const pos = this.c2s_pos(e.clientX, e.clientY);
    this.down_pos = pos;
    this.mouse_down = true;
    useAppStore().focus_surface = 'scene';

    if (useAppStore().tool_type == '选择') {
      this.begin_frame_interaction(e, pos);
    }
  }

  // 选择工具按下时：手柄 → 旋转/缩放；物体内部 → 选中并准备移动
  private begin_frame_interaction(e: MouseEvent, pos: Vec2) {
    const screen = this.c2canvas_pos(e.clientX, e.clientY);
    if (this.frame.begin_handle_drag(screen, pos)) return;

    const hit = this.text_at(pos);
    if (!hit) return;
    if (!hit.selected) {
      if (!e.shiftKey) {
        for (const text of this.texts) text.selected = false;
      }
      hit.selected = true;
      this.sync_selection();
    }
    // 已选中的一组物体一起拖动
    const targets = this.texts.filter(text => text.selected);
    this.frame.begin_move(targets.length ? targets : [hit], screen, pos);
  }

  onMouseUp(e: MouseEvent) {
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
      this.suppress_click = true; // 平移结束后不要再触发 click
      this.hovered_text = undefined; // 视图变了，旧的 hover 结果作废
      this.update_cursor();
      return;
    }

    this.up_pos = this.c2s_pos(e.clientX, e.clientY);
    const appStore = useAppStore();
    if (appStore.tool_type == '选择') {
      if (this.frame.drag) {
        // 辅助框拖拽结束：把旋转/缩放/移动的预览变换合并进实际数据
        this.frame.end_drag();
        this.sync_selection();
      } else {
        const dist = this.down_pos!.dist(this.up_pos!);
        if (dist < this.px(5)) { // 点击（而不是拖动）
          // 悬浮高亮的就是点击目标；否则按点击位置再找一次
          const hit_text = this.hovered_text ?? this.text_at(this.up_pos!);
          if (!e.shiftKey) { // 没按 shift 就清空其他选中
            for (const text of this.texts) text.selected = false;
          }
          if (hit_text) hit_text.selected = true;
        }
        // 框选的结果在 mouseup 时统一结算给属性面板
        this.sync_selection();
      }
    }
    this.mouse_down = false;
  }

  onMouseMove(e: MouseEvent) {
    if (this.panning) {
      if (!this.last_mouse) return;
      const dx = e.clientX - this.last_mouse.x;
      const dy = e.clientY - this.last_mouse.y;
      this.last_mouse = new Vec2(e.clientX, e.clientY);
      // 画面内容跟随鼠标移动，所以相机朝反方向移动
      this.camera.move_by_canvas(-dx, -dy);
      return; // 平移期间不跑 hover / 框选 / 工具逻辑
    }

    const pos = this.c2s_pos(e.clientX, e.clientY);
    this.move_pos = pos;
    this.mouse_world = pos;
    this.mouse_screen = this.c2canvas_pos(e.clientX, e.clientY);
    const appStore = useAppStore();

    // 模态调节中：鼠标一动就按基准点 mp 重新算一遍预览
    if (this.transform) {
      this.apply_transform(pos, this.mouse_screen);
      return;
    }

    // 辅助框拖拽中：只更新旋转/缩放/移动的预览
    if (this.frame.drag) {
      this.frame.move_to(this.mouse_screen, pos);
      return;
    }

    if (appStore.tool_type == '选择' && this.mouse_down) {
      const pos0 = this.down_pos;
      if (pos0) {
        for (const text of this.texts) {
          if (text.in_rect(pos0, pos)) {
            text.selected = true;
          } else if (!e.shiftKey) { // 没按 shift 时取消选择，按住 shift 再框选则累加
            text.selected = false;
          }
        }
      }
    }

    if (!this.mouse_down) { // 鼠标没有按下时
      // 对象后添加的在上层，从后往前找
      this.hovered_text = undefined;
      for (let i = this.texts.length - 1; i >= 0; i--) {
        if (this.texts[i].contains(pos)) {
          this.hovered_text = this.texts[i];
          break;
        }
      }
      for (const text of this.texts) {
        text.hovered = text === this.hovered_text;
      }
      // 辅助框手柄 / 拖动物体的鼠标指针
      if (appStore.tool_type == '选择') {
        const screen = this.c2canvas_pos(e.clientX, e.clientY);
        this.frame_cursor = this.frame.cursor_at(screen, this.hovered_text !== undefined);
      } else {
        this.frame.clear_hover();
        this.frame_cursor = undefined;
      }
      this.update_cursor();
    }
  }

  // 滚轮：默认上下移动相机，shift 左右移动相机，ctrl 以鼠标位置为锚点缩放
  onWheel(e: WheelEvent) {
    e.preventDefault(); // 阻止页面滚动，同时挡住 ctrl+滚轮的浏览器缩放
    // deltaMode: 0=像素, 1=行, 2=页，统一换算成像素
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.canvas.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;

    if (e.ctrlKey) {
      // 指数映射：每档滚轮的缩放比例一致，触控板的小增量也能平滑缩放
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
      // 向下滚 = 相机向右看（内容向左走）
      this.camera.move_by_canvas(dy + dx, 0);
    } else {
      // 向下滚 = 相机向下看（内容向上走）
      this.camera.move_by_canvas(dx, dy);
    }
  }

  onClick(e: MouseEvent) {
    if (this.suppress_click) {
      this.suppress_click = false;
      return;
    }
    const pos = this.c2s_pos(e.clientX, e.clientY);
    const appStore = useAppStore();
    const tool = appStore.tool_type;
    if (tool == '文本' || tool == '公式' || tool == '分子' || tool == '模型' || tool == '图像') {
      // 新建后直接选中它，属性面板随之打开
      const item = tool == '文本' ? this.add_text(pos)
        : tool == '公式' ? this.add_latex(pos)
          : tool == '模型' ? this.add_model(pos)
            : tool == '图像' ? this.add_image(pos)
              : this.add_mole(pos);
      for (const t of this.texts) t.selected = t === item;
      this.sync_selection();
      // 添加完物体就回到框选，避免手一滑连点生成一堆对象
      appStore.tool_type = '选择';
    }
  }

  onKeyDown(e: KeyboardEvent) {
    if (this.is_editing(e.target)) return;
    // 分子面板的画布获得焦点时，Delete / 工具快捷键不作用在主画布上
    const appStore = useAppStore();
    if (appStore.focus_surface == 'mole') return;

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

    // Delete / Backspace 删除选中对象（Backspace 在 Mac 上就是删除键）
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); // 顺手阻止 Backspace 触发浏览器后退
      this.delete_selected();
      return;
    }

    // 快捷键：Esc 回到框选，M / R / S 进入模态调节
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        appStore.tool_type = '选择';
        return;
      }
      if (key === 'm' || key === 'r' || key === 's') {
        e.preventDefault();
        this.begin_transform(key === 'm' ? 'move' : key === 'r' ? 'rotate' : 'scale');
        return;
      }
    }

    if (e.code !== 'Space') return;
    e.preventDefault(); // 阻止空格滚动页面
    if (this.space_down) return;
    this.space_down = true;
    this.update_cursor();
  }

  onKeyUp(e: KeyboardEvent) {
    if (e.code !== 'Space') return;
    this.space_down = false;
    // 正在拖动时仍保持 grabbing，等 mouseup 再恢复
    this.update_cursor();
  }

  set mouse_state(state: MouseState) {
    this._mouse_state = state;
    if (state === 'move') {
      document.body.style.cursor = 'move';
    } else {
      document.body.style.cursor = 'default';
    }
  }

  // 在鼠标按下位置和当前鼠标位置之间画选择框
  show_select_rect() {
    // 正在拖辅助框（旋转/缩放/移动）时不画框选矩形
    if (this.frame.drag) {
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
    const x0 = Math.min(down_pos.x, move_pos.x)
    const y0 = Math.min(down_pos.y, move_pos.y)
    const p1 = new Vec2(x0, y0)
    const p2 = new Vec2(x0 + w, y0 + h)
    this.select_rect.set_by_2p(p1, p2)
    this.select_rect.visible = true;
    this.select_rect.draw();
  }

  // 把相机变换应用到绘图上下文：之后所有绘制都使用世界坐标（cm）
  apply_view() {
    this.camera.apply(this.context, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  // apply_view 的逆变换：鼠标/画布坐标 → 场景坐标
  c2s_pos(client_x: number, client_y: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.canvas_to_world(
      client_x - rect.left,
      client_y - rect.top,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
    );
  }

  // 鼠标 → 画布像素坐标（辅助框直接在这个坐标系里绘制/命中）
  c2canvas_pos(client_x: number, client_y: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return new Vec2(client_x - rect.left, client_y - rect.top);
  }

  // 最上层命中该世界坐标的物体（后添加的在上层）
  text_at(pos: Vec2): TextLike | undefined {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      if (this.texts[i].contains(pos)) return this.texts[i];
    }
    return undefined;
  }

  // 屏幕像素长度 → 世界长度（cm）。随缩放变化，保证线宽/命中范围在屏幕上恒定
  px(n: number): number {
    return n / this.camera.scale;
  }

  update_cursor() {
    this.canvas.style.cursor = this.panning ? 'grabbing'
      : this.space_down ? 'grab'
        : this.frame_cursor ?? 'default';
  }

  // 只有真正在输入文字时才屏蔽快捷键；单选框/复选框等不算
  private is_editing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    const type = (el as HTMLInputElement).type;
    return ['text', 'search', 'email', 'number', 'password', 'tel', 'url'].includes(type);
  }
}
