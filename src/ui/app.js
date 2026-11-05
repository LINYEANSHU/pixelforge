/* PixelForge 特效工厂 —— 主控制器
 * 预览循环：连续时间 t 渲染（与导出 t=k/60 共用同一求值路径 → 天然一致）
 * 打开即播：boot 完成后立即播放“魔法爆炸”完整四阶段效果。
 */
(function () {
  'use strict';
  const PF = globalThis.PF;
  const $ = id => document.getElementById(id);
  const PARSER = globalThis.PF_PARSER, STAGE = globalThis.PF_STAGE;
  const I18N = globalThis.PF_I18N;
  const T = k => I18N.t(k);
  const fmt = (...a) => I18N.fmt.apply(I18N, a);

  /* ---------- 应用状态 ---------- */
  const S = {
    config: { template: 'magic_explosion', params: {}, seed: 42, loop: false, budget: 1000, canvasSize: 256 },
    eff: null,
    isCombo: false,
    playing: true,
    t: 0,
    speed: 1,
    locks: {},
    undo: [],
    favs: [],
    cat: 'all',
    stageOn: false,
    stageT: -1,          // -1 = 未触发
    reduceFlash: false,
    shake: true,
    hudOn: false,
    // 测量
    fps: 0, msSim: 0, msDraw: 0, frames: 0, fpsT: 0,
    job: null,           // 导出任务 {id, worker|null, cancelFlag}
  };
  try { S.favs = JSON.parse(localStorage.getItem('pf.favs') || '[]'); } catch (e) { S.favs = []; }

  const R = new PF.CpuRaster(256);
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');
  const disp = $('preview');
  const dctx = disp.getContext('2d');
  const compBuf = { buf: null };
  const compImg = { img: null, size: 0 };   // 复用 ImageData，避免每帧分配+双重拷贝

  function toast(msg, err) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  /* ---------- 效果构建 ---------- */
  function buildEffect() {
    try {
      if (S.config.items) {
        S.eff = PF.makeCombo(S.config);
        S.isCombo = true;
      } else {
        S.eff = PF.makeEffect(S.config);
        S.isCombo = false;
      }
    } catch (e) {
      toast(T('toast.buildFail') + e.message, true);
      return false;
    }
    R.resize(S.eff.canvasSize);
    offCanvas.width = offCanvas.height = S.eff.canvasSize;
    S.t = 0; S.stageT = -1;
    fitDisplay();
    renderNow();   // 立即出画面（后台节流下 rAF 可能延迟）
    return true;
  }

  function currentDuration() { return S.eff ? S.eff.durationSec : 2; }
  function frameCount() { return S.eff ? S.eff.frameCount() : 132; }

  /* ---------- 显示尺寸自适应 ---------- */
  function fitDisplay() {
    const wrap = $('preview-wrap');
    const pad = 24;
    const w = wrap.clientWidth - pad, h = wrap.clientHeight - pad;
    const size = Math.max(64, Math.min(w, h, 720));
    const q = Math.max(1, Math.floor(size / S.eff.canvasSize));
    disp.width = disp.height = q * S.eff.canvasSize;
    dctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', () => { if (S.eff) fitDisplay(); });

  /* ---------- 模板网格 ---------- */
  const thumbCache = {};
  function makeThumb(id) {
    if (thumbCache[id]) return thumbCache[id];
    const c = document.createElement('canvas');
    c.width = c.height = 72;
    const ctx = c.getContext('2d');
    const r2 = new PF.CpuRaster(72);
    try {
      const eff = PF.makeEffect({ template: id, seed: 7, canvasSize: 72 });
      eff.renderFrame(Math.min(eff.frameCount() - 1, Math.round(eff.thumbTime() * 60)), r2);
      const out = r2.composite(null, true);
      const img = new ImageData(new Uint8ClampedArray(out), 72, 72);
      ctx.putImageData(img, 0, 0);
    } catch (e) { /* 缩略图失败不阻断 */ }
    thumbCache[id] = c.toDataURL();
    return thumbCache[id];
  }
  function buildGrid() {
    const grid = $('grid');
    grid.innerHTML = '';
    let n = 0;
    for (const id of Object.keys(PF.TEMPLATES)) {
      const def = PF.TEMPLATES[id];
      if (S.cat !== 'all' && def.category !== S.cat) continue;
      n++;
      const cell = document.createElement('div');
      cell.className = 'cell' + (S.config.template === id && !S.isCombo ? ' on' : '');
      cell.innerHTML = '<img loading="lazy" src="' + makeThumb(id) + '"><div class="nm">' + esc(I18N.tplName(def)) + (def.loop ? ' ⟳' : '') + '</div>';
      cell.title = I18N.tplDesc(def) || I18N.tplName(def);
      cell.onclick = () => {
        pushUndo();
        S.config = { template: id, params: {}, seed: PF.rng.randomSeed(), loop: def.loop, budget: +$('budget').value || 1000, canvasSize: +$('canvas-size').value };
        S.locks = {};
        if (buildEffect()) { buildParams(); buildGrid(); updateNameplate(); }
      };
      grid.appendChild(cell);
    }
    $('tpl-count').textContent = '(' + Object.keys(PF.TEMPLATES).length + ')';
  }
  function buildCats() {
    const cats = $('cats');
    cats.innerHTML = '';
    const mk = (id, name) => {
      const el = document.createElement('div');
      el.className = 'cat' + (S.cat === id ? ' on' : '');
      el.textContent = name;
      el.onclick = () => { S.cat = id; buildCats(); buildGrid(); };
      cats.appendChild(el);
    };
    mk('all', T('cat.all'));
    for (const c of PF.CATEGORIES) mk(c.id, I18N.catName(c));
  }
  function updateNameplate() {
    if (S.isCombo) { $('np-name').textContent = T('combo.effect'); $('np-desc').textContent = fmt('combo.layers', S.eff.subs.length); return; }
    const def = PF.TEMPLATES[S.config.template];
    $('np-name').textContent = I18N.tplName(def) + (def.loop ? ' ⟳' : '');
    $('np-desc').textContent = I18N.tplDesc(def);
  }

  /* ---------- 参数面板 ---------- */
  function rampSwatch(rampName) {
    const ramp = PF.palette.resolveRamp(rampName);
    let css = 'linear-gradient(90deg';
    for (let i = 0; i <= 4; i++) css += ',' + PF.intToCss(ramp.sample(i / 4));
    return css + ')';
  }
  function buildParams() {
    if (S.isCombo) { $('params').innerHTML = '<div class="dim small">' + esc(T('params.comboHint')) + '</div>'; return; }
    const def = PF.TEMPLATES[S.config.template];
    const box = $('params');
    box.innerHTML = '';
    for (const s of def.params) {
      const row = document.createElement('div');
      row.className = 'p-row';
      const cur = S.config.params[s.key] !== undefined ? S.config.params[s.key] : s.default;
      const lock = document.createElement('span');
      lock.className = 'lock' + (S.locks[s.key] ? ' on' : '');
      lock.textContent = S.locks[s.key] ? '🔒' : '🔓';
      lock.title = T('param.lockTip');
      lock.onclick = () => { S.locks[s.key] = !S.locks[s.key]; buildParams(); };
      const name = document.createElement('span');
      name.className = 'p-name';
      name.textContent = I18N.paramLabel(s.label);
      name.title = I18N.paramLabel(s.label);
      if (s.type === 'range' || s.type === 'angle') {
        const isAngle = s.type === 'angle';
        const min = isAngle ? 0 : s.min, max = isAngle ? 359 : s.max;
        const sl = document.createElement('input');
        sl.type = 'range'; sl.min = min; sl.max = max; sl.step = isAngle ? 1 : (s.step || 0.01); sl.value = cur;
        const val = document.createElement('span');
        val.className = 'p-val';
        val.textContent = isAngle ? (cur + '°') : (+cur).toFixed(2);
        sl.oninput = () => {
          const v = +sl.value;
          S.config.params[s.key] = v;
          val.textContent = isAngle ? (v + '°') : v.toFixed(2);
          applyParamLive();
        };
        row.append(lock, name, sl, val);
      } else if (s.type === 'ramp') {
        const sw = document.createElement('div');
        sw.className = 'ramp-swatches';
        const opts = s.options || Object.keys(PF.palette.R);
        for (const o of opts) {
          const el = document.createElement('div');
          el.className = 'swatch' + (o === cur ? ' on' : '');
          el.style.background = rampSwatch(o);
          el.title = o;
          el.onclick = () => { S.config.params[s.key] = o; applyParamLive(); buildParams(); };
          sw.appendChild(el);
        }
        row.append(lock, name, sw);
      } else if (s.type === 'bool') {
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !!cur;
        cb.onchange = () => { S.config.params[s.key] = cb.checked; applyParamLive(); };
        row.append(lock, name, cb);
      }
      box.appendChild(row);
    }
  }
  /* 参数热更新：同模板直接重建（纯函数构建，代价 ~1ms） */
  function applyParamLive() {
    if (S.isCombo) return;
    const eff = PF.makeEffect(S.config);
    S.eff = eff;
    if (eff.canvasSize !== R.size) { R.resize(eff.canvasSize); offCanvas.width = offCanvas.height = eff.canvasSize; fitDisplay(); }
  }

  /* ---------- 时间轴 ---------- */
  function setScrub() {
    const n = frameCount();
    const sc = $('scrub');
    sc.max = n - 1;
    const f = Math.round(S.t * 60) % n;
    sc.value = f;
    $('frame-label').textContent = f + ' / ' + n;
  }
  $('btn-play').onclick = () => {
    S.playing = !S.playing;
    $('btn-play').textContent = S.playing ? '⏸' : '▶';
  };
  function stepFrame(d) {
    S.playing = false;
    $('btn-play').textContent = '▶';
    const n = frameCount();
    const f = ((Math.round(S.t * 60) % n) + n + d) % n;
    S.t = f / 60;
    renderNow();
  }
  $('btn-prev').onclick = () => stepFrame(-1);
  $('btn-next').onclick = () => stepFrame(1);
  $('btn-restart').onclick = () => { S.t = 0; S.stageT = -1; renderNow(); };
  $('speed').onchange = e => { S.speed = +e.target.value; };
  $('scrub').oninput = e => {
    S.playing = false;
    $('btn-play').textContent = '▶';
    S.t = (+e.target.value) / 60;
    renderNow();       // 拖动即渲染，不等下一帧 rAF
  };

  /* ---------- 顶栏开关 ---------- */
  $('tgl-shake').onchange = e => { S.shake = e.target.checked; };
  $('tgl-flash').onchange = e => { S.reduceFlash = e.target.checked; };
  $('tgl-stage').onchange = e => { S.stageOn = e.target.checked; if (S.stageOn) S.stageT = -1; };
  $('btn-stage-play').onclick = () => { S.stageOn = true; $('tgl-stage').checked = true; S.stageT = 0; S.t = 0; };
  $('btn-hud').onclick = () => { S.hudOn = !S.hudOn; $('hud').classList.toggle('hidden', !S.hudOn); };

  /* ---------- 文字配方 ---------- */
  /* 匹配项含义本地化：parser 输出结构化 {k, v}，由 UI 决定文案 */
  function chipMeaning(m) {
    if (typeof m.meaning === 'string') return m.meaning;   // 兼容旧结构
    const v = m.meaning.v;
    switch (m.meaning.k) {
      case 'tpl': return T('chip.tpl') + (PF.TEMPLATES[v] ? I18N.tplName(PF.TEMPLATES[v]) : v);
      case 'color': return T('chip.color') + v;
      case 'mod': return T('chip.mod') + v;
      case 'dur': return fmt('chip.dur', v);
      case 'rel': return T('chip.rel') + v;
      default: return String(v);
    }
  }
  $('btn-parse').onclick = () => {
    const text = $('recipe-input').value;
    const r = PARSER.parse(text);
    const box = $('parse-result');
    box.innerHTML = '';
    const chips = document.createElement('div');
    chips.className = 'parse-chips';
    const sep = T('list.separator');
    if (!r.ok) {
      chips.innerHTML = '<span class="chip warn">' + esc(T('parse.noTemplate')) + '</span>';
      box.appendChild(chips);
      box.innerHTML += '<div class="parse-unknown">' + esc(fmt('parse.cannot', r.unknown.join(sep) || text)) +
        '<br>' + esc(T('parse.tryWords')) + '</div>';
      return;
    }
    chips.innerHTML = '<span class="chip tpl">' + esc(I18N.tplName(PF.TEMPLATES[r.template])) + '</span>' +
      r.matched.map(m => '<span class="chip">' + esc(m.token) + '→' + esc(chipMeaning(m)) + '</span>').join('');
    box.appendChild(chips);
    if (r.unknown.length) {
      const u = document.createElement('div');
      u.className = 'parse-unknown';
      u.textContent = fmt('parse.ignored', r.unknown.join(sep));
      box.appendChild(u);
    } else {
      const ok = document.createElement('div');
      ok.className = 'parse-ok';
      ok.textContent = T('parse.allGood');
      box.appendChild(ok);
    }
    pushUndo();
    const def = PF.TEMPLATES[r.template];
    S.config = {
      template: r.template,
      params: r.params,
      seed: PF.rng.randomSeed(),
      loop: r.loop !== undefined ? r.loop : def.loop,
      budget: +$('budget').value || 1000,
      canvasSize: +$('canvas-size').value,
    };
    S.locks = {};
    $('loop-tgl').checked = S.config.loop;
    if (buildEffect()) { buildParams(); buildGrid(); updateNameplate(); }
  };
  $('btn-examples').onclick = () => {
    const ex = I18N.examples();
    $('recipe-input').value = ex[(Math.random() * ex.length) | 0];
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------- 种子/循环/画布/预算 ---------- */
  $('seed').onchange = e => { S.config.seed = +e.target.value | 0; if (buildEffect()) updateNameplate(); };
  $('btn-dice').onclick = () => { pushUndo(); S.config.seed = PF.rng.randomSeed(); $('seed').value = S.config.seed; if (buildEffect()) updateNameplate(); };
  $('loop-tgl').onchange = e => {
    pushUndo();
    S.config.loop = e.target.checked;
    if (!S.isCombo) S.config.template && (S.config.params.durationSec = S.config.params.durationSec);
    if (buildEffect()) updateNameplate();
  };
  $('canvas-size').onchange = e => { S.config.canvasSize = +e.target.value; if (buildEffect()) { buildParams(); updateNameplate(); } };
  $('budget').onchange = e => { S.config.budget = +e.target.value | 0; if (buildEffect()) updateNameplate(); };

  /* ---------- 变体 / 撤销 / 收藏 ---------- */
  $('btn-variant').onclick = () => {
    if (S.isCombo) { toast(T('toast.comboNoVariant'), true); return; }
    pushUndo();
    const style = $('variant-style').value;
    S.config = PF.variant.mutateStyled(S.config, S.locks, style);
    $('seed').value = S.config.seed;
    $('loop-tgl').checked = !!S.config.loop;
    if (buildEffect()) { buildParams(); updateNameplate(); }
  };
  function pushUndo() {
    S.undo.push(JSON.stringify(S.config));
    if (S.undo.length > 60) S.undo.shift();
  }
  $('btn-undo').onclick = () => {
    const j = S.undo.pop();
    if (!j) { toast(T('toast.nothingToUndo')); return; }
    S.config = JSON.parse(j);
    $('seed').value = S.config.seed || 1;
    $('loop-tgl').checked = !!S.config.loop;
    if (buildEffect()) { buildParams(); buildGrid(); updateNameplate(); }
  };
  $('btn-fav').onclick = () => {
    const name = S.isCombo ? fmt('fav.comboPrefix', S.config.items.length) : I18N.tplName(PF.TEMPLATES[S.config.template]);
    const label = prompt(T('fav.promptName'), name + ' #' + (S.favs.length + 1));
    if (label === null) return;
    S.favs.push({ label: label || name, config: JSON.parse(JSON.stringify(S.config)) });
    saveFavs(); renderFavs();
    toast(T('toast.faved'));
  };
  function saveFavs() { try { localStorage.setItem('pf.favs', JSON.stringify(S.favs)); } catch (e) { } }
  function renderFavs() {
    const box = $('favs');
    box.innerHTML = S.favs.length ? '' : '<div class="dim small">' + esc(T('favs.hint')) + '</div>';
    S.favs.forEach((f, i) => {
      const el = document.createElement('div');
      el.className = 'fav-item';
      el.innerHTML = '<span>' + esc(f.label) + '</span><span class="del" title="' + esc(T('fav.delTip')) + '">✕</span>';
      el.onclick = ev => {
        if (ev.target.classList.contains('del')) { S.favs.splice(i, 1); saveFavs(); renderFavs(); return; }
        pushUndo();
        S.config = JSON.parse(JSON.stringify(f.config));
        if (buildEffect()) { buildParams(); buildGrid(); updateNameplate(); }
      };
      box.appendChild(el);
    });
  }

  /* ---------- 组合器 ---------- */
  const comboState = { items: [null, null, null, null] };
  function buildComboUI() {
    const box = $('combo-slots');
    box.innerHTML = '';
    const ids = Object.keys(PF.TEMPLATES);
    for (let i = 0; i < 4; i++) {
      const it = comboState.items[i] || (comboState.items[i] = { tpl: ids[0], start: 0, dur: 2, x: 0, y: 0, scale: 1, on: false });
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML =
        '<div class="row"><label class="tgl"><input type="checkbox" class="c-on" ' + (it.on ? 'checked' : '') + '> ' + esc(fmt('combo.layer', i + 1)) + '</label>' +
        '<select class="c-tpl">' + ids.map(id => '<option value="' + id + '"' + (id === it.tpl ? ' selected' : '') + '>' + esc(I18N.tplName(PF.TEMPLATES[id])) + '</option>').join('') + '</select></div>' +
        '<div class="row"><span class="lbl">' + esc(T('combo.start')) + '</span><input type="number" class="c-start" step="0.1" value="' + it.start + '">' +
        '<span class="lbl">' + esc(T('combo.dur')) + '</span><input type="number" class="c-dur" step="0.1" value="' + it.dur + '"></div>' +
        '<div class="row"><span class="lbl">' + esc(T('combo.offset')) + '</span><input type="number" class="c-x" step="0.05" value="' + it.x + '">' +
        '<input type="number" class="c-y" step="0.05" value="' + it.y + '">' +
        '<span class="lbl">' + esc(T('combo.scale')) + '</span><input type="number" class="c-scale" step="0.1" value="' + it.scale + '"></div>';
      slot.querySelector('.c-on').onchange = e => { it.on = e.target.checked; };
      slot.querySelector('.c-tpl').onchange = e => { it.tpl = e.target.value; };
      slot.querySelector('.c-start').onchange = e => { it.start = +e.target.value; };
      slot.querySelector('.c-dur').onchange = e => { it.dur = +e.target.value; };
      slot.querySelector('.c-x').onchange = e => { it.x = +e.target.value; };
      slot.querySelector('.c-y').onchange = e => { it.y = +e.target.value; };
      slot.querySelector('.c-scale').onchange = e => { it.scale = +e.target.value; };
      box.appendChild(slot);
    }
  }
  $('btn-combo-apply').onclick = () => {
    pushUndo();
    const items = [];
    for (const it of comboState.items) {
      if (!it.on) continue;
      const def = PF.TEMPLATES[it.tpl];
      items.push({
        config: { template: it.tpl, params: {}, seed: PF.rng.randomSeed(), loop: def.loop },
        start: it.start, dur: it.dur || def.duration, off: [it.x, it.y], scale: it.scale,
      });
    }
    if (!items.length) { toast(T('toast.needLayer'), true); return; }
    S.config = { items, budget: +$('budget').value || 1000, canvasSize: +$('canvas-size').value };
    if (buildEffect()) { buildParams(); updateNameplate(); toast(fmt('toast.comboApplied', items.length)); }
  };
  $('btn-combo-clear').onclick = () => {
    const ids = Object.keys(PF.TEMPLATES);
    S.config = { template: ids[0], params: {}, seed: 1, loop: PF.TEMPLATES[ids[0]].loop, budget: +$('budget').value || 1000, canvasSize: +$('canvas-size').value };
    buildEffect(); buildParams(); buildGrid(); updateNameplate();
  };

  /* ---------- 预览渲染（可脱离 rAF 单独调用） ---------- */
  function renderNow() {
    if (!S.eff) return;
    const t0 = performance.now();
    R.clear();
    let effT = S.t;
    let skipEff = false;
    if (S.stageOn && S.stageT >= 0) {
      STAGE.draw(R, S.stageT, {});
      if (S.stageT < STAGE.WINDUP) {
        skipEff = true;                               // 前摇阶段：效果未触发
      } else {
        effT = S.stageT - STAGE.WINDUP;               // 命中瞬间效果归零
      }
    }
    if (!skipEff) S.eff.renderLocal(effT, R, {});
    const t1 = performance.now();
    const out = compBuf.buf = R.composite(compBuf.buf, S.reduceFlash);
    /* putImageData → 离屏 → 最近邻放大到显示画布
     * ImageData 复用（旧实现每帧 new Uint8ClampedArray(out) + new ImageData = 两次 256KB 拷贝） */
    if (!compImg.img || compImg.size !== R.size) {
      compImg.img = offCtx.createImageData(R.size, R.size);
      compImg.size = R.size;
    }
    compImg.img.data.set(out);
    offCtx.putImageData(compImg.img, 0, 0);
    /* 震屏 */
    const shk = [0, 0];
    S.eff.shakeOffset(effT, shk);
    const q = disp.width / R.size;
    dctx.fillStyle = '#0a0c10';
    dctx.fillRect(0, 0, disp.width, disp.height);
    dctx.save();
    if (S.shake && (shk[0] || shk[1])) {
      dctx.translate(shk[0] * q, shk[1] * q);
    }
    dctx.drawImage(offCanvas, 0, 0, disp.width, disp.height);
    dctx.restore();
    const t3 = performance.now();
    S.msSim = S.msSim * 0.9 + (t1 - t0) * 0.1;
    S.msDraw = S.msDraw * 0.9 + (t3 - t1) * 0.1;
    if (S.hudOn) {
      $('hud').textContent =
        fmt('hud.target', S.fps) + '\n' +
        fmt('hud.sim', S.msSim.toFixed(2), S.msDraw.toFixed(2)) + '\n' +
        fmt('hud.budget', (S.eff.maxActive || 0), (S.config.budget || 1000)) + '\n' +
        fmt('hud.canvas', R.size, (Math.round(S.t * 60) % frameCount()));
    }
    setScrub();
  }

  /* ---------- 预览主循环 ---------- */
  let lastTs = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    /* FPS 统计 */
    S.frames++; S.fpsT += dt;
    if (S.fpsT >= 0.5) { S.fps = Math.round(S.frames / S.fpsT); S.frames = 0; S.fpsT = 0; }

    if (S.playing) {
      S.t += dt * S.speed;
      const D = currentDuration();
      if (S.t >= D) S.t %= D;      // 预览始终循环（含一次性效果），便于调参
    }
    if (S.stageOn && S.stageT >= 0) {
      S.stageT += dt * S.speed;
      if (S.stageT > STAGE.WINDUP + STAGE.RECOVER + 0.6) S.stageT = -1;
    }
    renderNow();
  }

  /* ---------- 导出 ---------- */
  function ensureWorker() {
    try {
      const w = new Worker('src/export.worker.js');
      return w;
    } catch (e) { return null; }
  }
  function setProgress(cur, total, label) {
    $('export-progress').classList.remove('hidden');
    $('export-bar').style.width = (total ? (cur / total * 100) : 0) + '%';
    /* job.js 的阶段名是语言无关代码（frame/sequence/apng/sheet/batch/recipe），此处本地化 */
    const stageKey = 'stage.' + label;
    const stageText = label && T(stageKey) !== stageKey ? T(stageKey) : (label || '');
    $('export-label').textContent = stageText + ' ' + cur + '/' + total;
  }
  function hideProgress() { $('export-progress').classList.add('hidden'); }
  $('export-cancel').onclick = () => {
    if (!S.job) return;
    S.job.cancelled = true;
    if (S.job.worker) S.job.worker.postMessage({ id: S.job.id, type: 'cancel' });
  };
  function finishExport(res, fallbackName) {
    const box = $('export-links');
    box.innerHTML = '';
    if (!res || res.cancelled) { toast(T('toast.exportCancelled')); hideProgress(); S.job = null; return; }
    for (const e of res.entries) {
      const blob = new Blob([e.data], { type: e.name.endsWith('.zip') ? 'application/zip' : e.name.endsWith('.json') ? 'application/json' : 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = e.name; a.textContent = '⬇ ' + e.name + ' (' + (e.data.length / 1024).toFixed(0) + ' KB)';
      box.appendChild(a);
      /* 自动触发一次下载 */
      const auto = document.createElement('a');
      auto.href = url; auto.download = e.name;
      document.body.appendChild(auto); auto.click(); auto.remove();
    }
    toast(T('toast.exportDone'));
    hideProgress(); S.job = null;
  }
  /* 通用任务启动：优先 Worker，file:// 回退主线程；resolve 导出结果（null=失败） */
  function launchJob(job) {
    if (S.job) { toast(T('toast.exportBusy'), true); return Promise.resolve(null); }
    const id = 1;
    const worker = ensureWorker();
    return new Promise(resolve => {
      if (worker) {
        S.job = { id, worker, cancelled: false };
        worker.onmessage = ev => {
          const m = ev.data;
          if (m.id !== id) return;
          if (m.type === 'progress') setProgress(m.cur, m.total, m.stage);
          else if (m.type === 'done') { worker.terminate(); resolve(m.result); }
          else if (m.type === 'error') { worker.terminate(); toast(T('toast.exportFail') + m.message, true); hideProgress(); S.job = null; resolve(null); }
        };
        worker.onerror = e => { toast(T('toast.workerError') + e.message, true); worker.terminate(); hideProgress(); S.job = null; resolve(null); };
        worker.postMessage({ id, type: 'run', job });
      } else {
        /* file:// 回退：主线程分片导出（仍是逐帧编码+释放） */
        S.job = { id, worker: null, cancelled: false };
        PF.job.runJob(job, {
          onProgress: (c, t, s) => setProgress(c, t, s),
          shouldCancel: () => S.job && S.job.cancelled,
        }).then(resolve)
          .catch(e => { toast(T('toast.exportFail') + e.message, true); hideProgress(); S.job = null; resolve(null); });
      }
    });
  }
  function runExport(kind, extra) {
    const cfg = JSON.parse(JSON.stringify(S.config));
    cfg.canvasSize = +$('canvas-size').value;
    const job = { kind, config: cfg, name: S.isCombo ? 'combo' : S.config.template, };
    Object.assign(job, extra || {});
    launchJob(job).then(res => { if (res) finishExport(res); });
  }
  /* 批量导出：当前分类（或全部）所有模板各取最佳时刻 PNG + 配方，打包一个 ZIP */
  $('exp-batch').onclick = () => {
    const cat = S.cat;
    const items = [];
    for (const id of Object.keys(PF.TEMPLATES)) {
      const def = PF.TEMPLATES[id];
      if (cat !== 'all' && def.category !== cat) continue;
      items.push({ name: id, config: { template: id, seed: 7, loop: def.loop } });
    }
    if (!items.length) { toast(T('toast.emptyCategory'), true); return; }
    launchJob({
      kind: 'batch', items, canvasSize: +$('canvas-size').value,
      name: 'batch_' + (cat === 'all' ? 'all' : cat),
    }).then(res => { if (res) finishExport(res); });
  };
  $('exp-frame').onclick = () => runExport('frame', { timeSec: S.t });
  $('exp-seq').onclick = () => runExport('sequence', {});
  $('exp-apng').onclick = () => runExport('apng', {});
  $('exp-sheet').onclick = () => runExport('sheet', { maxPage: +$('sheet-maxpage').value, padding: +$('sheet-pad').value });
  $('exp-recipe').onclick = () => runExport('recipe', { note: $('recipe-input').value.slice(0, 120) });

  /* ---------- 键盘 ---------- */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); $('btn-play').click(); }
    else if (e.code === 'ArrowLeft') $('btn-prev').click();
    else if (e.code === 'ArrowRight') $('btn-next').click();
    else if (e.code === 'KeyV') $('btn-variant').click();
  });

  /* ---------- 语言切换 ---------- */
  $('btn-lang').onclick = () => I18N.toggle();
  I18N.onChange(() => {
    /* 静态文案由 I18N.apply 刷新；动态区域按当前语言重建 */
    buildCats();
    buildGrid();
    buildParams();
    buildComboUI();
    renderFavs();
    updateNameplate();
  });

  /* ---------- 启动：打开即播 ---------- */
  I18N.apply();
  buildCats();
  buildGrid();
  buildParams();
  buildComboUI();
  renderFavs();
  updateNameplate();
  $('seed').value = S.config.seed;
  $('loop-tgl').checked = S.config.loop;
  if (buildEffect()) {
    /* 打开即播：直接进入完整爆炸 */
    S.t = 0; S.playing = true;
  }
  requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
})();
