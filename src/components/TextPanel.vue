<template>
    <div class="text-panel">
        <el-input v-model="content" type="textarea" :rows="3" placeholder="请输入文本" />
        <div class="prop-row">
            <span class="prop-label">字体</span>
            <el-select v-model="font_family" class="prop-grow" size="small">
                <el-option v-for="item in FONT_FAMILIES" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
        </div>
        <div class="prop-row">
            <span class="prop-label">字号</span>
            <el-slider v-model="font_size" class="prop-grow" size="small" :min="0.02" :max="3" :step="0.02" />
            <span class="prop-value">{{ font_size.toFixed(2) }} cm</span>
        </div>
        <div class="prop-row">
            <span class="prop-label">颜色</span>
            <el-color-picker
                v-model="color"
                size="small"
                @active-change="set_active_color"
            />
            <span class="prop-value">{{ color }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElInput, ElSelect, ElOption, ElSlider, ElColorPicker } from "element-plus";
import { useAppStore } from "../stores/app";
import { FONT_FAMILIES } from "../object/Text";

const appStore = useAppStore();

// 面板内容和画布上的 Text 对象双向同步
const content = computed({
    get: () => appStore.text_content,
    set: (value: string) => appStore.set_text_content(value),
});

const font_family = computed({
    get: () => appStore.text_font_family,
    set: (value: string) => appStore.set_text_font_family(value),
});

// 字号单位是 cm；滑块步长在浮点上会留尾巴，写回时取两位小数
const font_size = computed({
    get: () => appStore.text_font_size,
    set: (value: number | number[]) => {
        const v = Array.isArray(value) ? value[0] : value;
        appStore.set_text_font_size(Math.round(v * 100) / 100);
    },
});

// 清空颜色选择器时回落到默认黑色
const color = computed({
    get: () => appStore.text_color,
    set: (value: string | null) => appStore.set_text_color(value || "#000000"),
});

// 拖动取色板时 v-model 要到点“确定”才更新，这里用 active-change 做实时预览
const set_active_color = (value: string | null) => {
    if (value) appStore.set_text_color(value);
};
</script>

<style scoped>
.text-panel {
    margin-top: 8px;
}

.prop-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
}

.prop-label {
    flex: 0 0 auto;
    width: 32px;
    color: #606266;
    font-size: 13px;
}

.prop-grow {
    flex: 1 1 auto;
    min-width: 0;
}

.prop-value {
    flex: 0 0 auto;
    min-width: 56px;
    color: #909399;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}
</style>
