/* PixelForge —— 一键变体引擎
 * 合理扰动参数与种子，保留用户锁定项。
 * 规则：种子必换；解锁参数 60% 在合法范围内随机、40% 在当前值附近抖动；
 * 色板仅在未锁定时换；循环模板不扰动 duration（无该参数）。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');
  const rngMod = (root.PF && root.PF.rng) ? root.PF.rng : require('./rng.js');
  const palette = (root.PF && root.PF.palette) ? root.PF.palette : require('./palette.js');

  function randRange(a, b) { return a + Math.random() * (b - a); }

  function mutate(config, locks) {
    locks = locks || {};
    const def = PF.TEMPLATES[config.template];
    if (!def) throw new Error('模板不存在');
    const params = {};
    for (const s of def.params) {
      const cur = (config.params && config.params[s.key] !== undefined) ? config.params[s.key] : s.default;
      if (locks[s.key]) { params[s.key] = cur; continue; }
      if (s.type === 'range') {
        params[s.key] = Math.random() < 0.6
          ? randRange(s.min, s.max)
          : PF.clamp(cur + (Math.random() - 0.5) * (s.max - s.min) * 0.4, s.min, s.max);
        if (s.step >= 1) params[s.key] = Math.round(params[s.key]);
      } else if (s.type === 'ramp') {
        const opts = (s.options && s.options.length ? s.options : Object.keys(palette.R));
        params[s.key] = opts[(Math.random() * opts.length) | 0];
      } else if (s.type === 'angle') {
        params[s.key] = Math.round(randRange(0, 359));
      } else if (s.type === 'bool') {
        params[s.key] = Math.random() < 0.3 ? !cur : cur;
      } else if (s.type === 'select') {
        params[s.key] = s.options[(Math.random() * s.options.length) | 0];
      } else {
        params[s.key] = cur;
      }
    }
    return {
      template: config.template,
      params,
      seed: rngMod.randomSeed(),
      loop: config.loop,
      budget: config.budget,
      canvasSize: config.canvasSize,
    };
  }

  /* 扰动强度档位：subtle / normal / wild */
  function mutateStyled(config, locks, style) {
    const out = mutate(config, locks);
    if (style === 'subtle') {
      /* 向默认值收敛一半 */
      const def = PF.TEMPLATES[out.template];
      for (const s of def.params) {
        if (s.type === 'range' && !locks[s.key]) {
          const dflt = s.default;
          out.params[s.key] = (out.params[s.key] + dflt) / 2;
        } else if (s.type === 'ramp' && !locks[s.key]) {
          const cur = (config.params && config.params[s.key]) || s.default;
          out.params[s.key] = cur; /* subtle 保留原色板 */
        }
      }
    }
    return out;
  }

  const VARIANT = { mutate, mutateStyled };
  if (typeof globalThis !== 'undefined') {
    globalThis.PF_VARIANT = VARIANT;
    if (globalThis.PF) globalThis.PF.variant = VARIANT;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = VARIANT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
