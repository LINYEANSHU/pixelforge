/* PixelForge 特效工厂 —— 核心命名空间与工具
 * 版本 1.0.0  |  MIT License  |  完全离线、CPU优先、零依赖
 * 设计要点：所有热路径零对象分配（TypedArray + 复用），模拟与渲染分离。
 */
(function (root) {
  'use strict';
  const PF = {
    VERSION: '1.0.0',
    APP_NAME: 'PixelForge 特效工厂',
    /* 固定时间基：所有模拟以 1/60 秒步进；渲染插值只发生在位置层面 */
    DT: 1 / 60,
    FPS: 60,
    /* 默认粒子预算（全局活动粒子数上限，可由用户调整 200..4000） */
    DEFAULT_BUDGET: 1000,
    /* 画布支持尺寸 */
    CANVAS_SIZES: [64, 128, 256, 512],
    DEFAULT_CANVAS: 256,
  };

  /* ---------- 数学工具 ---------- */
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOutCubic = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeOutQuad = t => 1 - (1 - clamp(t, 0, 1)) * (1 - clamp(t, 0, 1));
  const easeInQuad = t => { t = clamp(t, 0, 1); return t * t; };
  /* 攻击-持续-释放包络：返回 0..1 */
  function env(t, attack, sustain, release) {
    if (t <= 0) return 0;
    const end = attack + sustain + release;
    if (t >= end) return 0;
    if (t < attack) return t / Math.max(attack, 1e-6);
    if (t < attack + sustain) return 1;
    return 1 - (t - attack - sustain) / Math.max(release, 1e-6);
  }
  /* 通用 0..1 包络（快起慢落） */
  function envFast(t, dur) { return env(t, Math.min(0.06, dur * 0.12), dur * 0.1, dur * 0.78); }

  /* ---------- 颜色工具（打包 RGB 为 int，避免对象分配） ---------- */
  function hexToInt(hex) {
    if (typeof hex === 'number') return hex & 0xFFFFFF;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return parseInt(h, 16) & 0xFFFFFF;
  }
  const R = c => (c >> 16) & 255, G = c => (c >> 8) & 255, B = c => c & 255;
  function mixInt(c1, c2, t) {
    const r = (R(c1) + (R(c2) - R(c1)) * t) | 0;
    const g = (G(c1) + (G(c2) - G(c1)) * t) | 0;
    const b = (B(c1) + (B(c2) - B(c1)) * t) | 0;
    return (r << 16) | (g << 8) | b;
  }
  function intToCss(c, a) {
    a = a === undefined ? 1 : a;
    return 'rgba(' + R(c) + ',' + G(c) + ',' + B(c) + ',' + a + ')';
  }
  function intToHex(c) {
    return '#' + (c & 0xFFFFFF).toString(16).padStart(6, '0');
  }
  /* 亮度 0..1（用于光缓冲与闪烁抑制判断） */
  const luma = c => (R(c) * 0.299 + G(c) * 0.587 + B(c) * 0.114) / 255;

  PF.clamp = clamp; PF.lerp = lerp; PF.smooth = smooth;
  PF.easeOutCubic = easeOutCubic; PF.easeOutQuad = easeOutQuad; PF.easeInQuad = easeInQuad;
  PF.env = env; PF.envFast = envFast;
  PF.hexToInt = hexToInt; PF.mixInt = mixInt; PF.intToCss = intToCss; PF.intToHex = intToHex; PF.luma = luma;
  PF.chR = R; PF.chG = G; PF.chB = B;

  PF.util = { clamp, lerp, smooth, env, hexToInt, mixInt };
  if (typeof module !== 'undefined' && module.exports) module.exports = PF;
  root.PF = PF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
