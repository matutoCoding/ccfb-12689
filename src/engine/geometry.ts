// 程序化网格生成：所有基础网格以单位尺寸建模，渲染时用缩放矩阵适配真实尺寸
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

function append(
  dst: { p: number[]; n: number[]; uv: number[]; idx: number[] },
  m: MeshData,
  offset: [number, number, number],
): number {
  const base = dst.p.length / 3;
  for (let i = 0; i < m.positions.length; i += 3) {
    dst.p.push(m.positions[i] + offset[0], m.positions[i + 1] + offset[1], m.positions[i + 2] + offset[2]);
    dst.n.push(m.normals[i], m.normals[i + 1], m.normals[i + 2]);
  }
  for (let i = 0; i < m.uvs.length; i += 2) dst.uv.push(m.uvs[i], m.uvs[i + 1]);
  for (let i = 0; i < m.indices.length; i++) dst.idx.push(m.indices[i] + base);
  return base;
}

export function mergeMeshes(parts: { mesh: MeshData; offset: [number, number, number] }[]): MeshData {
  const dst = { p: [], n: [], uv: [], idx: [] };
  for (const part of parts) append(dst, part.mesh, part.offset);
  return {
    positions: new Float32Array(dst.p),
    normals: new Float32Array(dst.n),
    uvs: new Float32Array(dst.uv),
    indices: new Uint32Array(dst.idx),
  };
}

/** 单位立方体：中心在原点，边长 1，y 方向 [-0.5,0.5] */
export function boxMesh(): MeshData {
  const p: number[] = [], n: number[] = [], uv: number[] = [], idx: number[] = [];
  const faces: [number, number, number, number, number][] = [
    // nx, ny, nz, du, dv
    [1, 0, 0, 2, 1], [-1, 0, 0, 2, 1],
    [0, 1, 0, 0, 2], [0, -1, 0, 0, 2],
    [0, 0, 1, 0, 1], [0, 0, -1, 0, 1],
  ];
  for (const [nx, ny, nz] of faces) {
    const base = p.length / 3;
    const t1: [number, number, number] = ny !== 0 ? [1, 0, 0] : [0, 1, 0];
    const t2: [number, number, number] = [
      ny * t1[2] - nz * t1[1],
      nz * t1[0] - nx * t1[2],
      nx * t1[1] - ny * t1[0],
    ];
    const c: [number, number, number] = [nx * 0.5, ny * 0.5, nz * 0.5];
    const corners: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const uvs: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      const [u, v] = corners[i];
      p.push(
        c[0] + t1[0] * u + t2[0] * v,
        c[1] + t1[1] * u + t2[1] * v,
        c[2] + t1[2] * u + t2[2] * v,
      );
      n.push(nx, ny, nz);
      uv.push(uvs[i][0], uvs[i][1]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(uv), indices: new Uint32Array(idx) };
}

/** 单位平面：x-z 平面，边长 1，法线 +y（地面/地台用） */
export function planeMesh(): MeshData {
  return {
    positions: new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

/** 垂直单位平面：x-y 平面，法线 +z（玻璃/背板/灯箱片用） */
export function wallMesh(): MeshData {
  return {
    positions: new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

/** 单位圆柱：半径 0.5，高 1，中心在原点（横杆立柱/镀铬件） */
export function cylinderMesh(segments = 20): MeshData {
  const p: number[] = [], n: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= 1; j++) {
    const y = j - 0.5;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
      p.push(cx, y, cz);
      n.push(Math.cos(a), 0, Math.sin(a));
      uv.push(i / segments, j);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < segments; i++) {
    const a = i, b = i + 1, c = row + i + 1, d = row + i;
    idx.push(a, c, b, a, d, c);
  }
  // 顶盖 / 底盖
  for (const top of [0.5, -0.5]) {
    const center = p.length / 3;
    p.push(0, top, 0); n.push(0, Math.sign(top), 0); uv.push(0.5, 0.5);
    const ringStart = p.length / 3;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      p.push(Math.cos(a) * 0.5, top, Math.sin(a) * 0.5);
      n.push(0, Math.sign(top), 0);
      uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    }
    for (let i = 0; i < segments; i++) {
      if (top > 0) idx.push(center, ringStart + i, ringStart + i + 1);
      else idx.push(center, ringStart + i + 1, ringStart + i);
    }
  }
  return { positions: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(uv), indices: new Uint32Array(idx) };
}

/** 单位球（UV 球，低模够用） */
export function sphereMesh(lat = 12, lon = 16): MeshData {
  const p: number[] = [], n: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let y = 0; y <= lat; y++) {
    const v = y / lat;
    const theta = v * Math.PI;
    for (let x = 0; x <= lon; x++) {
      const u = x / lon;
      const phi = u * Math.PI * 2;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);
      p.push(nx * 0.5, ny * 0.5, nz * 0.5);
      n.push(nx, ny, nz);
      uv.push(u, 1 - v);
    }
  }
  const row = lon + 1;
  for (let y = 0; y < lat; y++) {
    for (let x = 0; x < lon; x++) {
      const a = y * row + x, b = a + 1, c = a + row + 1, d = a + row;
      idx.push(a, d, b, b, d, c);
    }
  }
  return { positions: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(uv), indices: new Uint32Array(idx) };
}

/** 抽象模特：躯干+头+双腿+底座，总高 1（缩放即真实身高），原点在脚底 */
export function mannequinMesh(): MeshData {
  const box = boxMesh(), sph = sphereMesh(10, 14), cyl = cylinderMesh(14);
  return mergeMeshes([
    // 底座
    { mesh: box, offset: [0, 0.02, 0] },
    // 双腿
    { mesh: cyl, offset: [-0.09, 0.27, 0] },
    { mesh: cyl, offset: [0.09, 0.27, 0] },
    // 髋部
    { mesh: box, offset: [0, 0.47, 0] },
    // 躯干（略收腰用盒子近似）
    { mesh: box, offset: [0, 0.66, 0] },
    { mesh: box, offset: [0, 0.8, 0] },
    // 颈+头
    { mesh: cyl, offset: [0, 0.9, 0] },
    { mesh: sph, offset: [0, 0.96, 0] },
  ]);
}

/** 横杆挂装架：两根立柱 + 横杆，单位宽 1、高 1，原点在脚底中央 */
export function railMesh(): MeshData {
  const cyl = cylinderMesh(16), box = boxMesh();
  return mergeMeshes([
    { mesh: cyl, offset: [-0.46, 0.5, 0] },
    { mesh: cyl, offset: [0.46, 0.5, 0] },
    { mesh: cyl, offset: [0, 0.95, 0] },
    { mesh: box, offset: [-0.46, 0.02, 0] },
    { mesh: box, offset: [0.46, 0.02, 0] },
  ]);
}

/** 叠装塔：层板柱，单位宽深 1、高 1，原点在底部中央 */
export function foldTowerMesh(layers: number): MeshData {
  const box = boxMesh();
  const parts: { mesh: MeshData; offset: [number, number, number] }[] = [
    { mesh: box, offset: [0, 0.02, 0] }, // 底座
  ];
  for (let i = 1; i <= layers; i++) {
    const y = i / (layers + 1);
    parts.push({ mesh: box, offset: [0, y, 0] }); // 层板
    // 层板上的叠装衣物（薄盒）
    parts.push({ mesh: box, offset: [0, y + 0.03, 0] });
  }
  return mergeMeshes(parts);
}

/** 简易衣架（挂装件）：三角轮廓扁盒，单位高 1 */
export function hangerMesh(): MeshData {
  return boxMesh();
}
