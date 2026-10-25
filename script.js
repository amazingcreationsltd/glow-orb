const MIN_SIZE = 240;

const STATE_TABLE = {
  idle: {
    speed: 0.3,
    warp: 0.52,
    ridge: 0.48,
    sharp: 0.9,
    zoom: 0.94,
    exposure: 0.68,
    mute: 0.4,
    glow: 0.16,
    rim: 0.55,
    hear: 0,
    voice: 0,
    fade: 1,
  },
  listening: {
    speed: 0.55,
    warp: 0.66,
    ridge: 0.7,
    sharp: 1.0,
    zoom: 1.0,
    exposure: 1.04,
    mute: 0,
    glow: 0.38,
    rim: 0.85,
    hear: 1,
    voice: 0,
    fade: 1,
  },
  thinking: {
    speed: 1.0,
    warp: 1.0,
    ridge: 1.0,
    sharp: 1.0,
    zoom: 1.0,
    exposure: 1.0,
    mute: 0,
    glow: 0.34,
    rim: 0.8,
    hear: 0,
    voice: 0,
    fade: 1,
  },
  speaking: {
    speed: 0.78,
    warp: 0.72,
    ridge: 0.9,
    sharp: 1.0,
    zoom: 1.0,
    exposure: 0.96,
    mute: 0,
    glow: 0.42,
    rim: 0.8,
    hear: 0,
    voice: 1,
    fade: 1,
  },
};

const VERT = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform float uSize, uPhase, uLevel, uWarp, uRidge, uSharp, uZoom, uExposure, uGlow, uRim, uHear, uFade;
uniform vec3 uColA, uColB, uColC, uColD, uHi, uCool, uWarm, uGlowCol;
uniform sampler2D uWaveTex;

const float RAD = 0.86;
const float SOFT = 0.005;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03;
    a *= 0.5;
  }
  return s / 0.9375;
}

vec2 band(vec2 q, float drift, float offset, float amp, float mainY, float env, float soft) {
  float u = clamp(q.x * 0.5 + 0.5, 0.0, 1.0);
  float realWave = (texture2D(uWaveTex, vec2(u, 0.5)).r - 0.5) * 2.0;
  float y = env * (amp * sin(q.x * 1.0 + drift + offset) + realWave * uLevel * 0.28);
  float d = abs(q.y - y);
  float line = 0.018 / (sqrt(d * d + soft * soft) + 0.026);
  float bd = max(0.0, max(q.y - max(mainY, y), min(mainY, y) - q.y));
  float fillB = 0.014 / (bd * bd * 5.0 + 0.06);
  return vec2(line, fillB);
}

vec3 sheet(vec2 p, float t) {
  float scale = 0.74 + uZoom * 0.34;
  vec2 q = p / scale;
  vec2 w = vec2(fbm(q * 1.1 + vec2(0.0, t * 0.09)), fbm(q * 1.1 + vec2(7.7, -t * 0.07))) - 0.5;
  q += uWarp * 0.075 * w;
  float envB = cos(1.57079633 * min(abs(0.9 * q.x), 1.0));
  float env = envB * envB;
  float low = 0.5 + 0.5 * cos(t * 0.37) + uLevel * 0.6;
  float mid = 0.5 + 0.5 * sin(t * 0.51 + 1.2) + uLevel * 0.8;
  float high = 0.5 + 0.5 * cos(t * 0.73 + 2.1) + uLevel * 0.5;
  float drift = t * 2.4;
  float mainAmp = 0.1 + uRidge * 0.17 + low * 0.018;
  float bandAmp = mainAmp + mid * 0.025 + high * 0.018;
  float mainY = mainAmp * env * sin(q.x * 1.1 + drift);
  float sep = 1.85 + uWarp * 0.12 + mid * 0.28;
  float soft = 0.03 / max(uSharp, 0.2) + mid * 0.006;

  vec2 b0 = band(q, drift, -sep, bandAmp, mainY, env, soft);
  vec2 b1 = band(q, drift, -sep * 0.34, bandAmp, mainY, env, soft);
  vec2 b2 = band(q, drift, sep * 0.34, bandAmp, mainY, env, soft);
  vec2 b3 = band(q, drift, sep, bandAmp, mainY, env, soft);
  float w0 = b0.x + b0.y, w1 = b1.x + b1.y, w2 = b2.x + b2.y, w3 = b3.x + b3.y;
  float total = w0 + w1 + w2 + w3;
  float d0 = w0*w0, d1 = w1*w1, d2 = w2*w2, d3 = w3*w3;
  vec3 spectral = (uColA*d0 + uColC*d1 + uColB*d2 + uColD*d3) / max(d0+d1+d2+d3, 0.0001);
  float energy = (1.0 - exp(-max(total - 0.12, 0.0) * 0.75)) * env;
  float md = abs(q.y - mainY);
  float core = exp(-md * md / (0.0028 / max(uSharp, 0.2))) * env;

  float haze = fbm(q * 1.6 + vec2(t * 0.05, -t * 0.03));
  vec3 atmos = mix(uColD, uColB, smoothstep(-0.7, 0.7, q.y)) * (0.012 + 0.022 * haze);
  atmos += mix(uColA, uColC, haze) * 0.035 * exp(-q.y * q.y * 7.0) * haze;

  vec3 col = atmos + spectral * energy * 1.14;
  col += uHi * core * (0.2 + 0.1 * low);
  col = col / (1.0 + col * 0.18);
  col = mix(col, uHi, 0.06 * smoothstep(0.15, 1.15, dot(p, vec2(-0.32, 0.78))));
  col *= 1.0 - 0.3 * smoothstep(-0.1, 1.2, dot(p, vec2(0.45, -0.62)));
  return col;
}

float profile(float t) { float d = clamp(t, 0.0, 1.0); return 1.0 - sqrt(max(1.0 - (1.0 - d)*(1.0 - d), 0.0)); }
float lobe(vec2 n, vec2 dir, float cut, float power) { return pow(clamp((dot(n, dir) - cut) / max(1.0 - cut, 0.001), 0.0, 1.0), power); }
vec3 over(vec3 dst, vec3 src, float a) { float k = clamp(a, 0.0, 1.0); return src * k + dst * (1.0 - k); }

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uSize) / uSize;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float t = uPhase;

  float contour = uHear * uLevel * (0.015 * sin(ang * 3.0 + t * 1.9) + 0.009 * sin(ang * 5.0 - t * 1.3 + 1.7));
  float rad = RAD * (1.0 + contour);

  vec3 dynamicHaloCol = mix(
    mix(uColA, uColB, 0.5 + 0.5 * sin(ang + t * 0.9)),
    mix(uColC, uColD, 0.5 + 0.5 * cos(ang * 2.0 - t * 0.7)),
    0.5
  );
  vec3 glowCol = mix(uGlowCol, dynamicHaloCol, 0.75) * (0.75 + 0.55 * uLevel);
  float glowAmt = uGlow * (1.0 + 1.25 * uLevel);

  if (r > rad * (1.01 + SOFT)) {
    vec3 halo = glowCol * glowAmt * exp(-(r - rad) * 9.5) * (1.0 - smoothstep(rad, 0.998, r));
    halo = clamp(halo, 0.0, 1.0);
    gl_FragColor = vec4(halo, max(halo.r, max(halo.g, halo.b))) * uFade;
    return;
  }

  vec2 p = uv / rad;
  float pd = length(p);
  vec2 n = pd > 0.0001 ? p / pd : vec2(0.0);
  float edge = max(1.0 - pd, 0.0);
  float prof = pow(profile(edge / 0.3), 0.68);
  vec2 rp = p - n * prof * 0.5;

  vec3 fcol;
  if (prof > 0.002) {
    float split = 0.12 * prof;
    fcol = vec3(sheet(rp - n * split, t).r, sheet(rp, t).g, sheet(rp + n * split, t).b);
  } else {
    fcol = sheet(p, t);
  }

  float lum = dot(fcol, vec3(0.213, 0.715, 0.072));
  vec3 col = clamp(vec3(lum) + (fcol - vec3(lum)) * 1.18, 0.0, 1.0);

  float rimReact = uRim * (1.0 + 0.45 * uHear * uLevel);
  float surfW = 0.035 + 0.03 * uHear * uLevel;
  float surf = 1.0 - smoothstep(0.0, surfW, edge);
  float optical = pow(surf, 1.8);
  col = over(col, mix(uColA, uHi, 0.5) * 0.35, optical * 0.1 * rimReact);

  float coolS = lobe(n, normalize(vec2(0.84, 0.54)), 0.05, 1.6);
  float warmS = lobe(n, normalize(vec2(-0.62, -0.78)), 0.05, 1.8);
  float disp = optical * 0.5 * rimReact;
  col = over(col, uCool, disp * coolS);
  col = over(col, uWarm, disp * warmS);

  col *= 1.0 - optical * 0.12 * (0.15 + 0.85 * max(dot(n, vec2(0.45, -0.89)), 0.0));
  float key = optical * lobe(n, normalize(vec2(-0.68, 0.73)), 0.2, 2.8) * 0.6 * rimReact;
  float fillL = optical * lobe(n, normalize(vec2(0.74, -0.67)), 0.4, 3.6) * 0.4 * rimReact;
  col = over(col, mix(uHi, vec3(1.0), 0.35), key);
  col = over(col, mix(uColC, uHi, 0.55), fillL);

  col *= 1.0 - 0.4 * smoothstep(0.95, 1.0, pd);
  col += mix(uColA, uColB, 0.3 + 0.3 * sin(ang + t * 0.6)) * optical * 0.3 * uHear * uLevel;

  float spec = exp(-dot(p - vec2(-0.38, 0.46), p - vec2(-0.38, 0.46)) * 22.0);
  col += uHi * spec * 0.07 * uRim;

  float ballA = 1.0 - smoothstep(0.99 - SOFT, 1.01 + SOFT, pd);
  col = clamp(col * max(uExposure, 0.0), 0.0, 1.0) * ballA;
  float outside = smoothstep(rad - SOFT, rad + SOFT, r);
  col += glowCol * glowAmt * exp(-max(r - rad, 0.0) * 9.5) * (1.0 - smoothstep(rad, 0.998, r)) * outside;
  col = clamp(col, 0.0, 1.0);
  float a = clamp(max(ballA, max(col.r, max(col.g, col.b))), 0.0, 1.0);
  gl_FragColor = vec4(col, a) * uFade;
}`;

const hexToRgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mixRgb = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const toUnit = ([r, g, b]) => [r / 255, g / 255, b / 255];
const rotateHue = ([r, g, b], deg) => {
  const a = (deg * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    k = 1 / 3,
    q = Math.sqrt(k);
  const m0 = c + (1 - c) * k,
    m1 = k * (1 - c) - q * s,
    m2 = k * (1 - c) + q * s;
  const cl = (v) => Math.min(255, Math.max(0, v));
  return [
    cl(r * m0 + g * m1 + b * m2),
    cl(r * m2 + g * m0 + b * m1),
    cl(r * m1 + g * m2 + b * m0),
  ];
};
const muteRgb = (rgb, amt) => {
  const lum = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return mixRgb(rgb, [lum, lum, lum], amt);
};
const buildPalette = (from, to, mute) => {
  const a = muteRgb(from, mute),
    b = muteRgb(to, mute);
  const c = muteRgb(rotateHue(mixRgb(from, to, 0.35), -38), mute);
  const d = muteRgb(rotateHue(mixRgb(from, to, 0.65), 42), mute);
  const mid = mixRgb(a, b, 0.5),
    W = [255, 255, 255];
  return {
    a: toUnit(a),
    b: toUnit(b),
    c: toUnit(c),
    d: toUnit(d),
    hi: toUnit(mixRgb(mid, W, 0.82)),
    cool: toUnit(mixRgb(a, W, 0.15)),
    warm: toUnit(mixRgb(d, W, 0.1)),
    glow: toUnit(mid),
  };
};

const canvas = document.getElementById("orb");
const haloOuter = document.getElementById("haloOuter");
const haloInner = document.getElementById("haloInner");

const orbitCanvas = document.getElementById("binaryOrbits");
const orbitCtx = orbitCanvas.getContext("2d");
let orbitStars = [];
let orbitWidth = 540, orbitHeight = 420;
let particleDensity = 520, particleSpeed = 1, particleSpread = 50, particleGlow = 1;

function getOrbRadiusInParticleSpace() {
  const orbBaseWidth = canvas.offsetWidth || 240;
  const particleBaseWidth = orbitCanvas.clientWidth || 540;
  return (orbBaseWidth * 0.5 * 0.84) / Math.max(1, particleBaseWidth) * orbitWidth;
}

function makeHaloParticle() {
  const angle = Math.random() * Math.PI * 2;
  const edge = getOrbRadiusInParticleSpace();
  return {
    angle,
    radius: edge + Math.random() * 2,
    radialSpeed: 4.5 + Math.random() * 6.5,
    angularSpeed: (Math.random() < 0.5 ? -1 : 1) * (0.035 + Math.random() * 0.11),
    size: Math.random() < 0.07 ? 0.85 + Math.random() * 0.65 : 0.2 + Math.random() * 0.48,
    alpha: 0.12 + Math.random() * 0.42,
    phase: Math.random() * Math.PI * 2,
    hue: [218, 232, 248, 260, 275, 290][Math.floor(Math.random() * 6)],
    age: 0,
    life: 2.5 + Math.random() * 4.5
  };
}

function resizeOrbitCanvas() {
  const rect = orbitCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  orbitWidth = rect.width || 540;
  orbitHeight = rect.height || 420;
  orbitCanvas.width = Math.round(orbitWidth * dpr);
  orbitCanvas.height = Math.round(orbitHeight * dpr);
  orbitCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  orbitStars = orbitStars.filter(star => star.age < 1);
}
resizeOrbitCanvas();
window.addEventListener("resize", resizeOrbitCanvas);

const particleControls = {
  density: document.getElementById("particleDensity"),
  speed: document.getElementById("particleSpeed"),
  spread: document.getElementById("particleSpread"),
  glow: document.getElementById("particleGlow")
};

function updateParticleControls() {
  particleDensity = Number(particleControls.density.value);
  particleSpeed = Number(particleControls.speed.value);
  particleSpread = Number(particleControls.spread.value);
  particleGlow = Number(particleControls.glow.value);
  document.getElementById("particleDensityVal").textContent = particleDensity;
  document.getElementById("particleSpeedVal").textContent = particleSpeed.toFixed(1) + "×";
  document.getElementById("particleSpreadVal").textContent = particleSpread + "px";
  document.getElementById("particleGlowVal").textContent = Math.round(particleGlow * 100) + "%";
  document.getElementById("particleStatus").textContent = particleDensity + " particle cap";
  if (orbitStars.length > particleDensity) orbitStars.length = particleDensity;
}
Object.values(particleControls).forEach(input => input.addEventListener("input", updateParticleControls));
updateParticleControls();

let lastParticleTime = 0;
let previousParticleAudio = 0;
let lastParticleEmission = 0;

function drawBinaryOrbits(time, audioLevel = 0, orbScale = 1) {
  if (!orbitCtx) return;
  orbitCtx.clearRect(0, 0, orbitWidth, orbitHeight);
  const cx = orbitWidth / 2, cy = orbitHeight / 2;
  const dt = Math.min(0.04, Math.max(0, (time - (lastParticleTime || time)) / 1000));
  lastParticleTime = time;

  const audio = Math.max(0, Math.min(1, audioLevel));
  const rise = audio - previousParticleAudio;
  const hitThreshold = 0.085;
  const isAudioHit = audio > hitThreshold && rise > 0.018 && (time - lastParticleEmission) > 55;

  if (isAudioHit && orbitStars.length < particleDensity) {
    const strength = Math.min(1, Math.max(0, (rise - 0.018) / 0.16));
    const burstCount = Math.max(2, Math.round(3 + strength * 15));
    const available = Math.max(0, particleDensity - orbitStars.length);
    for (let n = 0; n < Math.min(burstCount, available); n++) orbitStars.push(makeHaloParticle());
    lastParticleEmission = time;
  }
  previousParticleAudio = audio;

  orbitCtx.save();
  orbitCtx.globalCompositeOperation = "lighter";
  for (let i = 0; i < orbitStars.length; i++) {
    const star = orbitStars[i];
    star.age += dt / star.life;
    star.angle += star.angularSpeed * dt * particleSpeed;
    star.radius += star.radialSpeed * dt * particleSpeed;
    const edge = getOrbRadiusInParticleSpace();
    const outerEdge = edge + particleSpread;

    if (star.age >= 1 || star.radius > outerEdge) {
      orbitStars.splice(i, 1);
      i--;
      continue;
    }

    const r = star.radius * orbScale;
    const x = cx + Math.cos(star.angle) * r;
    const y = cy + Math.sin(star.angle) * r;
    const innerFade = Math.min(1, Math.max(0, (star.radius - edge) / 3));
    const outerFade = Math.min(1, Math.max(0, (outerEdge - star.radius) / Math.min(24, particleSpread * 0.48)));
    const lifeFade = Math.sin(Math.PI * Math.min(1, star.age));
    const twinkle = 0.72 + 0.28 * Math.sin(time * 0.0012 + star.phase);
    const alpha = Math.min(1, star.alpha * innerFade * outerFade * lifeFade * twinkle * particleGlow);
    if (alpha < 0.008) continue;

    const size = star.size * (0.92 + (orbScale - 1) * 0.22);
    const bloomRadius = size * (star.size > 1 ? 5.2 : 3.4) * (0.65 + particleGlow * 0.35);
    const bloom = orbitCtx.createRadialGradient(x, y, 0, x, y, bloomRadius);
    bloom.addColorStop(0, `hsla(${star.hue}, 92%, 96%, ${alpha * 0.95})`);
    bloom.addColorStop(0.22, `hsla(${star.hue}, 90%, 84%, ${alpha * 0.38})`);
    bloom.addColorStop(1, `hsla(${star.hue}, 90%, 75%, 0)`);
    orbitCtx.fillStyle = bloom;
    orbitCtx.beginPath();
    orbitCtx.arc(x, y, bloomRadius, 0, Math.PI * 2);
    orbitCtx.fill();
    orbitCtx.fillStyle = `hsla(${star.hue}, 95%, 96%, ${Math.min(0.85, alpha * 1.15)})`;
    orbitCtx.beginPath();
    orbitCtx.arc(x, y, Math.max(0.25, size * 0.42), 0, Math.PI * 2);
    orbitCtx.fill();
  }
  orbitCtx.restore();
}

const gl = canvas.getContext("webgl", {
  alpha: true,
  premultipliedAlpha: true,
});
const compile = (t, src) => {
  const s = gl.createShader(t);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
};
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 3, -1, -1, 3]),
  gl.STATIC_DRAW,
);
const aPos = gl.getAttribLocation(prog, "aPos");
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const waveData = new Uint8Array(256).fill(128);
const waveTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, waveTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(
  gl.TEXTURE_2D,
  0,
  gl.LUMINANCE,
  256,
  1,
  0,
  gl.LUMINANCE,
  gl.UNSIGNED_BYTE,
  waveData,
);

const U = {};
[
  "uSize",
  "uPhase",
  "uLevel",
  "uWarp",
  "uRidge",
  "uSharp",
  "uZoom",
  "uExposure",
  "uGlow",
  "uRim",
  "uHear",
  "uFade",
  "uColA",
  "uColB",
  "uColC",
  "uColD",
  "uHi",
  "uCool",
  "uWarm",
  "uGlowCol",
  "uWaveTex",
].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
gl.uniform1f(U.uSize, canvas.width);
gl.uniform1i(U.uWaveTex, 0);

let currentState = "idle",
  activeMode = "speaking",
  colorFrom = "#4285F4",
  colorTo = "#EA4335";
let p = { ...STATE_TABLE.idle },
  sheetPhase = 1.7,
  haloAngle = 0,
  level = 0,
  gain = 3.5,
  sizePulse = 0.28,
  glowIntensity = 0.9;
let audioCtx, analyser, mediaSource, micStream;

const ensureAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
};

const setStateUI = (st) => {
  currentState = st;
  document.getElementById("stateBadge").textContent =
    `Min: ${MIN_SIZE}px | state: ${st}`;
  document
    .querySelectorAll(".state-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.state === st));
};

const player = document.getElementById("audioPlayer");
document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  player.src = URL.createObjectURL(file);
  player.style.display = "block";
  player.play();
});

player.addEventListener("play", () => {
  ensureAudio();
  if (!mediaSource) {
    mediaSource = audioCtx.createMediaElementSource(player);
    mediaSource.connect(analyser);
    analyser.connect(audioCtx.destination);
  }
  setStateUI(activeMode);
});
player.addEventListener("pause", () => setStateUI("idle"));
player.addEventListener("ended", () => setStateUI("idle"));

document.getElementById("micBtn").addEventListener("click", async (e) => {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
    e.target.textContent = "🎙 Use Mic";
    setStateUI("idle");
    return;
  }
  player.pause();
  ensureAudio();
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx.createMediaStreamSource(micStream).connect(analyser);
  e.target.textContent = "⏹ Stop Mic";
  setStateUI(activeMode);
});

document.getElementById("gainSlider").addEventListener("input", (e) => {
  gain = parseFloat(e.target.value);
  document.getElementById("gainVal").textContent =
    `Gain: ${gain.toFixed(1)}x`;
});

document.getElementById("pulseSlider").addEventListener("input", (e) => {
  sizePulse = parseFloat(e.target.value);
  document.getElementById("pulseVal").textContent =
    `+${Math.round(sizePulse * 100)}%`;
});

document.getElementById("glowSlider").addEventListener("input", (e) => {
  glowIntensity = parseFloat(e.target.value);
  document.getElementById("glowVal").textContent =
    `${Math.round(glowIntensity * 100)}%`;
});

const haloNoiseSlider = document.getElementById("haloNoiseSlider");
const updateHaloNoise = () => {
  const amount = Number(haloNoiseSlider.value) / 100;
  document.documentElement.style.setProperty("--halo-noise-outer", (amount * 0.26).toFixed(3));
  document.documentElement.style.setProperty("--halo-noise-inner", (amount * 0.18).toFixed(3));
  document.getElementById("haloNoiseVal").textContent = `${Math.round(amount * 100)}%`;
};
haloNoiseSlider.addEventListener("input", updateHaloNoise);
updateHaloNoise();

document.querySelectorAll(".state-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const st = btn.dataset.state;
    if (st === "speaking" || st === "listening") activeMode = st;
    setStateUI(st);
  });
});

document.querySelectorAll(".preset").forEach((btn) => {
  btn.style.setProperty("--badge-from", btn.dataset.from || "#8b83ff");
  btn.style.setProperty("--badge-to", btn.dataset.to || btn.dataset.from || "#c4b5fd");
  btn.addEventListener("click", () => {
    colorFrom = btn.dataset.from;
    colorTo = btn.dataset.to;
    const haloGrad = btn.dataset.halo;
    haloOuter.style.background = haloGrad;
    haloInner.style.background = haloGrad;

    document
      .querySelectorAll(".preset")
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    document.getElementById("meter").style.background =
      `linear-gradient(90deg, ${colorFrom}, ${colorTo})`;
  });
});

let lastTime = performance.now();
function animate(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (
    analyser &&
    (currentState === "speaking" || currentState === "listening")
  ) {
    analyser.getByteTimeDomainData(waveData);
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      const n = (waveData[i] - 128) / 128;
      sum += n * n;
    }
    const target = Math.min(1, Math.sqrt(sum / 256) * gain);
    level += (target - level) * 0.35;
  } else {
    waveData.fill(128);
    level += (0 - level) * 0.15;
  }

  const safeLevel = Math.max(0, level);
  const scale = Math.max(1, 1 + safeLevel * sizePulse);
  canvas.style.transform = `scale(${scale.toFixed(4)})`;

  haloAngle = (haloAngle + dt * (36 + safeLevel * 220)) % 360;
  const outerScale = scale * (1.05 + safeLevel * 0.36);
  const innerScale = scale * (0.96 + safeLevel * 0.2);
  haloOuter.style.transform = `scale(${outerScale.toFixed(3)}) rotate(${haloAngle.toFixed(1)}deg)`;
  haloOuter.style.opacity = Math.min(
    1,
    (0.32 + safeLevel * 0.68) * glowIntensity,
  ).toFixed(3);
  haloInner.style.transform = `scale(${innerScale.toFixed(3)}) rotate(${(-haloAngle * 1.4).toFixed(1)}deg)`;
  haloInner.style.opacity = Math.min(
    1,
    (0.45 + safeLevel * 0.55) * glowIntensity,
  ).toFixed(3);

  drawBinaryOrbits(now, safeLevel, scale);

  document.getElementById("meter").style.width =
    `${(safeLevel * 100).toFixed(1)}%`;

  gl.bindTexture(gl.TEXTURE_2D, waveTex);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    256,
    1,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    waveData,
  );

  const targetP = STATE_TABLE[currentState];
  for (const k in p) p[k] += (targetP[k] - p[k]) * Math.min(1, dt * 6);

  const voice = p.voice * safeLevel;
  sheetPhase += dt * p.speed * (1 + 0.7 * voice);

  const pal = buildPalette(
    hexToRgb(colorFrom),
    hexToRgb(colorTo),
    p.mute,
  );
  const set3 = (loc, v) => gl.uniform3f(loc, v[0], v[1], v[2]);

  gl.uniform1f(U.uPhase, sheetPhase);
  gl.uniform1f(U.uLevel, safeLevel);
  gl.uniform1f(U.uWarp, p.warp * 3.2 + 0.85 * voice);
  gl.uniform1f(
    U.uRidge,
    p.ridge + 0.35 * voice + 0.25 * p.hear * safeLevel,
  );
  gl.uniform1f(U.uSharp, p.sharp * 2.2);
  gl.uniform1f(U.uZoom, p.zoom);
  gl.uniform1f(
    U.uExposure,
    p.exposure * 1.9 * (1 + 0.12 * voice + 0.1 * p.hear * safeLevel),
  );
  gl.uniform1f(U.uGlow, p.glow * 0.55 * glowIntensity);
  gl.uniform1f(U.uRim, p.rim);
  gl.uniform1f(U.uHear, p.hear);
  gl.uniform1f(U.uFade, p.fade);
  set3(U.uColA, pal.a);
  set3(U.uColB, pal.b);
  set3(U.uColC, pal.c);
  set3(U.uColD, pal.d);
  set3(U.uHi, pal.hi);
  set3(U.uCool, pal.cool);
  set3(U.uWarm, pal.warm);
  set3(U.uGlowCol, pal.glow);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
