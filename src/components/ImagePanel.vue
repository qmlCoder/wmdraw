<template>
    <div class="image-panel">
        <div class="prop-row">
            <el-button size="small" type="primary" @click="pick_file">导入图像</el-button>
            <span class="file-name" :title="appStore.image_name">{{ appStore.image_name || '未导入' }}</span>
        </div>
        <div class="prop-row">
            <span class="prop-label">阴影</span>
            <el-switch v-model="shadow" size="small" />
        </div>
        <template v-if="shadow">
            <div class="prop-row">
                <span class="prop-label">颜色</span>
                <el-color-picker v-model="shadow_color" size="small" show-alpha :predefine="PRESETS"
                    @active-change="on_active_color" />
                <span class="prop-value">{{ shadow_color }}</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">模糊</span>
                <el-slider v-model="shadow_blur" class="prop-grow" size="small" :min="0" :max="40" :step="1" />
                <span class="prop-value">{{ shadow_blur }} px</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">水平偏移</span>
                <el-slider v-model="shadow_offset_x" class="prop-grow" size="small" :min="-60" :max="60" :step="1" />
                <span class="prop-value">{{ shadow_offset_x }} px</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">垂直偏移</span>
                <el-slider v-model="shadow_offset_y" class="prop-grow" size="small" :min="-60" :max="60" :step="1" />
                <span class="prop-value">{{ shadow_offset_y }} px</span>
            </div>
        </template>
        <template v-if="loaded">
            <div class="prop-row prop-row-title">
                <span class="prop-label">裁剪</span>
                <el-button size="small" class="prop-grow" @click="reset_crop">重置裁剪</el-button>
            </div>
            <div class="crop-preview-box">
                <canvas ref="preview" class="crop-preview"></canvas>
                <div class="prop-hint">虚线框内是裁剪后保留的部分</div>
            </div>
            <div class="prop-row">
                <span class="prop-label">左</span>
                <el-slider v-model="crop_left" class="prop-grow" size="small" :min="0" :max="98 - crop_right" :step="1" />
                <span class="prop-value">{{ crop_left }} %</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">右</span>
                <el-slider v-model="crop_right" class="prop-grow" size="small" :min="0" :max="98 - crop_left" :step="1" />
                <span class="prop-value">{{ crop_right }} %</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">上</span>
                <el-slider v-model="crop_top" class="prop-grow" size="small" :min="0" :max="98 - crop_bottom" :step="1" />
                <span class="prop-value">{{ crop_top }} %</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">下</span>
                <el-slider v-model="crop_bottom" class="prop-grow" size="small" :min="0" :max="98 - crop_top" :step="1" />
                <span class="prop-value">{{ crop_bottom }} %</span>
            </div>
        </template>
        <div class="prop-hint">
            支持 PNG / JPG / GIF / WebP / SVG。主画布上可用四角等比缩放、四边单向缩放，m / r / s 调节。
        </div>
        <input ref="file_input" class="file-input" type="file" accept="image/*" @change="on_file" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { ElButton, ElSlider, ElSwitch, ElColorPicker, ElMessage } from "element-plus";
import { useAppStore } from "../stores/app";
import type { Image as ImageObject } from "../object/Image";

const PRESETS = ["#000000", "#00000066", "#3f3f46aa", "#6965db80", "#e6a23c80"];

const appStore = useAppStore();
const file_input = shallowRef<HTMLInputElement | null>(null);
const preview = shallowRef<HTMLCanvasElement | null>(null);
const image = computed(() => appStore.selected_image as ImageObject | null);

// 对象字段不是响应式的，面板用本地 ref 做镜像后再写回
const shadow = ref(true);
const shadow_color = ref("#00000066");
const shadow_blur = ref(12);
const shadow_offset_x = ref(0);
const shadow_offset_y = ref(6);

// 是否已经导入图片（对象字段不是响应式的，单独记一份用来控制裁剪区显示）
const loaded = ref(false);
// 裁剪比例（百分比整数）：左/右/上/下各裁掉多少
const crop_left = ref(0);
const crop_right = ref(0);
const crop_top = ref(0);
const crop_bottom = ref(0);
// 从对象回填镜像时不要反过来再写回对象
let syncing = false;

// 面板里的裁剪预览：整图 + 裁掉的部分蒙白 + 保留区域的虚线框（模仿 PPT 的裁剪界面）
function draw_preview() {
    const canvas = preview.value;
    const target = image.value;
    const img = target?.img;
    if (!canvas || !target || !img) return;

    const k = Math.min(260 / img.naturalWidth, 170 / img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const l = (target.crop_left * w);
    const r = (target.crop_right * w);
    const t = (target.crop_top * h);
    const b = (target.crop_bottom * h);
    ctx.fillStyle = "rgba(245, 247, 250, 0.82)";
    ctx.fillRect(0, 0, w, t);
    ctx.fillRect(0, h - b, w, b);
    ctx.fillRect(0, t, l, h - t - b);
    ctx.fillRect(w - r, t, r, h - t - b);

    ctx.strokeStyle = "#409eff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(l + 0.5, t + 0.5, Math.max(1, w - l - r - 1), Math.max(1, h - t - b - 1));

    // 原始图片边框用实线，方便看清裁掉了多少
    ctx.setLineDash([]);
    ctx.strokeStyle = "#909399";
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

async function redraw_later() {
    await nextTick();
    draw_preview();
}

const sync_from = (target: ImageObject | null) => {
    syncing = true;
    shadow.value = target ? target.shadow : true;
    shadow_color.value = target ? target.shadow_color : "#00000066";
    shadow_blur.value = target ? target.shadow_blur : 12;
    shadow_offset_x.value = target ? target.shadow_offset_x : 0;
    shadow_offset_y.value = target ? target.shadow_offset_y : 6;
    loaded.value = !!target?.has_image;
    crop_left.value = Math.round((target?.crop_left ?? 0) * 100);
    crop_right.value = Math.round((target?.crop_right ?? 0) * 100);
    crop_top.value = Math.round((target?.crop_top ?? 0) * 100);
    crop_bottom.value = Math.round((target?.crop_bottom ?? 0) * 100);
    syncing = false;
    void redraw_later();
};

watch(image, sync_from, { immediate: true });

// 裁剪改动：写回对象（裁掉的边收进框内）并刷新面板里的预览
watch([crop_left, crop_right, crop_top, crop_bottom], () => {
    if (syncing) return;
    const target = image.value;
    if (!target) return;
    target.set_crop(
        crop_left.value / 100,
        crop_right.value / 100,
        crop_top.value / 100,
        crop_bottom.value / 100,
    );
    draw_preview();
});

const reset_crop = () => {
    crop_left.value = 0;
    crop_right.value = 0;
    crop_top.value = 0;
    crop_bottom.value = 0;
};

watch(shadow, (value) => {
    if (image.value) image.value.shadow = value;
});

watch(shadow_color, (value) => {
    if (image.value && value) image.value.shadow_color = value;
});

watch(shadow_blur, (value) => {
    if (image.value) image.value.shadow_blur = value;
});

watch(shadow_offset_x, (value) => {
    if (image.value) image.value.shadow_offset_x = value;
});

watch(shadow_offset_y, (value) => {
    if (image.value) image.value.shadow_offset_y = value;
});

const pick_file = () => file_input.value?.click();

// 拖动取色板/透明度滑块时 v-model 要到点“确定”才更新，用 active-change 做实时预览
const on_active_color = (value: string | null) => {
    if (value) shadow_color.value = value;
};

const read_as_data_url = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("读取文件失败"));
        reader.readAsDataURL(file);
    });

const decode = (source: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("无法解码这张图片"));
        img.src = source;
    });

const on_file = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // 允许再次导入同一个文件
    const target = image.value;
    if (!file || !target) return;
    try {
        const source = await read_as_data_url(file);
        const img = await decode(source);
        target.set_image(img, source, file.name);
        appStore.set_image_name(file.name);
        loaded.value = true;
        crop_left.value = 0;
        crop_right.value = 0;
        crop_top.value = 0;
        crop_bottom.value = 0;
        void redraw_later();
    } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : "导入失败");
    }
};
</script>

<style scoped>
.image-panel {
    margin-top: 8px;
}

.prop-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
}

.prop-row-title .prop-label {
    color: #303133;
    font-weight: 600;
}

.prop-label {
    flex: 0 0 auto;
    width: 60px;
    color: #606266;
    font-size: 13px;
}

.prop-grow {
    flex: 1 1 auto;
    min-width: 0;
}

.crop-preview-box {
    margin-top: 8px;
    padding: 6px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    background: #f7f8fa;
    text-align: center;
}

.crop-preview {
    max-width: 100%;
    vertical-align: middle;
}

.prop-value {
    flex: 0 0 auto;
    min-width: 52px;
    text-align: right;
    color: #909399;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
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

.prop-hint {
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
}

.file-input {
    display: none;
}
</style>
