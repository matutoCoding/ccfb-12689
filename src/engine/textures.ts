// 程序化纹理：全部 Canvas 生成，无外部资源
export type GL = WebGL2RenderingContext;

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function toTexture(gl: GL, canvas: HTMLCanvasElement, repeat = 1): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, Math.log2(canvas.width));
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_LOD, 0);
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAX_LOD, Math.log2(canvas.width));
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

/** 中性白色纹理（无纹理道具用） */
export function whiteTexture(gl: GL): WebGLTexture {
  const [c, ctx] = makeCanvas(4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 4, 4);
  return toTexture(gl, c);
}

/** 木纹：沿 x 的纤维条纹 + 板块拼接缝 */
export function woodTexture(gl: GL, baseColor: string): WebGLTexture {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  // 纤维
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * size;
    const amp = 2 + Math.random() * 5;
    ctx.strokeStyle = `rgba(60,38,18,${0.05 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * amp);
    }
    ctx.stroke();
  }
  // 拼接缝（每 128px 一道，模拟板材）
  ctx.strokeStyle = 'rgba(40,24,10,0.55)';
  ctx.lineWidth = 2;
  for (const x of [0, 128, 256]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(size, 128); ctx.stroke();
  return toTexture(gl, c);
}

/** KT 板覆膜：亚光细颗粒 */
export function ktTexture(gl: GL, grain: number): WebGLTexture {
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 255 - Math.random() * 14 * grain;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(gl, c);
}

/** 绒布：短绒噪声 + 轻微方向性 */
export function velvetTexture(gl: GL, baseColor: string): WebGLTexture {
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const light = Math.random() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  // 顺绒方向的拉丝
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    const x = Math.random() * size;
    ctx.moveTo(x, 0); ctx.lineTo(x + 6, size);
    ctx.stroke();
  }
  return toTexture(gl, c);
}

/** 织物：经纬网格纹理 */
export function fabricTexture(gl: GL, baseColor: string): WebGLTexture {
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 4) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  return toTexture(gl, c);
}

/**
 * 环境立方体贴图：程序化绘制商场/街景氛围
 * 6 个面：px nx py ny pz nz
 */
export function envCubemap(gl: GL, withSignboard: boolean): WebGLTexture {
  const size = 256;
  const faces: HTMLCanvasElement[] = [];
  for (let f = 0; f < 6; f++) {
    const [c, ctx] = makeCanvas(size);
    // 天花板/地板
    if (f === 2) {
      const g = ctx.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, '#f2f0ec'); g.addColorStop(1, '#cfcac2');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = 'rgba(255,255,245,0.85)';
        ctx.fillRect((i * size) / 12 + 6, 20, size / 18, 10);
      }
    } else if (f === 3) {
      ctx.fillStyle = '#8a8178'; ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < size; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
      }
    } else {
      // 墙面 + 店铺光斑 + 对面灯箱招牌
      const g = ctx.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, '#e8e4dd'); g.addColorStop(0.6, '#c9c2b8'); g.addColorStop(1, '#9b938a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * size, y = 40 + Math.random() * 120;
        const grad = ctx.createRadialGradient(x, y, 2, x, y, 26);
        grad.addColorStop(0, 'rgba(255,244,214,0.9)');
        grad.addColorStop(1, 'rgba(255,244,214,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 28, y - 28, 56, 56);
      }
      if (withSignboard && (f === 4 || f === 5)) {
        ctx.fillStyle = '#101826';
        ctx.fillRect(28, 40, size - 56, 44);
        const hues = ['#ff4d6d', '#ffd166', '#4cc9f0', '#f72585'];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = hues[i % hues.length];
          ctx.fillRect(36 + i * 42, 48, 34, 12);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(36, 68, size - 72, 6);
      }
    }
    faces.push(c);
  }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
  for (let f = 0; f < 6; f++) {
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, faces[f]);
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** 1x1 深度纹理（阴影关闭时占位） */
export function emptyDepth(gl: GL): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return tex;
}
