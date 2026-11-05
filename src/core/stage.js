/* PixelForge —— 极简测试场
 * 稻草假人 + 简易攻击者剪影 + 60FPS 包络动画（前摇→命中→后摇）。
 * 不是战斗游戏：只提供“效果挂在谁身上”的参照物。
 * 全部用光栅算子绘制（扁色 stamp/beam），参与同一渲染管线与震屏变换。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');

  const GROUND = 0.62;          // 地面 y（世界坐标，向下为正）
  const DX = 0.42;              // 假人 x
  const HX = -0.55;             // 攻击者 x
  const WINDUP = 0.42;          // 前摇时长
  const RECOVER = 1.0;          // 后摇时长

  /* 一段攻击的时间轴状态：t 相对触发时刻 */
  function phase(t) {
    if (t < 0) return { name: 'idle', k: 0 };
    if (t < WINDUP) return { name: 'windup', k: t / WINDUP };
    if (t < WINDUP + 0.05) return { name: 'hit', k: (t - WINDUP) / 0.05 };
    if (t < WINDUP + RECOVER) return { name: 'recover', k: (t - WINDUP) / RECOVER };
    return { name: 'idle', k: 0 };
  }

  /* 绘制：t 为相对攻击触发的时间（负数=未触发） */
  function draw(R, t, opts) {
    opts = opts || {};
    const ph = phase(t);
    const lerp = PF.lerp, eo = PF.easeOutQuad;
    /* ---- 地面 ---- */
    R.beam(-1, GROUND + 0.06, 1, GROUND + 0.06, 0.012, 0x2c313c, 0.8, 0, 0);
    R.beam(-1, GROUND + 0.065, 1, GROUND + 0.065, 0.004, 0x3c424e, 0.35, 0, 0);

    /* ---- 假人（命中后轻微后仰+回弹） ---- */
    let lean = 0, kx = 0;
    if (ph.name === 'hit') { lean = 0.5 * ph.k; kx = 0.06 * ph.k; }
    else if (ph.name === 'recover') { lean = 0.5 * Math.exp(-ph.k * 4) * Math.cos(ph.k * 14); kx = 0.06 * Math.exp(-ph.k * 4) * Math.cos(ph.k * 10); }
    const dx = DX + kx;
    const straw = 0xb09048, strawD = 0x7a6330, rope = 0x5a4620;
    /* 支架 */
    R.beam(dx, GROUND, dx, GROUND - 0.28, 0.014, 0x4a4038, 1, 0, 0);
    /* 身体：两段倾斜胶囊 */
    const by = GROUND - 0.28;
    const bx2 = dx + Math.sin(lean) * 0.16, by2 = by - Math.cos(lean) * 0.26;
    R.beam(dx, by, bx2, by2, 0.075, straw, 1, 0, 0);
    R.beam(dx, by + 0.02, bx2, by2 + 0.02, 0.05, strawD, 0.5, 0, 0);
    /* 头 */
    R.stamp(bx2 + Math.sin(lean) * 0.05, by2 - 0.09, 0.075, straw, 1, 0, 0);
    R.stamp(bx2 + Math.sin(lean) * 0.05 - 0.02, by2 - 0.11, 0.045, strawD, 0.6, 0, 0);
    /* 绑绳 */
    R.beam(dx - 0.05 + Math.sin(lean) * 0.08, by - 0.08, dx + 0.05 + Math.sin(lean) * 0.08, by - 0.1, 0.014, rope, 1, 0, 0);
    /* 命中白闪 */
    if (ph.name === 'hit') R.stamp(dx, by - 0.15, 0.22, 0xffffff, 0.7 * (1 - ph.k), 0.5, 1);

    /* ---- 攻击者剪影 ---- */
    /* 前摇：手臂举起蓄力；命中瞬间：手臂前伸 */
    let arm = 0, step = 0;
    if (ph.name === 'windup') { arm = -0.5 * Math.sin(ph.k * Math.PI); step = 0.05 * ph.k; }
    else if (ph.name === 'hit') { arm = 0.22; step = 0.1; }
    else if (ph.name === 'recover') { arm = 0.22 * (1 - ph.k); step = 0.1 * (1 - ph.k); }
    const hx = HX + step;
    const body = 0x3a4252, bodyD = 0x272d3a;
    R.beam(hx, GROUND, hx, GROUND - 0.3, 0.06, body, 1, 0, 0);           // 腿/躯干
    R.beam(hx, GROUND - 0.18, hx + 0.03, GROUND - 0.42, 0.05, bodyD, 1, 0, 0); // 上身
    R.stamp(hx + 0.03, GROUND - 0.5, 0.06, body, 1, 0, 0);               // 头
    /* 武器臂：从肩到手的线，蓄力时上举后摆，命中时前指 */
    const sx = hx + 0.03, sy = GROUND - 0.38;
    const hax = sx + 0.16 + arm * 0.5, hay = sy + arm * 0.35 - (ph.name === 'windup' ? Math.abs(arm) * 0.25 : 0);
    R.beam(sx, sy, hax, hay, 0.018, body, 1, 0, 0);
    /* 武器（短剑线） */
    const wax = hax + 0.14 + (ph.name === 'windup' ? 0 : 0.06), way = hay - 0.1 + (ph.name === 'windup' ? arm * 0.3 : 0);
    R.beam(hax, hay, wax, way, 0.012, 0x9aa4b8, 1, 0.2, 0);
    /* 蓄力微光 */
    if (ph.name === 'windup' && opts.glow !== false) {
      R.stamp(sx + 0.1, sy - 0.05, 0.1 * ph.k, 0xd8e4ff, 0.25 * ph.k, 0.6, 1);
    }
  }

  const STAGE = { draw, phase, GROUND, DX, HX, WINDUP, RECOVER };
  if (typeof globalThis !== 'undefined') {
    globalThis.PF_STAGE = STAGE;
    if (globalThis.PF) globalThis.PF.stage = STAGE;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = STAGE;
})(typeof globalThis !== 'undefined' ? globalThis : this);
