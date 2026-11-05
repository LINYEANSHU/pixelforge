/* PixelForge —— 生成器模板库（26 个）
 * 每个模板都有明确的阶段结构（前摇/爆发/扩散/余波 或 持续发射/消散），
 * 换色板不构成新模板。参数均通过 schema 校验。
 * 时间设计以 durationSec 的比例表达，保证 0.8s..4s 内阶段比例一致。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');
  const palette = (root.PF && root.PF.palette) ? root.PF.palette : require('./palette.js');
  const T = PF.TEMPLATES;
  const R = palette.R;
  const HALF_PI = Math.PI / 2, PI = Math.PI;

  /* 快捷 schema 构造 */
  const P = {
    range: (key, label, min, max, def, step) => ({ key, label, type: 'range', min, max, default: def, step: step || 0.01 }),
    ramp: (key, label, def, opts) => ({ key, label, type: 'ramp', default: def, options: opts }),
    angle: (key, label, def) => ({ key, label, type: 'angle', default: def }),
    bool: (key, label, def) => ({ key, label, type: 'bool', default: !!def }),
  };
  const COMMON_RAMPS = Object.keys(R);

  function reg(def) { T[def.id] = def; }

  /* ================================================================
   *  1. 魔法爆炸 —— 起势(内聚) → 爆发(闪+环) → 扩散(碎片火花) → 余波(余烬+烟)
   * ================================================================ */
  reg({
    id: 'magic_explosion', name: '魔法爆炸', category: 'explosion', loop: false, duration: 2.2,
    desc: '蓝紫色奥术能量内聚后炸裂：冲击环、碎片、余烬与烟雾四阶段完整结构。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 1, 4, 2.2),
      P.ramp('color', '色板', 'magicBlue', COMMON_RAMPS),
      P.range('smoke', '烟雾量', 0, 2, 1),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 2.2;                       // 阶段比例因子
      return {
        shake: { t0: 0.36 * q, amp: 0.02 * S * I, freq: 9, dur: 0.5 * q },
        meta: { thumbTime: 0.42 * q },
        layers: [
          /* 起势：向心内聚 + 渐亮底光 */
          { type: 'swirl', t0: 0, t1: 0.34 * q, count: 30 * I | 0, r: 0.55 * S, w: 5, dir: 1, converge: 0.9 * S, trailK: 0.1, size0: [0.008, 0.016], size1: [0.012, 0.02], glow: 0.9, ramp },
          { type: 'glowspot', t0: 0, t1: 0.36 * q, r: 0.2 * S, alpha: 0.55 * I, pulse: 7, glow: 1.2, ramp },
          /* 爆发：复合闪光（白核→主色→外晕），环慢起从闪光中突破 */
          { type: 'flash', t0: 0.36 * q, t1: 0.52 * q, r: 0.55 * S, alpha: 0.92, glow: 1.7 * I, ramp },
          { type: 'glowspot', t0: 0.36 * q, t1: 0.8 * q, r: 0.28 * S, alpha: 0.5 * I, glow: 1.1, ramp },
          { type: 'ring', t0: 0.36 * q, t1: 0.9 * q, r0: 0.06, r1: 0.92 * S, halfW: 0.045, halfW1: 0.016, attack: 0.1, alpha: 0.92, glow: 1.3 * I, ramp },
          { type: 'ring', t0: 0.46 * q, t1: 0.95 * q, r0: 0.04, r1: 0.58 * S, halfW: 0.02, halfW1: 0.008, alpha: 0.5, glow: 0.9 * I, ramp },
          /* 扩散：碎片(自旋长条) + 火花(拉伸) */
          { type: 'burst', t0: 0.36 * q, count: 30 * I | 0, kind: 2, spin: 9, jitter: 0.05, spread: PI * 2, spd: [0.5 * S, 1.5 * S], spdPow: 1.2, drag: 1.9, grav: 1.1, life: [0.5, 1.0], size0: [0.018, 0.036], size1: [0.006, 0.014], glow: 1.0, mode: 1, ramp },
          { type: 'burst', t0: 0.36 * q, count: 56 * I | 0, kind: 1, jitter: 0.04, spread: PI * 2, spd: [0.9 * S, 2.3 * S], spdPow: 1.7, drag: 2.6, grav: 0.4, life: [0.3, 0.75], size0: [0.01, 0.024], size1: [0.003, 0.008], flicker: 0.5, glow: 1.5, ramp },
          { type: 'burst', t0: 0.36 * q, count: 14 * I | 0, kind: 1, jitter: 0.02, spread: PI * 2, spd: [2.2 * S, 4.4 * S], spdPow: 1.2, drag: 2.0, life: [0.1, 0.24], size0: [0.006, 0.012], size1: [0.002, 0.004], glow: 1.6, mode: 1, ramp },
          /* 余波：余烬上飘 + 烟雾 */
          { type: 'burst', t0: 0.42 * q, count: 26 * I | 0, spread: PI * 2, spd: [0.08, 0.4], drag: 0.9, grav: -0.22, life: [0.9, 1.7], size0: [0.01, 0.02], size1: [0.004, 0.008], flicker: 0.5, glow: 1.3, mode: 1, ramp },
          { type: 'vstream', t0: 0.6 * q, t1: 1.35 * q, rate: 26 * p.smoke, warm: false, pos: [0, 0.12 * S], spread: PI * 2, spd: [0.05, 0.22], drag: 0.6, grav: -0.32, life: [0.7, 1.3], size0: [0.06, 0.1], size1: [0.22, 0.32], jitter: 0.2, driftA: 0.18, alpha: 0.26, glow: 0.04, mode: 0, fadePow: 1.7, ramp: pal.makeRamp(['#0c0e14', '#181b22', '#262a33', '#3a3f4a']) },
        ],
      };
    },
  });

  /* ================================================================
   *  2. 烈焰爆裂 —— 火球膨胀 + 火舌 + 火星 + 浓烟
   * ================================================================ */
  reg({
    id: 'fire_burst', name: '烈焰爆裂', category: 'fire', loop: false, duration: 1.6,
    desc: '火焰球快速膨胀炸开，喷出火星与浓烟，橙红基调。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.8, 3, 1.6),
      P.ramp('color', '色板', 'fire', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.6;
      return {
        shake: { t0: 0.14 * q, amp: 0.015 * S, freq: 11, dur: 0.4 * q },
        meta: { thumbTime: 0.2 * q },
        layers: [
          { type: 'flash', t0: 0, t1: 0.14 * q, r: 0.4 * S, glow: 1.4 * I, ramp },
          /* 火球主体：慢速膨胀的大颗粒 */
          { type: 'burst', t0: 0, count: 26 * I | 0, spread: PI * 2, spd: [0.25 * S, 0.75 * S], drag: 2.8, life: [0.35, 0.7], size0: [0.06, 0.1], size1: [0.14, 0.22], sizePow: 0.6, jitter: 0.05, glow: 1.1, mode: 1, fadePow: 1.2, ramp },
          /* 火舌：向上喷流 */
          { type: 'vstream', t0: 0, t1: 0.5 * q, rate: 55 * I, warm: false, pos: [0, 0.05], angle: -HALF_PI, spread: 0.7, spd: [0.6 * S, 1.5 * S], drag: 1.6, life: [0.3, 0.55], size0: [0.03, 0.06], size1: [0.1, 0.16], jitter: 0.06, driftA: 0.08, flicker: 0.35, glow: 1.1, ramp },
          /* 火星 */
          { type: 'burst', t0: 0.02 * q, count: 34 * I | 0, kind: 1, spread: PI * 2, spd: [0.8 * S, 2.1 * S], spdPow: 1.5, drag: 2.2, grav: 0.7, life: [0.3, 0.65], size0: [0.006, 0.014], size1: [0.002, 0.004], flicker: 0.6, glow: 1.3, ramp },
          { type: 'ring', t0: 0.05 * q, t1: 0.5 * q, r0: 0.05, r1: 0.6 * S, halfW: 0.03, halfW1: 0.012, alpha: 0.75, glow: 1.0, ramp },
          /* 浓烟余波 */
          { type: 'vstream', t0: 0.35 * q, t1: 1.2 * q, rate: 13 * I, warm: false, pos: [0, 0.05 * S], spread: PI * 2, spd: [0.04, 0.16], drag: 0.6, grav: -0.35, life: [0.7, 1.2], size0: [0.06, 0.1], size1: [0.18, 0.28], jitter: 0.1, driftA: 0.12, glow: 0.05, mode: 0, fadePow: 1.5, ramp: pal.R.smoke },
        ],
      };
    },
  });

  /* ================================================================
   *  3. 雷霆一击 —— 蓄能微光 → 落雷(分叉) → 命中闪环 → 余辉
   * ================================================================ */
  reg({
    id: 'lightning_strike', name: '雷霆一击', category: 'lightning', loop: false, duration: 1.5,
    desc: '天降折电带分叉，命中点闪环与火花，短促爆发后留余辉。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.8, 3, 1.5),
      P.range('branches', '分叉数', 0, 6, 3, 1),
      P.ramp('color', '色板', 'lightning', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.5;
      const hit = [0, 0.42 * S];
      return {
        shake: { t0: 0.3 * q, amp: 0.025 * S * I, freq: 12, dur: 0.45 * q },
        meta: { thumbTime: 0.33 * q },
        layers: [
          { type: 'glowspot', t0: 0, t1: 0.3 * q, pos: [0.02, -0.3], r: 0.26, alpha: 0.55 * I, pulse: 9, glow: 1.3, ramp },
          { type: 'bolt', t0: 0.3 * q, t1: 0.62 * q, from: [0.02, -1.35], to: hit, segs: 10, jag: 0.1, branches: p.branches | 0, regen: 0.05, life: 0.15, glow: 1.5 * I, ramp },
          { type: 'flash', t0: 0.3 * q, t1: 0.46 * q, pos: hit, r: 0.55 * S, glow: 1.6 * I, ramp },
          { type: 'ring', t0: 0.32 * q, t1: 0.72 * q, pos: [0, 0.5 * S], r0: 0.04, r1: 0.58 * S, halfW: 0.04, halfW1: 0.015, squishY: 0.3, glow: 1.2 * I, ramp },
          { type: 'burst', t0: 0.3 * q, count: 40 * I | 0, kind: 1, pos: hit, angle: -HALF_PI, spread: PI * 1.6, spd: [0.6 * S, 2.0 * S], spdPow: 1.4, drag: 2.4, grav: 0.9, life: [0.25, 0.55], size0: [0.006, 0.014], size1: [0.002, 0.005], flicker: 0.6, glow: 1.3, ramp },
          { type: 'burst', t0: 0.32 * q, count: 12 * I | 0, kind: 2, pos: hit, spin: 11, spread: PI * 2, spd: [0.4 * S, 1.2 * S], drag: 1.6, grav: 1.3, life: [0.4, 0.8], size0: [0.012, 0.02], size1: [0.004, 0.008], glow: 0.8, ramp },
          { type: 'glowspot', t0: 0.62 * q, t1: 1.1 * q, pos: hit, r: 0.22 * S, alpha: 0.3, glow: 0.8, ramp },
          { type: 'vstream', t0: 0.4 * q, t1: 1.0 * q, rate: 14 * I, warm: false, pos: hit, spread: PI * 2, spd: [0.06, 0.3], drag: 0.9, grav: -0.5, life: [0.5, 0.9], size0: [0.006, 0.012], size1: [0.003, 0.006], jitter: 0.15, flicker: 0.7, glow: 1.0, ramp },
        ],
      };
    },
  });

  /* ================================================================
   *  4. 链式闪电 —— 三段跳电，每跳命中闪光与火花
   * ================================================================ */
  reg({
    id: 'chain_lightning', name: '链式闪电', category: 'lightning', loop: false, duration: 1.8,
    desc: '闪电在三个目标间跳跃传导，逐跳爆发。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 1, 3.5, 1.8),
      P.ramp('color', '色板', 'lightning', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.8;
      const A = [-0.55 * S, -0.1], B = [-0.1, 0.3], C = [0.55 * S, -0.15];
      const hops = [[A, B, 0.12], [B, C, 0.55], [C, [0.15, 0.62], 0.98]];
      const layers = [];
      for (const [f, t2, tt] of hops) {
        layers.push({ type: 'bolt', t0: tt * q, t1: (tt + 0.32) * q, from: f, to: t2, segs: 8, jag: 0.08 * S, branches: 2, regen: 0.045, life: 0.13, glow: 1.4 * I, ramp });
        layers.push({ type: 'flash', t0: (tt + 0.02) * q, t1: (tt + 0.18) * q, pos: t2, r: 0.3 * S, glow: 1.3 * I, ramp });
        layers.push({ type: 'burst', t0: (tt + 0.02) * q, count: 18 * I | 0, kind: 1, pos: t2, spread: PI * 2, spd: [0.4 * S, 1.4 * S], drag: 2.6, grav: 0.5, life: [0.2, 0.45], size0: [0.005, 0.012], size1: [0.002, 0.004], flicker: 0.6, glow: 1.2, ramp });
        layers.push({ type: 'ring', t0: (tt + 0.03) * q, t1: (tt + 0.4) * q, pos: t2, r0: 0.03, r1: 0.3 * S, halfW: 0.02, halfW1: 0.008, alpha: 0.7, glow: 1.0, ramp });
      }
      layers.push({ type: 'glowspot', t0: 1.3 * q, t1: 1.8 * q, pos: C, r: 0.25 * S, alpha: 0.3, glow: 0.8, ramp });
      return { shake: { t0: 0.14 * q, amp: 0.012 * S, freq: 10, dur: 0.3 * q }, meta: { thumbTime: 0.6 * q }, layers };
    },
  });

  /* ================================================================
   *  5. 神圣冲击 —— 光柱贯落 + 地面双环 + 上升光尘
   * ================================================================ */
  reg({
    id: 'holy_smite', name: '神圣冲击', category: 'magic', loop: false, duration: 2.0,
    desc: '金色光柱从天而降，地面冲击环扩散，光尘袅袅上升。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 1, 4, 2.0),
      P.ramp('color', '色板', 'holy', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 2.0;
      const g = [0, 0.42 * S];
      return {
        shake: { t0: 0.36 * q, amp: 0.018 * S * I, freq: 8, dur: 0.5 * q },
        meta: { thumbTime: 0.44 * q },
        layers: [
          { type: 'glowspot', t0: 0, t1: 0.36 * q, pos: g, r: 0.22 * S, alpha: 0.4 * I, pulse: 6, glow: 1.0, ramp },
          { type: 'beam', t0: 0.36 * q, t1: 1.15 * q, from: [0, -1.35], to: g, width: 0.2 * S, width1: 0.06, grow: 0.06, attack: 0.04, glow: 1.5 * I, ramp },
          { type: 'flash', t0: 0.38 * q, t1: 0.62 * q, pos: g, r: 0.6 * S, glow: 1.5 * I, ramp },
          { type: 'ring', t0: 0.38 * q, t1: 1.05 * q, pos: [0, 0.45 * S], r0: 0.05, r1: 0.9 * S, halfW: 0.045, halfW1: 0.018, squishY: 0.28, glow: 1.3 * I, ramp },
          { type: 'ring', t0: 0.5 * q, t1: 1.2 * q, pos: [0, 0.45 * S], r0: 0.03, r1: 0.6 * S, halfW: 0.022, halfW1: 0.01, squishY: 0.28, alpha: 0.75, glow: 1.0, ramp },
          { type: 'vstream', t0: 0.45 * q, t1: 1.7 * q, rate: 22 * I, warm: false, pos: [0, 0.35 * S], spread: PI * 2, spd: [0.15, 0.5], drag: 0.8, grav: -0.55, life: [0.7, 1.2], size0: [0.006, 0.014], size1: [0.004, 0.01], jitter: 0.3, flicker: 0.4, glow: 1.0, ramp },
          { type: 'burst', t0: 0.38 * q, count: 20 * I | 0, kind: 1, pos: g, spread: PI * 2, spd: [0.3, 0.9], drag: 2.2, grav: 0.2, life: [0.4, 0.8], size0: [0.006, 0.012], size1: [0.002, 0.005], glow: 1.1, ramp },
          { type: 'glowspot', t0: 1.15 * q, t1: 1.95 * q, pos: g, r: 0.3 * S, alpha: 0.3, glow: 0.7, ramp },
        ],
      };
    },
  });

  /* ================================================================
   *  6. 旋风之刃 —— 前摇弧光 → 大弧斩 → 弧上火花
   * ================================================================ */
  reg({
    id: 'slash_arc', name: '旋风之刃', category: 'hit', loop: false, duration: 0.9,
    desc: '月牙形挥砍弧光扫过，拖尾锐利，弧上迸溅火花。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.5, 2, 0.9),
      P.angle('angle', '挥砍方向', 0),
      P.ramp('color', '色板', 'slash', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 0.9;
      const rot = p.angle * PI / 180;
      return {
        shake: { t0: 0.22 * q, amp: 0.012 * S, freq: 12, dur: 0.25 * q },
        meta: { thumbTime: 0.3 * q },
        layers: [
          { type: 'arc', t0: 0.12 * q, t1: 0.42 * q, pos: [0, 0], r: 0.5 * S, r1: 0.68 * S, a0: -2.5 + rot, a1: 0.7 + rot, width: 0.075, trail: 1.8, glow: 1.2 * I, ramp },
          { type: 'glowspot', t0: 0, t1: 0.14 * q, pos: [-0.35 * S, -0.35 * S], r: 0.1 * S, alpha: 0.4 * I, pulse: 0, glow: 0.8, ramp },
          { type: 'arc', t0: 0.2 * q, t1: 0.55 * q, pos: [0, 0], r: 0.4 * S, r1: 0.52 * S, a0: -2.2 + rot, a1: 0.5 + rot, width: 0.038, trail: 1.5, alpha: 0.8, glow: 0.9, ramp },
          { type: 'flash', t0: 0.28 * q, t1: 0.4 * q, r: 0.18 * S, alpha: 0.8, glow: 1.0 * I, ramp },
          { type: 'burst', t0: 0.3 * q, count: 26 * I | 0, kind: 1, spread: PI * 2, spd: [0.6 * S, 1.8 * S], spdPow: 1.5, drag: 2.5, grav: 0.6, life: [0.2, 0.5], size0: [0.006, 0.014], size1: [0.002, 0.004], flicker: 0.5, glow: 1.2, ramp },
          { type: 'burst', t0: 0.3 * q, count: 10 * I | 0, kind: 2, spin: 10, spread: PI * 2, spd: [0.3 * S, 1.0 * S], drag: 1.8, grav: 1.0, life: [0.35, 0.7], size0: [0.01, 0.018], size1: [0.003, 0.007], glow: 0.8, ramp },
        ],
      };
    },
  });

  /* ================================================================
   *  7. 重锤命中 —— 接触闪 + 快环 + 定向碎片 + 落尘
   * ================================================================ */
  reg({
    id: 'hit_impact', name: '重锤命中', category: 'hit', loop: false, duration: 0.7,
    desc: '短促有力的接触反馈：闪光、快冲击环与定向碎片锥。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.4, 1.5, 0.7),
      P.angle('angle', '击飞方向', -90),
      P.ramp('color', '色板', 'hit', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 0.7;
      const ang = p.angle * PI / 180;
      return {
        shake: { t0: 0, amp: 0.02 * S * I, freq: 13, dur: 0.28 * q },
        meta: { thumbTime: 0.12 * q },
        layers: [
          { type: 'flash', t0: 0, t1: 0.12 * q, r: 0.3 * S, glow: 1.4 * I, ramp },
          { type: 'ring', t0: 0, t1: 0.32 * q, r0: 0.03, r1: 0.5 * S, halfW: 0.03, halfW1: 0.012, glow: 1.2 * I, ramp },
          { type: 'burst', t0: 0, count: 26 * I | 0, kind: 2, angle: ang, spread: 1.9, spd: [0.5 * S, 1.6 * S], spdPow: 1.3, drag: 1.7, grav: 1.4, life: [0.35, 0.7], size0: [0.014, 0.026], size1: [0.005, 0.01], spin: 12, glow: 1.1, ramp },
          { type: 'burst', t0: 0, count: 30 * I | 0, kind: 1, angle: ang, spread: 1.3, spd: [0.9 * S, 2.3 * S], spdPow: 1.5, drag: 2.6, life: [0.15, 0.4], size0: [0.006, 0.013], size1: [0.002, 0.004], flicker: 0.5, glow: 1.3, ramp },
          { type: 'vstream', t0: 0.12 * q, t1: 0.45 * q, rate: 10 * I, warm: false, pos: [0, 0.08 * S], spread: PI * 2, spd: [0.05, 0.2], drag: 1.0, grav: 0.25, life: [0.3, 0.55], size0: [0.03, 0.05], size1: [0.08, 0.13], jitter: 0.1, glow: 0.04, mode: 0, fadePow: 1.3, ramp: pal.R.smoke },
        ],
      };
    },
  });

  /* ================================================================
   *  8. 致命暴击 —— 多重闪环 + 星芒 + 重碎片，更长余韵
   * ================================================================ */
  reg({
    id: 'crit_hit', name: '致命暴击', category: 'hit', loop: false, duration: 1.2,
    desc: '强化版命中：双层冲击环、十字星芒、重碎片与慢速亮屑。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.7, 2.5, 1.2),
      P.angle('angle', '击飞方向', -90),
      P.ramp('color', '色板', 'crit_hit' in R ? 'crit_hit' : 'hit', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.2;
      const ang = p.angle * PI / 180;
      const spikes = [];
      for (let i = 0; i < 4; i++) {
        const a = ang + i * HALF_PI + 0.35;
        spikes.push({ type: 'beam', t0: 0.02 * q, t1: 0.3 * q, from: [0, 0], to: [Math.cos(a) * 0.75 * S, Math.sin(a) * 0.75 * S], width: 0.028, width1: 0.004, grow: 0.35, attack: 0.02, glow: 1.3 * I, ramp });
      }
      return {
        shake: { t0: 0, amp: 0.03 * S * I, freq: 11, dur: 0.4 * q },
        meta: { thumbTime: 0.14 * q },
        layers: [
          { type: 'flash', t0: 0, t1: 0.2 * q, r: 0.45 * S, glow: 1.6 * I, ramp },
          { type: 'ring', t0: 0, t1: 0.5 * q, r0: 0.04, r1: 0.72 * S, halfW: 0.04, halfW1: 0.014, glow: 1.4 * I, ramp },
          { type: 'ring', t0: 0.06 * q, t1: 0.55 * q, r0: 0.03, r1: 0.5 * S, halfW: 0.022, halfW1: 0.01, alpha: 0.8, glow: 1.0, ramp },
          ...spikes,
          { type: 'burst', t0: 0, count: 28 * I | 0, kind: 2, angle: ang, spread: 2.4, spd: [0.4 * S, 1.7 * S], drag: 1.5, grav: 1.2, life: [0.4, 0.85], size0: [0.014, 0.026], size1: [0.004, 0.009], spin: 11, glow: 1.0, ramp },
          { type: 'burst', t0: 0, count: 44 * I | 0, kind: 1, spread: PI * 2, spd: [0.8 * S, 2.4 * S], spdPow: 1.6, drag: 2.7, life: [0.2, 0.55], size0: [0.006, 0.015], size1: [0.002, 0.005], flicker: 0.55, glow: 1.4, ramp },
          { type: 'burst', t0: 0.1 * q, count: 22 * I | 0, spread: PI * 2, spd: [0.05, 0.35], drag: 0.8, grav: -0.3, life: [0.8, 1.2], size0: [0.008, 0.015], size1: [0.004, 0.008], flicker: 0.6, glow: 1.4, mode: 1, ramp },
        ],
      };
    },
  });

  /* ================================================================
   *  9. 护盾格挡 —— 弧面波纹 + 偏转火花
   * ================================================================ */
  reg({
    id: 'shield_block', name: '护盾格挡', category: 'hit', loop: false, duration: 1.0,
    desc: '半球护盾泛起涟漪，攻击被偏转为散射火花。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.5, 2, 1.0),
      P.ramp('color', '色板', 'magicBlue', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.0;
      return {
        shake: { t0: 0.12 * q, amp: 0.01 * S, freq: 10, dur: 0.2 * q },
        meta: { thumbTime: 0.2 * q },
        layers: [
          { type: 'swirl', t0: 0, t1: 0.9 * q, count: 40 * I | 0, pos: [0, 0.05], r: 0.42 * S, w: 2.6, dir: 1, trailK: 0.12, size0: [0.006, 0.013], size1: [0.004, 0.01], glow: 0.9, ramp },
          { type: 'ring', t0: 0.1 * q, t1: 0.55 * q, pos: [0, 0.05], r0: 0.3 * S, r1: 0.62 * S, halfW: 0.035, halfW1: 0.015, alpha: 0.85, glow: 1.1 * I, ramp },
          { type: 'ring', t0: 0.2 * q, t1: 0.7 * q, pos: [0, 0.05], r0: 0.3 * S, r1: 0.5 * S, halfW: 0.02, halfW1: 0.008, alpha: 0.6, glow: 0.9, ramp },
          { type: 'flash', t0: 0.1 * q, t1: 0.24 * q, pos: [0, 0.05], r: 0.32 * S, glow: 1.2 * I, ramp },
          { type: 'burst', t0: 0.1 * q, count: 30 * I | 0, kind: 1, pos: [0, 0.05], angle: -0.6, spread: 2.4, spd: [0.7 * S, 1.9 * S], spdPow: 1.4, drag: 2.4, grav: 0.6, life: [0.2, 0.5], size0: [0.006, 0.013], size1: [0.002, 0.004], flicker: 0.55, glow: 1.2, ramp },
          { type: 'glowspot', t0: 0.55 * q, t1: 0.95 * q, pos: [0, 0.05], r: 0.3 * S, alpha: 0.3, glow: 0.7, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 10. 治疗波光 —— 上升光尘 + 上扩柔环
   * ================================================================ */
  reg({
    id: 'heal_glow', name: '治疗波光', category: 'magic', loop: false, duration: 2.2,
    desc: '温和的治疗术：绿色光尘盘旋上升，柔环自下而上扩散。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 1, 4, 2.2),
      P.ramp('color', '色板', 'heal', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 2.2;
      return {
        meta: {},
        layers: [
          { type: 'glowspot', t0: 0, t1: 1.6 * q, pos: [0, 0.3 * S], r: 0.3 * S, alpha: 0.4 * I, pulse: 3, glow: 0.8, ramp },
          { type: 'ring', t0: 0.1 * q, t1: 1.0 * q, pos: [0, 0.45 * S], r0: 0.1, r1: 0.55 * S, halfW: 0.03, halfW1: 0.012, squishY: 0.32, alpha: 0.7, glow: 0.9, ramp },
          { type: 'ring', t0: 0.5 * q, t1: 1.4 * q, pos: [0, 0.3 * S], r0: 0.1, r1: 0.45 * S, halfW: 0.025, halfW1: 0.01, squishY: 0.32, alpha: 0.6, glow: 0.8, ramp },
          { type: 'vstream', t0: 0, t1: 1.6 * q, rate: 26 * I, warm: false, pos: [0, 0.35 * S], spread: PI * 2, spd: [0.1, 0.35], drag: 0.7, grav: -0.6, life: [0.8, 1.4], size0: [0.006, 0.013], size1: [0.008, 0.016], jitter: 0.28, driftA: 0.1, flicker: 0.3, glow: 0.9, ramp },
          { type: 'swirl', t0: 0, t1: 1.5 * q, count: 22 * I | 0, pos: [0, 0.3 * S], r: 0.32 * S, w: 1.6, dir: -1, wob: 0.06, size0: [0.005, 0.011], size1: [0.006, 0.012], glow: 0.8, ramp },
          { type: 'burst', t0: 1.3 * q, count: 12 * I | 0, pos: [0, -0.1], spread: PI * 2, spd: [0.04, 0.2], drag: 0.8, grav: -0.4, life: [0.5, 0.9], size0: [0.005, 0.01], size1: [0.003, 0.006], flicker: 0.6, glow: 0.9, mode: 1, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 11. 增益光环 —— 循环：轨道粒子 + 周期脉冲环
   * ================================================================ */
  reg({
    id: 'buff_aura', name: '增益光环', category: 'ui', loop: true, duration: 2.4,
    desc: '持续循环的增益状态：环绕轨道粒子、上升光点与周期脉冲。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.ramp('color', '色板', 'uiGold', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = 2.4, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      return {
        meta: { thumbTime: 0.6 },
        layers: [
          { type: 'glowspot', t0: 0, t1: D, pos: [0, 0.35 * S], r: 0.3 * S, alpha: 0.32 * I, pulse: 1, glow: 0.8, ramp },
          { type: 'swirl', t0: 0, t1: D, count: 46 * I | 0, pos: [0, 0.28 * S], r: 0.42 * S, w: 1.4, dir: 1, wob: 0.05, wobN: 2, trailK: 0.1, size0: [0.006, 0.013], size1: [0.005, 0.011], glow: 0.9, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 18 * I, pos: [0, 0.4 * S], spread: PI * 2, spd: [0.06, 0.22], drag: 0.7, grav: -0.45, life: [0.9, 1.5], size0: [0.005, 0.011], size1: [0.004, 0.009], jitter: 0.32, flicker: 0.3, glow: 0.9, ramp },
          { type: 'ring', t0: 0, t1: 0.9, pos: [0, 0.42 * S], r0: 0.08, r1: 0.55 * S, halfW: 0.025, halfW1: 0.01, squishY: 0.3, alpha: 0.6, glow: 0.9, ramp },
          { type: 'ring', t0: 1.2, t1: 2.1, pos: [0, 0.42 * S], r0: 0.08, r1: 0.55 * S, halfW: 0.025, halfW1: 0.01, squishY: 0.3, alpha: 0.6, glow: 0.9, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 12. 传送漩涡 —— 内聚吸入 → 白闪 → 外散余屑
   * ================================================================ */
  reg({
    id: 'teleport_warp', name: '传送漩涡', category: 'magic', loop: false, duration: 1.6,
    desc: '漩涡先吸入内聚，白闪一瞬后向外散出残余光屑。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.8, 3, 1.6),
      P.ramp('color', '色板', 'magicPurple', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.6;
      return {
        shake: { t0: 0.5 * q, amp: 0.014 * S, freq: 9, dur: 0.3 * q },
        meta: { thumbTime: 0.28 * q },
        layers: [
          { type: 'swirl', t0: 0, t1: 0.5 * q, count: 55 * I | 0, r: 0.6 * S, w: 7, dir: -1, converge: 1.0 * S, trailK: 0.14, size0: [0.008, 0.018], size1: [0.012, 0.022], glow: 1.1, ramp },
          { type: 'glowspot', t0: 0.2 * q, t1: 0.52 * q, r: 0.26 * S, alpha: 0.6 * I, pulse: 8, glow: 1.3, ramp },
          { type: 'flash', t0: 0.5 * q, t1: 0.68 * q, r: 0.55 * S, glow: 1.6 * I, ramp },
          { type: 'swirl', t0: 0.52 * q, t1: 1.15 * q, count: 40 * I | 0, r: 0.15 * S, w: -6, dir: 1, wob: 0.1, trailK: 0.12, size0: [0.008, 0.016], size1: [0.004, 0.01], glow: 1.0, ramp },
          { type: 'ring', t0: 0.52 * q, t1: 1.05 * q, r0: 0.05, r1: 0.7 * S, halfW: 0.035, halfW1: 0.014, glow: 1.2 * I, ramp },
          { type: 'burst', t0: 0.52 * q, count: 26 * I | 0, kind: 1, spread: PI * 2, spd: [0.5 * S, 1.5 * S], spdPow: 1.5, drag: 2.2, grav: 0.2, life: [0.3, 0.7], size0: [0.006, 0.013], size1: [0.002, 0.005], flicker: 0.5, glow: 1.2, ramp },
          { type: 'burst', t0: 0.6 * q, count: 20 * I | 0, spread: PI * 2, spd: [0.04, 0.25], drag: 0.8, grav: -0.25, life: [0.6, 1.1], size0: [0.007, 0.013], size1: [0.004, 0.008], flicker: 0.6, glow: 1.2, mode: 1, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 13. 喷泉火柱 —— 循环：双层火舌 + 火星 + 顶部烟
   * ================================================================ */
  reg({
    id: 'flame_jet', name: '喷泉火柱', category: 'fire', loop: true, duration: 2.0,
    desc: '持续向上的火柱喷流：双层火舌、飞散火星与顶部薄烟。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.ramp('color', '色板', 'fire', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = 2.0, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      return {
        meta: { thumbTime: 0.5 },
        layers: [
          { type: 'glowspot', t0: 0, t1: D, pos: [0, 0.55 * S], r: 0.25 * S, alpha: 0.35 * I, pulse: 2, glow: 1.0, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 90 * I, pos: [0, 0.6 * S], angle: -HALF_PI, spread: 0.42, spd: [0.9 * S, 1.7 * S], drag: 1.2, life: [0.35, 0.6], size0: [0.035, 0.06], size1: [0.1, 0.17], jitter: 0.05, driftA: 0.07, flicker: 0.4, glow: 1.1, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 40 * I, pos: [0, 0.6 * S], angle: -HALF_PI, spread: 0.2, spd: [1.2 * S, 2.1 * S], drag: 1.0, life: [0.3, 0.5], size0: [0.02, 0.04], size1: [0.06, 0.1], jitter: 0.03, flicker: 0.5, glow: 1.2, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 10 * I, pos: [0, 0.55 * S], spread: PI * 2, spd: [0.3, 0.9], drag: 0.6, grav: -0.6, life: [0.6, 1.1], size0: [0.005, 0.01], size1: [0.003, 0.006], jitter: 0.08, flicker: 0.7, glow: 1.2, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 7 * I, pos: [0, -0.3 * S], spread: PI * 2, spd: [0.05, 0.2], drag: 0.6, grav: -0.4, life: [0.9, 1.4], size0: [0.05, 0.09], size1: [0.16, 0.26], jitter: 0.1, driftA: 0.1, glow: 0.05, mode: 0, fadePow: 1.5, ramp: pal.R.smoke },
        ],
      };
    },
  });

  /* ================================================================
   * 14. 长明火把 —— 循环：小而稳的火焰
   * ================================================================ */
  reg({
    id: 'torch_fire', name: '长明火把', category: 'fire', loop: true, duration: 2.0,
    desc: '经典火把：紧凑摇曳的火焰本体与偶尔飘起的小火星。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.ramp('color', '色板', 'fire', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = 2.0, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      return {
        meta: { thumbTime: 0.5 },
        layers: [
          { type: 'glowspot', t0: 0, t1: D, pos: [0, 0.26 * S], r: 0.3 * S, alpha: 0.42 * I, pulse: 1.5, glow: 1.0, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 50 * I, pos: [0, 0.28 * S], angle: -HALF_PI, spread: 0.5, spd: [0.5 * S, 1.05 * S], drag: 1.4, life: [0.4, 0.75], size0: [0.045, 0.085], size1: [0.11, 0.19], jitter: 0.05, driftA: 0.07, flicker: 0.45, glow: 1.1, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 7 * I, pos: [0, 0.3 * S], spread: PI * 2, spd: [0.2, 0.6], drag: 0.5, grav: -0.7, life: [0.7, 1.2], size0: [0.006, 0.011], size1: [0.004, 0.007], jitter: 0.06, flicker: 0.8, glow: 1.2, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 15. 浓烟升腾 —— 循环：大团卷烟
   * ================================================================ */
  reg({
    id: 'smoke_plume', name: '浓烟升腾', category: 'smoke', loop: true, duration: 3.0,
    desc: '灰色浓烟持续翻卷上升，双层密度与横向摆动。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.ramp('color', '色板', 'smoke', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = 3.0, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      return {
        meta: { thumbTime: 1.0 },
        layers: [
          { type: 'vstream', t0: 0, t1: D, rate: 20 * I, pos: [0, 0.7 * S], angle: -HALF_PI, spread: 0.35, spd: [0.25 * S, 0.5 * S], drag: 0.5, life: [1.6, 2.6], size0: [0.08, 0.13], size1: [0.32, 0.47], jitter: 0.1, driftA: 0.18, driftF: 1.2, alpha: 0.8, glow: 0.04, mode: 0, fadePow: 1.3, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 9 * I, pos: [0, 0.7 * S], angle: -HALF_PI, spread: 0.2, spd: [0.35 * S, 0.6 * S], drag: 0.5, life: [1.4, 2.2], size0: [0.05, 0.09], size1: [0.2, 0.3], jitter: 0.05, driftA: 0.1, glow: 0.03, mode: 0, fadePow: 1.3, ramp },
          { type: 'glowspot', t0: 0, t1: D, pos: [0, 0.7 * S], r: 0.16 * S, alpha: 0.12, glow: 0.3, mode: 0, ramp: pal.R.smoke },
        ],
      };
    },
  });

  /* ================================================================
   * 16. 灵气迷雾 —— 循环：缓慢横漂的雾团
   * ================================================================ */
  reg({
    id: 'ambient_fog', name: '灵气迷雾', category: 'smoke', loop: true, duration: 4.0,
    desc: '低空灵雾缓缓横漂，双层异速制造层次。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.ramp('color', '色板', 'magicBlue', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = 4.0, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      return {
        meta: { thumbTime: 1.5 },
        layers: [
          { type: 'vstream', t0: 0, t1: D, rate: 7 * I, pos: [0.9, 0.55 * S], angle: PI, spread: 0.25, spd: [0.16 * S, 0.28 * S], drag: 0.1, life: [3.0, 3.9], size0: [0.18, 0.28], size1: [0.34, 0.5], jitter: 0.18, driftA: 0.05, glow: 0.05, mode: 0, fadePow: 0.9, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 5 * I, pos: [-0.9, 0.3 * S], angle: 0, spread: 0.25, spd: [0.2 * S, 0.32 * S], drag: 0.1, life: [3.2, 3.9], size0: [0.15, 0.24], size1: [0.3, 0.44], jitter: 0.15, driftA: 0.04, glow: 0.06, mode: 0, fadePow: 0.9, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 4 * I, pos: [0, -0.7 * S], spread: PI * 2, spd: [0.02, 0.08], drag: 0.2, grav: 0.06, life: [3.4, 3.9], size0: [0.2, 0.3], size1: [0.36, 0.5], jitter: 0.5, driftA: 0.06, glow: 0.07, mode: 0, fadePow: 0.9, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 17. 暴雨倾盆 —— 循环：斜雨线 + 地面溅环 + 闷雷微闪
   * ================================================================ */
  reg({
    id: 'rain_storm', name: '暴雨倾盆', category: 'smoke', loop: true, duration: 2.0,
    desc: '斜落的雨线打在地面激起溅环，远处偶有闷雷微闪。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('wind', '风力', -1, 1, 0.3),
    ],
    build(p, pal) {
      const D = 2.0, S = p.scale, I = p.intensity;
      const ramp = pal.R.rain;
      const wind = p.wind * 0.5;
      const ang = HALF_PI - wind * 0.5;
      const layers = [
        { type: 'vstream', t0: 0, t1: D, rate: 170 * I, pos: [wind * 0.6, -0.2], angle: ang, spread: 0.12, spd: [2.2, 3.0], drag: 0, life: [0.42, 0.5], size0: [0.006, 0.01], size1: [0.006, 0.01], jitter: 1.1, kind: 1, speedLine: true, glow: 0.7, mode: 1, ramp },
        { type: 'vstream', t0: 0, t1: D, rate: 70 * I, pos: [wind * 0.6, -0.2], angle: ang, spread: 0.18, spd: [1.8, 2.5], drag: 0, life: [0.45, 0.52], size0: [0.004, 0.007], size1: [0.004, 0.007], jitter: 1.1, kind: 1, speedLine: true, glow: 0.5, mode: 1, ramp },
      ];
      /* 地面溅环：四个相位错开的地面小环 */
      for (let i = 0; i < 5; i++) {
        layers.push({ type: 'ring', t0: i * 0.4, t1: i * 0.4 + 0.3, pos: [-0.6 + i * 0.3, 0.7 * S], r0: 0.005, r1: 0.055, halfW: 0.012, halfW1: 0.006, squishY: 0.35, alpha: 0.65, glow: 0.6, mode: 1, ramp });
      }
      layers.push({ type: 'flash', t0: 1.4, t1: 1.7, pos: [0.3, -0.5], r: 0.7, alpha: 0.16, glow: 0.5, mode: 2, ramp });
      return { meta: { thumbTime: 0.4 }, layers };
    },
  });

  /* ================================================================
   * 18. 飘雪纷飞 —— 循环：大小雪片摇摆下落
   * ================================================================ */
  reg({
    id: 'snow_drift', name: '飘雪纷飞', category: 'smoke', loop: true, duration: 4.0,
    desc: '三层雪片异速下落，横向摇摆营造风的呼吸感。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('wind', '风力', -1, 1, 0.2),
    ],
    build(p, pal) {
      const D = 4.0, S = p.scale, I = p.intensity;
      const ramp = pal.makeRamp(['#eef4fa', '#ffffff', '#ffffff']);
      const wind = p.wind;
      return {
        meta: { thumbTime: 1.2 },
        layers: [
          { type: 'vstream', t0: 0, t1: D, rate: 26 * I, pos: [wind * 0.5, -0.95], angle: HALF_PI, spread: 0.5, spd: [0.28 * S, 0.42 * S], drag: 0, life: [3.3, 3.95], size0: [0.012, 0.022], size1: [0.012, 0.022], jitter: 0.7, driftA: 0.12, driftF: 1.4, glow: 0.5, alpha: 1.0, mode: 1, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 18 * I, pos: [wind * 0.5, -0.95], angle: HALF_PI, spread: 0.6, spd: [0.45 * S, 0.62 * S], drag: 0, life: [3.0, 3.7], size0: [0.007, 0.013], size1: [0.007, 0.013], jitter: 0.6, driftA: 0.1, driftF: 1.8, glow: 0.4, alpha: 1.0, mode: 1, ramp },
          { type: 'vstream', t0: 0, t1: D, rate: 12 * I, pos: [wind * 0.5, -0.95], angle: HALF_PI, spread: 0.7, spd: [0.7 * S, 0.9 * S], drag: 0, life: [2.4, 2.9], size0: [0.004, 0.008], size1: [0.004, 0.008], jitter: 0.5, driftA: 0.08, driftF: 2.2, glow: 0.35, alpha: 1.0, mode: 1, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 19. 水花飞溅 —— 上抛水珠(重力抛物线) + 地面环 + 雾
   * ================================================================ */
  reg({
    id: 'water_splash', name: '水花飞溅', category: 'water', loop: false, duration: 1.3,
    desc: '水珠受重力上抛后坠落，激起地面薄环与升腾水雾。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.6, 2.5, 1.3),
      P.ramp('color', '色板', 'water', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.3;
      const g = [0, 0.55 * S];
      return {
        meta: { thumbTime: 0.25 * q },
        layers: [
          { type: 'burst', t0: 0, count: 34 * I | 0, kind: 1, pos: g, angle: -HALF_PI, spread: 1.1, spd: [0.8 * S, 1.8 * S], spdPow: 1.2, drag: 0.25, grav: 3.2, life: [0.5, 0.95], size0: [0.007, 0.015], size1: [0.005, 0.012], glow: 0.7, ramp },
          { type: 'burst', t0: 0.02 * q, count: 20 * I | 0, pos: g, angle: -HALF_PI, spread: 1.7, spd: [0.4 * S, 1.1 * S], drag: 0.3, grav: 3.4, life: [0.4, 0.8], size0: [0.005, 0.01], size1: [0.004, 0.008], glow: 0.6, ramp },
          { type: 'ring', t0: 0, t1: 0.55 * q, pos: g, r0: 0.03, r1: 0.55 * S, halfW: 0.03, halfW1: 0.012, squishY: 0.3, alpha: 0.8, glow: 0.8, ramp },
          { type: 'vstream', t0: 0.05 * q, t1: 0.7 * q, rate: 16 * I, warm: false, pos: g, spread: PI * 2, spd: [0.04, 0.16], drag: 0.7, grav: -0.35, life: [0.5, 0.9], size0: [0.035, 0.065], size1: [0.12, 0.18], jitter: 0.14, driftA: 0.09, alpha: 0.5, glow: 0.05, mode: 0, fadePow: 1.6, ramp: pal.makeRamp(['#182838', '#2c4a60', '#486a80', '#7a9ab0']) },
        ],
      };
    },
  });

  /* ================================================================
   * 20. 寒冰碎裂 —— 冰晶闪 → 锋利碎片 → 霜雾沉降
   * ================================================================ */
  reg({
    id: 'ice_shatter', name: '寒冰碎裂', category: 'water', loop: false, duration: 1.6,
    desc: '冰面炸裂：苍白闪光、锋利冰晶碎片四散、霜雾缓缓沉降。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.8, 3, 1.6),
      P.ramp('color', '色板', 'ice', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.6;
      return {
        shake: { t0: 0.06 * q, amp: 0.018 * S * I, freq: 10, dur: 0.35 * q },
        meta: { thumbTime: 0.16 * q },
        layers: [
          { type: 'flash', t0: 0, t1: 0.16 * q, r: 0.4 * S, glow: 1.4 * I, ramp },
          { type: 'ring', t0: 0.04 * q, t1: 0.5 * q, r0: 0.04, r1: 0.7 * S, halfW: 0.03, halfW1: 0.012, glow: 1.1 * I, ramp },
          { type: 'burst', t0: 0.02 * q, count: 36 * I | 0, kind: 2, spin: 7, spread: PI * 2, spd: [0.5 * S, 1.6 * S], spdPow: 1.3, drag: 1.1, grav: 1.6, life: [0.5, 1.0], size0: [0.012, 0.026], size1: [0.004, 0.01], glow: 0.8, ramp },
          { type: 'burst', t0: 0.02 * q, count: 30 * I | 0, kind: 1, spread: PI * 2, spd: [0.9 * S, 2.2 * S], spdPow: 1.5, drag: 2.3, grav: 0.8, life: [0.2, 0.5], size0: [0.005, 0.012], size1: [0.002, 0.004], flicker: 0.65, glow: 1.2, ramp },
          { type: 'vstream', t0: 0.3 * q, t1: 1.0 * q, rate: 12 * I, warm: false, spread: PI * 2, spd: [0.03, 0.14], drag: 0.8, grav: 0.3, life: [0.6, 1.1], size0: [0.045, 0.075], size1: [0.13, 0.21], jitter: 0.22, driftA: 0.08, alpha: 0.45, glow: 0.06, mode: 0, fadePow: 1.6, ramp: pal.makeRamp(['#182840', '#28486a', '#4878a0', '#88b8d8']) },
          { type: 'burst', t0: 0.5 * q, count: 10 * I | 0, spread: PI * 2, spd: [0.02, 0.12], drag: 0.6, grav: 0.15, life: [0.5, 0.9], size0: [0.004, 0.009], size1: [0.002, 0.005], flicker: 0.8, glow: 1.0, mode: 1, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 21. 寒霜吐息 —— 定向锥形霜雾 + 晶屑
   * ================================================================ */
  reg({
    id: 'frost_breath', name: '寒霜吐息', category: 'water', loop: false, duration: 1.2,
    desc: '锥形冰霜吐息向前喷出，带晶屑与源地辉光。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.6, 2, 1.2),
      P.angle('angle', '吐息方向', -15),
      P.ramp('color', '色板', 'ice', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.2;
      const ang = p.angle * PI / 180;
      return {
        meta: { thumbTime: 0.3 * q },
        layers: [
          { type: 'glowspot', t0: 0, t1: 0.6 * q, pos: [-0.2, 0.1], r: 0.16 * S, alpha: 0.4 * I, pulse: 5, glow: 1.0, ramp },
          { type: 'vstream', t0: 0, t1: 0.55 * q, rate: 70 * I, warm: false, pos: [-0.15, 0.08], angle: ang, spread: 0.55, spd: [1.0 * S, 2.0 * S], drag: 2.2, life: [0.4, 0.8], size0: [0.035, 0.065], size1: [0.13, 0.21], jitter: 0.07, driftA: 0.06, alpha: 0.55, glow: 0.1, mode: 0, fadePow: 1.5, ramp: pal.makeRamp(['#28486a', '#4878a8', '#88c0e0', '#d0eefc']) },
          { type: 'vstream', t0: 0, t1: 0.5 * q, rate: 24 * I, warm: false, pos: [-0.15, 0.08], angle: ang, spread: 0.4, spd: [1.4 * S, 2.4 * S], drag: 1.8, life: [0.3, 0.6], size0: [0.006, 0.014], size1: [0.004, 0.008], jitter: 0.04, flicker: 0.6, glow: 1.1, ramp },
          { type: 'burst', t0: 0.15 * q, count: 14 * I | 0, kind: 2, pos: [0.35, 0], angle: ang, spread: 0.9, spin: 6, spd: [0.3 * S, 1.0 * S], drag: 1.4, grav: 0.9, life: [0.35, 0.7], size0: [0.01, 0.02], size1: [0.004, 0.008], glow: 0.9, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 22. 剧毒气泡 —— 循环：上浮气泡 + 破裂微溅 + 毒雾
   * ================================================================ */
  reg({
    id: 'poison_bubbles', name: '剧毒气泡', category: 'magic', loop: true, duration: 2.5,
    desc: '绿色毒沼气泡上浮破裂，溅出微滴并逸出毒雾。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.ramp('color', '色板', 'poison', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = 2.5, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const layers = [
        { type: 'glowspot', t0: 0, t1: D, pos: [0, 0.6 * S], r: 0.3 * S, alpha: 0.3 * I, pulse: 0.8, glow: 0.8, ramp },
        { type: 'vstream', t0: 0, t1: D, rate: 12 * I, pos: [0, 0.65 * S], angle: -HALF_PI, spread: 1.5, spd: [0.2 * S, 0.45 * S], drag: 0.2, grav: -0.3, life: [0.7, 1.3], size0: [0.015, 0.035], size1: [0.02, 0.045], jitter: 0.25, driftA: 0.09, driftF: 2.5, glow: 0.7, mode: 1, ramp },
        { type: 'vstream', t0: 0, t1: D, rate: 8 * I, pos: [0, 0.5 * S], angle: -HALF_PI, spread: 2.2, spd: [0.1 * S, 0.25 * S], drag: 0.4, grav: -0.4, life: [1.0, 1.6], size0: [0.04, 0.08], size1: [0.1, 0.16], jitter: 0.3, driftA: 0.1, glow: 0.06, mode: 0, fadePow: 1.3, ramp },
      ];
      /* 周期性破裂微溅（确定性事件，循环时逐周期重复） */
      for (let i = 0; i < 4; i++) {
        const tt = i * 0.6 + 0.15;
        layers.push({ type: 'burst', t0: tt, count: 6 * I | 0, pos: [-0.3 + i * 0.2, 0.05 + (i % 2) * 0.15], angle: -HALF_PI, spread: 1.2, spd: [0.2, 0.5], drag: 1.2, grav: 1.8, life: [0.2, 0.4], size0: [0.004, 0.008], size1: [0.003, 0.006], glow: 0.8, mode: 1, ramp });
      }
      return { meta: { thumbTime: 0.8 }, layers };
    },
  });

  /* ================================================================
   * 23. 激光扫射 —— 细束充能 → 全宽光束 → 命中火花烟尘
   * ================================================================ */
  reg({
    id: 'laser_beam', name: '激光扫射', category: 'ui', loop: false, duration: 1.6,
    desc: '科技感激光：细束充能、全宽主束、命中点火花与烟尘。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.8, 3, 1.6),
      P.ramp('color', '色板', 'hit', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.6;
      const tgt = [0.55 * S, -0.1];
      const src = [-0.75 * S, 0.15];
      return {
        shake: { t0: 0.5 * q, amp: 0.012 * S * I, freq: 14, dur: 0.4 * q },
        meta: { thumbTime: 0.6 * q },
        layers: [
          { type: 'beam', t0: 0, t1: 0.5 * q, from: src, to: tgt, width: 0.012, width1: 0.03, grow: 0.6, attack: 0.2, alpha: 0.7, glow: 0.9, ramp },
          { type: 'glowspot', t0: 0.1 * q, t1: 0.5 * q, pos: src, r: 0.14 * S, alpha: 0.5 * I, pulse: 10, glow: 1.1, ramp },
          { type: 'beam', t0: 0.5 * q, t1: 1.1 * q, from: src, to: tgt, width: 0.075 * S, width1: 0.03, grow: 0.04, attack: 0.03, glow: 1.5 * I, ramp },
          { type: 'flash', t0: 0.5 * q, t1: 0.68 * q, pos: tgt, r: 0.35 * S, glow: 1.5 * I, ramp },
          { type: 'flash', t0: 0.5 * q, t1: 0.64 * q, pos: src, r: 0.22 * S, glow: 1.3 * I, ramp },
          { type: 'ring', t0: 0.52 * q, t1: 0.95 * q, pos: tgt, r0: 0.03, r1: 0.4 * S, halfW: 0.028, halfW1: 0.01, glow: 1.1 * I, ramp },
          { type: 'burst', t0: 0.5 * q, count: 30 * I | 0, kind: 1, pos: tgt, angle: 2.6, spread: 2.0, spd: [0.6 * S, 2.0 * S], spdPow: 1.4, drag: 2.5, grav: 0.6, life: [0.2, 0.5], size0: [0.006, 0.014], size1: [0.002, 0.005], flicker: 0.55, glow: 1.3, ramp },
          { type: 'vstream', t0: 0.75 * q, t1: 1.3 * q, rate: 10 * I, warm: false, pos: tgt, spread: PI * 2, spd: [0.04, 0.18], drag: 0.8, grav: -0.3, life: [0.4, 0.8], size0: [0.04, 0.065], size1: [0.11, 0.17], jitter: 0.1, driftA: 0.1, alpha: 0.5, glow: 0.05, mode: 0, fadePow: 1.6, ramp: pal.R.smoke },
          { type: 'glowspot', t0: 1.1 * q, t1: 1.55 * q, pos: tgt, r: 0.2 * S, alpha: 0.3, glow: 0.7, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 24. 能量脉冲 —— 双环 + 放射刻度（UI 反馈）
   * ================================================================ */
  reg({
    id: 'ui_pulse', name: '能量脉冲', category: 'ui', loop: false, duration: 0.9,
    desc: '雷达式双环扩散与放射刻度线，适合 UI 确认反馈。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.4, 2, 0.9),
      P.ramp('color', '色板', 'uiGold', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 0.9;
      return {
        meta: { thumbTime: 0.3 * q },
        layers: [
          { type: 'ring', t0: 0, t1: 0.5 * q, r0: 0.05, r1: 0.6 * S, halfW: 0.03, halfW1: 0.012, glow: 1.1 * I, ramp },
          { type: 'ring', t0: 0.1 * q, t1: 0.62 * q, r0: 0.05, r1: 0.45 * S, halfW: 0.02, halfW1: 0.008, alpha: 0.75, glow: 0.9, ramp },
          { type: 'burst', t0: 0, count: 18 * I | 0, kind: 1, spread: PI * 2, spd: [0.5 * S, 1.1 * S], drag: 2.8, life: [0.15, 0.35], size0: [0.005, 0.01], size1: [0.002, 0.004], glow: 1.0, ramp },
          { type: 'flash', t0: 0, t1: 0.18 * q, r: 0.22 * S, glow: 1.1 * I, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 25. 拾取闪光 —— 星形小闪 + 上飘光屑（物品拾取）
   * ================================================================ */
  reg({
    id: 'pickup_sparkle', name: '拾取闪光', category: 'ui', loop: false, duration: 0.8,
    desc: '轻快的星形闪光与上飘光屑，用于物品拾取反馈。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.4, 1.5, 0.8),
      P.ramp('color', '色板', 'uiGold', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 0.8;
      const cross = [];
      for (let i = 0; i < 4; i++) {
        const a = i * HALF_PI + HALF_PI / 4;
        cross.push({ type: 'beam', t0: 0.02 * q, t1: 0.28 * q, from: [0, 0], to: [Math.cos(a) * 0.3 * S, Math.sin(a) * 0.3 * S], width: 0.018, width1: 0.003, grow: 0.3, attack: 0.02, glow: 1.1 * I, ramp });
      }
      return {
        meta: { thumbTime: 0.2 * q },
        layers: [
          { type: 'flash', t0: 0, t1: 0.22 * q, r: 0.22 * S, glow: 1.3 * I, ramp },
          ...cross,
          { type: 'ring', t0: 0.02 * q, t1: 0.4 * q, r0: 0.02, r1: 0.32 * S, halfW: 0.02, halfW1: 0.008, alpha: 0.8, glow: 1.0, ramp },
          { type: 'burst', t0: 0.05 * q, count: 26 * I | 0, kind: 1, angle: -HALF_PI, spread: 2.2, spd: [0.2 * S, 0.9 * S], drag: 1.4, grav: -0.5, life: [0.35, 0.75], size0: [0.007, 0.014], size1: [0.003, 0.006], flicker: 0.5, glow: 1.4, ramp },
        ],
      };
    },
  });

  /* ================================================================
   * 26. 升级之柱 —— 上升光柱 + 环带 + 顶部爆发
   * ================================================================ */
  reg({
    id: 'levelup_pillar', name: '升级之柱', category: 'ui', loop: false, duration: 1.9,
    desc: '角色升级：光柱自下而上推进，环带上升，顶部星屑爆发。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 1, 3.5, 1.9),
      P.ramp('color', '色板', 'holy', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.9;
      const bands = [];
      for (let i = 0; i < 3; i++) {
        bands.push({ type: 'ring', t0: (0.1 + i * 0.22) * q, t1: (0.6 + i * 0.22) * q, pos: [0, 0], r0: 0.1 * S, r1: 0.38 * S, halfW: 0.022, halfW1: 0.01, squishY: 0.22, alpha: 0.65, glow: 0.9, ramp });
      }
      return {
        meta: { thumbTime: 0.55 * q },
        layers: [
          { type: 'glowspot', t0: 0, t1: 0.35 * q, pos: [0, 0.5 * S], r: 0.22 * S, alpha: 0.4 * I, pulse: 6, glow: 1.0, ramp },
          { type: 'beam', t0: 0.3 * q, t1: 1.25 * q, from: [0, 0.6 * S], to: [0, -0.95], width: 0.14 * S, width1: 0.05, grow: 0.35, attack: 0.08, glow: 1.3 * I, ramp },
          ...bands,
          { type: 'vstream', t0: 0.3 * q, t1: 1.3 * q, rate: 30 * I, warm: false, pos: [0, 0.5 * S], spread: PI * 2, spd: [0.2, 0.6], drag: 0.6, grav: -0.8, life: [0.5, 1.0], size0: [0.006, 0.014], size1: [0.005, 0.011], jitter: 0.18, flicker: 0.4, glow: 1.0, ramp },
          { type: 'flash', t0: 1.15 * q, t1: 1.4 * q, pos: [0, -0.55], r: 0.4 * S, glow: 1.4 * I, ramp },
          { type: 'burst', t0: 1.15 * q, count: 30 * I | 0, kind: 2, pos: [0, -0.55], spin: 8, spread: PI * 2, spd: [0.3 * S, 1.2 * S], drag: 1.6, grav: 0.9, life: [0.4, 0.8], size0: [0.01, 0.02], size1: [0.004, 0.008], glow: 1.0, ramp },
          { type: 'ring', t0: 1.16 * q, t1: 1.7 * q, pos: [0, -0.55], r0: 0.05, r1: 0.55 * S, halfW: 0.03, halfW1: 0.012, glow: 1.1 * I, ramp },
        ],
      };
    },
  });

  /* ================================================================
   *  27. 火焰龙卷 —— 底部旋涡 → 上升火柱 → 顶端爆散余烬
   * ================================================================ */
  reg({
    id: 'fire_whirl', name: '火焰龙卷', category: 'fire', loop: false, duration: 1.8,
    desc: '地面旋涡卷起火柱冲天，顶端爆出余烬，带轻微热浪抖动。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 1, 3, 1.8),
      P.range('height', '柱体高度', 0.6, 1.6, 1),
      P.ramp('color', '色板', 'fire', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.8;
      const base = [0, 0.55 * S];
      const top = [0, 0.55 * S - 1.15 * p.height * S];
      return {
        shake: { t0: 0.25 * q, amp: 0.012 * S * I, freq: 7, dur: 1.2 * q },
        meta: { thumbTime: 0.75 * q },
        layers: [
          { type: 'glowspot', t0: 0, t1: 1.4 * q, pos: base, r: 0.3 * S, alpha: 0.5 * I, pulse: 5, glow: 1.2, ramp },
          /* 底部主旋涡：双圈反向搅动 */
          { type: 'swirl', t0: 0.05 * q, t1: 1.45 * q, count: 26 * I | 0, pos: base, r: 0.34 * S, w: 6, trailK: 0.28, size0: [0.012, 0.024], size1: [0.02, 0.035], glow: 1.1 * I, ramp },
          { type: 'swirl', t0: 0.1 * q, t1: 1.4 * q, count: 14 * I | 0, pos: base, r: 0.18 * S, w: 9, dir: -1, trailK: 0.2, size0: [0.01, 0.02], size1: [0.016, 0.028], glow: 1.2 * I, ramp },
          /* 上升火柱：窄角向上持续发射 */
          { type: 'vstream', t0: 0.18 * q, t1: 1.35 * q, rate: 46 * I, warm: false, pos: base, angle: -HALF_PI, spread: 0.4, spd: [1.1 * S, 2.2 * S * p.height], drag: 0.75, grav: -0.55, life: [0.45, 0.8], size0: [0.012, 0.024], size1: [0.03, 0.055], jitter: 0.06, flicker: 0.35, glow: 1.3 * I, ramp },
          /* 顶端碎火与余烬 */
          { type: 'burst', t0: 0.5 * q, count: 22 * I | 0, kind: 1, pos: top, angle: -HALF_PI, spread: PI * 1.4, spd: [0.3 * S, 1.1 * S], spdPow: 1.3, drag: 1.8, grav: 0.5, life: [0.3, 0.7], size0: [0.008, 0.016], size1: [0.003, 0.007], flicker: 0.55, glow: 1.4, ramp },
          { type: 'burst', t0: 0.55 * q, count: 12 * I | 0, kind: 2, pos: top, spin: 9, spread: PI * 2, spd: [0.15 * S, 0.7 * S], drag: 1.4, grav: 0.7, life: [0.4, 0.8], size0: [0.01, 0.02], size1: [0.004, 0.008], glow: 1.0, ramp },
          { type: 'flash', t0: 0.4 * q, t1: 0.6 * q, pos: top, r: 0.3 * S, alpha: 0.7, glow: 1.2 * I, ramp },
          /* 淡烟 */
          { type: 'vstream', t0: 0.7 * q, t1: 1.6 * q, rate: 10 * I, warm: false, pos: top, spread: PI * 2, spd: [0.04, 0.16], drag: 0.7, grav: -0.4, life: [0.6, 1.0], size0: [0.05, 0.09], size1: [0.16, 0.24], jitter: 0.12, driftA: 0.1, alpha: 0.22, glow: 0.05, mode: 0, fadePow: 1.6, ramp: pal.R.smoke },
        ],
      };
    },
  });

  /* ================================================================
   *  28. 冰霜新星 —— 蓄能 → 白炽爆心 → 双重冰环 → 碎冰四射
   * ================================================================ */
  reg({
    id: 'frost_nova', name: '冰霜新星', category: 'water', loop: false, duration: 1.3,
    desc: '寒气内聚后以冰晶新星形式炸开，双重冰环与碎冰碎片四射。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.8, 2.5, 1.3),
      P.ramp('color', '色板', 'ice', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 1.3;
      return {
        shake: { t0: 0.32 * q, amp: 0.02 * S * I, freq: 10, dur: 0.4 * q },
        meta: { thumbTime: 0.36 * q },
        layers: [
          /* 蓄能：向心寒气 */
          { type: 'swirl', t0: 0, t1: 0.3 * q, count: 20 * I | 0, pos: [0, 0], r: 0.4 * S, w: 6, dir: -1, converge: 0.8 * S, trailK: 0.12, size0: [0.008, 0.015], size1: [0.012, 0.02], glow: 1.0, ramp },
          { type: 'glowspot', t0: 0, t1: 0.32 * q, r: 0.2 * S, alpha: 0.5 * I, pulse: 8, glow: 1.2, ramp },
          /* 爆心 */
          { type: 'flash', t0: 0.32 * q, t1: 0.5 * q, r: 0.5 * S, alpha: 0.95, glow: 1.6 * I, ramp },
          /* 双重冰环：外快内慢 */
          { type: 'ring', t0: 0.32 * q, t1: 0.85 * q, r0: 0.05, r1: 0.9 * S, halfW: 0.04, halfW1: 0.014, attack: 0.08, alpha: 0.9, glow: 1.3 * I, ramp },
          { type: 'ring', t0: 0.42 * q, t1: 1.05 * q, r0: 0.03, r1: 0.6 * S, halfW: 0.026, halfW1: 0.01, alpha: 0.55, glow: 0.9 * I, ramp },
          /* 碎冰四射：拉伸碎片 + 自旋大块 */
          { type: 'burst', t0: 0.32 * q, count: 34 * I | 0, kind: 1, spread: PI * 2, spd: [0.7 * S, 2.1 * S], spdPow: 1.5, drag: 2.1, grav: 0.5, life: [0.25, 0.6], size0: [0.008, 0.018], size1: [0.002, 0.006], flicker: 0.4, glow: 1.3, ramp },
          { type: 'burst', t0: 0.36 * q, count: 14 * I | 0, kind: 2, spin: 10, spread: PI * 2, spd: [0.3 * S, 1.0 * S], drag: 1.5, grav: 0.9, life: [0.4, 0.85], size0: [0.012, 0.024], size1: [0.005, 0.01], glow: 0.9, ramp },
          /* 冷雾消散 */
          { type: 'vstream', t0: 0.5 * q, t1: 1.1 * q, rate: 16 * I, warm: false, pos: [0, 0.08 * S], spread: PI * 2, spd: [0.05, 0.22], drag: 0.8, grav: -0.25, life: [0.5, 0.9], size0: [0.05, 0.09], size1: [0.14, 0.2], jitter: 0.12, driftA: 0.08, alpha: 0.3, glow: 0.06, mode: 0, fadePow: 1.6, ramp: pal.makeRamp(['#0a1828', '#14304a', '#285a78', '#4888a8']) },
        ],
      };
    },
  });

  /* ================================================================
   *  29. 冲刺残影 —— 多重拖影横扫 → 头部闪光 → 收尾火花
   * ================================================================ */
  reg({
    id: 'dash_trail', name: '冲刺残影', category: 'hit', loop: false, duration: 0.8,
    desc: '角色朝指定方向高速冲刺，拖出多重残影，终点闪光与逆向火花。',
    params: [
      P.range('scale', '整体尺寸', 0.5, 2, 1),
      P.range('intensity', '强度', 0.4, 2, 1),
      P.range('durationSec', '持续时间(秒)', 0.5, 1.5, 0.8),
      P.angle('angle', '方向(度)'),
      P.ramp('color', '色板', 'slash', COMMON_RAMPS),
    ],
    build(p, pal) {
      const D = p.durationSec, S = p.scale, I = p.intensity;
      const ramp = pal.resolveRamp(p.color);
      const q = D / 0.8;
      const a = (p.angle || 0) * PI / 180;
      const dir = [Math.cos(a), Math.sin(a)];
      const from = [-0.72 * S * dir[0], -0.72 * S * dir[1]];
      const to = [0.62 * S * dir[0], 0.62 * S * dir[1]];
      const back = a + PI;
      return {
        shake: { t0: 0.05 * q, amp: 0.014 * S * I, freq: 14, dur: 0.4 * q },
        meta: { thumbTime: 0.4 * q },
        layers: [
          /* 三重拖影：宽度与亮度递减、时序错开 */
          { type: 'beam', t0: 0, t1: 0.5 * q, from, to, width: 0.075 * S, width1: 0.028, grow: 0.55, attack: 0.05, alpha: 0.95, glow: 1.2 * I, ramp },
          { type: 'beam', t0: 0.05 * q, t1: 0.55 * q, from, to, width: 0.05 * S, width1: 0.018, grow: 0.4, attack: 0.05, alpha: 0.6, glow: 0.9 * I, ramp },
          { type: 'beam', t0: 0.1 * q, t1: 0.62 * q, from, to, width: 0.03 * S, width1: 0.01, grow: 0.3, attack: 0.05, alpha: 0.35, glow: 0.6 * I, ramp },
          /* 头部闪光与终点小环 */
          { type: 'flash', t0: 0.28 * q, t1: 0.48 * q, pos: to, r: 0.3 * S, alpha: 0.85, glow: 1.4 * I, ramp },
          { type: 'ring', t0: 0.32 * q, t1: 0.72 * q, pos: to, r0: 0.03, r1: 0.3 * S, halfW: 0.022, halfW1: 0.008, alpha: 0.6, glow: 0.9 * I, ramp },
          /* 逆向火花与速度线 */
          { type: 'burst', t0: 0.05 * q, count: 24 * I | 0, kind: 1, pos: from, angle: back, spread: 0.9, spd: [0.8 * S, 2.0 * S], spdPow: 1.4, drag: 2.6, life: [0.15, 0.35], size0: [0.006, 0.013], size1: [0.002, 0.005], flicker: 0.5, glow: 1.2, ramp },
          { type: 'vstream', t0: 0.02 * q, t1: 0.45 * q, rate: 22 * I, warm: false, pos: [from[0] * 0.6, from[1] * 0.6], angle: back, spread: 0.5, spd: [1.2 * S, 2.4 * S], drag: 2.4, life: [0.12, 0.28], size0: [0.005, 0.011], size1: [0.004, 0.009], glow: 0.8, ramp },
          /* 起点淡出底光 */
          { type: 'glowspot', t0: 0, t1: 0.4 * q, pos: from, r: 0.18 * S, alpha: 0.3, glow: 0.8, ramp },
        ],
      };
    },
  });

  /* 统计 */
  reg.count = Object.keys(T).length;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof globalThis !== 'undefined' ? globalThis : this);
