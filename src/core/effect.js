/* PixelForge —— 效果实例：配置 + 种子 → 图层组 → 可复现时间采样
 * 职责：模板查找、参数校验与合并、粒子预算按层分配、渲染帧、
 *       配方 JSON 序列化/解析、震屏曲线。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');
  const rngMod = (root.PF && root.PF.rng) ? root.PF.rng : require('./rng.js');
  const Layers = (root.PF && root.PF.Layers) ? root.PF.Layers : require('./layers.js');
  const palette = (root.PF && root.PF.palette) ? root.PF.palette : require('./palette.js');
  const { clamp } = PF;

  PF.TEMPLATES = {};
  PF.CATEGORIES = [
    { id: 'explosion', name: '爆炸/冲击' },
    { id: 'fire', name: '火焰' },
    { id: 'lightning', name: '闪电' },
    { id: 'magic', name: '魔法' },
    { id: 'smoke', name: '烟雾/天气' },
    { id: 'water', name: '水/冰' },
    { id: 'hit', name: '命中' },
    { id: 'ui', name: 'UI反馈' },
  ];

  /* ---------- 参数校验 ---------- */
  function validateParams(def, params) {
    const errors = [], out = {};
    /* schema 支持数组或对象两种形态，统一转为 key→schema 映射 */
    const schema = Array.isArray(def.params)
      ? (() => { const m = {}; for (const s of def.params) m[s.key] = s; return m; })()
      : def.params;
    for (const key of Object.keys(params || {})) {
      if (!(key in schema)) { errors.push('未知参数: ' + key); continue; }
      out[key] = params[key];
    }
    for (const key of Object.keys(schema)) {
      const s = schema[key], v = out[key];
      if (v === undefined) { out[key] = s.default; continue; }
      if (s.type === 'range') {
        if (typeof v !== 'number' || !isFinite(v)) { errors.push('参数 ' + key + ' 需要数字'); continue; }
        out[key] = clamp(v, s.min, s.max);
      } else if (s.type === 'bool') {
        out[key] = !!v;
      } else if (s.type === 'select') {
        if (s.options.indexOf(v) < 0) { errors.push('参数 ' + key + ' 的取值必须是: ' + s.options.join('/')); continue; }
      } else if (s.type === 'ramp') {
        if (typeof v !== 'string' || !/^#?[0-9a-fA-F]{3,8}$/.test(v) && !palette.R[v]) {
          /* 允许命名色板或单色 hex（单色自动生成双端渐变） */
          errors.push('参数 ' + key + ' 不是有效颜色/色板: ' + v);
        }
      } else if (s.type === 'angle') {
        if (typeof v !== 'number' || !isFinite(v)) { errors.push('参数 ' + key + ' 需要角度数字'); continue; }
        out[key] = ((v % 360) + 360) % 360;
      }
    }
    return { errors, params: out };
  }

  function resolveRamp(v) { return palette.resolveRamp(v); }

  /* 按预算缩放图层规格 */
  function scaleSpecs(specs, k) {
    if (k >= 1) return;
    for (const s of specs) {
      if (s.type === 'burst' || s.type === 'swirl') {
        if (s.count !== undefined) s.count = Math.max(1, Math.round(s.count * k));
      } else if (s.type === 'vstream') {
        if (s.rate !== undefined) s.rate = s.rate * k;
      }
    }
  }

  function makeEffect(config) {
    const def = PF.TEMPLATES[config.template];
    if (!def) throw new Error('模板不存在: ' + config.template);
    const v = validateParams(def, config.params || {});
    if (v.errors.length) throw new Error('参数校验失败: ' + v.errors.join('; '));
    const params = v.params;
    const seed = rngMod.normSeed(config.seed === undefined ? 1 : config.seed);
    const budget = clamp(config.budget === undefined ? PF.DEFAULT_BUDGET : config.budget, 64, 4000) | 0;
    const canvasSize = clamp(config.canvasSize === undefined ? PF.DEFAULT_CANVAS : config.canvasSize, 16, 512) | 0;
    const durationSec = clamp(params.durationSec !== undefined ? params.durationSec : def.duration, 0.1, 30);
    const loop = !!(config.loop === undefined ? def.loop : config.loop);

    /* 构建图层规格（深拷贝，避免模板定义被污染） */
    const built = def.build(params, palette);
    const specs = built.layers.map(s => Object.assign({}, s));
    /* 预算分配：估算总量，超限按比例缩 */
    let estimate = 0;
    for (const s of specs) {
      if (s.type === 'burst' || s.type === 'swirl') estimate += s.count || 0;
      else if (s.type === 'vstream') estimate += Math.ceil((s.rate || 0) * ((s.life || [0.5, 1])[1]));
      else estimate += 1;
    }
    const k = estimate > budget ? budget / estimate : 1;
    scaleSpecs(specs, k);

    const modD = loop ? durationSec : 0;
    const layers = specs.map((s, i) => Layers.make(s, seed, i, modD));
    const maxActive = Layers.maxActive(layers);

    const eff = {
      kind: 'effect',
      def, params, seed, budget, canvasSize, loop, durationSec,
      layers, specs, maxActive,
      estimate: Math.min(estimate, budget),
      meta: built.meta || {},
      shakeSpec: built.shake || null,
      config: { template: config.template, params, seed, budget, canvasSize, loop },
      /* 帧时间：t = n/60（精确时间基，勿用累积毫秒） */
      frameCount() {
        return Math.max(2, Math.round(durationSec * PF.FPS));
      },
      timeOfFrame(k) { return k / PF.FPS; },
      renderFrame(n, R, opts) {
        R.clear();
        return this.renderLocal(n * PF.DT, R, opts);
      },
      /* 在指定本地时间 t 渲染（不清屏，供组合器与插值使用） */
      renderLocal(t, R, opts) {
        const ls = layers;
        for (let i = 0; i < ls.length; i++) ls[i].render(t, R);
        return t;
      },
      /* 震屏偏移（渲染层应用，默认不烘入导出） */
      shakeOffset(t, out) {
        if (!this.shakeSpec) { out[0] = out[1] = 0; return out; }
        const s = this.shakeSpec;
        const lt = this.loop ? (t % this.durationSec) : t - s.t0;
        if (lt < 0 || lt > s.dur) { out[0] = out[1] = 0; return out; }
        const decay = 1 - lt / s.dur;
        const amp = s.amp * decay * decay;
        out[0] = Math.sin(lt * s.freq * 37.7) * amp;
        out[1] = Math.cos(lt * s.freq * 29.3) * amp * 0.7;
        return out;
      },
      /* 缩略图最佳时刻（模板可声明） */
      thumbTime() { return built.meta.thumbTime !== undefined ? built.meta.thumbTime : this.durationSec * 0.35; },
    };
    return eff;
  }

  /* ---------- 配方 JSON ---------- */
  function recipeToJSON(effOrConfig, note) {
    const c = effOrConfig.config || effOrConfig;
    if (c.items) {
      return {
        format: 'pixelforge.recipe',
        version: 1,
        app: PF.APP_NAME + ' ' + PF.VERSION,
        combo: true,
        items: c.items,
        budget: c.budget || PF.DEFAULT_BUDGET,
        canvasSize: c.canvasSize || PF.DEFAULT_CANVAS,
        note: note || '',
      };
    }
    return {
      format: 'pixelforge.recipe',
      version: 1,
      app: PF.APP_NAME + ' ' + PF.VERSION,
      template: c.template,
      params: c.params,
      seed: c.seed,
      loop: !!c.loop,
      budget: c.budget || PF.DEFAULT_BUDGET,
      canvasSize: c.canvasSize || PF.DEFAULT_CANVAS,
      note: note || '',
    };
  }

  function recipeFromJSON(json) {
    if (!json || typeof json !== 'object') return { ok: false, errors: ['不是有效的 JSON 对象'] };
    const errors = [];
    if (json.format !== 'pixelforge.recipe') errors.push('format 必须是 pixelforge.recipe');
    if (json.version !== 1) errors.push('不支持的配方版本: ' + json.version);
    if (json.combo) {
      if (!Array.isArray(json.items) || json.items.length < 1 || json.items.length > 4) {
        return { ok: false, errors: errors.concat(['组合 items 需要 1..4 个元素']) };
      }
      for (let i = 0; i < json.items.length; i++) {
        const it = json.items[i];
        if (!it || !it.config || typeof it.config.template !== 'string' || !PF.TEMPLATES[it.config.template]) {
          errors.push('组合层 ' + (i + 1) + ' 模板无效');
        }
      }
      if (errors.length) return { ok: false, errors };
      return {
        ok: true,
        config: {
          items: json.items,
          budget: json.budget,
          canvasSize: json.canvasSize,
        },
      };
    }
    if (typeof json.template !== 'string' || !PF.TEMPLATES[json.template]) {
      errors.push('未知模板: ' + json.template);
      return { ok: false, errors };
    }
    if (json.seed !== undefined && (typeof json.seed !== 'number' || !isFinite(json.seed))) {
      errors.push('seed 必须是数字');
    }
    if (json.params && typeof json.params !== 'object') errors.push('params 必须是对象');
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      config: {
        template: json.template,
        params: json.params || {},
        seed: json.seed === undefined ? 1 : json.seed,
        loop: json.loop,
        budget: json.budget,
        canvasSize: json.canvasSize,
      },
    };
  }

  /* 组合效果（≤4 层）：每层独立模板实例 + 时间/位置/缩放/色板覆盖 */
  function makeCombo(config) {
    const items = config.items || [];
    if (items.length < 1 || items.length > 4) throw new Error('组合器需要 1..4 个图层');
    for (const it of items) {
      if (!it || !it.config || !PF.TEMPLATES[it.config.template]) throw new Error('组合层缺少有效模板');
    }
    const subs = items.map(it => {
      const cfg = Object.assign({}, it.config);
      cfg.budget = Math.max(64, Math.round((config.budget || PF.DEFAULT_BUDGET) / items.length));
      const eff = makeEffect(cfg);
      return { eff, start: clamp(it.start || 0, 0, 60), dur: clamp(it.dur || eff.durationSec, 0.1, 60), off: it.off || [0, 0], scale: clamp(it.scale || 1, 0.2, 2.5), ramp: it.ramp || null };
    });
    const totalDur = Math.max.apply(null, subs.map(s => s.start + s.dur));
    const combo = {
      kind: 'combo', subs, durationSec: totalDur,
      loop: !!config.loop,
      canvasSize: clamp(config.canvasSize === undefined ? PF.DEFAULT_CANVAS : config.canvasSize, 16, 512) | 0,
      maxActive: subs.reduce((a, s) => a + s.eff.maxActive, 0),
      config,
      frameCount() { return Math.max(2, Math.round(totalDur * PF.FPS)); },
      timeOfFrame(k) { return k / PF.FPS; },
      renderFrame(n, R, opts) {
        R.clear();
        this.renderLocal(n * PF.DT, R, opts);
      },
      renderLocal(t, R, opts) {
        for (const s of subs) {
          const lt = t - s.start;
          if (lt < 0 || lt > s.dur) continue;
          if (s.scale !== 1 || s.off[0] !== 0 || s.off[1] !== 0) {
            R.pushTransform(s.off[0], s.off[1], s.scale);
            s.eff.renderLocal(lt, R, opts);
            R.popTransform();
          } else {
            s.eff.renderLocal(lt, R, opts);
          }
        }
      },
      thumbTime() { return totalDur * 0.4; },
      shakeOffset(t, out) { out[0] = out[1] = 0; return out; },
    };
    return combo;
  }

  PF.validateParams = validateParams;
  PF.resolveRamp = resolveRamp;
  PF.makeEffect = makeEffect;
  PF.makeCombo = makeCombo;
  PF.recipeToJSON = recipeToJSON;
  PF.recipeFromJSON = recipeFromJSON;
  if (typeof module !== 'undefined' && module.exports) module.exports = PF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
