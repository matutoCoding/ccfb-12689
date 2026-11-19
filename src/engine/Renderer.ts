import type { Geometry } from '../lib/geometry';
import { VERT, FRAG, LINE_VERT, LINE_FRAG } from './shaders';
import type { Mat4 } from '../lib/math';
import { identity, mat4, multiply, perspective, lookAt, compose, v3 } from '../lib/math';
import type { SurfaceType, Vec3 } from '../types';

export interface DrawCall {
  geo: Geometry;
  model: Mat4;
  surface: SurfaceType;
  color: [number, number, number];
  color2?: [number, number, number];
  transparent?: boolean;
  lightboxOn?: boolean;
}

export interface LineCall {
  points: Vec3[];          // 线段序列(每两个点一条)
  color: [number, number, number];
  alpha: number;
  loop?: boolean;
  dashed?: boolean;
}

export interface BlobCall { center: Vec3; rx: number; rz: number; }

export interface CameraState { eye: Vec3; target: Vec3; fov: number; }

const SURFACE_INDEX: Record<SurfaceType, number> = {
  matte: 0, acrylic: 1, wood: 2, chrome: 3, velvet: 4, lightbox: 5,
  plastic: 6, metal: 7, glass: 8, skin: 9,
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}
function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

interface GeoGPU {
  vao: WebGLVertexArrayObject;
  count: number;
  type: number;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private lineProg: WebGLProgram;
  private geoCache = new Map<Geometry, GeoGPU>();
  private cubeTex: WebGLTexture;
  private cubeFBO: WebGLFramebuffer;
  private cubeSize = 64;
  private envDirty = true;
  private frameNo = 0;
  private cubeProj: Mat4;
  private cubeViews: Mat4[] = [];
  private time = 0;
  fog = 0;
  lightboxPower = true;
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: true, alpha: false, preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;
    this.prog = program(gl, VERT, FRAG);
    this.lineProg = program(gl, LINE_VERT, LINE_FRAG);
    this.cubeTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cubeTex);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (let i = 0; i < 6; i++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA,
        this.cubeSize, this.cubeSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    this.cubeFBO = gl.createFramebuffer()!;
    this.initLineBuffer();
    this.cubeProj = perspective(mat4(), Math.PI / 2, 1, 5, 5000);
    this.buildCubeViews();
    this.seedProceduralEnv();
  }

  private buildCubeViews() {
    const o = v3(0, 90, 0);
    const dirs: [Vec3, Vec3][] = [
      [v3(1, 0, 0), v3(0, -1, 0)], [v3(-1, 0, 0), v3(0, -1, 0)],
      [v3(0, 1, 0), v3(0, 0, 1)], [v3(0, -1, 0), v3(0, 0, -1)],
      [v3(0, 0, 1), v3(0, -1, 0)], [v3(0, 0, -1), v3(0, -1, 0)],
    ];
    this.cubeViews = dirs.map(([d, up]) => lookAt(mat4(), o, { x: o.x + d.x, y: o.y + d.y, z: o.z + d.z }, up));
  }

  // 程序化环境贴图(暖天花灯 + 冷环境),保证首帧镀铬件就有倒影
  private seedProceduralEnv() {
    const gl = this.gl;
    const n = this.cubeSize;
    for (let face = 0; face < 6; face++) {
      const data = new Uint8Array(n * n * 4);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = (y * n + x) * 4;
          const vy = 1 - y / n;
          const spot = Math.max(0, 1 - Math.hypot(x / n - 0.3, y / n - 0.25) * 2.4);
          const up = vy;
          data[i] = 60 + up * 70 + spot * 120;
          data[i + 1] = 62 + up * 68 + spot * 115;
          data[i + 2] = 70 + up * 60 + spot * 95;
          data[i + 3] = 255;
        }
      }
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cubeTex);
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGBA, n, n, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  }

  markEnvDirty() { this.envDirty = true; }

  private getGeo(geo: Geometry): GeoGPU {
    let g = this.geoCache.get(geo);
    if (g) return g;
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const norBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geo.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    g = { vao, count: geo.indices.length, type: geo.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    this.geoCache.set(geo, g);
    return g;
  }

  private lineVao!: WebGLVertexArrayObject;
  private lineBuf!: WebGLBuffer;
  private lineCapacity = 16384; // 顶点数上限

  private initLineBuffer() {
    const gl = this.gl;
    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    this.lineBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.lineCapacity * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private drawLineVerts(verts: Vec3[], color: [number, number, number], alpha: number, loop: boolean) {
    if (verts.length < 2) return;
    const gl = this.gl;
    if (verts.length > this.lineCapacity) return;
    const arr = new Float32Array(verts.length * 3);
    verts.forEach((p, i) => arr.set([p.x, p.y, p.z], i * 3));
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    gl.uniform3fv(gl.getUniformLocation(this.lineProg, 'uColor'), color);
    gl.uniform1f(gl.getUniformLocation(this.lineProg, 'uAlpha'), alpha);
    gl.drawArrays(loop ? gl.LINE_LOOP : gl.LINES, 0, verts.length);
    gl.bindVertexArray(null);
  }

  private buildEnvMap(calls: DrawCall[], cam: CameraState) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.cubeFBO);
    const oldVp = gl.getParameter(gl.VIEWPORT);
    gl.viewport(0, 0, this.cubeSize, this.cubeSize);
    for (let face = 0; face < 6; face++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, this.cubeTex, 0);
      gl.clearColor(0.35, 0.36, 0.4, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.drawOpaque(calls, this.cubeProj, this.cubeViews[face], v3(0, 90, 0), true);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(oldVp[0], oldVp[1], oldVp[2], oldVp[3]);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cubeTex);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    this.envDirty = false;
  }

  private drawOpaque(calls: DrawCall[], proj: Mat4, view: Mat4, camPos: Vec3, forEnv: boolean) {
    const gl = this.gl;
    const vp = mat4();
    multiply(vp, proj, view);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uViewProj'), false, vp);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'uCamPos'), [camPos.x, camPos.y, camPos.z]);
    gl.uniform1i(gl.getUniformLocation(this.prog, 'uEnv'), 0);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uEnvMix'), 1);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uTime'), this.time);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uFog'), this.fog);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'uLightDir'), [0.35, 0.9, 0.45]);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'uLightDir2'), [-0.5, 0.4, -0.6]);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'uAmbient'), [0.32, 0.33, 0.36]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cubeTex);
    for (const c of calls) {
      if (forEnv && (c.surface === 'glass' || c.surface === 'acrylic')) continue;
      const gpu = this.getGeo(c.geo);
      gl.bindVertexArray(gpu.vao);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uModel'), false, c.model);
      gl.uniform1i(gl.getUniformLocation(this.prog, 'uSurface'), SURFACE_INDEX[c.surface]);
      gl.uniform3fv(gl.getUniformLocation(this.prog, 'uColor'), c.color);
      gl.uniform3fv(gl.getUniformLocation(this.prog, 'uColor2'), c.color2 ?? c.color);
      gl.uniform1i(gl.getUniformLocation(this.prog, 'uLightboxOn'),
        c.lightboxOn === false ? 0 : this.lightboxPower ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, gpu.count, gpu.type, 0);
    }
    gl.bindVertexArray(null);
  }

  private drawLines(lines: LineCall[], proj: Mat4, view: Mat4) {
    const gl = this.gl;
    const vp = mat4();
    multiply(vp, proj, view);
    gl.useProgram(this.lineProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uViewProj'), false, vp);
    const m = identity(mat4());
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uModel'), false, m);
    gl.disable(gl.DEPTH_TEST);
    for (const ln of lines) {
      if (ln.points.length < 2) continue;
      if (ln.dashed) {
        const verts: Vec3[] = [];
        for (let i = 0; i < ln.points.length - 1; i++) {
          if (i % 2 === 0) verts.push(ln.points[i], ln.points[i + 1]);
        }
        this.drawLineVerts(verts, ln.color, ln.alpha, false);
      } else {
        this.drawLineVerts(ln.points, ln.color, ln.alpha, !!ln.loop);
      }
    }
    gl.enable(gl.DEPTH_TEST);
  }

  private drawBlobs(blobs: BlobCall[], proj: Mat4, view: Mat4) {
    // 用 LINE 程序画两个正交三角片即可,这里退化为扁平半透明 box:复用主程序 matte 黑
    const gl = this.gl;
    const vp = mat4();
    multiply(vp, proj, view);
    gl.useProgram(this.lineProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uViewProj'), false, vp);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uModel'), false, identity(mat4()));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const b of blobs) {
      const seg = 20;
      const pts: Vec3[] = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pts.push(v3(b.center.x + Math.cos(a) * b.rx, b.center.y + 0.3, b.center.z + Math.sin(a) * b.rz));
      }
      this.drawLineVerts(pts, [0.08, 0.08, 0.1], 0.22, true);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // 自适应分辨率:帧预算超支降 DPR,连续富余再回升,保证 60 帧目标
  private dprScale = 1;
  private perfAccum = 0;
  private perfFrames = 0;
  private perfCooldown = 0;

  resize(cssW: number, cssH: number, maxDpr: number) {
    const dpr = Math.min(maxDpr, 1.5) * this.dprScale;
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(2, Math.round(cssH * dpr));
    const c = this.gl.canvas as HTMLCanvasElement;
    if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h;
      this.width = w; this.height = h;
      this.markEnvDirty();
    }
  }

  private adaptResolution(dt: number) {
    this.perfAccum += dt;
    this.perfFrames++;
    if (this.perfCooldown > 0) { this.perfCooldown--; return; }
    if (this.perfFrames < 45) return;
    const avg = this.perfAccum / this.perfFrames;
    this.perfAccum = 0; this.perfFrames = 0;
    if (avg > 0.0185 && this.dprScale > 0.55) {
      this.dprScale = Math.max(0.55, this.dprScale - 0.15);
      this.perfCooldown = 60;
    } else if (avg < 0.011 && this.dprScale < 1) {
      this.dprScale = Math.min(1, this.dprScale + 0.1);
      this.perfCooldown = 60;
    }
  }
  get currentDprScale() { return this.dprScale; }

  render(cam: CameraState, calls: DrawCall[], lines: LineCall[], blobs: BlobCall[], dt: number) {
    const gl = this.gl;
    this.time += dt;
    this.frameNo++;
    this.adaptResolution(dt);
    this.resize((gl.canvas as HTMLCanvasElement).clientWidth,
      (gl.canvas as HTMLCanvasElement).clientHeight,
      Math.min(window.devicePixelRatio || 1, 1.5));
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0.13, 0.14, 0.17, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    const proj = perspective(mat4(), cam.fov, this.width / this.height, 1, 8000);
    const view = lookAt(mat4(), cam.eye, cam.target, v3(0, 1, 0));

    // 动态环境立方图:仅场景变化后刷新一次,静止时零开销(拖拽中每帧标记为脏)
    if (this.envDirty) {
      this.buildEnvMap(calls.filter(c => !c.transparent), cam);
    }

    const opaque = calls.filter(c => !c.transparent);
    const transparent = calls.filter(c => c.transparent);
    this.drawOpaque(opaque, proj, view, cam.eye, false);

    if (blobs.length) this.drawBlobs(blobs, proj, view);

    if (transparent.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      this.drawOpaque(transparent, proj, view, cam.eye, false);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    if (lines.length) this.drawLines(lines, proj, view);
  }

  // 离屏渲染到指定尺寸并返回 PNG dataURL(带尺寸标注的截图在 Editor 里用 2D 叠加)
  capture(cam: CameraState, calls: DrawCall[], lines: LineCall[], blobs: BlobCall[]): string {
    const c = this.gl.canvas as HTMLCanvasElement;
    const prevW = c.width, prevH = c.height;
    const target = 1600;
    const scale = target / Math.max(prevW, prevH);
    c.width = Math.round(prevW * scale);
    c.height = Math.round(prevH * scale);
    this.width = c.width; this.height = c.height;
    this.frameNo = 1;
    this.buildEnvMap(calls.filter(x => !x.transparent), cam);
    this.render(cam, calls, lines, blobs, 0.016);
    const url = c.toDataURL('image/png');
    c.width = prevW; c.height = prevH;
    this.width = prevW; this.height = prevH;
    this.markEnvDirty();
    return url;
  }

  dispose() {
    const gl = this.gl;
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}

export { compose as composeMat };
