<template>
    <!-- 整条标题栏都是拖拽区；按钮不在拖拽区上，所以不会被拖走 -->
    <div class="titlebar" data-tauri-drag-region>
        <span class="app-name" data-tauri-drag-region>wmdraw</span>
        <span class="app-version" data-tauri-drag-region>{{ version }}</span>
        <div class="spacer" data-tauri-drag-region></div>
        <div class="controls">
            <button class="control" title="最小化" @click="minimize">
                <img class="control-icon" src="/icons/最小化.png" alt="最小化" />
            </button>
            <button class="control" :title="maximized ? '还原' : '最大化'" @click="toggle_maximize">
                <img v-if="!maximized" class="control-icon" src="/icons/最大化.png" alt="最大化" />
                <img v-else class="control-icon" src="/icons/还原.png" alt="还原" />
            </button>
            <button class="control" title="关闭" @click="close">
                <img class="control-icon" src="/icons/关闭.png" alt="关闭" />
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import pkg from "../../package.json";

const version = pkg.version;

// 浏览器里预览时没有 Tauri 运行时，窗口按钮保持无操作
const in_tauri = "__TAURI_INTERNALS__" in window;
const app_window = in_tauri ? getCurrentWindow() : null;
const maximized = ref(false);
let unlisten: (() => void) | undefined;

const minimize = () => {
    app_window?.minimize();
};

const toggle_maximize = () => {
    app_window?.toggleMaximize();
};

const close = () => {
    app_window?.close();
};

onMounted(async () => {
    const win = app_window;
    if (!win) return;
    maximized.value = await win.isMaximized();
    // 双击拖拽区也会切换最大化，统一用窗口尺寸变化同步按钮图标
    unlisten = await win.onResized(async () => {
        maximized.value = await win.isMaximized();
    });
});

onBeforeUnmount(() => unlisten?.());
</script>

<style scoped>
.titlebar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    /* 必须盖在应用内容之上，否则会被定位元素遮挡 */
    z-index: 1000;
    height: var(--wm-titlebar-height);
    display: flex;
    align-items: center;
    box-sizing: border-box;
    background: #fff;
    border-bottom: 1px solid #dcdfe6;
    color: #303133;
    font-size: 13px;
    user-select: none;
}

.app-name {
    margin-left: 12px;
    font-weight: 600;
}

.app-version {
    margin-left: 6px;
    font-size: 11px;
    color: #909399;
}

.spacer {
    flex: 1 1 auto;
    align-self: stretch;
}

.controls {
    display: flex;
    align-self: stretch;
}

.control {
    appearance: none;
    padding: 0;
    margin: 0;
    border: none;
    width: 30px;
    background: transparent;
    color: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.control:hover {
    background: #f0f0f0;
}

.control-icon {
    display: block;
    width: 24px;
    height: 24px;
    object-fit: contain;
}
</style>
