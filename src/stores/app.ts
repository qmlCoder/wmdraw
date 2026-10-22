import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { ToolType, BondType, MoleTool } from '../types'
import type { Text } from '../object/Text'
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_TEXT_COLOR } from '../object/Text'
import type { Latex } from '../object/Latex'
import type { Mole } from '../object/Mole'
import type { Model } from '../object/Model'
import type { Image } from '../object/Image'



export const useAppStore = defineStore('app', () => {
  const tool_type = ref<ToolType>('选择')
  const bond_type = ref<BondType>('单键')
  const frag_name = ref('cyclopropane')
  const show_mrp = ref(false)
  // 成键时把键长/键角吸附到固定值（模仿 ChemDraw 的 Fixed Length / Fixed Angles）
  const fix_len = ref(true)
  const fix_ang = ref(true)
  const fix_len_cm = ref(0.5) // 固定键长（cm）
  const fix_ang_step = ref(15) // 固定角度步长（度）
  // 分子绘制画布的高度（px），拖动画布下方的横条调整
  const mole_canvas_height = ref(280)

  // ---- 文本属性面板 ----
  // selected_text 指向画布上被选中的那个 Text 对象（shallowRef，不代理对象）
  const selected_text = shallowRef<Text | null>(null)
  // text_content 是面板里正在显示/编辑的内容，作为 Text.content 的响应式镜像
  const text_content = ref('')
  // 字体、字号、颜色的响应式镜像，改面板时写回 Text
  const text_font_family = ref(DEFAULT_FONT_FAMILY)
  const text_font_size = ref(DEFAULT_FONT_SIZE)
  const text_color = ref(DEFAULT_TEXT_COLOR)

  const select_text = (text: Text | null) => {
    selected_text.value = text
    text_content.value = text ? text.content : ''
    text_font_family.value = text ? text.font_family : DEFAULT_FONT_FAMILY
    text_font_size.value = text ? text.font_size : DEFAULT_FONT_SIZE
    text_color.value = text ? text.color : DEFAULT_TEXT_COLOR
  }

  const set_text_content = (content: string) => {
    text_content.value = content
    if (selected_text.value) selected_text.value.content = content
  }

  const set_text_font_family = (family: string) => {
    text_font_family.value = family
    if (selected_text.value) selected_text.value.font_family = family
  }

  const set_text_font_size = (size: number) => {
    text_font_size.value = size
    if (selected_text.value) selected_text.value.font_size = size
  }

  const set_text_color = (color: string) => {
    text_color.value = color
    if (selected_text.value) selected_text.value.color = color
  }

  // ---- 公式属性面板 ----
  // selected_latex 指向画布上被选中的公式对象
  const selected_latex = shallowRef<Latex | null>(null)
  // latex_content 是面板里正在编辑的 LaTeX 源码，作为 Latex.content 的响应式镜像
  const latex_content = ref('')

  const select_latex = (latex: Latex | null) => {
    selected_latex.value = latex
    latex_content.value = latex ? latex.content : ''
  }

  const set_latex_content = (content: string) => {
    latex_content.value = content
    if (selected_latex.value) selected_latex.value.content = content
  }

  // ---- 分子属性面板 ----
  // selected_mole 指向主画布上被选中的分子对象
  const selected_mole = shallowRef<Mole | null>(null)
  // mole_tool 是分子面板专用画布当前的工具
  const mole_tool = ref<MoleTool>('成键')
  // 最近一次按下鼠标的是哪块画布：Delete / 工具快捷键只作用于对应画布
  const focus_surface = ref<'scene' | 'mole'>('scene')

  const select_mole = (mole: Mole | null) => {
    selected_mole.value = mole
  }

  // ---- 3D 模型属性面板 ----
  // selected_model 指向主画布上被选中的模型对象
  const selected_model = shallowRef<Model | null>(null)
  // 面板显示的文件名（3D 数据和快照都存在 Model 对象上）
  const model_name = ref('')

  const select_model = (model: Model | null) => {
    selected_model.value = model
    model_name.value = model ? model.name : ''
  }

  const set_model_name = (name: string) => {
    model_name.value = name
    if (selected_model.value) selected_model.value.name = name
  }

  // ---- 图像属性面板 ----
  const selected_image = shallowRef<Image | null>(null)
  const image_name = ref('')

  const select_image = (image: Image | null) => {
    selected_image.value = image
    image_name.value = image ? image.name : ''
  }

  const set_image_name = (name: string) => {
    image_name.value = name
    if (selected_image.value) selected_image.value.name = name
  }

  return {
    tool_type, bond_type, frag_name, show_mrp, fix_len, fix_ang, fix_len_cm, fix_ang_step,
    mole_canvas_height,
    selected_text, text_content, select_text, set_text_content,
    text_font_family, text_font_size, text_color,
    set_text_font_family, set_text_font_size, set_text_color,
    selected_latex, latex_content, select_latex, set_latex_content,
    selected_mole, mole_tool, focus_surface, select_mole,
    selected_model, model_name, select_model, set_model_name,
    selected_image, image_name, select_image, set_image_name,
  }
})
