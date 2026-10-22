// 单位约定：
// - 物体内部数据（节点坐标 node.pos、键长、片段尺寸等）一律使用厘米 cm
// - 画布与渲染使用像素 px
// - 换算关系：1 cm = 100 px
export const PX_PER_CM = 100;

export const cm2px = (cm: number) => cm * PX_PER_CM;

export const px2cm = (px: number) => px / PX_PER_CM;
