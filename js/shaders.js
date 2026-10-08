/* WGSL shaders as JS strings (runs by double-clicking index.html, no server needed) */
const COMMON_WGSL=`struct View { vp: mat4x4f, cam: vec4f, clip: vec4f, camR: vec4f, camU: vec4f, camF: vec4f };
struct Env {
  lightVP: mat4x4f,
  sunDir: vec4f, sunCol: vec4f, skyTop: vec4f, skyHor: vec4f, ambient: vec4f, fogCol: vec4f, skyS: vec4f, moon: vec4f,
  wind: vec4f, wx: vec4f, tm: vec4f, params: vec4f, cloud: vec4f, grassC: vec4f,
  push: array<vec4f, 16>, pushV: array<vec4f, 16>, ripples: array<vec4f, 16>, occ: array<vec4f, 16>,
  bird: vec4f,
  frogP: vec4f,
};
const PI = 3.14159265;
const GS = 9.0;
const PC = vec2f(0.0, 0.0);
const WATER_Y = 0.0;
const WG = 9.0;
const BN = 96u;
const WN = 128u;

var<private> BEDS = array<vec4f, 4>(vec4f(-4.0, 2.9, 2.0, 1.4), vec4f(3.6, 3.4, 2.2, 1.4), vec4f(-4.3, -3.0, 1.9, 1.6), vec4f(4.4, -2.8, 1.8, 1.5));
var<private> PATH = array<vec2f, 8>(vec2f(300.0, 300.0), vec2f(301.0, 300.0), vec2f(302.0, 300.0), vec2f(303.0, 300.0), vec2f(304.0, 300.0), vec2f(305.0, 300.0), vec2f(306.0, 300.0), vec2f(307.0, 300.0));

// ------------------------------------------------------------ noise
fn h11(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn h21(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn h22(p: vec2f) -> vec2f { return fract(sin(vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)))) * 43758.5453); }
fn h31(p: vec3f) -> f32 {
  var q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3));
  q = q * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn vn2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2f(1.0, 0.0)), u.x), mix(h21(i + vec2f(0.0, 1.0)), h21(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn vn3(x: vec3f) -> f32 {
  let i = floor(x); let f = fract(x);
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(h31(i), h31(i + vec3f(1.0, 0.0, 0.0)), u.x);
  let b = mix(h31(i + vec3f(0.0, 1.0, 0.0)), h31(i + vec3f(1.0, 1.0, 0.0)), u.x);
  let c = mix(h31(i + vec3f(0.0, 0.0, 1.0)), h31(i + vec3f(1.0, 0.0, 1.0)), u.x);
  let d = mix(h31(i + vec3f(0.0, 1.0, 1.0)), h31(i + vec3f(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}
fn fbm2(p: vec2f) -> f32 {
  return (0.5 * vn2(p) + 0.25 * vn2(p * 2.03 + 3.1) + 0.125 * vn2(p * 4.07 + 7.7) + 0.0625 * vn2(p * 8.1 + 1.3)) / 0.9375;
}
fn srgb(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }

// ------------------------------------------------------------ world shape
fn pondD(p: vec2f) -> f32 {
  let q = p - PC;
  let ang = atan2(q.y, q.x);
  var r = length(q / vec2f(2.7, 1.95));
  r = r * (1.0 + 0.14 * sin(ang * 3.0 + 1.0) + 0.09 * sin(ang * 5.0 + 2.0) + 0.05 * sin(ang * 7.0 + 0.5));
  return (r - 1.0) * 2.1;
}
fn baseH(p: vec2f) -> f32 {
  return 0.30 + 0.10 * sin(p.x * 0.21 + 1.3) * cos(p.y * 0.17) + 0.06 * sin(p.x * 0.5 + p.y * 0.37) + 0.03 * sin(p.x * 1.3 + p.y * 1.1);
}
fn terrainH(p: vec2f) -> f32 {
  let d = pondD(p);
  let b = baseH(p);
  let basin = 1.0 - smoothstep(-0.9, 0.9, d);
  let rim = 0.06 * exp(-pow((d - 0.5) / 0.6, 2.0));
  let deep = 1.0 - smoothstep(-2.0, -0.2, d);
  let bottom = -0.12 - 0.5 * deep + 0.04 * sin(p.x * 2.1) * sin(p.y * 1.7);
  return mix(b + rim, bottom, basin);
}
fn pathD(p: vec2f) -> f32 {
  var best = 1000.0;
  for (var i = 0; i < 7; i = i + 1) {
    let a = PATH[i];
    let b = PATH[i + 1];
    let ab = b - a;
    let t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    best = min(best, length(p - (a + ab * t)));
  }
  return best;
}
fn bedMask(p: vec2f) -> f32 {
  var m = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    let b = BEDS[i];
    let q = (p - b.xy) / b.zw;
    let r = length(q) * (1.0 + 0.18 * sin(atan2(q.y, q.x) * 4.0 + f32(i)));
    m = max(m, 1.0 - smoothstep(0.82, 1.05, r));
  }
  return m;
}

// ------------------------------------------------------------ wind (mirrored on the CPU)
fn windAt(p: vec3f, t: f32) -> vec3f {
  let s = E.wind.z;
  let d = vec2f(E.wind.x, E.wind.y);
  let g1 = sin(dot(p.xz, vec2f(0.31, 0.22)) - t * 1.1 * (0.6 + s));
  let g2 = sin(dot(p.xz, vec2f(-0.17, 0.41)) - t * 1.9 * (0.6 + s) + 1.7);
  let g3 = sin(dot(p.xz, vec2f(0.8, 0.6)) - t * 3.4 * (0.5 + s) + p.y * 1.3);
  let gust = 0.55 + 0.30 * g1 + 0.20 * g2;
  let m = s * (gust + 0.12 * g3 * (0.3 + s));
  let side = vec2f(-d.y, d.x) * 0.25 * s * g2;
  return vec3f(d.x * m + side.x, 0.0, d.y * m + side.y);
}

// ------------------------------------------------------------ fields
fn bendAt(p: vec2f) -> vec2f {
  let g = (p + GS) / (2.0 * GS) * f32(BN) - 0.5;
  let i0 = floor(g);
  let f = g - i0;
  let x0 = u32(clamp(i0.x, 0.0, f32(BN) - 1.0));
  let y0 = u32(clamp(i0.y, 0.0, f32(BN) - 1.0));
  let x1 = min(x0 + 1u, BN - 1u);
  let y1 = min(y0 + 1u, BN - 1u);
  let a = bendF[y0 * BN + x0].xy;
  let b = bendF[y0 * BN + x1].xy;
  let c = bendF[y1 * BN + x0].xy;
  let d = bendF[y1 * BN + x1].xy;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn waterAt(p: vec2f) -> f32 {
  let g = ((p - PC) / WG + 0.5) * f32(WN) - 0.5;
  if (g.x < 0.0 || g.y < 0.0 || g.x > f32(WN) - 1.0 || g.y > f32(WN) - 1.0) { return 0.0; }
  let i0 = floor(g);
  let f = g - i0;
  let x0 = u32(i0.x);
  let y0 = u32(i0.y);
  let x1 = min(x0 + 1u, WN - 1u);
  let y1 = min(y0 + 1u, WN - 1u);
  let a = waterF[y0 * WN + x0].x;
  let b = waterF[y0 * WN + x1].x;
  let c = waterF[y1 * WN + x0].x;
  let d = waterF[y1 * WN + x1].x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn waveH(p: vec2f, t: f32) -> f32 {
  let s = 0.25 + E.wind.z * 0.9 + E.wx.x * 0.3;
  let d = vec2f(E.wind.x, E.wind.y);
  return s * 0.012 * (sin(dot(p, d) * 3.1 - t * 2.1) + 0.6 * sin(dot(p, vec2f(-d.y, d.x)) * 4.7 - t * 2.9 + 1.0) + 0.4 * sin(dot(p, d + vec2f(0.3, 0.7)) * 7.3 - t * 3.7));
}

// ------------------------------------------------------------ light
fn cloudSh(wp: vec3f) -> f32 {
  let n = fbm2(wp.xz * 0.045 + E.cloud.xy);
  let cover = E.wx.z;
  let bd = length(wp.xz - E.bird.xy);
  let bs = 1.0 - E.bird.w * (1.0 - smoothstep(E.bird.z * 0.45, E.bird.z, bd));
  return (1.0 - 0.75 * smoothstep(1.0 - cover - 0.05, 1.0 - cover + 0.3, n) * smoothstep(0.1, 0.5, cover)) * bs;
}
fn viewClip(wp: vec3f) {
  if (V.clip.x > 0.5 && wp.y < V.clip.y - 0.02) { discard; }
}
fn skyCol(d: vec3f) -> vec3f {
  let h = max(d.y, 0.0);
  var c = mix(E.skyHor.rgb, E.skyTop.rgb, pow(h, 0.45));
  let sd = max(dot(d, normalize(E.skyS.xyz)), 0.0);
  c = c + E.sunCol.rgb * (pow(sd, 700.0) * 14.0 + pow(sd, 18.0) * 0.35 + pow(sd, 4.0) * 0.1) * smoothstep(-0.05, 0.1, E.skyS.y) * (1.0 - 0.8 * E.wx.z);
  let md = max(dot(d, normalize(E.moon.xyz)), 0.0);
  c = c + vec3f(0.75, 0.82, 1.0) * (pow(md, 1500.0) * 3.0 + pow(md, 30.0) * 0.06) * E.tm.z * smoothstep(0.0, 0.1, E.moon.y);
  return c;
}
fn shadowAt(wp: vec3f, n: vec3f) -> f32 {
  let p = wp + n * 0.025;
  let lc = E.lightVP * vec4f(p, 1.0);
  let uv = vec2f(lc.x * 0.5 + 0.5, 0.5 - lc.y * 0.5);
  let z = lc.z - 0.0012;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || z > 1.0) { return 1.0; }
  var s = 0.0;
  let ts = 1.0 / 2048.0;
  for (var i = 0; i < 9; i = i + 1) {
    let o = vec2f(f32(i % 3) - 1.0, f32(i / 3) - 1.0) * ts * 1.5;
    s = s + textureSampleCompareLevel(shTex, shSmp, uv + o, z);
  }
  return s / 9.0;
}
fn fogApply(c: vec3f, wp: vec3f) -> vec3f {
  let dist = length(wp - V.cam.xyz);
  let f = 1.0 - exp(-dist * E.fogCol.w);
  let hf = exp(-max(wp.y, 0.0) * 0.25);
  return mix(c, E.fogCol.rgb, clamp(f * (0.55 + 0.45 * hf), 0.0, 1.0));
}
// generic PBR-ish shading for vegetation and ground
fn shadeSurf(alb: vec3f, N: vec3f, Vv: vec3f, wp: vec3f, sh: f32, ao: f32, sss: f32, rough: f32, wet: f32) -> vec3f {
  let L = normalize(E.sunDir.xyz);
  let ndl = dot(N, L);
  let cs = cloudSh(wp);
  let lit = E.sunCol.rgb * E.sunDir.w * sh * cs;
  var col = alb * lit * max(ndl, 0.0);
  let bl = pow(max(dot(-Vv, L), 0.0), 3.0);
  col = col + alb * sss * lit * (max(-ndl, 0.0) * 0.6 + bl * 0.6) * vec3f(1.0, 1.1, 0.5);
  let up = N.y * 0.5 + 0.5;
  var amb = mix(E.ambient.rgb * 0.5, E.skyTop.rgb * 0.55 + E.skyHor.rgb * 0.2, up) * E.ambient.w;
  amb = amb + vec3f(0.7, 0.75, 1.0) * E.tm.w * 0.9;
  col = col + alb * amb * ao;
  let Hh = normalize(L + Vv);
  let sp = pow(max(dot(N, Hh), 0.0), mix(24.0, 220.0, 1.0 - rough)) * (1.0 - rough);
  col = col + lit * sp * (0.1 + 0.5 * wet) * step(0.0, ndl);
  let fr = pow(1.0 - max(dot(N, Vv), 0.0), 4.0);
  col = col + skyCol(reflect(-Vv, N)) * fr * (0.02 + 0.25 * wet) * ao;
  return col;
}
`;

const SCENE_WGSL=`@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var<uniform> E: Env;
@group(0) @binding(2) var shTex: texture_depth_2d;
@group(0) @binding(3) var shSmp: sampler_comparison;
@group(0) @binding(4) var rfTex: texture_2d<f32>;
@group(0) @binding(5) var linSmp: sampler;
@group(1) @binding(0) var<storage, read> bendF: array<vec4f>;
@group(1) @binding(1) var<storage, read> waterF: array<vec4f>;

// ============================================================ SKY
struct SO { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vs_sky(@builtin(vertex_index) vi: u32) -> SO {
  var c = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: SO;
  o.pos = vec4f(c[vi], 1.0, 1.0);
  o.ndc = c[vi];
  return o;
}
@fragment fn fs_sky(in: SO) -> @location(0) vec4f {
  let d = normalize(V.camF.xyz + V.camR.xyz * in.ndc.x * V.camR.w + V.camU.xyz * in.ndc.y * V.camU.w);
  var c = skyCol(d);
  let cover = E.wx.z;
  let storm = E.wx.w;
  if (d.y > 0.01) {
    let pp = d.xz / (d.y + 0.12) * 0.9;
    let n = fbm2(pp * 0.9 + E.cloud.xy * 0.2 + 4.0);
    let cd = smoothstep(1.0 - cover - 0.12, 1.0 - cover + 0.3, n);
    let n2 = fbm2((pp + normalize(E.skyS.xz + vec2f(0.001)) * 0.12) * 0.9 + E.cloud.xy * 0.2 + 4.0);
    let selfSh = clamp((n2 - n) * 3.0 + 0.55, 0.0, 1.0);
    let sunL = E.sunCol.rgb * E.sunDir.w * 0.28;
    var cc = (E.ambient.rgb * 1.6 + sunL * (0.35 + 0.65 * selfSh)) * mix(1.0, 0.32, storm);
    cc = mix(cc, cc * vec3f(0.8, 0.85, 1.0), 0.3);
    c = mix(c, cc, cd * smoothstep(0.0, 0.18, d.y) * 0.96);
  }
  if (E.tm.z > 0.05 && d.y > 0.0) {
    let sp = floor(d * 170.0);
    let star = step(0.9965, h31(sp)) * (0.5 + 0.5 * h31(sp + 3.0)) * E.tm.z;
    c = c + vec3f(0.9, 0.95, 1.0) * star * E.tm.z * (1.0 - cover) * smoothstep(0.0, 0.25, d.y);
  }
  if (E.tm.w > 0.02) {
    c = c + vec3f(0.65, 0.7, 1.0) * E.tm.w * 0.5;
    let az = atan2(d.z, d.x);
    var da = az - E.params.w;
    da = da - 6.2831853 * floor((da + 3.1415926) / 6.2831853);
    let zig = 0.05 * sin(d.y * 38.0) + 0.025 * sin(d.y * 97.0 + 2.0);
    let bolt = (1.0 - smoothstep(0.0, 0.01 + 0.02 * (1.0 - d.y), abs(da - zig))) * smoothstep(0.02, 0.1, d.y) * (1.0 - smoothstep(0.55, 0.9, d.y));
    c = c + vec3f(0.9, 0.92, 1.0) * bolt * E.tm.w * 5.0;
  }
  return vec4f(c, 900.0);
}

// ============================================================ TERRAIN
struct TO { @builtin(position) pos: vec4f, @location(0) wp: vec3f };
@vertex fn vs_terrain(@location(0) xz: vec2f) -> TO {
  let h = terrainH(xz);
  let wp = vec3f(xz.x, h, xz.y);
  var o: TO;
  o.pos = V.vp * vec4f(wp, 1.0);
  o.wp = wp;
  return o;
}
fn rainRing(p: vec2f) -> f32 {
  var r = 0.0;
  for (var l = 0; l < 2; l = l + 1) {
    let sc = 3.0 + f32(l) * 2.3;
    let cell = floor(p * sc);
    let ph = fract(E.tm.x * (0.8 + 0.3 * f32(l)) + h21(cell + f32(l) * 7.0));
    let c = (cell + 0.2 + 0.6 * h22(cell * 1.3 + f32(l))) / sc;
    let d = length(p - c) * sc;
    r = r + (1.0 - smoothstep(0.0, 0.08, abs(d - ph * 0.5))) * (1.0 - ph) * (1.0 - ph) * step(h21(cell + 5.0), 0.55);
  }
  return r;
}
@fragment fn fs_terrain(in: TO) -> @location(0) vec4f {
  let wp = in.wp;
  viewClip(wp);
  let e = 0.08;
  var N = normalize(vec3f(terrainH(wp.xz - vec2f(e, 0.0)) - terrainH(wp.xz + vec2f(e, 0.0)), 2.0 * e, terrainH(wp.xz - vec2f(0.0, e)) - terrainH(wp.xz + vec2f(0.0, e))));
  N = normalize(N + vec3f(vn2(wp.xz * 18.0) - 0.5, 0.0, vn2(wp.xz * 18.0 + 9.0) - 0.5) * 0.25);
  let bed = bedMask(wp.xz);
  let pd = pathD(wp.xz);
  let pond = pondD(wp.xz);
  let wet = E.wx.y;
  var lawn = mix(srgb(vec3f(0.15, 0.25, 0.06)), srgb(vec3f(0.27, 0.36, 0.10)), fbm2(wp.xz * 0.8));
  lawn = mix(lawn, srgb(vec3f(0.40, 0.40, 0.13)), smoothstep(0.55, 0.8, fbm2(wp.xz * 0.18 + 7.0)) * 0.55);
  lawn = mix(lawn, lawn * 0.55, smoothstep(0.58, 0.85, fbm2(wp.xz * 0.4 + 2.0)) * 0.55);
  lawn = lawn * (0.9 + 0.2 * (0.5 + 0.5 * sin(wp.x * 1.7 + wp.z * 0.4))) * (0.82 + 0.36 * vn2(wp.xz * 55.0));
  var soil = mix(srgb(vec3f(0.14, 0.085, 0.05)), srgb(vec3f(0.30, 0.20, 0.12)), fbm2(wp.xz * 3.0 + 4.0));
  soil = mix(soil, srgb(vec3f(0.34, 0.31, 0.27)), smoothstep(0.82, 0.88, vn2(wp.xz * 38.0)) * 0.5);
  soil = mix(soil, srgb(vec3f(0.22, 0.14, 0.08)), smoothstep(0.55, 0.8, vn2(wp.xz * 22.0 + 2.0)) * 0.5);
  var alb = mix(lawn, soil, bed);
  alb = mix(alb, srgb(vec3f(0.34, 0.30, 0.24)) * (0.8 + 0.4 * vn2(wp.xz * 30.0)), 1.0 - smoothstep(0.5, 0.95, pd));
  alb = mix(alb, srgb(vec3f(0.22, 0.165, 0.10)), (1.0 - smoothstep(-0.2, 0.6, pond)) * 0.9);
  let under = 1.0 - smoothstep(-1.0, 0.1, pond);
  let alg = smoothstep(0.52, 0.72, fbm2(wp.xz * 2.4 + 3.0)) * under;
  alb = mix(alb, srgb(vec3f(0.10, 0.22, 0.06)), alg * 0.8);
  alb = mix(alb, srgb(vec3f(0.30, 0.25, 0.16)), smoothstep(0.6, 0.8, vn2(wp.xz * 9.0 + 5.0)) * under * 0.5);
  let moss = smoothstep(0.5, 0.72, fbm2(wp.xz * 3.2 + 9.0)) * smoothstep(-0.6, 0.3, pond) * (1.0 - smoothstep(0.4, 1.8, pond));
  alb = mix(alb, srgb(vec3f(0.07, 0.19, 0.04)), moss * 0.85);
  alb = alb * (1.0 - 0.5 * wet);
  var ao = 1.0;
  for (var k = 0; k < 16; k = k + 1) {
    let o = E.occ[k];
    if (o.w > 0.0) { ao = ao * (1.0 - 0.55 * (1.0 - smoothstep(o.w * 0.4, o.w * 1.9, length(wp.xz - o.xz)))); }
  }
  ao = ao * (0.75 + 0.25 * vn2(wp.xz * 6.0));
  let sh = shadowAt(wp, N);
  let Vv = normalize(V.cam.xyz - wp);
  var col = shadeSurf(alb, N, Vv, wp, sh, ao, 0.0, 0.85 - 0.45 * wet, wet);
  let pud = smoothstep(0.56, 0.68, fbm2(wp.xz * 0.5 + 11.0)) * smoothstep(0.15, 0.7, wet) * (1.0 - bed * 0.4) * (1.0 - smoothstep(0.2, 0.34, wp.y)) * smoothstep(0.4, 1.0, pd);
  if (pud > 0.01) {
    let ring = rainRing(wp.xz) * E.wx.x;
    let pn = normalize(vec3f(ring * 0.4, 1.0, ring * 0.3));
    let rc = skyCol(reflect(-Vv, pn)) * 0.85;
    col = mix(col, rc * 0.8 + ring * 0.25, pud * 0.7);
  }
  col = fogApply(col, wp);
  return vec4f(col, length(wp - V.cam.xyz));
}

// ============================================================ GRASS
struct GO {
  @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f,
  @location(2) t: f32, @location(3) v: f32,
};
@vertex fn vs_grass(@builtin(instance_index) ii: u32, @builtin(vertex_index) vi: u32) -> GO {
  var o: GO;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  let B = u32(E.grassC.w);
  let cellI = ii / B;
  let k = ii % B;
  let cx = f32(i32(cellI % 128u) - 64);
  let cz = f32(i32(cellI / 128u) - 64);
  let cs = E.grassC.z;
  let fc = floor(E.grassC.xy / cs);
  let cell = vec2f(cx + fc.x, cz + fc.y);
  let r2 = h22(cell * 1.37 + f32(k) * 7.13);
  let r3 = h22(cell * 2.11 + f32(k) * 3.7 + 19.0);
  let base = (cell + r2) * cs;
  let dist = length(base - V.cam.xz);
  let maxd = 64.0 * cs * 0.96;
  let fade = 1.0 - smoothstep(maxd * 0.7, maxd, dist);
  let bed = bedMask(base);
  let pd = pathD(base);
  let pond = pondD(base);
  var keep = 1.0 - 0.96 * bed;
  if (pd < 0.62) { keep = 0.0; }
  if (pond < 0.35) { keep = 0.0; }
  if (abs(base.x) > GS - 0.2 || abs(base.y) > GS - 0.2) { keep = 0.0; }
  if (r3.x > keep || fade <= 0.01) { return o; }
  let th = terrainH(base);
  let hgt = (0.10 + 0.26 * r3.y * r3.y + 0.20 * step(0.94, r3.x / max(keep, 0.01))) * (0.75 + 0.5 * fbm2(base * 0.4)) * fade * (0.28 + 0.72 * smoothstep(0.4, 2.2, pond)) * E.cloud.z * (1.0 - 0.9 * E.frogP.z * (1.0 - smoothstep(0.35, 1.1, length(base - E.frogP.xy))));
  let bw = (0.010 + 0.010 * r3.x) * (cs / 0.11);
  let ang = r2.x * 6.2831853;
  let la = r2.y * 6.2831853;
  let lean = vec2f(cos(la), sin(la)) * (0.05 + 0.2 * r3.y) * hgt;
  let row = vi / 2u;
  let side = f32(vi & 1u) * 2.0 - 1.0;
  let tt = f32(row) / 5.0;
  let cv = tt * tt;
  let w = windAt(vec3f(base.x, hgt * 0.5, base.y), E.tm.x);
  let bend = bendAt(base);
  var off = lean * cv + (w.xz * 0.5 * hgt + bend * 0.9) * cv;
  off = off + lean * 0.5 * E.wx.y * cv;
  off = off + vec2f(sin(E.tm.x * 7.0 + base.x * 5.0), cos(E.tm.x * 6.0 + base.y * 4.0)) * 0.008 * length(w.xz) * cv;
  let y = hgt * tt * (1.0 - 0.35 * min(dot(off, off) / (hgt * hgt), 1.0));
  let across = vec2f(cos(ang), sin(ang));
  let width = bw * (1.0 - tt * 0.9);
  let wpos = vec3f(base.x + off.x + across.x * side * width, th + y, base.y + off.y + across.y * side * width);
  o.pos = V.vp * vec4f(wpos, 1.0);
  o.wp = wpos;
  let face = vec2f(-across.y, across.x);
  o.n = normalize(vec3f(face.x * 0.9 - off.x * 2.0 + across.x * side * 0.4, 0.4 + 0.3 * tt, face.y * 0.9 - off.y * 2.0 + across.y * side * 0.4));
  o.t = tt;
  o.v = r3.x + r3.y * 0.5;
  return o;
}
@fragment fn fs_grass(in: GO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let wp = in.wp;
  var N = normalize(in.n);
  if (!ff) { N = -N; }
  let dry = smoothstep(0.55, 0.75, fbm2(wp.xz * 0.35 + 5.0));
  var alb = mix(srgb(vec3f(0.04, 0.10, 0.015)), srgb(vec3f(0.30, 0.50, 0.10)), pow(max(in.t, 0.0), 0.8));
  alb = mix(alb, srgb(vec3f(0.48, 0.43, 0.16)), dry * 0.55 * in.t);
  alb = alb * (0.8 + 0.4 * fract(in.v * 3.7));
  alb = alb * (1.0 - 0.35 * E.wx.y);
  let ao = mix(0.22, 1.0, pow(max(in.t, 0.0), 0.7));
  let sh = shadowAt(wp, N);
  let Vv = normalize(V.cam.xyz - wp);
  var col = shadeSurf(alb, N, Vv, wp, sh, ao, 0.85, 0.55, E.wx.y);
  col = fogApply(col, wp);
  return vec4f(col, length(wp - V.cam.xyz));
}

// ============================================================ PLANKS
struct PO { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) lp: vec3f, @location(3) seed: f32, @location(4) wet: f32 };
@vertex fn vs_plank(@location(0) p: vec3f, @location(1) nn: vec3f, @location(2) a: vec4f, @location(3) b: vec4f) -> PO {
  let lp = vec3f(p.x * b.x, p.y * 0.05, p.z * b.y);
  let cy = cos(a.w);
  let sy = sin(a.w);
  let w = vec3f(a.x + lp.x * cy + lp.z * sy, a.y + lp.y, a.z - lp.x * sy + lp.z * cy);
  var o: PO;
  o.pos = V.vp * vec4f(w, 1.0);
  o.wp = w;
  o.n = vec3f(nn.x * cy + nn.z * sy, nn.y, -nn.x * sy + nn.z * cy);
  o.lp = lp;
  o.seed = b.z;
  o.wet = b.w;
  return o;
}
@fragment fn fs_plank(in: PO) -> @location(0) vec4f {
  viewClip(in.wp);
  var N = normalize(in.n);
  let s = in.seed;
  let grain = vn2(vec2f(in.lp.x * 2.5 + s * 40.0, in.lp.z * 55.0)) * 0.6 + vn2(vec2f(in.lp.x * 9.0, in.lp.z * 160.0 + s * 9.0)) * 0.4;
  let rings = 0.5 + 0.5 * sin(in.lp.z * 70.0 + 6.0 * vn2(vec2f(in.lp.x * 3.0 + s * 20.0, in.lp.z * 6.0)));
  var alb = mix(srgb(vec3f(0.34, 0.21, 0.11)), srgb(vec3f(0.52, 0.36, 0.20)), fract(s * 7.31));
  alb = alb * (0.7 + 0.35 * grain) * (0.85 + 0.2 * rings);
  let weather = smoothstep(0.35, 0.8, fbm2(in.wp.xz * 2.5 + s * 5.0));
  alb = mix(alb, srgb(vec3f(0.45, 0.43, 0.39)), weather * 0.45);
  let moss = smoothstep(0.62, 0.85, fbm2(in.wp.xz * 5.0 + 3.0 + s)) * smoothstep(0.1, 0.7, abs(in.lp.x) / 0.5 + 0.2);
  alb = mix(alb, srgb(vec3f(0.12, 0.22, 0.06)), moss * 0.5);
  alb = alb * (1.0 - 0.45 * E.wx.y);
  let ao = mix(0.6, 1.0, smoothstep(0.0, 0.06, 0.13 - abs(in.lp.z)));
  let Vv = normalize(V.cam.xyz - in.wp);
  let sh = shadowAt(in.wp, N);
  var col = shadeSurf(alb, N, Vv, in.wp, sh, ao, 0.0, 0.8 - 0.5 * E.wx.y, E.wx.y);
  col = fogApply(col, in.wp);
  return vec4f(col, length(in.wp - V.cam.xyz));
}

// ============================================================ BLOBS (rocks, pebbles, centres, fruit)
struct BO { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec3f, @location(3) @interpolate(flat) kind: i32, @location(4) seed: f32, @location(5) lp: vec3f };
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
fn blobR(n: vec3f, seed: f32, disp: f32) -> f32 {
  let s = n * 2.4 + vec3f(seed * 13.0);
  return 1.0 + disp * ((vn3(s) - 0.5) + 0.5 * (vn3(s * 2.3 + 5.0) - 0.5));
}
@vertex fn vs_blob(@location(0) p: vec3f, @location(1) a: vec4f, @location(2) b: vec4f, @location(3) q: vec4f, @location(4) d: vec4f) -> BO {
  let n = normalize(p);
  let sc = vec3f(a.w, b.x, b.y);
  let r = blobR(n, b.w, d.w);
  let lpos = n * r * sc;
  let w = a.xyz + qrot(q, lpos);
  // approximate displaced normal
  let e = 0.05;
  let t1 = normalize(cross(n, vec3f(0.0, 1.0, 0.001)));
  let t2 = cross(n, t1);
  let r1 = blobR(normalize(n + t1 * e), b.w, d.w);
  let r2 = blobR(normalize(n + t2 * e), b.w, d.w);
  let p0 = n * r;
  let p1 = normalize(n + t1 * e) * r1;
  let p2 = normalize(n + t2 * e) * r2;
  var nl = normalize(cross(p1 - p0, p2 - p0));
  if (dot(nl, n) < 0.0) { nl = -nl; }
  var o: BO;
  o.pos = V.vp * vec4f(w, 1.0);
  o.wp = w;
  o.n = qrot(q, normalize(nl / sc));
  o.col = d.xyz;
  o.kind = i32(b.z);
  o.seed = b.w;
  o.lp = n * r;
  return o;
}
@fragment fn fs_blob(in: BO) -> @location(0) vec4f {
  viewClip(in.wp);
  var alb = in.col;
  var rough = 0.8;
  var sss = 0.0;
  var extra = vec3f(0.0);
  var N = normalize(in.n);
  let wet = E.wx.y;
  if (in.kind == 0) {
    let st = vn3(in.lp * vec3f(3.0, 9.0, 3.0) + in.seed * 7.0);
    alb = mix(alb * 0.7, alb * 1.25, st);
    alb = alb * (0.8 + 0.4 * vn3(in.lp * 14.0));
    let top = smoothstep(0.35, 0.85, N.y) * smoothstep(0.45, 0.75, fbm2(in.wp.xz * 3.0 + in.seed * 9.0));
    alb = mix(alb, srgb(vec3f(0.16, 0.28, 0.07)), top * 0.7);
    alb = alb * (1.0 - 0.4 * wet);
    rough = 0.9 - 0.4 * wet;
  } else if (in.kind == 3) {
    let bmp = vn3(in.lp * vec3f(34.0) + in.seed * 5.0) - 0.5;
    let spots = smoothstep(0.55, 0.74, vn3(in.lp * 7.0 + in.seed * 3.0));
    let fine = smoothstep(0.7, 0.8, vn3(in.lp * 26.0 + 4.0));
    var dorsal = in.col * (0.9 + 0.2 * vn3(in.lp * 5.0));
    dorsal = mix(dorsal, in.col * vec3f(0.35, 0.5, 0.35), spots * 0.65);
    dorsal = mix(dorsal, in.col * vec3f(1.35, 1.25, 0.9), fine * 0.35);
    let bel = 1.0 - smoothstep(-0.75, -0.3, N.y);
    alb = mix(dorsal, srgb(vec3f(0.78, 0.8, 0.5)) * (0.9 + 0.1 * bmp), bel * 0.9);
    alb = alb * (0.94 + 0.12 * bmp);
    rough = 0.24;
    sss = 0.28;
    N = normalize(N + vec3f(bmp, bmp * 0.5, -bmp) * 0.14);
  } else if (in.kind == 4) {
    let ln = normalize(in.lp);
    let cl = in.col.x;
    let dil = in.col.y;
    let pw = 0.52;
    let ph = 0.16 + 0.22 * dil;
    let pd = (ln.x / pw) * (ln.x / pw) + (ln.y / ph) * (ln.y / ph);
    let pupil = 1.0 - smoothstep(0.8, 1.0, pd);
    let rr = length(vec2f(ln.x, ln.y));
    var iris = mix(srgb(vec3f(0.98, 0.72, 0.14)), srgb(vec3f(0.42, 0.22, 0.04)), smoothstep(0.1, 0.8, rr));
    iris = iris * (0.75 + 0.5 * vn3(vec3f(atan2(ln.y, ln.x) * 6.0, rr * 14.0, in.seed)));
    var eye = mix(iris, vec3f(0.01), pupil);
    eye = mix(eye, vec3f(0.02), smoothstep(0.82, 0.98, rr));
    let lidT = mix(1.25, -0.9, cl);
    let lidB = mix(-1.3, -0.25, cl * 0.7);
    let lid = max(smoothstep(lidT - 0.06, lidT + 0.03, ln.y), 1.0 - smoothstep(lidB - 0.03, lidB + 0.06, ln.y));
    let skin = srgb(vec3f(0.17, 0.4, 0.1));
    alb = mix(eye, skin * 1.1, lid);
    rough = mix(0.04, 0.3, lid);
    sss = 0.2 * lid;
    let Ld = normalize(E.sunDir.xyz);
    let Rr = reflect(-normalize(V.cam.xyz - in.wp), N);
    extra = E.sunCol.rgb * E.sunDir.w * pow(max(dot(Rr, Ld), 0.0), 600.0) * 6.0 * (1.0 - lid) + skyCol(Rr) * 0.1 * (1.0 - lid);
  } else if (in.kind == 2) {
    let dots = smoothstep(0.55, 0.7, vn3(in.lp * 26.0 + in.seed * 3.0));
    alb = mix(alb, alb * 0.45, dots);
    rough = 0.7;
    sss = 0.3;
  } else {
    alb = alb * (0.88 + 0.24 * vn3(in.lp * 20.0));
    rough = 0.35;
    sss = 0.2;
  }
  let Vv = normalize(V.cam.xyz - in.wp);
  let sh = shadowAt(in.wp, N);
  let ao = mix(0.45, 1.0, smoothstep(-0.2, 0.7, N.y)) * smoothstep(0.0, 0.05, in.wp.y - terrainH(in.wp.xz) + 0.05);
  var col = shadeSurf(alb, N, Vv, in.wp, sh, ao, sss, rough, select(wet, 1.0, in.kind == 3 || in.kind == 4)) + extra;
  col = fogApply(col, in.wp);
  return vec4f(col, length(in.wp - V.cam.xyz));
}

// ============================================================ TUBES (stems, trunks, branches)
struct TuO { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) mat: f32 };
@vertex fn vs_tube(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) m: f32) -> TuO {
  var o: TuO;
  o.pos = V.vp * vec4f(p, 1.0);
  o.wp = p;
  o.n = n;
  o.uv = uv;
  o.mat = m;
  return o;
}
@fragment fn fs_tube(in: TuO) -> @location(0) vec4f {
  viewClip(in.wp);
  let N = normalize(in.n);
  var alb = srgb(vec3f(0.14, 0.30, 0.07));
  var sss = 0.35;
  var rough = 0.55;
  let m = i32(in.mat + 0.5);
  if (m == 0) {
    alb = mix(srgb(vec3f(0.10, 0.22, 0.06)), srgb(vec3f(0.30, 0.46, 0.12)), clamp(in.uv.y, 0.0, 1.0));
    alb = alb * (0.88 + 0.2 * vn2(vec2f(in.uv.x * 20.0, in.uv.y * 30.0)));
  } else if (m == 1) {
    let len = vn2(vec2f(in.uv.x * 14.0, in.uv.y * 90.0));
    alb = mix(srgb(vec3f(0.82, 0.80, 0.74)), srgb(vec3f(0.07, 0.06, 0.05)), smoothstep(0.62, 0.8, len) * 0.9);
    alb = alb * (0.9 + 0.2 * vn2(in.uv * vec2f(30.0, 6.0)));
    sss = 0.0;
    rough = 0.8;
  } else if (m == 2) {
    let gr = vn2(vec2f(in.uv.x * 26.0, in.uv.y * 12.0)) * 0.6 + vn2(vec2f(in.uv.x * 70.0, in.uv.y * 30.0)) * 0.4;
    alb = mix(srgb(vec3f(0.12, 0.08, 0.05)), srgb(vec3f(0.34, 0.25, 0.17)), gr);
    sss = 0.0;
    rough = 0.9;
  } else {
    alb = mix(srgb(vec3f(0.22, 0.28, 0.14)), srgb(vec3f(0.42, 0.40, 0.30)), clamp(in.uv.y, 0.0, 1.0));
    sss = 0.1;
  }
  alb = alb * (1.0 - 0.3 * E.wx.y);
  let Vv = normalize(V.cam.xyz - in.wp);
  let sh = shadowAt(in.wp, N);
  let ao = mix(0.35, 1.0, smoothstep(0.0, 0.4, in.wp.y - terrainH(in.wp.xz)));
  var col = shadeSurf(alb, N, Vv, in.wp, sh, ao, sss, rough, E.wx.y);
  col = fogApply(col, in.wp);
  return vec4f(col, length(in.wp - V.cam.xyz));
}

// ============================================================ FOLIAGE (leaves, petals, lily pads)
struct FO {
  @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) c1: vec3f, @location(4) c2: vec3f, @location(5) @interpolate(flat) kind: i32, @location(6) seed: f32, @location(7) wet: f32,
  @location(8) wv: vec2f,
};
fn leafW(kind: i32, v: f32) -> f32 {
  if (kind == 1) { return pow(max(sin(PI * pow(v, 0.8)), 0.0), 0.6); }
  if (kind == 4) { return pow(max(sin(PI * pow(v, 0.7)), 0.0), 0.8) * (1.0 - 0.4 * v); }
  if (kind == 5) { return 0.25 * (1.0 - v) + 0.9 * pow(max(sin(PI * pow(v, 0.6)), 0.0), 0.8); }
  if (kind == 6) { return pow(max(sin(PI * v), 0.0), 0.9); }
  if (kind == 7) { return 0.35 + 0.65 * pow(max(sin(PI * pow(v, 1.4)), 0.0), 0.7); }
  return max(sin(PI * pow(v, 0.72)), 0.0) * (1.0 - 0.25 * v);
}
@vertex fn vs_fol(@location(0) uv: vec2f, @location(1) a: vec4f, @location(2) b: vec4f, @location(3) c: vec4f, @location(4) d: vec4f, @location(5) e: vec4f, @location(6) f: vec4f) -> FO {
  let kind = i32(d.w + 0.5);
  let F = b.xyz;
  let R = c.xyz;
  let N = normalize(cross(R, F));
  let size = a.w;
  var local = vec3f(0.0);
  var nrm = N;
  var wpos = a.xyz;
  let t = E.tm.x;
  if (kind == 2 || kind == 3) {
    var r = uv.x;
    let th = uv.y * 6.2831853;
    if (kind == 2 && uv.y < 0.045 && r > 0.1) { r = 0.1; }
    let cup = r * r * 0.03 * (1.0 - f.x * 0.0);
    local = R * (cos(th) * r * size) + F * (sin(th) * r * size * f.x) + N * cup * size;
    wpos = a.xyz + local;
    wpos.y = wpos.y + waterAt(wpos.xz) + waveH(wpos.xz, t);
    nrm = N;
  } else {
    let u = uv.x;
    let v = uv.y;
    let w = leafW(kind, v) * f.x;
    let isPetal = kind == 1 || kind == 6 || kind == 7;
    var fold = abs(u) * w * 0.28 * (1.0 - v);
    if (isPetal) { fold = u * u * w * 0.5 * (0.3 + 0.7 * v) * (0.5 + 0.5 * fract(e.w * 3.7)); }
    let flut = c.w * sin(t * 5.0 + e.w * 17.0 + v * 3.0 + u) * v;
    local = R * (u * w * size) + F * (v * size) + N * ((fold + flut * 0.1) * size) - vec3f(0.0, 1.0, 0.0) * (b.w * v * v * size);
    wpos = a.xyz + local;
    nrm = normalize(N + R * (-u * 0.35 * w) + F * (-b.w * v * 0.6) * 0.5);
  }
  var o: FO;
  o.pos = V.vp * vec4f(wpos, 1.0);
  o.wp = wpos;
  o.n = nrm;
  o.uv = uv;
  o.c1 = d.xyz;
  o.c2 = e.xyz;
  o.kind = kind;
  o.seed = e.w;
  o.wet = f.y;
  o.wv = vec2f(f.x, 0.0);
  return o;
}
@fragment fn fs_fol(in: FO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  viewClip(in.wp);
  var N = normalize(in.n);
  if (!ff) { N = -N; }
  let kind = in.kind;
  var alb = in.c1;
  var sss = 0.7;
  var rough = 0.45;
  let u = in.uv.x;
  let v = in.uv.y;
  var ao = 1.0;
  if (kind == 2 || kind == 3) {
    let r = u;
    let th = v * 6.2831853;
    let vein = pow(0.5 + 0.5 * cos(th * 14.0), 12.0) * smoothstep(0.1, 0.9, r);
    alb = mix(in.c1, in.c2, r * r) * (0.8 + 0.5 * vn2(vec2f(r * 6.0, th * 3.0)));
    alb = mix(alb, alb * 1.5, vein * 0.5);
    alb = alb * (0.35 + 0.65 * smoothstep(0.0, 0.18, 1.0 - r));
    N = normalize(vec3f(0.0, 1.0, 0.0) + 0.0 * N);
    rough = 0.3;
    sss = 0.4;
  } else if (kind == 1 || kind == 6 || kind == 7) {
    let g = clamp(v * 0.9 + abs(u) * 0.25, 0.0, 1.0);
    alb = mix(in.c1, in.c2, smoothstep(0.0, 1.0, g));
    let vein = pow(0.5 + 0.5 * cos(u * 22.0 + sin(v * 3.0) * 0.5), 10.0) * (0.3 + 0.7 * v);
    alb = alb * (1.0 - 0.15 * vein);
    alb = mix(alb, in.c1 * 0.55, (1.0 - smoothstep(0.0, 0.15, v)) * 0.6);
    sss = 1.0;
    rough = 0.5;
    ao = 0.65 + 0.35 * smoothstep(0.0, 0.3, v);
  } else {
    let w = max(leafW(kind, v) * in.wv.x, 0.001);
    let rel = abs(u);
    let mid = 1.0 - smoothstep(0.0, 0.07, rel);
    let side = pow(0.5 + 0.5 * cos((v * 9.0 - rel * 2.2) * PI), 14.0) * smoothstep(0.05, 0.4, rel) * 0.5;
    alb = mix(in.c1, in.c2, smoothstep(0.0, 1.0, v));
    alb = alb * (0.88 + 0.2 * vn2(vec2f(u * 9.0, v * 14.0) + in.seed * 9.0));
    alb = mix(alb, alb * vec3f(1.5, 1.45, 1.0), (mid * 0.55 + side * 0.35));
    alb = alb * (1.0 - 0.25 * smoothstep(0.7, 1.0, rel));
    ao = 0.55 + 0.45 * smoothstep(0.0, 0.4, v + 0.2 * (1.0 - in.wp.y));
    ao = ao * smoothstep(0.0, 0.5, in.wp.y - terrainH(in.wp.xz) + 0.35);
  }
  alb = alb * (1.0 - 0.18 * in.wet);
  let Vv = normalize(V.cam.xyz - in.wp);
  let sh = shadowAt(in.wp, N);
  var col = shadeSurf(alb, N, Vv, in.wp, sh, ao, sss, rough - 0.15 * in.wet, max(in.wet, E.wx.y * 0.8));
  col = fogApply(col, in.wp);
  return vec4f(col, length(in.wp - V.cam.xyz));
}

// ============================================================ CREATURES
struct CO { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) part: f32, @location(4) cA: vec3f, @location(5) cB: vec3f, @location(6) @interpolate(flat) kind: i32, @location(7) lp: vec3f };
@vertex fn vs_cre(@location(0) p: vec3f, @location(1) nn: vec3f, @location(2) uv: vec2f, @location(3) part: f32,
                  @location(4) a: vec4f, @location(5) b: vec4f, @location(6) c: vec4f, @location(7) d: vec4f, @location(8) e: vec4f) -> CO {
  var lp = p;
  var ln = nn;
  let pi = i32(part + 0.5);
  if (pi >= 1 && pi <= 4) {
    let side = select(-1.0, 1.0, (pi % 2) == 1);
    let ang = side * (e.w + c.w * sin(b.w + select(0.0, 0.7, pi > 2)));
    let ca = cos(ang);
    let sa = sin(ang);
    lp = vec3f(p.x * ca - p.y * sa, p.x * sa + p.y * ca, p.z);
    ln = vec3f(nn.x * ca - nn.y * sa, nn.x * sa + nn.y * ca, nn.z);
  }
  let F = b.xyz;
  let R = c.xyz;
  let U = normalize(cross(F, R));
  let w = a.xyz + (R * lp.x + U * lp.y + F * lp.z) * a.w;
  var o: CO;
  o.pos = V.vp * vec4f(w, 1.0);
  o.wp = w;
  o.n = normalize(R * ln.x + U * ln.y + F * ln.z);
  o.uv = uv;
  o.part = part;
  o.cA = d.xyz;
  o.cB = e.xyz;
  o.kind = i32(d.w + 0.5);
  o.lp = p;
  return o;
}
@fragment fn fs_cre(in: CO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  viewClip(in.wp);
  var N = normalize(in.n);
  if (!ff) { N = -N; }
  let pi = i32(in.part + 0.5);
  var alb = in.cA;
  var rough = 0.5;
  var sss = 0.2;
  let k = in.kind;
  var alpha = 1.0;
  if (pi >= 1 && pi <= 4) {
    sss = 0.8;
    if (k == 0) {
      let r = length(in.uv - vec2f(0.0, 0.0));
      let edge = smoothstep(0.75, 0.95, in.uv.x + 0.3 * in.uv.y);
      alb = mix(in.cA, in.cB, edge);
      alb = mix(alb, srgb(vec3f(0.95, 0.93, 0.85)), smoothstep(0.8, 0.9, vn2(in.uv * 9.0 + in.wp.x)) * 0.0 + step(0.9, fract(in.uv.x * 6.0 + in.uv.y * 3.0)) * 0.0);
      let vein = pow(0.5 + 0.5 * cos(in.uv.y * 30.0 + in.uv.x * 6.0), 12.0);
      alb = alb * (1.0 - 0.3 * vein);
      let spot = 1.0 - smoothstep(0.05, 0.09, length(in.uv - vec2f(0.6, 0.45)));
      alb = mix(alb, vec3f(0.02), spot * 0.7);
    } else if (k == 4) {
      alb = mix(in.cA * 0.7, in.cB, in.uv.y);
      sss = 0.3;
    } else {
      alb = mix(vec3f(0.85, 0.9, 0.95), in.cA, select(0.0, 0.3, k == 3));
      let vein = pow(0.5 + 0.5 * cos(in.uv.y * 40.0), 18.0) + pow(0.5 + 0.5 * cos(in.uv.x * 14.0), 18.0);
      alpha = 0.22 + 0.5 * vein;
      rough = 0.15;
    }
  } else if (pi == 7) {
    alb = vec3f(0.01);
    rough = 0.05;
  } else if (pi == 6) {
    alb = vec3f(0.85, 0.6, 0.15);
  } else {
    if (k == 1) {
      let stripe = smoothstep(0.45, 0.55, sin(in.uv.y * 24.0));
      alb = mix(in.cA, in.cB, stripe);
      alb = alb * (0.85 + 0.3 * vn3(in.lp * 60.0));
      rough = 0.6;
    } else if (k == 2) {
      alb = in.cA;
      let sp = smoothstep(0.06, 0.04, length(fract(in.lp.xz * 9.0 + 0.5) - 0.5));
      if (in.lp.y > 0.0) { alb = mix(alb, vec3f(0.02), sp * step(0.15, abs(in.lp.x) + abs(in.lp.z) * 0.5)); }
      alb = mix(alb, vec3f(0.02), (1.0 - smoothstep(0.0, 0.05, abs(in.lp.x))) * 0.8 * step(0.0, in.lp.y));
      rough = 0.1;
    } else if (k == 3) {
      alb = mix(in.cA, in.cB, 0.5 + 0.5 * sin(in.lp.z * 30.0));
      rough = 0.2;
    } else if (k == 4) {
      alb = mix(in.cA, in.cB, smoothstep(0.1, -0.3, in.lp.y + 0.15 * in.lp.z));
      alb = alb * (0.85 + 0.3 * vn3(in.lp * 40.0));
      sss = 0.35;
    } else if (k == 5) {
      alb = mix(in.cA, in.cB, smoothstep(0.0, -0.5, in.lp.y));
      alb = alb * (0.7 + 0.5 * vn3(in.lp * 25.0));
      rough = 0.2;
      sss = 0.3;
    } else {
      alb = mix(in.cA, in.cB, smoothstep(0.1, -0.2, in.lp.y));
    }
  }
  if (alpha < 0.999) {
    let dth = fract(sin(dot(in.pos.xy, vec2f(12.9898, 78.233))) * 43758.5453);
    if (dth > alpha) { discard; }
  }
  let Vv = normalize(V.cam.xyz - in.wp);
  var sh = shadowAt(in.wp, N);
  if (pi >= 1 && pi <= 4) { sh = mix(sh, 1.0, 0.85); }
  var col = shadeSurf(alb, N, Vv, in.wp, sh, 1.0, sss, rough, E.wx.y * 0.5);
  col = fogApply(col, in.wp);
  return vec4f(col, length(in.wp - V.cam.xyz));
}

// ============================================================ WATER
struct WO { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) uv: vec2f };
@vertex fn vs_water(@location(0) uv: vec2f) -> WO {
  let xz = PC + (uv - 0.5) * WG;
  var y = WATER_Y + waterAt(xz) + waveH(xz, E.tm.x);
  var o: WO;
  let wp = vec3f(xz.x, y, xz.y);
  o.pos = V.vp * vec4f(wp, 1.0);
  o.wp = wp;
  o.uv = uv;
  return o;
}
@fragment fn fs_water(in: WO) -> @location(0) vec4f {
  let wp = in.wp;
  let tH = terrainH(wp.xz);
  let depth = WATER_Y - tH;
  let pd = pondD(wp.xz);
  if (depth <= 0.0 || pd > 0.7) { discard; }
  let e = 0.06;
  let hx = waterAt(wp.xz + vec2f(e, 0.0)) - waterAt(wp.xz - vec2f(e, 0.0)) + waveH(wp.xz + vec2f(e, 0.0), E.tm.x) - waveH(wp.xz - vec2f(e, 0.0), E.tm.x);
  let hz = waterAt(wp.xz + vec2f(0.0, e)) - waterAt(wp.xz - vec2f(0.0, e)) + waveH(wp.xz + vec2f(0.0, e), E.tm.x) - waveH(wp.xz - vec2f(0.0, e), E.tm.x);
  let N = normalize(vec3f(-hx * 3.0, 2.0 * e, -hz * 3.0));
  let Vv = normalize(V.cam.xyz - wp);
  let fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, Vv), 0.0), 5.0);
  let sc = V.vp * vec4f(wp, 1.0);
  var uv = sc.xy / sc.w * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
  uv = uv + N.xz * 0.04;
  var refl = textureSampleLevel(rfTex, linSmp, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  let L = normalize(E.sunDir.xyz);
  let bottomN = vec3f(0.0, 1.0, 0.0);
  var bottom = mix(srgb(vec3f(0.30, 0.25, 0.15)), srgb(vec3f(0.10, 0.24, 0.07)), smoothstep(0.52, 0.72, fbm2(wp.xz * 2.4 + 3.0))) * (0.7 + 0.6 * vn2(wp.xz * 8.0));
  let caus = pow(0.5 + 0.5 * sin(wp.x * 9.0 + sin(wp.z * 7.0 + E.tm.x * 1.3) * 2.0 + E.tm.x), 6.0) * 0.5;
  let sunl = E.sunCol.rgb * E.sunDir.w * max(L.y, 0.0) * cloudSh(wp);
  bottom = bottom * (E.ambient.rgb * 1.5 + sunl * (0.5 + caus));
  let deepc = srgb(vec3f(0.03, 0.12, 0.10)) * (E.ambient.rgb * 2.2 + sunl * 0.25);
  let tr = exp(-depth * 1.15);
  var body = mix(deepc, bottom, tr);
  let tint = vec3f(0.55, 0.85, 0.6);
  body = body * mix(vec3f(1.0), tint, 1.0 - tr);
  var col = mix(body, refl, clamp(fres * 0.9 + 0.1, 0.0, 1.0));
  let Hh = normalize(L + Vv);
  col = col + sunl * pow(max(dot(N, Hh), 0.0), 300.0) * 3.0;
  let foam = (1.0 - smoothstep(0.0, 0.025, depth)) * (0.6 + 0.4 * vn2(wp.xz * 20.0 + E.tm.x * 0.3));
  col = mix(col, vec3f(0.8, 0.85, 0.85) * (E.ambient.rgb * 2.0 + sunl * 0.3), foam * 0.2);
  col = fogApply(col, wp);
  let alpha = smoothstep(0.0, 0.06, depth) * 0.97;
  return vec4f(col, alpha);
}

// ============================================================ WEATHER BILLBOARDS
struct RO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) a: f32 };
fn quadC(vi: u32) -> vec2f {
  var c = array<vec2f, 6>(vec2f(-1.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(-1.0, 0.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  return c[vi];
}
@vertex fn vs_rain(@builtin(instance_index) ii: u32, @builtin(vertex_index) vi: u32) -> RO {
  let id = f32(ii);
  let c = E.grassC.xy;
  let R = 9.0;
  let HH = 14.0;
  let spd = 9.0 + 4.0 * h11(id * 3.1);
  let ph = fract(h11(id * 5.7) - E.tm.x * spd / HH);
  let wd = vec2f(E.wind.x, E.wind.y) * E.wind.z * 4.0;
  let xz = vec2f(c.x + (h11(id * 1.7 + 0.3) * 2.0 - 1.0) * R, c.y + (h11(id * 2.3 + 1.1) * 2.0 - 1.0) * R);
  let p = vec3f(xz.x + wd.x * (1.0 - ph) * HH / spd, ph * HH, xz.y + wd.y * (1.0 - ph) * HH / spd);
  let dir = normalize(vec3f(wd.x * 0.25, -1.0, wd.y * 0.25));
  let q = quadC(vi);
  let toCam = normalize(V.cam.xyz - p);
  let right = normalize(cross(dir, toCam));
  let wpos = p - dir * (q.y * 0.5) + right * q.x * 0.0028;
  var o: RO;
  o.pos = V.vp * vec4f(wpos, 1.0);
  o.uv = q;
  let dd = length(p - V.cam.xyz);
  o.a = (0.3 + 0.2 * E.wx.w) * smoothstep(0.6, 2.5, dd) * (1.0 - smoothstep(6.0, 12.0, dd)) * smoothstep(0.0, 0.5, p.y - terrainH(p.xz));
  return o;
}
@fragment fn fs_rain(in: RO) -> @location(0) vec4f {
  let a = in.a * (1.0 - abs(in.uv.x)) * (0.3 + 0.7 * in.uv.y);
  return vec4f(vec3f(0.75, 0.82, 0.95) * a, a);
}
@vertex fn vs_splash(@builtin(instance_index) ii: u32, @builtin(vertex_index) vi: u32) -> RO {
  let id = f32(ii);
  let c = E.grassC.xy;
  let R = 8.0;
  let xz = vec2f(c.x + (h11(id * 1.3 + 0.7) * 2.0 - 1.0) * R, c.y + (h11(id * 2.9 + 4.1) * 2.0 - 1.0) * R);
  let ph = fract(E.tm.x * 1.7 + h11(id * 4.4));
  var y = terrainH(xz) + 0.012;
  if (pondD(xz) < -0.05) { y = WATER_Y + 0.01; }
  let q = quadC(vi);
  let sz = 0.02 + ph * 0.13;
  let corner = vec2f(q.x, q.y * 2.0 - 1.0);
  let wpos = vec3f(xz.x + corner.x * sz, y, xz.y + corner.y * sz);
  var o: RO;
  o.pos = V.vp * vec4f(wpos, 1.0);
  o.uv = corner;
  o.a = (1.0 - ph) * (1.0 - ph) * 0.55 * (1.0 - smoothstep(4.0, 8.0, length(wpos - V.cam.xyz)));
  return o;
}
@fragment fn fs_splash(in: RO) -> @location(0) vec4f {
  let r = length(in.uv);
  let ring = (1.0 - smoothstep(0.0, 0.2, abs(r - 0.75))) * (1.0 - smoothstep(0.85, 1.0, r));
  let a = ring * in.a;
  return vec4f(vec3f(0.85, 0.9, 1.0) * a, a);
}
struct BBO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f };
@vertex fn vs_bb(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> BBO {
  let q = quadC(vi);
  let c = vec2f(q.x, q.y * 2.0 - 1.0);
  let wpos = a.xyz + (V.camR.xyz * c.x + V.camU.xyz * c.y) * a.w;
  var o: BBO;
  o.pos = V.vp * vec4f(wpos, 1.0);
  o.uv = c;
  o.col = b;
  return o;
}
@fragment fn fs_bb(in: BBO) -> @location(0) vec4f {
  let g = exp(-dot(in.uv, in.uv) * 3.5);
  let a = g * in.col.a;
  return vec4f(in.col.rgb * a, a);
}

// ============================================================ POST
struct PU { p0: vec4f, p1: vec4f, p2: vec4f };
@group(0) @binding(0) var hdr: texture_2d<f32>;
@group(0) @binding(1) var pSmp: sampler;
@group(0) @binding(2) var<uniform> PP: PU;
struct PO2 { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs_post(@builtin(vertex_index) vi: u32) -> PO2 {
  var c = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: PO2;
  o.pos = vec4f(c[vi], 0.0, 1.0);
  o.uv = vec2f(c[vi].x * 0.5 + 0.5, 0.5 - c[vi].y * 0.5);
  return o;
}
fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
@fragment fn fs_post(in: PO2) -> @location(0) vec4f {
  let dim = vec2f(textureDimensions(hdr));
  let px = in.uv * dim;
  let c0 = textureSampleLevel(hdr, pSmp, in.uv, 0.0);
  let focus = PP.p0.x;
  let ap = PP.p0.y;
  let depth = min(c0.a, 400.0);
  var coc = clamp(abs(depth - focus) / max(depth, 0.5) * ap, 0.0, 9.0);
  var col = vec3f(0.0);
  var wsum = 0.0;
  let n = 20;
  if (coc < 1.2) {
    col = c0.rgb;
    wsum = 1.0;
  } else {
    for (var i = 0; i < n; i = i + 1) {
      let fi = f32(i) + 0.5;
      let r = sqrt(fi / f32(n)) * coc;
      let a = fi * 2.399963;
      let o = vec2f(cos(a), sin(a)) * r;
      let s = textureSampleLevel(hdr, pSmp, (px + o) / dim, 0.0);
      let sc = clamp(abs(min(s.a, 400.0) - focus) / max(min(s.a, 400.0), 0.5) * ap, 0.0, 9.0);
      let w = select(0.15, 1.0, sc >= r * 0.8) ;
      col = col + s.rgb * w;
      wsum = wsum + w;
    }
    col = col / wsum;
  }
  let mb = PP.p1.xy;
  if (length(mb) > 0.5) {
    var acc = col;
    for (var i = 1; i < 6; i = i + 1) {
      let t = f32(i) / 6.0 - 0.5;
      acc = acc + textureSampleLevel(hdr, pSmp, (px + mb * t) / dim, 0.0).rgb;
    }
    col = acc / 6.0;
  }
  if (coc < 1.2) {
    let bl = (textureSampleLevel(hdr, pSmp, (px + vec2f(1.0, 0.0)) / dim, 0.0).rgb + textureSampleLevel(hdr, pSmp, (px - vec2f(1.0, 0.0)) / dim, 0.0).rgb + textureSampleLevel(hdr, pSmp, (px + vec2f(0.0, 1.0)) / dim, 0.0).rgb + textureSampleLevel(hdr, pSmp, (px - vec2f(0.0, 1.0)) / dim, 0.0).rgb) * 0.25;
    col = max(col + (col - bl) * 0.55, vec3f(0.0));
  }
  col = col * PP.p0.z;
  col = col + vec3f(0.75, 0.8, 1.0) * PP.p1.z * 0.25;
  let v = in.uv * 2.0 - 1.0;
  col = col * (1.0 - 0.28 * dot(v, v) * 0.5);
  var o = aces(col);
  o = pow(o, vec3f(1.0 / 2.2));
  let g = fract(sin(dot(px + PP.p1.w, vec2f(12.9898, 78.233))) * 43758.5453);
  o = o + (g - 0.5) / 160.0;
  return vec4f(o, 1.0);
}
`;

const COMPUTE_WGSL=`struct Env {
  lightVP: mat4x4f,
  sunDir: vec4f, sunCol: vec4f, skyTop: vec4f, skyHor: vec4f, ambient: vec4f, fogCol: vec4f, skyS: vec4f, moon: vec4f,
  wind: vec4f, wx: vec4f, tm: vec4f, params: vec4f, cloud: vec4f, grassC: vec4f,
  push: array<vec4f, 16>, pushV: array<vec4f, 16>, ripples: array<vec4f, 16>, occ: array<vec4f, 16>,
};
const GS = 9.0;
const PC = vec2f(0.0, 0.0);
const WG = 9.0;
@group(0) @binding(0) var<uniform> E: Env;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;

@compute @workgroup_size(8, 8) fn cs_bend(@builtin(global_invocation_id) id: vec3u) {
  let N = 96u;
  if (id.x >= N || id.y >= N) { return; }
  let i = id.y * N + id.x;
  let s = src[i];
  let cell = 2.0 * GS / f32(N);
  let p = (vec2f(id.xy) + 0.5) * cell - GS;
  var f = vec2f(0.0);
  for (var k = 0; k < 16; k = k + 1) {
    let pu = E.push[k];
    if (pu.w > 0.0) {
      let d = p - pu.xz;
      let r = length(d);
      if (r < pu.w) {
        let fall = 1.0 - r / pu.w;
        let dir = d / max(r, 0.001);
        let pv = E.pushV[k];
        f = f + dir * fall * fall * pv.w * 90.0 + pv.xz * fall * 25.0 * min(pv.w, 1.5);
      }
    }
  }
  let xm = src[id.y * N + max(id.x, 1u) - 1u].xy;
  let xp = src[id.y * N + min(id.x + 1u, N - 1u)].xy;
  let ym = src[(max(id.y, 1u) - 1u) * N + id.x].xy;
  let yp = src[min(id.y + 1u, N - 1u) * N + id.x].xy;
  let avg = (xm + xp + ym + yp) * 0.25;
  let dt = min(E.tm.y, 0.033);
  let k = 55.0;
  let c = 7.5 - E.wx.x * 0.0;
  var pos = s.xy;
  var vel = s.zw;
  let a = f - k * pos - c * vel + (avg - pos) * 160.0;
  vel = vel + a * dt;
  pos = pos + vel * dt;
  let m = length(pos);
  if (m > 0.35) { pos = pos * (0.35 / m); }
  dst[i] = vec4f(pos, vel);
}

@compute @workgroup_size(8, 8) fn cs_water(@builtin(global_invocation_id) id: vec3u) {
  let N = 128u;
  if (id.x >= N || id.y >= N) { return; }
  let i = id.y * N + id.x;
  let s = src[i];
  let xm = src[id.y * N + max(id.x, 1u) - 1u].x;
  let xp = src[id.y * N + min(id.x + 1u, N - 1u)].x;
  let ym = src[(max(id.y, 1u) - 1u) * N + id.x].x;
  let yp = src[min(id.y + 1u, N - 1u) * N + id.x].x;
  let avg = (xm + xp + ym + yp) * 0.25;
  var h = s.x;
  var v = s.y;
  v = (v + (avg - h) * 0.5) * 0.994;
  h = h + v;
  let cell = WG / f32(N);
  let p = PC + (vec2f(id.xy) + 0.5) * cell - WG * 0.5;
  for (var k = 0; k < 16; k = k + 1) {
    let r = E.ripples[k];
    if (r.w > 0.0) {
      let d = length(p - r.xy);
      if (d < r.w) {
        let q = 1.0 - d / r.w;
        v = v - q * q * r.z;
      }
    }
  }
  let ed = min(min(f32(id.x), f32(N - 1u - id.x)), min(f32(id.y), f32(N - 1u - id.y)));
  let damp = clamp(ed / 6.0, 0.0, 1.0);
  h = h * damp;
  v = v * damp;
  h = clamp(h, -0.2, 0.2);
  dst[i] = vec4f(h, v, 0.0, 0.0);
}
`;