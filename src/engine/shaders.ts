// GLSL ES 3.00 着色器集合
// 材质分类号：0 标准/木质/KT/绒布 1 亚克力 2 镀铬 3 灯箱 4 玻璃 5 纯色无光照(标注)
// 每实例属性 loc3..7：iModel0(平移xyz+绕Y弧度) iScale(xyz) iColor(rgb+rough)
//                     iExtra0(matKind+param+emissiveR) iExtra1(pickId+alpha+emissiveG+emissiveB)

const UBLOCK = `
layout(std140) uniform Global {
  mat4 uViewProj;
  vec4 uCameraPos;
  vec4 uLightDir;
  vec4 uAmbient;
  mat4 uLightVP;
  vec4 uFogParams;
};`;

const INST_ATTRS = `
layout(location = 3) in vec4 iModel0;
layout(location = 4) in vec4 iScale;
layout(location = 5) in vec4 iColor;
layout(location = 6) in vec4 iExtra0;
layout(location = 7) in vec4 iExtra1;
mat4 instanceModel() {
  float c = cos(iModel0.w), s = sin(iModel0.w);
  mat4 R = mat4(
    c, 0.0, -s, 0.0,
    0.0, 1.0, 0.0, 0.0,
    s, 0.0, c, 0.0,
    0.0, 0.0, 0.0, 1.0);
  mat4 S = mat4(
    iScale.x, 0.0, 0.0, 0.0,
    0.0, iScale.y, 0.0, 0.0,
    0.0, 0.0, iScale.z, 0.0,
    0.0, 0.0, 0.0, 1.0);
  mat4 T = mat4(
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    iModel0.x, iModel0.y, iModel0.z, 1.0);
  return T * R * S;
}`;

const MAIN_VERT = `#version 300 es
precision highp float;
${UBLOCK}
${INST_ATTRS}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUV;
flat out int vMatKind;
out float vParam;
out float vEmissiveR;
out vec4 vColor;
out vec4 vExtra1;
void main() {
  mat4 uModel = instanceModel();
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vUV = aUV;
  vMatKind = int(iExtra0.x + 0.5);
  vParam = iExtra0.y;
  vEmissiveR = iExtra0.z;
  vColor = iColor;
  vExtra1 = iExtra1;
  gl_Position = uViewProj * world;
}`;

const MAIN_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
${UBLOCK}
uniform sampler2D uTex0;
uniform samplerCube uEnvMap;
uniform sampler2DShadow uShadowMap;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUV;
flat in int vMatKind;
in float vParam;
in float vEmissiveR;
in vec4 vColor;
in vec4 vExtra1;
out vec4 fragColor;

float shadowFactor() {
  vec4 lp = uLightVP * vec4(vWorld, 1.0);
  vec3 ndc = lp.xyz / lp.w;
  if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0 || ndc.z > 1.0) return 1.0;
  vec3 uv = vec3(ndc.xy * 0.5 + 0.5, ndc.z * 0.5 + 0.5 - 0.0025);
  float s = 0.0;
  vec2 texel = vec2(1.0) / vec2(2048.0);
  for (int x = 0; x < 2; x++) for (int y = 0; y < 2; y++) {
    s += texture(uShadowMap, uv + vec3((vec2(x, y) - 0.5) * texel * 1.5, 0.0));
  }
  return s * 0.25;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 baseColor = vColor.rgb;
  float uRoughness = vColor.a;
  float alpha = vExtra1.y;
  vec3 uEmissive = vec3(vEmissiveR, vExtra1.z, vExtra1.w);
  float uParams = vParam;
  int uMatKind = vMatKind;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos.xyz - vWorld);
  vec3 L = normalize(uLightDir.xyz);
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.0);
  float sh = shadowFactor();
  vec3 base = baseColor * texture(uTex0, vUV).rgb;
  vec3 ambientCol = uAmbient.xyz * uAmbient.w;
  vec3 color;

  if (uMatKind == 5) { fragColor = vec4(base, alpha); return; }

  if (uMatKind == 4) {
    float fres = pow(1.0 - ndv, 3.0);
    vec3 refl = texture(uEnvMap, reflect(-V, N)).rgb;
    float fog = uFogParams.x;
    float grime = mix(1.0, hash21(gl_FragCoord.xy * 0.5) * 0.6 + 0.4, fog);
    vec3 glassTint = base * (1.0 - fog * 0.55);
    color = mix(glassTint * 0.25, refl, clamp(fres * 1.4 + fog * 0.35, 0.0, 1.0));
    color *= grime;
    color += (hash21(floor(vWorld.xy * 8.0)) - 0.5) * fog * 0.12;
    alpha = clamp(alpha + fres * 0.4 + fog * 0.35, 0.05, 0.92);
    fragColor = vec4(color, alpha);
    return;
  }

  if (uMatKind == 3) {
    float power = uParams;
    vec3 grey = vec3(dot(base, vec3(0.299, 0.587, 0.114))) * 0.55;
    vec3 lit = mix(grey, base * (1.0 + uEmissive * power), power);
    color = lit + ambientCol * 0.35 + vec3(1.0) * ndl * sh * 0.25 * power;
    fragColor = vec4(color, alpha);
    return;
  }

  if (uMatKind == 2) {
    vec3 R = reflect(-V, N);
    vec3 refl = texture(uEnvMap, R).rgb;
    vec3 jitter = (vec3(
      hash21(vWorld.xy * 3.1), hash21(vWorld.yz * 2.7), hash21(vWorld.xz * 3.7)) - 0.5)
      * uRoughness * 0.35;
    refl = mix(refl, texture(uEnvMap, R + jitter).rgb, uRoughness);
    color = refl * (0.75 + 0.25 * ndl) + ambientCol * 0.15;
    fragColor = vec4(color, alpha);
    return;
  }

  if (uMatKind == 1) {
    float fres = pow(1.0 - ndv, 2.5);
    vec3 refl = texture(uEnvMap, reflect(-V, N)).rgb;
    vec3 diffuse = base * (ambientCol + ndl * sh * 0.6);
    color = diffuse * (1.0 - uParams * 0.7) + refl * (fres * 0.9 + 0.08) + base * uParams * 0.35;
    color += vec3(0.9, 0.97, 1.0) * fres * 0.45;
    alpha = clamp(alpha * (1.0 - uParams * 0.55) + fres * 0.5, 0.12, 1.0);
    fragColor = vec4(color, alpha);
    return;
  }

  float spec = pow(max(dot(N, H), 0.0), mix(128.0, 8.0, uRoughness))
    * (1.0 - uRoughness) * 0.55;
  vec3 diffuse = base * (ambientCol + vec3(1.0) * ndl * sh * uLightDir.w);
  float sheen = pow(1.0 - ndv, 2.0) * uParams;
  color = diffuse + vec3(spec) + base * sheen * 0.6;
  fragColor = vec4(color, alpha);
}`;

const DEPTH_VERT = `#version 300 es
precision highp float;
${UBLOCK}
${INST_ATTRS}
layout(location = 0) in vec3 aPos;
void main() {
  gl_Position = uLightVP * instanceModel() * vec4(aPos, 1.0);
}`;
const DEPTH_FRAG = `#version 300 es
precision highp float;
void main() {}`;

const PICK_VERT = `#version 300 es
precision highp float;
uniform mat4 uViewProj;
uniform mat4 uModel;
layout(location = 0) in vec3 aPos;
void main() { gl_Position = uViewProj * uModel * vec4(aPos, 1.0); }`;
const PICK_FRAG = `#version 300 es
precision highp float;
uniform vec4 uPickId;
out vec4 fragColor;
void main() { fragColor = uPickId; }`;

const LINE_VERT = `#version 300 es
precision highp float;
uniform mat4 uViewProj;
layout(location = 0) in vec3 aPos;
void main() { gl_Position = uViewProj * vec4(aPos, 1.0); }`;
const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }`;

export const SHADERS = {
  main: { vert: MAIN_VERT, frag: MAIN_FRAG },
  depth: { vert: DEPTH_VERT, frag: DEPTH_FRAG },
  pick: { vert: PICK_VERT, frag: PICK_FRAG },
  line: { vert: LINE_VERT, frag: LINE_FRAG },
};
