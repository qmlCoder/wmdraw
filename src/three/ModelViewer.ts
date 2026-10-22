import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { ModelView } from "../object/Model";

// 属性面板里支持导入的扩展名（.glb 自带材质和贴图，最省事）
export const MODEL_ACCEPT = ".glb,.gltf,.obj,.stl";

export interface Snapshot {
  img: HTMLImageElement;
  aspect: number;
}

// .obj/.stl 这类不带材质的格式统一给个中性灰
const default_material = () => new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.1, roughness: 0.6 });

// OBJLoader 会塞一个默认的白色 MeshPhongMaterial，在浅色背景上几乎看不见，换成中性灰
function use_default_material(object: THREE.Object3D) {
  object.traverse(item => {
    const mesh = item as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry && !mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    if (mesh.material instanceof THREE.MeshPhongMaterial) mesh.material = default_material();
  });
}

// 把文件内容解析成能直接加进场景的 Object3D
function parse_model(data: ArrayBuffer, name: string): Promise<THREE.Object3D> {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  if (ext === ".glb" || ext === ".gltf") {
    // .gltf 引用外部 .bin/贴图时解析会失败，建议用户导出 .glb
    return new GLTFLoader().parseAsync(data, "").then(gltf => gltf.scene);
  }
  if (ext === ".obj") {
    const group = new OBJLoader().parse(new TextDecoder().decode(data));
    use_default_material(group);
    return Promise.resolve(group);
  }
  if (ext === ".stl") {
    const geometry = new STLLoader().parse(data);
    geometry.computeVertexNormals();
    return Promise.resolve(new THREE.Mesh(geometry, default_material()));
  }
  return Promise.reject(new Error(`不支持的模型格式：${ext || name}`));
}

function dispose_object(object: THREE.Object3D) {
  object.traverse(item => {
    const mesh = item as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach(m => m.dispose());
    else if (material) material.dispose();
  });
}

// 面板里的 three.js 预览器：负责渲染模型，并把渲染结果裁到模型范围内推给主画布
export class ModelViewer {
  on_snapshot: (snapshot: Snapshot) => void = () => { };
  on_change: () => void = () => { };

  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  private controls: OrbitControls;
  private root: THREE.Object3D | undefined = undefined;
  private radius = 1; // 模型包围球半径
  private disposed = false;
  private resize_observer: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    // 背景透明：快照叠在主画布上时不会带底色
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.9);
    fill.position.set(-4, -2, -3);
    this.scene.add(fill);

    this.camera.position.set(0, 0, 3);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.render());

    this.resize_observer = new ResizeObserver(() => this.resize());
    this.resize_observer.observe(container);
    this.resize();
  }

  get has_model(): boolean {
    return this.root !== undefined;
  }

  // 载入模型文件（ArrayBuffer）。解析失败会抛出异常，由面板提示
  async load(data: ArrayBuffer, name: string) {    const object = await parse_model(data, name);
    if (this.disposed) {
      dispose_object(object);
      return;
    }
    if (this.root) {
      this.scene.remove(this.root);
      dispose_object(this.root);
    }

    // 把模型中心挪到原点，方便绕中心旋转
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);
      this.radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1e-3);
    } else {
      this.radius = 1;
    }
    this.root = object;
    this.scene.add(object);
    this.reset_view();
  }

  // 视角恢复成默认的三点透视角度
  reset_view() {
    const distance = (this.radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.1;
    this.apply_view({ azimuth: Math.PI * 0.15, polar: Math.PI * 0.42, distance: distance / this.radius });
  }

  get_view(): ModelView | undefined {
    if (!this.root) return undefined;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    return {
      azimuth: spherical.theta,
      polar: spherical.phi,
      distance: spherical.radius / this.radius,
    };
  }

  apply_view(view: ModelView) {
    const spherical = new THREE.Spherical(view.distance * this.radius, view.polar, view.azimuth);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.controls.update();
  }

  // 切到没有模型的物体时清空预览
  clear() {
    if (!this.root) return;
    this.scene.remove(this.root);
    dispose_object(this.root);
    this.root = undefined;
    this.radius = 1;
  }

  dispose() {
    this.disposed = true;
    this.resize_observer.disconnect();
    this.controls.dispose();
    if (this.root) dispose_object(this.root);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.root = undefined;
  }

  private resize() {
    if (this.disposed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  // 渲染一帧，然后把结果裁到模型范围内推给主画布
  private render() {
    if (this.disposed || !this.root) return;
    this.renderer.render(this.scene, this.camera);
    this.on_change();
    this.emit_snapshot();
  }

  // 模型在渲染画布上的像素包围盒（超出画布的部分会被裁掉）
  private screen_bounds() {
    const canvas = this.renderer.domElement;
    const box = new THREE.Box3().setFromObject(this.root!);
    if (box.isEmpty()) return undefined;

    const width = canvas.width;
    const height = canvas.height;
    const v = new THREE.Vector3();
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      minx = Math.min(minx, x);
      miny = Math.min(miny, y);
      maxx = Math.max(maxx, x);
      maxy = Math.max(maxy, y);
    }
    minx = Math.max(0, Math.floor(minx));
    miny = Math.max(0, Math.floor(miny));
    maxx = Math.min(width, Math.ceil(maxx));
    maxy = Math.min(height, Math.ceil(maxy));
    if (maxx - minx < 2 || maxy - miny < 2) return undefined;
    return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
  }

  private emit_snapshot() {
    const bounds = this.screen_bounds();
    if (!bounds) return;
    const out = document.createElement("canvas");
    out.width = bounds.w;
    out.height = bounds.h;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(this.renderer.domElement, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);

    const img = new Image();
    img.onload = () => {
      if (this.disposed) return;
      this.on_snapshot({ img, aspect: bounds.w / bounds.h });
    };
    img.src = out.toDataURL("image/png");
  }
}
