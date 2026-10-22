<style scoped>
* {
    margin: 0;
    border: 0;
}

.app-root {
    height: calc(100vh - var(--wm-titlebar-height));
    display: flex;
    flex-direction: column;
}

.toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 6px 12px;
    border-bottom: 1px solid #dcdfe6;
    background: #fff;
    box-sizing: border-box;
}

.toolbar-title {
    flex: 0 0 auto;
    line-height: 32px;
    /* 与单行 el-radio 的高度对齐，换行时贴在首行 */
    font-size: 14px;
    font-weight: 600;
    color: #303133;
    white-space: nowrap;
}

.toolbar-group {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 16px;
    row-gap: 2px;
}

.toolbar-group :deep(.el-radio) {
    margin-right: 0;
}

.splitter {
    flex: 1 1 0;
    min-height: 0;
}

.canvas-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid gray;
    box-sizing: border-box;
}

canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.control-panel {
    width: 100%;
    height: 100%;
    padding: 8px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
}

.property-area {
    margin-top: auto;
    /* 推到底部 */
    padding-top: 8px;
    border-top: 1px solid #dcdfe6;
}

.property-area h3 {
    margin-bottom: 8px;
}

.prop-hint {
    color: #909399;
    font-size: 12px;
}

.prop-tabs {
    margin-top: 4px;
}

.prop-tabs :deep(.el-tabs__header) {
    margin-bottom: 8px;
}
</style>

<template>
    <TitleBar />
    <div class="app-root">
        <div class="toolbar">
            <!-- 工具栏 -->
            <el-radio-group class="toolbar-group" v-model="tool">
                <el-radio value="选择.框选">框选</el-radio>
                <el-radio value="文本">文本</el-radio>
                <el-radio value="公式">公式</el-radio>
                <el-radio value="分子">分子</el-radio>
                <el-radio value="模型">模型</el-radio>
                <el-radio value="图像">图像</el-radio>
            </el-radio-group>
        </div>
        <el-splitter class="splitter">
            <!-- 画布区域 -->
            <el-splitter-panel>
                <div ref="canvasContainer" class="canvas-container">
                    <canvas ref="canvas" :width="refs.canvasWidth" :height="refs.canvasHeight"></canvas>
                </div>
            </el-splitter-panel>
            <!-- 侧边栏 -->
            <el-splitter-panel :size="500">
                <div class="control-panel">
                    <h3>属性</h3>
                    <el-tabs v-model="active_prop_tab" class="prop-tabs">
                        <el-tab-pane label="文本属性" name="text">
                            <TextPanel v-if="appStore.selected_text" />
                            <div v-else class="prop-hint">未选择文本对象</div>
                        </el-tab-pane>
                        <el-tab-pane label="公式属性" name="latex">
                            <LatexPanel v-if="appStore.selected_latex" />
                            <div v-else class="prop-hint">未选择公式对象</div>
                        </el-tab-pane>
                        <el-tab-pane label="分子属性" name="mole">
                            <MolePanel v-if="appStore.selected_mole" />
                            <div v-else class="prop-hint">未选择分子对象</div>
                        </el-tab-pane>
                        <el-tab-pane label="模型属性" name="model">
                            <ModelPanel v-if="appStore.selected_model" />
                            <div v-else class="prop-hint">未选择模型对象</div>
                        </el-tab-pane>
                        <el-tab-pane label="图像属性" name="image">
                            <ImagePanel v-if="appStore.selected_image" />
                            <div v-else class="prop-hint">未选择图像对象</div>
                        </el-tab-pane>
                    </el-tabs>
                </div>
            </el-splitter-panel>
        </el-splitter>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { ElSplitter, ElSplitterPanel, ElRadioGroup, ElRadio, ElTabs, ElTabPane } from 'element-plus'
import { Scene } from "./scene";
import { useAppStore } from "./stores/app";
import { ToolType } from "./types";
import TextPanel from "./components/TextPanel.vue";
import LatexPanel from "./components/LatexPanel.vue";
import MolePanel from "./components/MolePanel.vue";
import ModelPanel from "./components/ModelPanel.vue";
import ImagePanel from "./components/ImagePanel.vue";
import TitleBar from "./components/TitleBar.vue";


const appStore = useAppStore();

const canvas = shallowRef<HTMLCanvasElement | null>(null);
const canvasContainer = shallowRef<HTMLDivElement | null>(null);
const scene = new Scene();
const refs = reactive({
    canvasWidth: 0,
    canvasHeight: 0,
});

// 属性面板当前标签：选中文本/公式/分子/模型/图像时自动切到对应标签
const active_prop_tab = ref<'text' | 'latex' | 'mole' | 'model' | 'image'>('text');

watch(() => appStore.selected_text, (text) => {
    if (text) active_prop_tab.value = 'text';
});

watch(() => appStore.selected_latex, (latex) => {
    if (latex) active_prop_tab.value = 'latex';
});

watch(() => appStore.selected_mole, (mole) => {
    if (mole) active_prop_tab.value = 'mole';
});

watch(() => appStore.selected_model, (model) => {
    if (model) active_prop_tab.value = 'model';
});

watch(() => appStore.selected_image, (image) => {
    if (image) active_prop_tab.value = 'image';
});

const set_tool = (tool: string) => {
    appStore.tool_type = tool.split('.')[0] as ToolType
};

// 工具栏的选中项由 store 反推，这样快捷键（Esc）切换工具时单选组也会跟着变
const tool = computed({
    get: () => {
        switch (appStore.tool_type) {
            case '选择': return '选择.框选';
            case '公式': return '公式';
            case '分子': return '分子';
            case '模型': return '模型';
            case '图像': return '图像';
            default: return '文本';
        }
    },
    set: (value: string) => set_tool(value),
});



let resizeObserver: ResizeObserver | null = null;

const resizeCanvas = () => {
    const container = canvasContainer.value;
    if (!container) {
        return;
    }
    refs.canvasWidth = container.clientWidth;
    refs.canvasHeight = container.clientHeight;
};

onMounted(() => {
    if (canvas.value) {
        scene.init(canvas.value);
        scene.draw();
    }
    resizeCanvas();
    resizeObserver = new ResizeObserver(resizeCanvas);
    if (canvasContainer.value) {
        resizeObserver.observe(canvasContainer.value);
    }
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
});
</script>
