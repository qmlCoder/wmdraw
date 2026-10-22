<template>
    <div class="mole-panel">
        <!-- 分子专用画布：原子/键的绘制交互都在这里，放最上面 -->
        <div ref="container" class="mole-canvas" :style="{ height: appStore.mole_canvas_height + 'px' }">
            <canvas ref="canvas"></canvas>
        </div>
        <!-- 拖动调整画布高度，双击恢复默认 -->
        <div class="resize-bar" title="拖动调整画布高度（双击恢复默认）" @pointerdown="on_resize_down"
            @dblclick="reset_height">
            <span class="resize-grip"></span>
        </div>

        <div class="tool-row">
            <el-radio-group v-model="mole_tool" size="small">
                <el-radio-button value="选择">选择</el-radio-button>
                <el-radio-button value="成键">成键</el-radio-button>
                <el-radio-button value="片段">片段</el-radio-button>
            </el-radio-group>
        </div>

        <div v-if="mole_tool === '成键' && !selected_bond" class="tool-row">
            <span class="tool-label">键类型</span>
            <el-radio-group v-model="bond_type" size="small">
                <el-radio-button
                    v-for="item in BOND_OPTIONS"
                    :key="item.value"
                    :value="item.value"
                >
                    {{ item.label }}
                </el-radio-button>
            </el-radio-group>
        </div>

        <!-- 固定角度/固定长度：模仿 ChemDraw，成键时把键角和键长吸附到固定值 -->
        <template v-if="mole_tool === '成键'">
            <div class="tool-row">
                <span class="tool-label fixed-label">固定角度</span>
                <el-switch v-model="appStore.fix_ang" size="small" />
                <el-select v-model="appStore.fix_ang_step" size="small" class="fixed-input" :disabled="!appStore.fix_ang">
                    <el-option v-for="item in ANGLE_STEPS" :key="item" :label="`${item}°`" :value="item" />
                </el-select>
            </div>
            <div class="tool-row">
                <span class="tool-label fixed-label">固定长度</span>
                <el-switch v-model="appStore.fix_len" size="small" />
                <el-input-number
                    v-model="appStore.fix_len_cm"
                    size="small"
                    class="fixed-input"
                    :min="0.1"
                    :max="3"
                    :step="0.1"
                    :precision="2"
                    :disabled="!appStore.fix_len"
                />
                <span class="prop-hint">cm</span>
            </div>
        </template>

        <div v-else-if="mole_tool === '片段'" class="tool-row wrap">
            <span class="tool-label">片段</span>
            <el-radio-group v-model="frag_name" size="small">
                <el-radio-button
                    v-for="item in FRAGMENTS"
                    :key="item.name"
                    :value="item.name"
                >
                    {{ item.label }}
                </el-radio-button>
            </el-radio-group>
        </div>

        <!-- 选中项属性：只对单个原子 / 单个键生效 -->
        <div v-if="selected_atom" class="tool-row">
            <span class="tool-label">元素</span>
            <el-input
                v-model="atom_label"
                size="small"
                class="label-input"
                maxlength="3"
                placeholder="留空为碳节点"
            />
            <span class="prop-hint">如 C、N、O、Cl</span>
        </div>
        <div v-else-if="selected_bond" class="tool-row">
            <span class="tool-label">键类型</span>
            <el-radio-group v-model="bond_type" size="small">
                <el-radio-button
                    v-for="item in BOND_OPTIONS"
                    :key="item.value"
                    :value="item.value"
                >
                    {{ item.label }}
                </el-radio-button>
            </el-radio-group>
        </div>
        <div v-else class="tool-hint">选中 1 个原子或 1 个键，可以在这里调节它的属性</div>

        <div class="tool-row switch-row">
            <span class="tool-label">显示最大排斥方向</span>
            <el-switch v-model="appStore.show_mrp" size="small" />
        </div>

        <div class="tool-hint">
            选择：拖动选中框内部移动，四角等比缩放、四边单向缩放、上方圆点旋转；m/r/s 进入调节，左键确认、Esc 取消
        </div>
        <div class="tool-hint">
            成键：拖动或点击连出新的键；片段：点原子/键贴上，点空白处放置；空格+拖动平移，Ctrl+滚轮缩放，Delete 删除选中
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { ElRadioGroup, ElRadioButton, ElInput, ElInputNumber, ElSwitch, ElSelect, ElOption } from "element-plus";
import { useAppStore } from "../stores/app";
import type { BondType, MoleTool } from "../types";
import { FRAGMENTS } from "../frags";
import { MoleEditor } from "../object/MoleEditor";
import type { Atom } from "../object/Atom";
import type { Bond } from "../object/Bond";

const BOND_OPTIONS: { value: BondType; label: string }[] = [
    { value: '单键', label: '单键' },
    { value: '双键-0', label: '双键居中' },
    { value: '双键-1', label: '双键侧1' },
    { value: '双键-2', label: '双键侧2' },
    { value: '三键', label: '三键' },
];

// 固定角度的可选步长（度），和 ChemDraw 一样以 15° 为默认
const ANGLE_STEPS = [5, 10, 15, 30, 45, 60, 90];

const appStore = useAppStore();

// 编辑画布里当前的选中项（由 MoleEditor 回调刷新）
const sel_atoms = shallowRef<Atom[]>([]);
const sel_bonds = shallowRef<Bond[]>([]);
// 只有「唯一的」原子或键才显示属性编辑器
const selected_atom = computed(() =>
    sel_atoms.value.length === 1 && sel_bonds.value.length === 0 ? sel_atoms.value[0] : null);
const selected_bond = computed(() =>
    sel_bonds.value.length === 1 && sel_atoms.value.length === 0 ? sel_bonds.value[0] : null);

const mole_tool = computed({
    get: () => appStore.mole_tool,
    set: (value: MoleTool) => { appStore.mole_tool = value; },
});

// 原子/键本身不是响应式对象，面板用本地状态做镜像，再写回选中项
const atom_label = ref('');
watch(selected_atom, (atom) => {
    atom_label.value = atom ? atom.label : '';
}, { immediate: true });
watch(atom_label, (value) => {
    if (selected_atom.value) selected_atom.value.label = value.trim();
});

// 选中键时显示/修改那条键的类型；否则是新建键用的默认类型
const bond_type = ref<BondType>('单键');
watch(selected_bond, (bond) => {
    bond_type.value = bond ? bond.type : appStore.bond_type;
}, { immediate: true });
watch(bond_type, (value) => {
    appStore.bond_type = value;
    const mole = appStore.selected_mole;
    if (!mole) return;
    for (const bond of mole.bonds) {
        if (bond.selected) bond.type = value;
    }
});

const frag_name = computed({
    get: () => appStore.frag_name,
    set: (value: string) => { appStore.frag_name = value; },
});

const container = shallowRef<HTMLDivElement | null>(null);
const canvas = shallowRef<HTMLCanvasElement | null>(null);
const size = reactive({ w: 0, h: 0 });
const editor = new MoleEditor();
let observer: ResizeObserver | null = null;

// 画布高度可拖拽调整（范围夹在 160~900 px，双击回到默认值）
const CANVAS_MIN_H = 160;
const CANVAS_MAX_H = 900;
const CANVAS_DEFAULT_H = 280;
let resize_start: { y: number; h: number } | null = null;

const on_resize_move = (e: PointerEvent) => {
    if (!resize_start) return;
    const next = resize_start.h + (e.clientY - resize_start.y);
    appStore.mole_canvas_height = Math.max(CANVAS_MIN_H, Math.min(CANVAS_MAX_H, Math.round(next)));
};

const on_resize_up = () => {
    resize_start = null;
    window.removeEventListener("pointermove", on_resize_move);
    window.removeEventListener("pointerup", on_resize_up);
};

const on_resize_down = (e: PointerEvent) => {
    resize_start = { y: e.clientY, h: appStore.mole_canvas_height };
    window.addEventListener("pointermove", on_resize_move);
    window.addEventListener("pointerup", on_resize_up);
    // 防止拖动时选中面板里的文字
    e.preventDefault();
};

const reset_height = () => {
    appStore.mole_canvas_height = CANVAS_DEFAULT_H;
};

// 画布尺寸自己管：直接改 canvas 的像素尺寸并立刻重画，
// 不走响应式绑定，否则每次改尺寸都要等到下一帧才重绘，拖动时会闪
const resize = () => {
    const box = container.value;
    const cv = canvas.value;
    if (!box || !cv) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (w === size.w && h === size.h) return;
    const first = size.w === 0 && w > 0;
    const dw = first ? 0 : w - size.w;
    const dh = first ? 0 : h - size.h;
    size.w = w;
    size.h = h;
    // 第一次拿到尺寸时再对准一次分子（挂载时可能还没布局）
    if (first) editor.fit();
    else editor.keep_view_on_resize(dw, dh);
    if (cv.width !== w) cv.width = w;   // 改 pixels 尺寸会清空画布
    if (cv.height !== h) cv.height = h;
    editor.redraw();
};

onMounted(() => {
    editor.on_selection_change = (atoms, bonds) => {
        sel_atoms.value = atoms;
        sel_bonds.value = bonds;
    };
    if (canvas.value) editor.init(canvas.value);
    editor.set_mole(appStore.selected_mole);
    resize();
    observer = new ResizeObserver(resize);
    if (container.value) observer.observe(container.value);
});

onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
    editor.on_selection_change = undefined;
    editor.destroy();
    on_resize_up();
});

watch(() => appStore.selected_mole, (mole) => editor.set_mole(mole));
</script>

<style scoped>
.mole-panel {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.tool-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.tool-row.wrap {
    flex-wrap: wrap;
}

/* 开关靠右：标签占满剩余宽度 */
.switch-row {
    justify-content: space-between;
}

.switch-row .tool-label {
    flex: 1 1 auto;
}

.tool-label {
    flex: 0 0 auto;
    color: #606266;
    font-size: 13px;
}

.label-input {
    width: 130px;
}

.fixed-label {
    width: 60px;
}

.fixed-input {
    width: 100px;
}

.prop-hint {
    color: #909399;
    font-size: 12px;
}

.tool-row :deep(.el-radio-button__inner) {
    padding: 5px 8px;
}

.mole-canvas {
    position: relative;
    height: 280px;
    border: 1px solid #dcdfe6;
    box-sizing: border-box;
    overflow: hidden;
}

.resize-bar {
    height: 10px;
    margin-top: -4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ns-resize;
    user-select: none;
    touch-action: none;
}

.resize-grip {
    width: 44px;
    height: 4px;
    border-radius: 2px;
    background: #dcdfe6;
    transition: background 0.15s;
}

.resize-bar:hover .resize-grip {
    background: #a8abb2;
}

canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.tool-hint {
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
}
</style>
