<template>
    <div class="latex-panel">
        <el-input
            v-model="content"
            type="textarea"
            :rows="3"
            placeholder="请输入 LaTeX，例如 E=MC^2"
        />
        <div class="prop-hint">支持 LaTeX 语法；化学式可写 \ce{...}，如 \ce{H2O}</div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElInput } from "element-plus";
import { useAppStore } from "../stores/app";

const appStore = useAppStore();

// 面板里的 LaTeX 源码和画布上的 Latex 对象双向同步（生成 SVG 是异步的，画布下一帧自动刷新）
const content = computed({
    get: () => appStore.latex_content,
    set: (value: string) => appStore.set_latex_content(value),
});
</script>

<style scoped>
.latex-panel {
    margin-top: 8px;
}

.prop-hint {
    margin-top: 8px;
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
}
</style>
