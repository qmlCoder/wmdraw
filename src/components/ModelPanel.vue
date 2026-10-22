<template>
    <div class="model-panel">
        <div class="prop-row">
            <el-button size="small" type="primary" @click="pick_file">导入模型</el-button>
            <span class="file-name" :title="appStore.model_name">{{ appStore.model_name || '未导入' }}</span>
            <el-button size="small" :disabled="!has_model" @click="reset_view">重置视角</el-button>
        </div>
        <div ref="viewer_box" class="viewer"></div>
        <div class="prop-hint">
            支持 .glb / .gltf / .obj / .stl（推荐 .glb：材质贴图打包在文件里）。
            左键旋转、滚轮缩放、右键平移；主画布显示的就是这里的实时拍摄结果。
        </div>
        <input ref="file_input" class="file-input" type="file" accept=".glb,.gltf,.obj,.stl" @change="on_file" />
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import { ElButton, ElMessage } from "element-plus";
import { useAppStore } from "../stores/app";
import type { ModelViewer } from "../three/ModelViewer";
import type { Model } from "../object/Model";

const appStore = useAppStore();
const viewer_box = shallowRef<HTMLDivElement | null>(null);
const file_input = shallowRef<HTMLInputElement | null>(null);
const model = computed(() => appStore.selected_model as Model | null);
const has_model = computed(() => !!model.value?.has_model && appStore.model_name.length > 0);

let viewer: ModelViewer | undefined = undefined;
let disposed = false;

// 面板里每渲染一帧，就把裁好的图推给主画布上的模型对象
const apply_snapshot = (snapshot: { img: HTMLImageElement; aspect: number }) => {
    if (model.value) model.value.set_snapshot(snapshot.img, snapshot.aspect);
};

// 视角变化记到对象上，切走再切回来能恢复
const save_view = () => {
    const target = model.value;
    const view = viewer?.get_view();
    if (target && view) target.view = view;
};

const load_into_viewer = async (target: Model) => {
    if (!viewer) return;
    if (!target.data) {
        viewer.clear();
        return;
    }
    // 载入时 viewer 会先给默认视角并写回对象，所以先把要恢复的视角取下来
    const view = target.view;
    try {
        await viewer.load(target.data, target.name || "model.glb");
        if (view) viewer.apply_view(view);
    } catch {
        ElMessage.error("模型解析失败，请确认文件格式");
    }
};

onMounted(async () => {
    const box = viewer_box.value;
    if (!box) return;
    // three.js 只在打开模型面板时才加载
    const { ModelViewer } = await import("../three/ModelViewer");
    if (disposed) return;
    viewer = new ModelViewer(box);
    viewer.on_snapshot = apply_snapshot;
    viewer.on_change = save_view;
    if (model.value) await load_into_viewer(model.value);
});

// 面板在多个模型对象之间切换时不会重建，这里手动换场景
watch(model, (target) => {
    if (target) void load_into_viewer(target);
});

onBeforeUnmount(() => {
    disposed = true;
    viewer?.dispose();
    viewer = undefined;
});

const pick_file = () => file_input.value?.click();

const on_file = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // 允许再次导入同一个文件
    const target = model.value;
    if (!file || !target || !viewer) return;
    try {
        const data = await file.arrayBuffer();
        target.data = data;
        target.name = file.name;
        target.view = undefined; // 新模型用默认视角
        appStore.set_model_name(file.name);
        await viewer.load(data, file.name);
    } catch (error) {
        ElMessage.error(error instanceof Error ? `导入失败：${error.message}` : "导入失败");
    }
};

const reset_view = () => viewer?.reset_view();
</script>

<style scoped>
.model-panel {
    margin-top: 8px;
}

.prop-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.file-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #606266;
    font-size: 13px;
}

.viewer {
    height: 340px;
    margin-top: 8px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    overflow: hidden;
    background: #f7f8fa;
    cursor: grab;
}

.prop-hint {
    margin-top: 8px;
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
}

.file-input {
    display: none;
}
</style>
