import { OrbitCamera } from './camera';
import {
  boxMesh, cylinderMesh, foldTowerMesh, mannequinMesh, planeMesh, railMesh, wallMesh,
  type MeshData,
} from './geometry';
import {
  mat4Multiply, mat4LookAt, mat4Perspective, mat4TRS, type Mat4, type Vec3,
} from './math';
import { SHADERS } from './shaders';
import {
  emptyDepth, envCubemap, fabricTexture, ktTexture, velvetTexture, whiteTexture, woodTexture,
} from './textures';

export type GL = WebGL2RenderingContext;

export interface DrawInstance {
  meshName: string;
  position: Vec3;
  rotationY: number;
  scale: Vec3;
  color: [number, number, number];
  alpha: number;
  roughness: number;
  matKind: 0 | 1 | 2 | 3 | 4 | 5;
  param: number;
  emissive: [number, number, number];
  textureKind: 'white' | 'wood' | 'kt' | 'velvet' | 'fabric';
  pickId: number;
  transparent: boolean;
  isGlass?: boolean;
}

interface GpuMesh {
  vao: WebGLVertexArrayObject;
  indexCount: number;
}

interface Program {
  prog: WebGLProgram;
  locs: Record<string, WebGLUniformLocation | null>;
}

const MAX_INSTANCES = 4096;
const INST_FLOATS = 20; // 5 个 vec4

function compile(gl: GL, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function link(gl: GL, vs: string, fs: string): Program {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(prog));
  }
  const locs: Record<string, WebGLUniformLocation | null> = {};
  for (const u of ['uModel', 'uColor', 'uRoughness', 'uMatKind', 'uParams', 'uEmissive',
    'uTex0', 'uEnvMap', 'uShadowMap', 'uViewProj', 'uPickId', 'uColor']) {
    locs[u] = gl.getUniformLocation(prog, u);
  }
  return { prog, locs };
}

export class Renderer {
  readonly gl: GL;
  readonly camera = new OrbitCamera();
  fps = 60;
  frameMs = 0;
  drawCalls = 0;
  instanceCount = 0;

  private programs: Record<string, Program> = {};
  private meshes = new Map<string, GpuMesh>();
  private textures: Record<string, WebGLTexture> = {};
  private envMap!: WebGLTexture;
  private shadowTex!: WebGLTexture;
  private shadowFbo!: WebGLFramebuffer;
  private emptyShadowTex: WebGLTexture | null = null;
  private ubo!: WebGLBuffer;
  private pickFbo!: WebGLFramebuffer;
  private pickTex!: WebGLTexture;
  private pickDepth!: WebGLRenderbuffer;
  private lineVao!: WebGLVertexArrayObject;
  private lineVbo!: WebGLBuffer;
  private instVbo!: WebGLBuffer;
  private instData = new Float32Array(MAX_INSTANCES * INST_FLOATS);
  private uboData = new Float32Array(48);
  private lightProj = new Float32Array(16);
  private instances: DrawInstance[] = [];
  private lines: number[] = [];
  private lightDir: Vec3 = [-0.45, 0.85, 0.35];
  private ambient = 0.55;
  private fogLevel = 0;
  private signboard = true;
  private shadowSize = 2048;
  private shadowEnabled = true;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: true, alpha: false, preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    for (const [name, src] of Object.entries(SHADERS)) {
      const program = link(gl, src.vert, src.frag);
      // 显式把 Global UBO 块绑定到绑定点 0（不用 GLSL layout(binding)，兼容性更好）
      const blockIdx = gl.getUniformBlockIndex(program.prog, 'Global');
      if (blockIdx !== gl.INVALID_INDEX) gl.uniformBlockBinding(program.prog, blockIdx, 0);
      this.programs[name] = program;
    }

    // 实例化缓冲必须先于网格创建：uploadMesh 绑定 VAO 时要把实例属性 loc3..7 挂到它上面
    this.instVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.instData.byteLength, gl.DYNAMIC_DRAW);

    this.uploadMesh('box', boxMesh());
    this.uploadMesh('wall', wallMesh());
    this.uploadMesh('plane', planeMesh());
    this.uploadMesh('cyl', cylinderMesh(18));
    this.uploadMesh('mannequin', mannequinMesh());
    this.uploadMesh('rail', railMesh());
    for (const n of [3, 5, 8]) this.uploadMesh('tower' + n, foldTowerMesh(n));

    this.textures = {
      white: whiteTexture(gl),
      wood: woodTexture(gl, '#a9764a'),
      kt: ktTexture(gl, 1),
      velvet: velvetTexture(gl, '#5a2435'),
      fabric: fabricTexture(gl, '#c9c2b6'),
    };
    this.envMap = envCubemap(gl, true);

    // 阴影贴图（开启 sampler2DShadow 深度比较）
    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);

    // 拾取 FBO
    this.pickFbo = gl.createFramebuffer()!;
    this.pickTex = gl.createTexture()!;
    this.pickDepth = gl.createRenderbuffer()!;

    // 线段
    this.lineVao = gl.createVertexArray()!;
    this.lineVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 65536, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    // UBO 192 字节
    this.ubo = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, 192, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  private uploadMesh(name: string, data: MeshData): void {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const attr = (buf: WebGLBuffer, loc: number, size: number): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    attr(vbo, 0, 3);
    const nbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);
    attr(nbo, 1, 3);
    const uvbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.uvs, gl.STATIC_DRAW);
    attr(uvbo, 2, 2);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

    // 实例属性（每个 VAO 都绑同一份实例缓冲）
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    for (let loc = 3; loc <= 7; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, INST_FLOATS * 4, (loc - 3) * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.meshes.set(name, { vao, indexCount: data.indices.length });
    gl.bindVertexArray(null);
  }

  ensureTowerMesh(layers: number): string {
    const name = 'tower' + layers;
    if (!this.meshes.has(name)) this.uploadMesh(name, foldTowerMesh(layers));
    return name;
  }

  setEnv(opts: { fog: number; signboard: boolean; ambient: number }): void {
    this.fogLevel = opts.fog;
    this.ambient = opts.ambient;
    if (opts.signboard !== this.signboard) {
      this.signboard = opts.signboard;
      this.gl.deleteTexture(this.envMap);
      this.envMap = envCubemap(this.gl, opts.signboard);
    }
  }

  setShadowEnabled(on: boolean): void { this.shadowEnabled = on; }

  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(2, Math.floor(cssW * dpr));
    const h = Math.max(2, Math.floor(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.pickTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.pickDepth);
    }
    this.camera.aspect = cssW / cssH;
  }

  beginFrame(instances: DrawInstance[], lines: number[]): void {
    this.instances = instances.length > MAX_INSTANCES ? instances.slice(0, MAX_INSTANCES) : instances;
    this.lines = lines;
  }

  private writeUbo(viewProj: Mat4, lightVP: Mat4): void {
    const gl = this.gl;
    const data = this.uboData;
    data.set(viewProj, 0);
    const eye = this.camera.position;
    data[16] = eye[0]; data[17] = eye[1]; data[18] = eye[2]; data[19] = 0;
    data[20] = this.lightDir[0]; data[21] = this.lightDir[1];
    data[22] = this.lightDir[2]; data[23] = 1.15;
    data[24] = 0.92; data[25] = 0.9; data[26] = 0.86; data[27] = this.ambient;
    data.set(lightVP, 28);
    data[44] = this.fogLevel; data[45] = 0; data[46] = 0; data[47] = 0;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
  }

  private lightViewProj(): Mat4 {
    const eye: Vec3 = [
      -this.lightDir[0] * 9000, this.lightDir[1] * 9000, this.lightDir[2] * 9000,
    ];
    const view = mat4LookAt(eye, [0, 800, 0], [0, 1, 0]);
    const m = this.lightProj;
    m.fill(0);
    m[0] = 2 / 18000; m[5] = 2 / 18000; m[10] = -2 / 19900;
    m[14] = -(20000 + 100) / 19900; m[15] = 1;
    return mat4Multiply(m, view);
  }

  private fillInstanceData(list: DrawInstance[]): void {
    const d = this.instData;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const o = i * INST_FLOATS;
      d[o] = it.position[0]; d[o + 1] = it.position[1]; d[o + 2] = it.position[2];
      d[o + 3] = it.rotationY;
      d[o + 4] = it.scale[0]; d[o + 5] = it.scale[1]; d[o + 6] = it.scale[2];
      d[o + 7] = 0;
      d[o + 8] = it.color[0]; d[o + 9] = it.color[1]; d[o + 10] = it.color[2];
      d[o + 11] = it.roughness;
      d[o + 12] = it.matKind; d[o + 13] = it.param; d[o + 14] = it.emissive[0]; d[o + 15] = 0;
      d[o + 16] = it.pickId; d[o + 17] = it.alpha;
      d[o + 18] = it.emissive[1]; d[o + 19] = it.emissive[2];
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, list.length * INST_FLOATS);
  }

  /** 按 mesh+纹理分组批量实例绘制，返回 draw call 数 */
  private drawBatches(list: DrawInstance[], transparent: boolean): void {
    const gl = this.gl;
    let lastMesh = '', lastTex = '';
    let batchStart = 0;
    const flush = (end: number): void => {
      if (end <= batchStart) return;
      const mesh = this.meshes.get(list[batchStart].meshName);
      if (!mesh) { batchStart = end; return; }
      gl.bindVertexArray(mesh.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0, end - batchStart);
      this.drawCalls++;
      batchStart = end;
    };
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.transparent !== transparent) { flush(i); batchStart = i + 1; continue; }
      if (it.meshName !== lastMesh || it.textureKind !== lastTex) {
        flush(i);
        batchStart = i;
        lastMesh = it.meshName;
        lastTex = it.textureKind;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[it.textureKind] ?? this.textures.white);
      }
    }
    flush(list.length);
    gl.bindVertexArray(null);
  }

  render(): number {
    const t0 = performance.now();
    const gl = this.gl;
    this.fillInstanceData(this.instances);
    const viewProj = mat4Multiply(this.camera.projMatrix(), this.camera.viewMatrix());
    const lightVP = this.lightViewProj();
    this.writeUbo(viewProj, lightVP);
    this.drawCalls = 0;
    this.instanceCount = this.instances.length;

    // 阴影
    if (this.shadowEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.programs.depth.prog);
      this.drawBatches(this.instances, false);
    }

    // 主画面
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.13, 0.14, 0.16, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const main = this.programs.main;
    gl.useProgram(main.prog);
    gl.uniform1i(main.locs.uTex0, 0);
    gl.uniform1i(main.locs.uEnvMap, 1);
    gl.uniform1i(main.locs.uShadowMap, 2);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.envMap);
    gl.activeTexture(gl.TEXTURE2);
    if (this.shadowEnabled) {
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    } else {
      if (!this.emptyShadowTex) this.emptyShadowTex = emptyDepth(gl);
      gl.bindTexture(gl.TEXTURE_2D, this.emptyShadowTex);
    }
    gl.activeTexture(gl.TEXTURE0);

    // 不透明批
    this.drawBatches(this.instances, false);

    // 半透明：远→近单实例绘制保证排序正确
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const trans = this.instances
      .filter((i) => i.transparent && !i.isGlass)
      .map((i) => ({ i, d: dist2(this.camera.position, i.position) }))
      .sort((a, b) => b.d - a.d)
      .map((x) => x.i);
    this.drawTransparentOneByOne(trans);
    this.drawTransparentOneByOne(this.instances.filter((i) => i.isGlass));
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    this.renderLines(viewProj);

    this.frameMs = performance.now() - t0;
    this.fps = this.fps * 0.92 + (1000 / Math.max(1, this.frameMs + 1)) * 0.08;
    return this.frameMs;
  }

  private drawTransparentOneByOne(list: DrawInstance[]): void {
    const gl = this.gl;
    // 单实例绘制：临时把该实例写入缓冲开头
    for (const inst of list) {
      const mesh = this.meshes.get(inst.meshName);
      if (!mesh) continue;
      this.fillInstanceData([inst]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[inst.textureKind] ?? this.textures.white);
      gl.bindVertexArray(mesh.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0, 1);
      this.drawCalls++;
    }
    gl.bindVertexArray(null);
    // 恢复完整实例缓冲，供后续拾取使用
    this.fillInstanceData(this.instances);
  }

  private renderLines(viewProj: Mat4): void {
    if (this.lines.length < 6) return;
    const gl = this.gl;
    const prog = this.programs.line.prog;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uViewProj'), false, viewProj);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    const maxFloats = Math.floor(65536 / 4 / 3) * 3;
    const data = new Float32Array(this.lines.slice(0, maxFloats));
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.uniform4fv(gl.getUniformLocation(prog, 'uColor'), [1.0, 0.25, 0.18, 0.95]);
    gl.drawArrays(gl.LINES, 0, data.length / 3);
    this.drawCalls++;
    gl.bindVertexArray(null);
  }

  /** 屏幕坐标拾取，返回 pickId 或 null */
  pick(cssX: number, cssY: number): number | null {
    const gl = this.gl;
    const dpr = this.canvas.width / this.canvas.clientWidth;
    const x = Math.floor(cssX * dpr);
    const y = this.canvas.height - Math.floor(cssY * dpr);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFbo);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    const pp = this.programs.pick;
    gl.useProgram(pp.prog);
    gl.uniformMatrix4fv(pp.locs.uViewProj, false,
      mat4Multiply(this.camera.projMatrix(), this.camera.viewMatrix()));
    for (const inst of this.instances) {
      if (inst.pickId <= 0 || inst.isGlass) continue;
      const mesh = this.meshes.get(inst.meshName);
      if (!mesh) continue;
      gl.bindVertexArray(mesh.vao);
      const model = mat4TRS(inst.position, inst.rotationY, inst.scale);
      gl.uniformMatrix4fv(pp.locs.uModel, false, model);
      gl.uniform4fv(pp.locs.uPickId, [
        (inst.pickId & 255) / 255,
        ((inst.pickId >> 8) & 255) / 255,
        ((inst.pickId >> 16) & 255) / 255, 1,
      ]);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
      this.drawCalls++;
    }
    const px = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const id = px[0] | (px[1] << 8) | (px[2] << 16);
    return id > 0 ? id : null;
  }

  screenshot(): string {
    this.render();
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function dist2(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}
