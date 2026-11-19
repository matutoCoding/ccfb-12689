// GLSL 着色器:单一 UBER 程序,材质全部程序化,无外部贴图
export const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vWorld;
out vec3 vNormal;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * aNor;
  gl_Position = uViewProj * w;
}`;

const NOISE = `
float hash31(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000=hash31(i+vec3(0,0,0));
  float n100=hash31(i+vec3(1,0,0));
  float n010=hash31(i+vec3(0,1,0));
  float n110=hash31(i+vec3(1,1,0));
  float n001=hash31(i+vec3(0,0,1));
  float n101=hash31(i+vec3(1,0,1));
  float n011=hash31(i+vec3(0,1,1));
  float n111=hash31(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}
`;

export const FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform int uSurface;
uniform vec3 uCamPos;
uniform samplerCube uEnv;
uniform float uEnvMix;
uniform float uTime;
uniform float uFog;            // 玻璃雾化(仅玻璃面用)
uniform int uLightboxOn;      // 灯箱通电
uniform vec3 uLightDir;
uniform vec3 uLightDir2;
uniform vec3 uAmbient;
out vec4 outColor;
${NOISE}

vec3 envSample(vec3 r){ return texture(uEnv, r).rgb; }

// 简易色调映射
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 base = uColor;
  vec3 accent = uColor2;
  float ndv = max(dot(N, V), 0.0);
  vec3 L1 = normalize(uLightDir);
  vec3 L2 = normalize(uLightDir2);
  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0);
  vec3 lit = uAmbient + vec3(1.0,0.97,0.92)*diff1*0.85 + vec3(0.55,0.62,0.75)*diff2*0.45;
  vec3 R = reflect(-V, N);
  vec3 env = envSample(R);
  vec3 col = base * lit;
  float alpha = 1.0;

  if(uSurface == 0){            // matte —— KT 板覆膜亚光颗粒
    float grain = vnoise(vWorld * 2.2) - 0.5;
    col = base * (lit * 0.92 + 0.08) + vec3(grain * 0.05);
    col *= 0.96 + 0.04 * ndv;
  }
  else if(uSurface == 1){       // acrylic —— 边缘高光 + 透明层次
    float fres = pow(1.0 - ndv, 3.0);
    col = mix(base * lit * 0.55, base * lit + env * 0.5, fres);
    col += vec3(0.9,0.95,1.0) * fres * 0.45;
    alpha = 0.35 + fres * 0.55;
  }
  else if(uSurface == 2){       // wood —— 纹理 + 拼接缝
    vec3 wp = vWorld * vec3(0.18, 1.0, 0.18);
    float rings = sin(wp.x * 6.2831 + vnoise(wp * 1.5) * 3.0);
    float grain = vnoise(wp * 3.0);
    vec3 wood = mix(base, accent, 0.35 + 0.35 * rings);
    wood *= 0.85 + grain * 0.3;
    float seam = step(0.965, max(abs(fract(vWorld.x*0.05)-0.5)*2.0,
                                 abs(fract(vWorld.z*0.05)-0.5)*2.0));
    wood = mix(wood, wood * 0.45, seam);
    col = wood * lit;
  }
  else if(uSurface == 3){       // chrome —— 周围橱窗倒影
    col = env * (0.85 + 0.15 * ndv) + base * 0.08;
    col += vec3(pow(max(dot(reflect(-L1,N),V),0.0), 60.0)) * 0.6;
  }
  else if(uSurface == 4){       // velvet —— 绒感随角度变
    float sheen = pow(1.0 - ndv, 2.2);
    float nap = vnoise(vWorld * 1.4);
    col = base * lit * (0.55 + 0.45 * nap) + accent * sheen * 0.85;
  }
  else if(uSurface == 5){       // lightbox
    if(uLightboxOn == 1){
      float sat = 1.35;
      vec3 glow = mix(base, base*sat + vec3(0.08), 0.7);
      float band = 0.92 + 0.08 * sin(vWorld.y * 1.2 + uTime * 2.0);
      col = glow * band * 1.45 + glow * 0.5;
    } else {
      float g = dot(base, vec3(0.299,0.587,0.114));
      col = vec3(g) * (0.55 + 0.2 * vnoise(vWorld)) * lit * 0.5;
    }
  }
  else if(uSurface == 6){       // plastic
    float fres = pow(1.0 - ndv, 4.0);
    col = base * lit + env * fres * 0.25;
  }
  else if(uSurface == 7){       // metal 普通金属
    col = mix(base * lit, env, 0.45) + vec3(pow(max(dot(reflect(-L1,N),V),0.0),40.0))*0.35;
  }
  else if(uSurface == 8){       // glass 橱窗玻璃
    float fres = pow(1.0 - ndv, 3.0);
    col = env * fres * 0.5 + base * 0.06;
    // 起雾沾灰:发花
    float dirt = mix(0.0, (vnoise(vWorld*0.6)*0.6 + vnoise(vWorld*3.0)*0.4), uFog);
    col = mix(col, vec3(0.72,0.75,0.78), uFog * (0.35 + dirt * 0.45));
    alpha = 0.06 + fres * 0.22 + uFog * 0.28;
  }
  else if(uSurface == 9){       // skin 模特
    float subs = pow(ndv, 1.5) * 0.25;
    col = base * (lit * 0.9 + 0.15) + accent * subs;
    col = mix(col, env * 0.15, pow(1.0-ndv,4.0)*0.4);
  }
  else {
    col = base * lit;
  }

  outColor = vec4(aces(col), alpha);
}`;

// 线框/纯色着色器(选框、遮挡线、分块线、行人标记)
export const LINE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){ gl_Position = uViewProj * uModel * vec4(aPos,1.0); }`;

export const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 outColor;
void main(){ outColor = vec4(uColor, uAlpha); }`;

// 地面投影 blob 阴影
export const BLOB_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform vec2 uScale;
void main(){
  vec3 p = uCenter + vec3(aPos.x*uScale.x, 0.0, aPos.z*uScale.y);
  gl_Position = uViewProj * vec4(p,1.0);
}`;
export const BLOB_FRAG = `#version 300 es
precision highp float;
in vec3 unused;
uniform vec2 uUv;
out vec4 outColor;
void main(){
  float r = length(uUv);
  float a = smoothstep(1.0, 0.15, r) * 0.28;
  outColor = vec4(0.05,0.05,0.08,a);
}`;
