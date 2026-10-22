import { Vec2, BondType } from "./types";
import { Mole } from "./object/Mole";
import { Atom } from "./object/Atom";
import { Bond } from "./object/Bond";
import * as maths from "./maths";

type Frag = {
  nodes: [number,number][];
  edges: [number, number, BondType][];
  joint_node: number;           // 贴节点时：片段用哪个节点对齐
  joint_edge: [number, number]; // 贴键时：用已有的键代替片段里的这条键
}

const frags:Record<string,Frag> = {
  "cyclopropane": {
    nodes: [
      [-0.1768, -0.25],
      [-0.1768, 0.25],
      [0.2562, 0]
    ],
    edges: [
      [0, 1,'单键'],
      [1, 2,'单键'],
      [2, 0,'单键']
    ],
    joint_node: 0,
    joint_edge: [0, 1],
  },
  "cyclobutane": {
    nodes: [
      [-0.25, -0.25],
      [-0.25, 0.25],
      [0.25, 0.25],
      [0.25, -0.25]
    ],
    edges: [
      [0, 1, '单键'],
      [1, 2, '单键'],
      [2, 3, '单键'],
      [3, 0, '单键']
    ],
    joint_node: 0,
    joint_edge: [0, 1],
  },

  'cyclopentane': {
    nodes: [
      [0, -0.4253],
      [-0.4045, -0.1314],
      [-0.25, 0.3441],
      [0.25, 0.3441],
      [0.4045, -0.1314]
    ],
    edges: [
      [0, 1, '单键'],
      [1, 2, '单键'],
      [2, 3, '单键'],
      [3, 4, '单键'],
      [4, 0, '单键']
    ],
    joint_node: 0,
    joint_edge: [0, 1],
  },
  'cyclohexane': {
    nodes: [
      [0, -0.5],
      [-0.4330, -0.25],
      [-0.4330, 0.25],
      [0, 0.5],
      [0.4330, 0.25],
      [0.4330, -0.25]
    ],
    edges: [
      [0, 1, '单键'],
      [1, 2, '单键'],
      [2, 3, '单键'],
      [3, 4, '单键'],
      [4, 5, '单键'],
      [5, 0, '单键']
    ],
    joint_node: 0,
    joint_edge: [0, 1],
  },
  'cycloheptane': {
    nodes: [
      [0, -0.5762],
      [-0.4505, -0.3592],
      [-0.5617, 0.1282],
      [-0.25, 0.5191],
      [0.25, 0.5191],
      [0.5617, 0.1282],
      [0.4505, -0.3592]
    ],
    edges: [
      [0, 1, '单键'],
      [1, 2, '单键'],
      [2, 3, '单键'],
      [3, 4, '单键'],
      [4, 5, '单键'],
      [5, 6, '单键'],
      [6, 0, '单键']
    ],
    joint_node: 0,
    joint_edge: [0, 1],
  },
  'cyclooctane': {
    nodes: [
      [-0.25, -0.6036],
      [-0.6036, -0.25],
      [-0.6036, 0.25],
      [-0.25, 0.6036],
      [0.25, 0.6036],
      [0.6036, 0.25],
      [0.6036, -0.25],
      [0.25, -0.6036]
    ],
    edges: [
      [0, 1, '单键'],
      [1, 2, '单键'],
      [2, 3, '单键'],
      [3, 4, '单键'],
      [4, 5, '单键'],
      [5, 6, '单键'],
      [6, 7, '单键'],
      [7, 0, '单键']
    ],
    joint_node: 0,
    joint_edge: [0, 1],
  },
  'cyclopentaniene': {
    nodes: [
      [0, -0.4253],
      [-0.4045, -0.1314],
      [-0.25, 0.3441],
      [0.25, 0.3441],
      [0.4045, -0.1314]
    ],
    edges: [
      [0, 1, '单键'],
      [1, 2, '双键-2'],
      [2, 3, '单键'],
      [3, 4, '双键-2'],
      [4, 0, '单键']
    ],
    joint_node: 0,
    joint_edge: [0, 1],
  },
  'benzene': {
    nodes: [
      [0, -0.5],
      [-0.4330, -0.25],
      [-0.4330, 0.25],
      [0, 0.5],
      [0.4330, 0.25],
      [0.4330, -0.25]
    ],
    edges: [
      [0, 1, '单键'],
      [1, 2, '双键-2'],
      [2, 3, '单键'],
      [3, 4, '双键-2'],
      [4, 5, '单键'],
      [5, 0, '双键-2']
    ],
    joint_node: 0,
    joint_edge: [0, 1],
  },
}

// 片段坐标单位是 cm（环上键长约 0.5 cm = 50 px）

// 片段列表（分子属性面板里的按钮顺序）
export const FRAGMENTS: { name: string; label: string }[] = [
  { name: 'cyclopropane', label: '三元环' },
  { name: 'cyclobutane', label: '四元环' },
  { name: 'cyclopentane', label: '五元环' },
  { name: 'cyclohexane', label: '六元环' },
  { name: 'cycloheptane', label: '七元环' },
  { name: 'cyclooctane', label: '八元环' },
  { name: 'cyclopentaniene', label: '环戊二烯' },
  { name: 'benzene', label: '苯环' },
];

export const add_fragment = (mole:Mole, name:string, pos:Vec2, atom: Atom|undefined, bond: Bond|undefined) => {
  const frag = frags[name];
  if (!frag) return;

  // 贴到已有的键上：用这条键代替片段自己的 joint_edge
  if (bond) {
    const na = mole.get_atom(bond.idx1);
    const nb = mole.get_atom(bond.idx2);
    if (!na || !nb) return;

    const [j0, j1] = frag.joint_edge;
    const p0 = new Vec2(frag.nodes[j0][0], frag.nodes[j0][1]);
    const p1 = new Vec2(frag.nodes[j1][0], frag.nodes[j1][1]);
    const from = p1.sub(p0);
    const from_len = Math.hypot(from.x, from.y);
    if (from_len < 1e-9) return;

    // 相似变换：把片段的 p0→p1 映射到 start→end，返回所有片段原子的位置（不创建原子）
    const place = (start: Atom, end: Atom): Vec2[] => {
      const to = end.pos.sub(start.pos);
      const to_len = Math.hypot(to.x, to.y);
      if (to_len < 1e-9) return [];
      const scale = to_len / from_len;
      const angle = from.angle(to);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return frag.nodes.map(([x, y]) => {
        const dx = (x - p0.x) * scale;
        const dy = (y - p0.y) * scale;
        return new Vec2(
          start.pos.x + dx * cos - dy * sin,
          start.pos.y + dx * sin + dy * cos,
        );
      });
    };

    // 两个朝向：j0 对 na 或对 nb，分别算一遍
    const candidates = [
      { start: na, end: nb, positions: place(na, nb) },
      { start: nb, end: na, positions: place(nb, na) },
    ].filter(c => c.positions.length > 0);
    if (candidates.length == 0) return;

    // 选新原子离已有原子更远的一侧，否则贴到环上时新环会和原环重叠
    let chosen = candidates[0];
    let best = -Infinity;
    for (const c of candidates) {
      let min_dist = Infinity;
      for (let i = 0; i < c.positions.length; i++) {
        if (i == j0 || i == j1) continue; // 这两个原子就是已有键的端点
        for (const other of mole.atoms) {
          min_dist = Math.min(min_dist, c.positions[i].dist(other.base_pos));
        }
      }
      if (min_dist > best) {
        best = min_dist;
        chosen = c;
      }
    }

    const idx_map = new Map<number, number>();
    idx_map.set(j0, chosen.start.idx); // 两端直接复用已有键的原子
    idx_map.set(j1, chosen.end.idx);
    for (let i = 0; i < frag.nodes.length; i++) {
      if (i == j0 || i == j1) continue;
      const _atom = mole.add_atom(chosen.positions[i]);
      idx_map.set(i, _atom.idx);
    }
    for (const [idx1, idx2, type] of frag.edges) {
      // joint_edge 由已有的键承担，不再重复添加
      if ((idx1 == j0 && idx2 == j1) || (idx1 == j1 && idx2 == j0)) continue;
      mole.add_bond(idx_map.get(idx1)!, idx_map.get(idx2)!, type);
    }
    return;
  }

  // 贴到已有的原子上
  if (atom) {
    const dx = frag.nodes[frag.joint_node][0];
    const dy = frag.nodes[frag.joint_node][1];
    const idx_map = new Map<number, number>();
    for (let i = 0; i < frag.nodes.length; i++) {
      if (i == frag.joint_node) {
        idx_map.set(i, atom.idx);
        continue
      };
      const [x, y] = frag.nodes[i];
      const px = (x - dx) + atom.pos.x
      const py = (y - dy) + atom.pos.y
      const angle= new Vec2(0,1).angle(atom.max_rep_dir())
      const [p] = maths.points_rotate([new Vec2(px, py)], angle, atom.pos)
      const _atom = mole.add_atom(p);
      idx_map.set(i, _atom.idx);
    }
    for (const [idx1, idx2, type] of frag.edges) {
      mole.add_bond(idx_map.get(idx1)!, idx_map.get(idx2)!, type)
    }
    return;
  }

  // 放在鼠标点击的位置
  let start = 0
  if (mole.atoms.length != 0) {
    start=mole.atoms[mole.atoms.length-1].idx+1
  }
  for(const [x,y] of frag.nodes) {
    mole.add_atom(new Vec2(x + pos.x, y + pos.y));
  }
  for(const [idx1,idx2,type] of frag.edges) {
    mole.add_bond(start + idx1, start + idx2, type);
  }
}
