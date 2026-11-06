/* PixelForge —— UI 双语词典（中文 / English）
 * 职责：语言检测与持久化（localStorage 'pf.lang'）、静态文本应用（data-i18n*）、
 *       动态文本翻译（t / fmt）、模板名与描述、参数标签、分类名、示例句。
 * 词典以中文为基准键（zh 即原文，en 为翻译），模板词条按模板 id 索引。
 */
(function (root) {
  'use strict';

  const ZH = {
    'app.title': 'PixelForge 特效工厂',
    'lang.toggle': '🌐 EN',
    'lang.toggleTip': '切换到 English',
    'ui.tagline': '特效工厂',
    'badge.offline': '完全离线',
    'badge.cpu': 'CPU 渲染',
    'badge.timebase': '60 FPS 时间基 1/60',
    'top.shake': '震屏',
    'top.options': '预览选项',
    'tl.seek': '预览帧',
    'top.reduceFlash': '抑制剧烈闪烁',
    'top.stage': '测试场',
    'top.attackTest': '▶ 攻击测试',
    'top.attackTestTip': '播放一次攻击：前摇→命中→后摇',
    'panel.templates': '模板库',
    'cat.all': '全部',
    'panel.favs': '收藏',
    'favs.hint': '在参数面板点 ☆ 收藏当前配方',
    'tl.playTip': '播放/暂停',
    'tl.prevTip': '上一帧',
    'tl.nextTip': '下一帧',
    'tl.restartTip': '回到起点',
    'tl.speedTip': '播放速度',
    'panel.recipe': '文字配方',
    'panel.recipeNote': '（离线词典·支持范围有限）',
    'recipe.placeholder': '例：蓝紫色环形爆炸，持续2秒，细碎火花',
    'recipe.parse': '解析并应用',
    'recipe.examples': '示例',
    'panel.params': '参数',
    'param.seed': '种子',
    'param.loop': '循环',
    'param.canvas': '画布',
    'param.budget': '预算',
    'param.budgetTip': '活动粒子上限',
    'param.variant': '🎲 一键变体',
    'param.variantStyleTip': '变体幅度',
    'variant.subtle': '轻微',
    'variant.normal': '标准',
    'variant.wild': '狂野',
    'param.undo': '↶ 撤销',
    'param.undoTip': '撤销',
    'param.favTip': '收藏当前配方',
    'param.lockTip': '锁定后一键变体不改变此项',
    'panel.combo': '组合器',
    'panel.comboNote': '（最多 4 层）',
    'combo.layer': '层{0}',
    'combo.start': '开始',
    'combo.dur': '时长',
    'combo.offset': '偏移',
    'combo.scale': '缩放',
    'combo.apply': '应用组合',
    'combo.clear': '清除',
    'panel.export': '导出',
    'export.frame': '单帧 PNG',
    'export.sequence': 'PNG 序列',
    'export.apng': 'APNG 动图',
    'export.sheet': 'Sprite Sheet',
    'export.batch': '批量导出分类',
    'export.recipe': '配方 JSON',
    'export.maxPage': '帧页上限',
    'export.padding': '间距',
    'export.cancel': '取消',
    'export.hint': '序列默认 60 FPS · t=k/60 精确采样 · 透明通道 · 循环不重复首帧',
    'toast.buildFail': '构建失败: ',
    'toast.nothingToUndo': '没有可撤销的操作',
    'toast.faved': '已收藏',
    'toast.comboNoVariant': '组合效果不支持变体',
    'toast.needLayer': '请至少启用一层',
    'toast.comboApplied': '组合已应用: {0} 层',
    'toast.emptyCategory': '当前分类没有模板',
    'toast.exportBusy': '已有导出任务在进行',
    'toast.exportCancelled': '已取消（缓冲已释放）',
    'toast.exportDone': '导出完成 ✓',
    'toast.exportFail': '导出失败: ',
    'toast.workerError': 'Worker 错误: ',
    'fav.promptName': '收藏名称：',
    'fav.comboPrefix': '组合×{0}',
    'fav.delTip': '删除',
    'combo.effect': '组合效果',
    'combo.layers': '{0} 层',
    'params.comboHint': '组合模式下请展开组合器调整各层。',
    'parse.noTemplate': '未识别模板',
    'parse.cannot': '无法理解: {0}',
    'parse.tryWords': '试试主题词如：爆炸/火焰/闪电/治疗/暴雨/激光…',
    'parse.ignored': '未理解（已忽略）: {0} —— 可手动在参数面板修正',
    'parse.allGood': '全部字段已解析 ✓（离线词典匹配，非自然语言理解）',
    'chip.tpl': '模板 ',
    'chip.color': '颜色 ',
    'chip.mod': '修饰 ',
    'chip.dur': '持续时间 {0} 秒',
    'chip.rel': '关联词 ',
    'list.separator': '、',
    'stage.frame': '单帧',
    'stage.sequence': '序列',
    'stage.apng': 'APNG',
    'stage.sheet': '精灵表',
    'stage.batch': '批量',
    'stage.recipe': '配方',
    'hud.target': 'FPS {0}  (目标 60)',
    'hud.sim': '模拟 {0}ms  合成+绘制 {1}ms',
    'hud.budget': '粒子预算 {0} / {1}',
    'hud.canvas': '画布 {0}px  帧 {1}',
  };

  const EN = {
    'app.title': 'PixelForge — Pixel FX Forge',
    'lang.toggle': '🌐 中文',
    'lang.toggleTip': '切换到中文',
    'ui.tagline': 'PIXEL FX FORGE',
    'badge.offline': 'Fully offline',
    'badge.cpu': 'CPU rendering',
    'badge.timebase': '60 FPS time base 1/60',
    'top.shake': 'Screen shake',
    'top.options': 'Preview options',
    'tl.seek': 'Preview frame',
    'top.reduceFlash': 'Tone down flashes',
    'top.stage': 'Test stage',
    'top.attackTest': '▶ Attack test',
    'top.attackTestTip': 'Play one attack: windup → hit → recovery',
    'panel.templates': 'Templates',
    'cat.all': 'All',
    'panel.favs': 'Favorites',
    'favs.hint': 'Click ☆ in the parameter panel to save the current recipe',
    'tl.playTip': 'Play / pause',
    'tl.prevTip': 'Previous frame',
    'tl.nextTip': 'Next frame',
    'tl.restartTip': 'Back to start',
    'tl.speedTip': 'Playback speed',
    'panel.recipe': 'Recipe',
    'panel.recipeNote': '(offline dictionary · limited scope)',
    'recipe.placeholder': 'e.g. blue-violet ring explosion, 2s, fine sparks',
    'recipe.parse': 'Parse & apply',
    'recipe.examples': 'Example',
    'panel.params': 'Parameters',
    'param.seed': 'Seed',
    'param.loop': 'Loop',
    'param.canvas': 'Canvas',
    'param.budget': 'Budget',
    'param.budgetTip': 'Max active particles',
    'param.variant': '🎲 Variate',
    'param.variantStyleTip': 'Variation strength',
    'variant.subtle': 'Subtle',
    'variant.normal': 'Standard',
    'variant.wild': 'Wild',
    'param.undo': '↶ Undo',
    'param.undoTip': 'Undo',
    'param.favTip': 'Save current recipe',
    'param.lockTip': 'Locked items are kept by one-click variation',
    'panel.combo': 'Combiner',
    'panel.comboNote': '(up to 4 layers)',
    'combo.layer': 'Layer {0}',
    'combo.start': 'Start',
    'combo.dur': 'Length',
    'combo.offset': 'Offset',
    'combo.scale': 'Scale',
    'combo.apply': 'Apply combo',
    'combo.clear': 'Clear',
    'panel.export': 'Export',
    'export.frame': 'Frame PNG',
    'export.sequence': 'PNG sequence',
    'export.apng': 'APNG animation',
    'export.sheet': 'Sprite Sheet',
    'export.batch': 'Batch export category',
    'export.recipe': 'Recipe JSON',
    'export.maxPage': 'Max page size',
    'export.padding': 'Padding',
    'export.cancel': 'Cancel',
    'export.hint': 'Sequence defaults to 60 FPS · exact t=k/60 sampling · alpha channel · loops never repeat frame 0',
    'toast.buildFail': 'Build failed: ',
    'toast.nothingToUndo': 'Nothing to undo',
    'toast.faved': 'Saved to favorites',
    'toast.comboNoVariant': 'Variation is not available for combos',
    'toast.needLayer': 'Enable at least one layer',
    'toast.comboApplied': 'Combo applied: {0} layers',
    'toast.emptyCategory': 'No templates in this category',
    'toast.exportBusy': 'An export task is already running',
    'toast.exportCancelled': 'Cancelled (buffers released)',
    'toast.exportDone': 'Export finished ✓',
    'toast.exportFail': 'Export failed: ',
    'toast.workerError': 'Worker error: ',
    'fav.promptName': 'Favorite name:',
    'fav.comboPrefix': 'Combo×{0}',
    'fav.delTip': 'Delete',
    'combo.effect': 'Combo effect',
    'combo.layers': '{0} layers',
    'params.comboHint': 'In combo mode, open the combiner to adjust each layer.',
    'parse.noTemplate': 'No template matched',
    'parse.cannot': "Couldn't understand: {0}",
    'parse.tryWords': 'Try theme words like: explosion / fire / lightning / heal / rain / laser…',
    'parse.ignored': 'Ignored: {0} — adjust manually in the parameter panel',
    'parse.allGood': 'All fields parsed ✓ (offline dictionary match, not natural-language understanding)',
    'chip.tpl': 'Template: ',
    'chip.color': 'Color: ',
    'chip.mod': 'Modifier: ',
    'chip.dur': 'Duration {0}s',
    'chip.rel': 'Related: ',
    'list.separator': ', ',
    'stage.frame': 'Frame',
    'stage.sequence': 'Sequence',
    'stage.apng': 'APNG',
    'stage.sheet': 'Sprite sheet',
    'stage.batch': 'Batch',
    'stage.recipe': 'Recipe',
    'hud.target': 'FPS {0}  (target 60)',
    'hud.sim': 'Sim {0}ms  Composite+draw {1}ms',
    'hud.budget': 'Particle budget {0} / {1}',
    'hud.canvas': 'Canvas {0}px  Frame {1}',
  };

  /* ---------- 模板英文名与描述（中文原文在 templates.js，避免重复维护基准） ---------- */
  const TPL_EN = {
    magic_explosion: { name: 'Arcane Burst', desc: 'Blue-violet arcane energy implodes, then detonates: shock ring, shards, embers and smoke in a full four-phase structure.' },
    fire_burst: { name: 'Blaze Burst', desc: 'A fireball swells and bursts in an instant, spitting sparks and thick smoke in blazing orange.' },
    lightning_strike: { name: 'Thunderstrike', desc: 'A branching bolt tears down from the sky; the impact flashes a ring and sparks, brief and violent, then a fading afterglow.' },
    chain_lightning: { name: 'Chain Lightning', desc: 'Lightning leaps between three targets, bursting on every hop.' },
    holy_smite: { name: 'Holy Smite', desc: 'A golden pillar of light falls from above; a ground shock ring spreads while motes of light drift upward.' },
    slash_arc: { name: 'Whirlwind Blade', desc: 'A crescent slash sweeps across with a razor-sharp trail, sparks scattering along the arc.' },
    hit_impact: { name: 'Heavy Impact', desc: 'A short, punchy contact response: flash, fast shock ring and a directional shard cone.' },
    crit_hit: { name: 'Critical Hit', desc: 'An amplified hit: twin shock rings, a star burst, heavy shards and slow bright motes.' },
    shield_block: { name: 'Shield Block', desc: 'A hemispherical shield ripples as the attack is deflected into scattered sparks.' },
    heal_glow: { name: 'Healing Wave', desc: 'A gentle heal: green motes of light spiral upward while soft rings spread from below.' },
    buff_aura: { name: 'Buff Aura', desc: 'A looping buff state: orbiting particles, rising glints and a periodic pulse.' },
    teleport_warp: { name: 'Teleport Vortex', desc: 'A vortex draws inward first; a white flash, then leftover light motes scatter outward.' },
    flame_jet: { name: 'Flame Fountain', desc: 'A continuous fire jet: twin tongues of flame, flying sparks and thin smoke at the top.' },
    torch_fire: { name: 'Torch Flame', desc: 'A classic torch: a compact, flickering flame body with the occasional drifting spark.' },
    smoke_plume: { name: 'Smoke Plume', desc: 'Grey smoke keeps billowing upward, in two density layers with a lateral sway.' },
    ambient_fog: { name: 'Ambient Fog', desc: 'Low-lying mystic fog drifts slowly sideways; two layers at different speeds add depth.' },
    rain_storm: { name: 'Rainstorm', desc: 'Slanted rain streaks hit the ground and kick up splash rings, with an occasional distant lightning flicker.' },
    snow_drift: { name: 'Snowfall', desc: 'Three layers of snowflakes fall at different speeds, swaying sideways like breathing wind.' },
    water_splash: { name: 'Water Splash', desc: 'Water droplets leap up under gravity and fall back, raising a thin ground ring and rising mist.' },
    ice_shatter: { name: 'Ice Shatter', desc: 'The ice surface shatters: a pale flash, sharp crystal shards flying, frost mist settling slowly.' },
    frost_breath: { name: 'Frost Breath', desc: 'A cone of frosty breath blasts forward with crystal dust and a glowing origin.' },
    poison_bubbles: { name: 'Poison Bubbles', desc: 'Bubbles rise from a green poison swamp and pop, splashing droplets and leaking toxic fumes.' },
    laser_beam: { name: 'Laser Sweep', desc: 'Sci-fi laser: a thin charge beam, a full-width main beam, impact sparks and smoke.' },
    ui_pulse: { name: 'UI Pulse', desc: 'Radar-style twin rings with radial tick marks, made for UI confirm feedback.' },
    pickup_sparkle: { name: 'Pickup Sparkle', desc: 'A light star-shaped flash with rising motes, for item pickup feedback.' },
    levelup_pillar: { name: 'Level-Up Pillar', desc: 'Level up: a light pillar sweeps upward, rings rise with it, and a burst of star dust crowns the top.' },
    fire_whirl: { name: 'Fire Whirl', desc: 'A ground vortex spins up a towering fire column that bursts embers at the top, with a slight heat-haze wobble.' },
    frost_nova: { name: 'Frost Nova', desc: 'Cold air implodes, then detonates as an icy nova: twin frost rings and shattered ice flying outward.' },
    dash_trail: { name: 'Dash Trail', desc: 'The character dashes hard in a direction, dragging multiple afterimages with an endpoint flash and reverse sparks.' },
  };

  /* ---------- 分类英文名 ---------- */
  const CAT_EN = {
    explosion: 'Explosion / Impact',
    fire: 'Fire',
    lightning: 'Lightning',
    magic: 'Magic',
    smoke: 'Smoke / Weather',
    water: 'Water / Ice',
    hit: 'Hit',
    ui: 'UI Feedback',
  };

  /* ---------- 参数标签英译（键为中文原文标签） ---------- */
  const PARAM_EN = {
    '整体尺寸': 'Overall size',
    '强度': 'Intensity',
    '持续时间(秒)': 'Duration (s)',
    '色板': 'Palette',
    '烟雾量': 'Smoke',
    '分叉数': 'Branches',
    '方向(度)': 'Angle (deg)',
    '击飞方向': 'Launch angle',
    '挥砍方向': 'Slash angle',
    '吐息方向': 'Breath angle',
    '柱体高度': 'Pillar height',
    '风力': 'Wind',
  };

  /* ---------- 文字配方示例（各自语言，均可在该语言下解析成功） ---------- */
  const EXAMPLES = {
    zh: [
      '蓝紫色环形爆炸，持续2秒，细碎火花，透明背景',
      '橙红色火焰爆炸，快速',
      '暴击命中，巨大，强烈',
      '金色升级光柱，3秒',
      '闪电，蓝白色，分叉',
      '循环的火把火焰',
      '暴雨，风大',
      '寒冰碎裂，浅蓝',
    ],
    en: [
      'blue-violet ring explosion, 2s, fine sparks, transparent background',
      'orange-red fireball explosion, fast',
      'critical hit, huge, intense',
      'golden level up pillar, 3 seconds',
      'lightning, blue-white, branching',
      'looping torch flame',
      'rainstorm, strong wind',
      'ice shatter, light blue',
    ],
  };

  /* ---------- 状态与 API ---------- */
  const STORE_KEY = 'pf.lang';
  let listeners = [];
  let lang = 'zh';

  function detect() {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved === 'zh' || saved === 'en') return saved;
    } catch (e) { /* localStorage 不可用则仅本次生效 */ }
    const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.toLowerCase() : 'zh';
    return nav.indexOf('zh') === 0 ? 'zh' : 'en';
  }
  lang = detect();

  function getLang() { return lang; }

  function t(key) {
    if (lang === 'en') {
      const v = EN[key];
      if (v !== undefined) return v;
    }
    const z = ZH[key];
    return z !== undefined ? z : key;
  }

  /* fmt('combo.layers', 3) → “3 层” / “3 layers” */
  function fmt(key) {
    let s = t(key);
    for (let i = 1; i < arguments.length; i++) {
      s = s.split('{' + (i - 1) + '}').join(String(arguments[i]));
    }
    return s;
  }

  function tplName(def) {
    if (!def) return '';
    if (lang === 'en' && TPL_EN[def.id]) return TPL_EN[def.id].name;
    return def.name;
  }
  function tplDesc(def) {
    if (!def) return '';
    if (lang === 'en' && TPL_EN[def.id]) return TPL_EN[def.id].desc;
    return def.desc || '';
  }
  function catName(cat) {
    if (!cat) return '';
    if (lang === 'en' && CAT_EN[cat.id]) return CAT_EN[cat.id];
    return cat.name;
  }
  function paramLabel(label) {
    if (lang === 'en' && PARAM_EN[label]) return PARAM_EN[label];
    return label;
  }
  function examples() { return EXAMPLES[lang] || EXAMPLES.zh; }

  /* 把静态 DOM 文案刷成当前语言；index.html 中节点带 data-i18n / data-i18n-title / data-i18n-ph */
  function apply() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = t('app.title');
    const nodes = document.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-ph]');
    for (const el of nodes) {
      const k = el.getAttribute('data-i18n');
      if (k) el.textContent = t(k);
      const kt = el.getAttribute('data-i18n-title');
      if (kt) el.title = t(kt);
      const kp = el.getAttribute('data-i18n-ph');
      if (kp) el.placeholder = t(kp);
    }
  }

  function setLang(next) {
    if (next !== 'zh' && next !== 'en') return;
    if (next === lang) return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* 忽略持久化失败 */ }
    apply();
    for (const fn of listeners) {
      try { fn(lang); } catch (e) { /* 单个监听失败不阻断 */ }
    }
  }

  function toggle() { setLang(lang === 'zh' ? 'en' : 'zh'); }
  function onChange(fn) { listeners.push(fn); }

  const I18N = { getLang, setLang, toggle, t, fmt, tplName, tplDesc, catName, paramLabel, examples, apply, onChange };
  if (typeof globalThis !== 'undefined') globalThis.PF_I18N = I18N;
  if (typeof module !== 'undefined' && module.exports) module.exports = I18N;
})(typeof globalThis !== 'undefined' ? globalThis : this);
