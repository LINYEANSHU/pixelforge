/* PixelForge —— 色板与颜色渐变
 * 渐变 = 暗→亮的 hex 停靠点数组，采样为打包 int，零对象分配。
 * 参考概念（仅概念，未复用代码）来自 patch-gg/pixelfx 的 palette 思路。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');
  const hexToInt = PF.hexToInt;

  /* Ramp：停靠点均分为 n 段，预展开成 256 级查找表 —— 采样零计算 */
  function makeRamp(stops) {
    const ints = new Array(stops.length);
    for (let i = 0; i < stops.length; i++) ints[i] = hexToInt(stops[i]);
    const lut = new Int32Array(256);
    const segs = ints.length - 1;
    for (let i = 0; i < 256; i++) {
      const u = i / 255 * segs;
      const s = Math.min(segs - 1, u | 0);
      lut[i] = PF.mixInt(ints[s], ints[s + 1], u - s);
    }
    return { lut, stops: ints, sample(u) { return lut[PF.clamp((u * 255) | 0, 0, 255)]; } };
  }

  /* 常用色板：暗 → 亮 */
  const R = {
    fire: makeRamp(['#1a0400', '#701400', '#c93b00', '#ff7b00', '#ffc83e', '#fff6c8']),
    ember: makeRamp(['#2a0800', '#8a2500', '#e05a00', '#ff9a2a', '#ffd98a']),
    explosion: makeRamp(['#200402', '#8c1d05', '#e65100', '#ff9800', '#ffd54f', '#ffffff']),
    smoke: makeRamp(['#101216', '#2a2d33', '#4a4e57', '#6b707a', '#8f959e']),
    magicBlue: makeRamp(['#06021e', '#241070', '#4b3ff0', '#7a8cff', '#c8d4ff', '#ffffff']),
    magicPurple: makeRamp(['#12021e', '#4a0e78', '#8b2be2', '#b06bff', '#e0c2ff', '#ffffff']),
    lightning: makeRamp(['#101040', '#3040c0', '#60a0ff', '#a8d8ff', '#ffffff']),
    holy: makeRamp(['#301a00', '#a06a00', '#f0b400', '#ffe066', '#fffbe0', '#ffffff']),
    water: makeRamp(['#021430', '#085c8c', '#18a0d8', '#54d0f8', '#c8f4ff']),
    ice: makeRamp(['#041430', '#0a4a78', '#2890d8', '#7cd0f8', '#d8f6ff', '#ffffff']),
    heal: makeRamp(['#02200a', '#0a7a2c', '#2cc85a', '#8af08a', '#e8ffe0']),
    poison: makeRamp(['#0a2000', '#2c6a00', '#6ab000', '#a8e040', '#e0ff9a']),
    slash: makeRamp(['#202030', '#606a90', '#a8c0e0', '#e8f4ff', '#ffffff']),
    hit: makeRamp(['#301004', '#a83810', '#f08030', '#ffc860', '#ffffff']),
    uiGold: makeRamp(['#2a1c02', '#8a6208', '#d8a820', '#ffd860', '#fff8c0']),
    rain: makeRamp(['#1a2430', '#3a5468', '#6088a8', '#98c0d8', '#d0e8f4']),
    blood: makeRamp(['#1a0204', '#6a0a12', '#c02020', '#e85555', '#ffaaaa']),
    shadow: makeRamp(['#0a0612', '#241438', '#4a2a68', '#7a4a98', '#b090c8']),
    /* —— 扩充色板（第二阶段）：暗 → 亮，与上表同风格 —— */
    dawn: makeRamp(['#1a0a2e', '#5a1642', '#c8422e', '#ff9a3c', '#ffe2a0']),      // 晨曦：暗紫→曙红→金
    mint: makeRamp(['#04241c', '#0a5a44', '#18a878', '#5ae0a8', '#dcfff0']),      // 薄荷
    candy: makeRamp(['#3c0a3c', '#a02a8c', '#ff5ab0', '#ff9ad8', '#ffe4f4']),     // 糖果
    abyss: makeRamp(['#020c10', '#0a2a34', '#145060', '#2890a0', '#a8f0f4']),     // 深渊：墨青→冷辉
    rose: makeRamp(['#2a0812', '#781428', '#d8304a', '#ff7a90', '#ffd8e0']),      // 玫瑰
  };
  /* 命名颜色（文字配方解析使用，键为中文） */
  const NAMED = {
    '红': '#c82020', '深红': '#8a1010', '血红': '#a00c14', '粉': '#ff70a0',
    '橙': '#ff7b1a', '橙红': '#ff5a1a', '金': '#ffc832', '金黄': '#ffb820',
    '黄': '#ffe14a', '绿': '#2cc85a', '深绿': '#0e7a30', '青': '#28d8d0',
    '蓝': '#3a6cf0', '深蓝': '#1a2a9a', '蓝紫': '#7a4aff', '紫': '#8b2be2', '浅蓝': '#7ab8f0', '蓝白': '#a8d0ff', '青蓝': '#20a0d0',
    '浅紫': '#b06bff', '白': '#f8f8f8', '黑': '#202020', '棕': '#7a4a20',
    '灰': '#8a8f98', '亮': '#ffffff',
  };

  /* 解析用户色板参数：命名色板 | 单色 hex（自动生成暗→亮渐变） */
  function resolveRamp(v) {
    if (!v) return R.fire;
    if (R[v]) return R[v];
    let h = String(v).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const c = parseInt(h, 16) & 0xFFFFFF;
    return makeRamp([
      PF.intToHex(PF.mixInt(c, 0x000000, 0.78)),
      PF.intToHex(PF.mixInt(c, 0x000000, 0.35)),
      PF.intToHex(c),
      PF.intToHex(PF.mixInt(c, 0xFFFFFF, 0.55)),
      '#ffffff',
    ]);
  }

  PF.palette = { makeRamp, resolveRamp, R, NAMED };
  if (typeof module !== 'undefined' && module.exports) module.exports = PF.palette;
})(typeof globalThis !== 'undefined' ? globalThis : this);
