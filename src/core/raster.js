/* PixelForge —— 软件光栅化（CPU，双缓冲：颜色 + 加法光）
 * 概念（颜色缓冲 + 加法光缓冲）参考 patch-gg/pixelfx，实现完全自研。
 * 所有操作写入预分配 TypedArray，热路径零对象分配。
 * 世界坐标：x,y ∈ [-1,1]，原点居中，y 向下。
 * Renderer 接口（未来 GPU 渲染器实现同一组方法即可替换）：
 *   clear() / stamp() / ring() / beam() / pixel() / fillBg() / composite()
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');
  const { clamp } = PF;

  /* 衰减查找表：64 级，t∈[0,1] */
  function makeFalloff(fn) {
    const t = new Float32Array(64);
    for (let i = 0; i < 64; i++) t[i] = fn(i / 63);
    return t;
  }
  const PT = [0, 0];
  const FALL_SOFT = makeFalloff(t => Math.pow(1 - t, 1.7));          // 柔和光斑（火焰/烟/辉光）
  const FALL_CORE = makeFalloff(t => t < 0.55 ? 1 : Math.pow(1 - (t - 0.55) / 0.45, 1.5)); // 实心核心+快速边
  const FALL_BEAM = makeFalloff(t => Math.pow(1 - t, 2.2));          // 光束横截面
  /* alpha 归一化查表：DA[k] = k/255（k 为 0..255 整数，结果与内联除法逐位一致）
   * 消除 source-over 热路径上每像素一次的除法。 */
  const DA = new Float64Array(256);
  for (let i = 0; i < 256; i++) DA[i] = i / 255;

  class CpuRaster {
    constructor(size) {
      this.size = size | 0;
      this.scale = size / 2;                 // 世界半径 1 → size/2 像素
      this.data = new Uint8ClampedArray(size * size * 4);
      this.light = new Uint8ClampedArray(size * size * 3);
      this.flashCap = 1;                     // 防剧烈闪烁：光缓冲加法上限系数（可调）
      this.lightOn = true;
    }
    resize(size) {
      this.size = size | 0; this.scale = this.size / 2;
      this.data = new Uint8ClampedArray(this.size * this.size * 4);
      this.light = new Uint8ClampedArray(this.size * this.size * 3);
    }
    clear() { this.data.fill(0); if (this.lightOn) this.light.fill(0); }

    /* 世界坐标变换栈（组合器用）：p' = p*scale + offset（世界单位） */
    pushTransform(ox, oy, s) {
      (this.tstack || (this.tstack = [])).push(this.tx !== undefined ? [this.tx, this.ty, this.ts] : null);
      this.tx = (this.tx || 0) + (ox || 0) * (this.ts || 1);
      this.ty = (this.ty || 0) + (oy || 0) * (this.ts || 1);
      this.ts = (this.ts || 1) * (s || 1);
    }
    popTransform() {
      const st = this.tstack ? this.tstack.pop() : null;
      if (st) { this.tx = st[0]; this.ty = st[1]; this.ts = st[2]; }
      else { this.tx = 0; this.ty = 0; this.ts = 1; }
    }
    _p(wx, wy, out) {
      const s = this.ts || 1;
      out[0] = (wx * s + (this.tx || 0)) * 0.5 + 0.5;
      out[1] = (wy * s + (this.ty || 0)) * 0.5 + 0.5;
      return out;
    }

    /* 预览背景填充（绝不会进入导出缓冲——导出前总是 clear） */
    fillBg(colorInt) {
      const d = this.data, r = (colorInt >> 16) & 255, g = (colorInt >> 8) & 255, b = colorInt & 255;
      for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
    }

    /* 柔和圆斑：主体颗粒。mode: 0=普通混合 1=加法 2=仅光 3=普通+不加光 */
    stamp(wx, wy, wr, colorInt, alpha, glow, mode, fall) {
      if (alpha <= 0.002 || wr <= 0) return;
      const S = this.size, sc = this.scale;
      this._p(wx, wy, PT);
      const cx = PT[0] * S, cy = PT[1] * S;
      const rp = wr * sc * (this.ts || 1);
      if (rp < 0.4) return this.pixel(wx, wy, colorInt, alpha, glow, mode);
      const r = rp | 0;
      let x0 = (cx - r) | 0, x1 = Math.ceil(cx + r), y0 = (cy - r) | 0, y1 = Math.ceil(cy + r);
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= S) x1 = S - 1; if (y1 >= S) y1 = S - 1;
      if (x1 < x0 || y1 < y0) return;
      const cr = (colorInt >> 16) & 255, cg = (colorInt >> 8) & 255, cb = colorInt & 255;
      const F = fall || FALL_SOFT, inv = 1 / (rp * rp);
      const d = this.data, L = this.light;
      const doColor = mode !== 2, doLight = this.lightOn && mode !== 3 && glow > 0;
      const a255 = alpha * 255, gl = glow * alpha;
      for (let py = y0; py <= y1; py++) {
        const dy = py - cy, dy2 = dy * dy;
        let row = py * S;
        for (let px = x0; px <= x1; px++) {
          const dx = px - cx;
          const t = (dx * dx + dy2) * inv;
          if (t >= 1) continue;
          let f = F[(t * 63) | 0];
          if (f <= 0) continue;
          const ia = row + px;
          if (doColor) {
            const i4 = ia << 2;
            if (mode === 1) {
              const add = f * a255;
              d[i4] += cr * add / 255; d[i4 + 1] += cg * add / 255; d[i4 + 2] += cb * add / 255;
              d[i4 + 3] += f * a255;   /* Uint8ClampedArray 写入自带钳制，结果与 Math.min(255,…) 一致 */
            } else {
              /* source-over，直通 alpha */
              const sa = f * a255 / 255, da = DA[d[i4 + 3]];
              const oa = sa + da * (1 - sa);
              if (oa > 0) {
                d[i4] = (cr * sa + d[i4] * da * (1 - sa)) / oa;
                d[i4 + 1] = (cg * sa + d[i4 + 1] * da * (1 - sa)) / oa;
                d[i4 + 2] = (cb * sa + d[i4 + 2] * da * (1 - sa)) / oa;
              }
              d[i4 + 3] = oa * 255;
            }
          }
          if (doLight) {
            const i3 = ia * 3, add = f * gl;
            L[i3] += cr * add; L[i3 + 1] += cg * add; L[i3 + 2] += cb * add;
          }
        }
      }
    }

    /* 冲击环：分析式圆带，halfW 为世界单位半宽 */
    ring(wx, wy, rWorld, halfW, colorInt, alpha, glow, mode, fall) {
      if (alpha <= 0.002 || halfW <= 0 || rWorld < 0) return;
      const S = this.size, sc = this.scale;
      this._p(wx, wy, PT);
      const cx = PT[0] * S, cy = PT[1] * S;
      const rp = rWorld * sc * (this.ts || 1), hw = Math.max(halfW * sc * (this.ts || 1), 0.8);
      const ext = rp + hw + 1;
      let x0 = (cx - ext) | 0, x1 = Math.ceil(cx + ext), y0 = (cy - ext) | 0, y1 = Math.ceil(cy + ext);
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= S) x1 = S - 1; if (y1 >= S) y1 = S - 1;
      if (x1 < x0 || y1 < y0) return;
      const cr = (colorInt >> 16) & 255, cg = (colorInt >> 8) & 255, cb = colorInt & 255;
      const F = fall || FALL_SOFT, inv = 1 / hw;
      const d = this.data, L = this.light;
      const doColor = mode !== 2, doLight = this.lightOn && mode !== 3 && glow > 0;
      const a255 = alpha * 255, gl = glow * alpha;
      for (let py = y0; py <= y1; py++) {
        const dy = py - cy;
        const dy2 = dy * dy;     /* 行不变量提升：与内联 dy*dy 逐位一致 */
        const row = py * S;
        for (let px = x0; px <= x1; px++) {
          const dx = px - cx;
          const dist = Math.sqrt(dx * dx + dy2);
          const t = Math.abs(dist - rp) * inv;
          if (t >= 1) continue;
          let f = F[(t * 63) | 0];
          if (f <= 0) continue;
          const ia = row + px;
          if (doColor) {
            const i4 = ia << 2;
            if (mode === 1) {
              const add = f * a255;
              d[i4] += cr * add / 255; d[i4 + 1] += cg * add / 255; d[i4 + 2] += cb * add / 255;
              d[i4 + 3] += f * a255;   /* Uint8ClampedArray 写入自带钳制，结果与 Math.min(255,…) 一致 */
            } else {
              const sa = f * a255 / 255, da = DA[d[i4 + 3]];
              const oa = sa + da * (1 - sa);
              if (oa > 0) {
                d[i4] = (cr * sa + d[i4] * da * (1 - sa)) / oa;
                d[i4 + 1] = (cg * sa + d[i4 + 1] * da * (1 - sa)) / oa;
                d[i4 + 2] = (cb * sa + d[i4 + 2] * da * (1 - sa)) / oa;
              }
              d[i4 + 3] = oa * 255;
            }
          }
          if (doLight) {
            const i3 = ia * 3, add = f * gl;
            L[i3] += cr * add; L[i3 + 1] += cg * add; L[i3 + 2] += cb * add;
          }
        }
      }
    }

    /* 光束/胶囊：到线段距离场 */
    beam(x1, y1, x2, y2, halfW, colorInt, alpha, glow, mode, fall) {
      if (alpha <= 0.002 || halfW <= 0) return;
      const S = this.size, sc = this.scale;
      this._p(x1, y1, PT); let ax = PT[0] * S, ay = PT[1] * S;
      this._p(x2, y2, PT); let bx = PT[0] * S, by = PT[1] * S;
      const hw = Math.max(halfW * sc * (this.ts || 1), 0.6);
      let x0 = (Math.min(ax, bx) - hw) | 0, xe = Math.ceil(Math.max(ax, bx) + hw);
      let y0 = (Math.min(ay, by) - hw) | 0, ye = Math.ceil(Math.max(ay, by) + hw);
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (xe >= S) xe = S - 1; if (ye >= S) ye = S - 1;
      if (xe < x0 || ye < y0) return;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const invLen2 = len2 > 1e-6 ? 1 / len2 : 0;
      const cr = (colorInt >> 16) & 255, cg = (colorInt >> 8) & 255, cb = colorInt & 255;
      const F = fall || FALL_BEAM, inv = 1 / hw;
      const d = this.data, L = this.light;
      const doColor = mode !== 2, doLight = this.lightOn && mode !== 3 && glow > 0;
      const a255 = alpha * 255, gl = glow * alpha;
      for (let py = y0; py <= ye; py++) {
        const row = py * S;
        const pydy = (py - ay) * dy;   /* 行不变量提升：与内联计算逐位一致 */
        for (let px = x0; px <= xe; px++) {
          let t = ((px - ax) * dx + pydy) * invLen2;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const qx = ax + dx * t - px, qy = ay + dy * t - py;
          const dist = Math.sqrt(qx * qx + qy * qy);
          const u = dist * inv;
          if (u >= 1) continue;
          let f = F[(u * 63) | 0];
          if (f <= 0) continue;
          const ia = row + px;
          if (doColor) {
            const i4 = ia << 2;
            if (mode === 1) {
              const add = f * a255;
              d[i4] += cr * add / 255; d[i4 + 1] += cg * add / 255; d[i4 + 2] += cb * add / 255;
              d[i4 + 3] += f * a255;   /* Uint8ClampedArray 写入自带钳制，结果与 Math.min(255,…) 一致 */
            } else {
              const sa = f * a255 / 255, da = DA[d[i4 + 3]];
              const oa = sa + da * (1 - sa);
              if (oa > 0) {
                d[i4] = (cr * sa + d[i4] * da * (1 - sa)) / oa;
                d[i4 + 1] = (cg * sa + d[i4 + 1] * da * (1 - sa)) / oa;
                d[i4 + 2] = (cb * sa + d[i4 + 2] * da * (1 - sa)) / oa;
              }
              d[i4 + 3] = oa * 255;
            }
          }
          if (doLight) {
            const i3 = ia * 3, add = f * gl;
            L[i3] += cr * add; L[i3 + 1] += cg * add; L[i3 + 2] += cb * add;
          }
        }
      }
    }

    /* 单像素 */
    pixel(wx, wy, colorInt, alpha, glow, mode) {
      const S = this.size;
      this._p(wx, wy, PT);
      const px = (PT[0] * S) | 0, py = (PT[1] * S) | 0;
      if (px < 0 || py < 0 || px >= S || py >= S || alpha <= 0.002) return;
      const ia = py * S + px, a = alpha * 255;
      const cr = (colorInt >> 16) & 255, cg = (colorInt >> 8) & 255, cb = colorInt & 255;
      const d = this.data;
      if (mode !== 2) {
        const i4 = ia << 2;
        if (mode === 1) {
          d[i4] += cr * alpha; d[i4 + 1] += cg * alpha; d[i4 + 2] += cb * alpha;
          d[i4 + 3] += a;   /* 写入自带钳制 */
        } else {
          const sa = alpha, da = DA[d[i4 + 3]];
          const oa = sa + da * (1 - sa);
          if (oa > 0) {
            d[i4] = (cr * sa + d[i4] * da * (1 - sa)) / oa;
            d[i4 + 1] = (cg * sa + d[i4 + 1] * da * (1 - sa)) / oa;
            d[i4 + 2] = (cb * sa + d[i4 + 2] * da * (1 - sa)) / oa;
          }
          d[i4 + 3] = oa * 255;
        }
      }
      if (this.lightOn && mode !== 3 && glow > 0) {
        const i3 = ia * 3, add = glow * alpha;
        L2(this.light, i3, cr, cg, cb, add);
      }
    }

    /* 复合：颜色 + 光 → 输出 RGBA（导出即此结果）。
     * 光对 alpha 的贡献取光亮度上限（半透明辉光在导出中保持半透明）。
     * reduceFlash: 将光缓冲限制到 k 以下（防剧烈闪烁模式）。 */
    composite(out, reduceFlash) {
      const S = this.size, d = this.data, L = this.light;
      const cap = reduceFlash ? 160 : 255;
      const n = S * S;
      if (!out || out.length !== n * 4) out = new Uint8ClampedArray(n * 4);
      for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) {
        const da = d[j + 3];
        let lr = L[k] > cap ? cap : L[k], lg = L[k + 1] > cap ? cap : L[k + 1], lb = L[k + 2] > cap ? cap : L[k + 2];
        /* 颜色缓冲已是直通 alpha；把光加进 RGB，alpha 取 max(颜色alpha, 光亮度) */
        const la = Math.max(lr, lg, lb) * 0.85;
        out[j] = d[j] + lr;
        out[j + 1] = d[j + 1] + lg;
        out[j + 2] = d[j + 2] + lb;
        out[j + 3] = da > la ? da : la;
      }
      return out;
    }
  }
  function L2(L, i3, r, g, b, add) { L[i3] += r * add; L[i3 + 1] += g * add; L[i3 + 2] += b * add; }

  PF.FALL = { SOFT: FALL_SOFT, CORE: FALL_CORE, BEAM: FALL_BEAM };
  PF.CpuRaster = CpuRaster;
  /* Renderer 接口约定（保持稳定，供未来 GPU 后端实现）：
   * clear / fillBg / stamp / ring / beam / pixel / composite / resize */
  PF.Renderer = CpuRaster;
  if (typeof module !== 'undefined' && module.exports) module.exports = CpuRaster;
})(typeof globalThis !== 'undefined' ? globalThis : this);
