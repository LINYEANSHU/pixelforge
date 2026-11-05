/* PixelForge —— 文字配方离线解析器
 * 范围明确声明：支持「模板关键词 + 颜色 + 尺寸/强度/方向/时长/循环」的组合，
 * 不支持任意自然语言，不联网，不执行文本内容。
 * 双语输入：中文与英文关键词映射到同一模板/参数（英文词做词边界匹配，避免
 * “switch 里的 hit”这类子串误命中；中文沿用子串匹配）。
 * 输出：解析字段 + 已匹配项（meaning 为结构化 {k,v}，由 UI 本地化展示）+ 未识别项。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');
  const palette = (root.PF && root.PF.palette) ? root.PF.palette : require('./palette.js');

  /* 主题关键词 → 模板（按优先级顺序，先长后短、先具体后泛化；中英文同表） */
  const SUBJECTS = [
    [['链式闪电', '链电', '连环雷', 'chain lightning', 'chained lightning', 'chain bolt'], 'chain_lightning'],
    [['雷霆一击', '落雷', '天雷', '雷电', '闪电', 'lightning strike', 'thunderstrike', 'thunder bolt', 'lightning', 'thunder'], 'lightning_strike'],
    [['喷泉火柱', '火柱', '喷火', '火舌喷泉', 'flame fountain', 'flame jet', 'fire jet', 'fire fountain'], 'flame_jet'],
    [['长明火把', '火把', '篝火', 'torch flame', 'campfire', 'bonfire', 'torch'], 'torch_fire'],
    [['火焰龙卷', '火龙卷', '龙卷火', '火焰旋风', 'fire whirl', 'fire tornado', 'flame tornado', 'flame whirl'], 'fire_whirl'],
    [['烈焰爆裂', '火焰爆炸', '火球爆炸', '火球', '烈焰', '火焰', 'fire explosion', 'fireball explosion', 'fireball', 'flame burst', 'fire blast', 'blaze burst', 'fire', 'flame'], 'fire_burst'],
    [['升级光柱', '升级之柱', '升级光', '升级', 'level up pillar', 'levelup pillar', 'level-up pillar', 'level up beam', 'level up', 'levelup', 'level-up'], 'levelup_pillar'],
    [['神圣冲击', '圣光', '神罚', '光柱', '神圣', 'holy smite', 'pillar of light', 'smite', 'holy', 'divine'], 'holy_smite'],
    [['魔法爆炸', '奥术爆炸', '奥术', '魔法', 'magic explosion', 'arcane explosion', 'arcane burst', 'arcane', 'magic'], 'magic_explosion'],
    [['挥砍', '斩击', '刀光', '斩', '横斩', '剑气', 'whirlwind blade', 'crescent slash', 'sword slash', 'arc slash', 'slash arc', 'cleave', 'slash'], 'slash_arc'],
    [['冲刺残影', '冲刺', '残影', '突进', 'dash trail', 'dash afterimage', 'afterimage dash', 'afterimages', 'afterimage', 'dash'], 'dash_trail'],
    [['致命暴击', '暴击', '会心', 'critical hit', 'critical strike', 'critical', 'crit'], 'crit_hit'],
    [['护盾格挡', '格挡', '护盾', '防御', 'shield block', 'shield bash', 'parry', 'shield', 'guard', 'block'], 'shield_block'],
    [['治疗', '回复', '回血', '治愈', 'healing wave', 'healing glow', 'healing', 'heal', 'mending'], 'heal_glow'],
    [['增益', 'buff aura', '光环', 'buff', 'aura'], 'buff_aura'],
    [['传送', '漩涡', '闪现', 'teleport warp', 'teleport', 'warp vortex', 'warp', 'portal', 'blink'], 'teleport_warp'],
    [['浓烟', '烟雾', '烟柱', '烟', 'smoke plume', 'thick smoke', 'fumes', 'smoke'], 'smoke_plume'],
    [['迷雾', '雾气', '灵雾', '雾', 'ambient fog', 'mystic fog', 'mist', 'haze', 'fog'], 'ambient_fog'],
    [['暴雨', '下雨', '降雨', '雨', 'rainstorm', 'rain storm', 'downpour', 'raining', 'rain'], 'rain_storm'],
    [['飘雪', '下雪', '降雪', '雪', 'snow drift', 'snowfall', 'snowing', 'snow'], 'snow_drift'],
    [['水花', '溅水', '水波', '水', 'water splash', 'splashing water', 'splash', 'water'], 'water_splash'],
    [['冰霜新星', '冰爆', '霜爆新星', 'frost nova', 'ice nova', 'frost burst'], 'frost_nova'],
    [['寒冰碎裂', '碎冰', '冰裂', '冰霜碎裂', 'ice shatter', 'ice shattering', 'shattered ice', 'ice crack', 'shatter'], 'ice_shatter'],
    [['寒霜吐息', '冰霜吐息', '吐息', '寒气', '霜息', 'frost breath', 'ice breath', 'dragon breath', 'breath'], 'frost_breath'],
    [['剧毒气泡', '毒泡', '毒气', '毒', 'poison bubbles', 'poison bubble', 'toxic bubbles', 'venom', 'toxic', 'poison'], 'poison_bubbles'],
    [['激光', '射线', '光束', 'laser sweep', 'laser beam', 'laser', 'light beam', 'beam', 'ray gun', 'ray'], 'laser_beam'],
    [['拾取', '捡起', '获得物品', '闪光拾取', 'pickup sparkle', 'item pickup', 'loot sparkle', 'pick up', 'pickup'], 'pickup_sparkle'],
    [['能量脉冲', '脉冲', '确认反馈', '按钮反馈', 'ui pulse', 'energy pulse', 'button pulse', 'button feedback', 'pulse'], 'ui_pulse'],
    [['爆炸', '爆裂', '爆破', '引爆', 'explosion', 'detonation', 'detonate', 'blast'], 'magic_explosion'],
    [['命中', '打击', '受击', '攻击', 'hit impact', 'melee hit', 'impact hit', 'impact', 'hit'], 'hit_impact'],
  ];

  /* 修饰词 → 参数调整（仅当模板拥有该参数时生效；中英文同表，长词优先） */
  const MODS = [
    [['巨大', '超大', '特大', 'colossal', 'gigantic', 'huge', 'giant'], c => c.scale = { set: 1.8 }],
    [['大', '加大', 'large', 'big'], c => c.scale = { set: 1.35 }],
    [['小', '迷你', '小型', 'tiny', 'small', 'little'], c => c.scale = { set: 0.65 }],
    [['强烈', '强力', '猛烈', '狂暴', 'powerful', 'intense', 'fierce', 'strong'], c => c.intensity = { set: 1.6 }],
    [['微弱', '轻柔', '淡淡', '轻微', 'gentle', 'faint', 'weak', 'soft'], c => c.intensity = { set: 0.6 }],
    [['密集', '浓密', 'dense', 'thick'], c => c.intensity = { bump: 1.3 }],
    [['稀疏', '少量', 'sparse', 'scattered'], c => c.intensity = { bump: 0.7 }],
    [['细碎', '细小碎片', '碎屑', 'fine debris', 'fine sparks', 'debris'], c => { c.intensity = { bump: 1.15 }; c.smoke = { set: 0.3 }; }],
    [['火花', '火星', '光点', '微粒', 'sparks', 'sparkle', 'glints'], c => c.intensity = { bump: 1.1 }],
    [['无烟', '少烟', 'smokeless', 'no smoke'], c => c.smoke = { set: 0.15 }],
    [['多烟', '浓烟滚滚', 'billowing smoke', 'smoky', 'billowing'], c => c.smoke = { set: 1.8 }],
    [['快速', '急速', '迅速', 'rapid', 'swift', 'quick', 'fast'], c => c.durationSec = { mul: 0.65 }],
    [['缓慢', '慢慢', '慢速', 'sluggish', 'slow'], c => c.durationSec = { mul: 1.5 }],
    [['长', '持久', 'lasting', 'long'], c => c.durationSec = { mul: 1.3 }],
    [['短', '短促', 'brief', 'short'], c => c.durationSec = { mul: 0.75 }],
    [['循环', '一直', '持续播放', '无限', 'looping', 'endless', 'infinite', 'loop'], c => c.loop = true],
    [['单次', '只播一次', '不循环', 'play once', 'one-shot', 'one shot', 'no loop', 'once'], c => c.loop = false],
    [['透明背景', 'transparent background', 'transparent'], c => c.transparent = true],
    [['顺时针', 'clockwise', 'cw'], c => c.dirCW = true],
    [['逆时针', 'counterclockwise', 'counter-clockwise', 'ccw'], c => c.dirCCW = true],
    [['向左', '朝左', '左', 'towards left', 'toward left', 'face left', 'left'], c => c.angle = 180],
    [['向右', '朝右', '右', 'towards right', 'toward right', 'face right', 'right'], c => c.angle = 0],
    [['向上', '朝上', '上', 'upwards', 'upward', 'up'], c => c.angle = 270],
    [['向下', '朝下', '下', 'downwards', 'downward', 'down'], c => c.angle = 90],
    [['大风', '风大', '狂风', 'strong wind', 'gusty', 'windy'], c => c.wind = 0.85],
    [['微风', '小风', 'light breeze', 'breeze', 'gentle wind'], c => c.wind = 0.25],
    [['无风', 'windless', 'no wind'], c => c.wind = -0.05],
    [['环形', '圆环', '冲击环', 'ring shaped', 'ring-shaped', 'shockwave ring', 'ring'], c => c.shape = 'ring'],
    [['十字', '星芒', 'starburst', 'star shaped', 'star-shaped', 'star', 'cross'], c => c.shape = 'star'],
  ];

  /* 颜色词（最长优先）：中文来自 palette.NAMED，英文在此映射到同一色值 */
  const EN_COLOR = {
    'red': '#c82020', 'deep red': '#8a1010', 'dark red': '#8a1010', 'blood red': '#a00c14', 'crimson': '#a00c14', 'pink': '#ff70a0',
    'orange': '#ff7b1a', 'orange red': '#ff5a1a', 'orange-red': '#ff5a1a', 'gold': '#ffc832', 'golden': '#ffb820',
    'yellow': '#ffe14a', 'green': '#2cc85a', 'deep green': '#0e7a30', 'dark green': '#0e7a30', 'teal': '#28d8d0', 'cyan': '#28d8d0',
    'blue': '#3a6cf0', 'deep blue': '#1a2a9a', 'dark blue': '#1a2a9a', 'blue violet': '#7a4aff', 'blue-violet': '#7a4aff',
    'purple': '#8b2be2', 'violet': '#7a4aff', 'light blue': '#7ab8f0', 'blue white': '#a8d0ff', 'blue-white': '#a8d0ff', 'azure': '#20a0d0',
    'light purple': '#b06bff', 'lavender': '#b06bff', 'white': '#f8f8f8', 'black': '#202020', 'brown': '#7a4a20',
    'gray': '#8a8f98', 'grey': '#8a8f98',
  };
  const COLOR_MAP = Object.assign({}, palette.NAMED, EN_COLOR);
  const COLOR_WORDS = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);

  const ASCII_WORD = /^[a-z0-9][a-z0-9 \-'&]*$/;
  const WORD_CHAR = /[a-z0-9]/;

  /* 查找关键词位置：英文关键词要求词边界（前后不是字母数字），中文沿用子串匹配 */
  function findWord(rest, word) {
    if (ASCII_WORD.test(word)) {
      let from = 0;
      for (;;) {
        const i = rest.indexOf(word, from);
        if (i < 0) return -1;
        const before = i === 0 ? ' ' : rest[i - 1];
        const j = i + word.length;
        const after = j >= rest.length ? ' ' : rest[j];
        if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return i;
        from = i + 1;
      }
    }
    return rest.indexOf(word);
  }

  /* 常见填充字（中文按子串替换，英文按词边界替换） */
  const ZH_FILLERS = ['的', '色', '带', '感', '系', '风格', '一下', '效果'];
  const EN_FILLER_RE = / (?:the|a|an|and|with|of|to|into|please|style|effect) (?=[a-z0-9 ']|$)/g;

  function parse(text) {
    const res = { ok: false, template: null, templateName: '', params: {}, loop: undefined,
      matched: [], unknown: [], transparent: undefined, confidence: 0 };
    if (!text || !text.trim()) { res.unknown.push('(空输入)'); return res; }
    /* 输入统一小写：英文大小写不敏感；中文无大小写，不受影响 */
    let rest = ' ' + String(text).trim().toLowerCase() + ' ';
    const consume = (word, meaning) => {
      const i = findWord(rest, word);
      if (i < 0) return false;
      rest = rest.slice(0, i) + ' ' + rest.slice(i + word.length);
      res.matched.push({ token: word, meaning });
      return true;
    };

    /* 1. 时长：持续X秒 / X秒 / Xs / X seconds */
    const durM = rest.match(/(?:持续|时长)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:秒|s\b|sec\b|secs\b|seconds\b)/);
    if (durM) {
      const v = parseFloat(durM[1]);
      if (isFinite(v) && v >= 0.3 && v <= 30) {
        res.params.durationSec = v;
        consume(durM[0].trim(), { k: 'dur', v });
      }
    }

    /* 2. 颜色（最长优先，逐个消费；仅记录最长的命中） */
    let colorFound = null;
    for (const w of COLOR_WORDS) {
      const i = findWord(rest, w);
      if (i >= 0) {
        if (!colorFound || w.length > colorFound.w.length) colorFound = { w, hex: COLOR_MAP[w] };
      }
    }
    if (colorFound) { consume(colorFound.w, { k: 'color', v: colorFound.w }); res.color = colorFound.hex; }

    /* 3. 主题模板 */
    for (const [words, id] of SUBJECTS) {
      for (const w of words) {
        if (findWord(rest, w) >= 0) { consume(w, { k: 'tpl', v: id }); res.template = id; break; }
      }
      if (res.template) break;
    }

    /* 4. 修饰词（全部匹配；跨词条按最长优先，避免单字抢匹配） */
    const modCtx = {};
    const modFlat = [];
    for (const [words, fn] of MODS) for (const w of words) modFlat.push({ w, fn });
    modFlat.sort((a, b) => b.w.length - a.w.length);
    for (const { w, fn } of modFlat) {
      if (findWord(rest, w) >= 0) { fn(modCtx); consume(w, { k: 'mod', v: w }); }
    }
    if (modCtx.transparent) res.transparent = true;
    if (modCtx.loop !== undefined) res.loop = modCtx.loop;
    if (modCtx.angle !== undefined) res.angle = modCtx.angle;

    if (!res.template) {
      /* 未找到模板：把剩余文字列为未识别 */
      res.unknown = leftoverTokens(rest);
      return res;
    }
    const def = PF.TEMPLATES[res.template];
    res.templateName = def.name;

    /* 5. 把修饰上下文映射进模板实际拥有的参数 */
    const schemaMap = {};
    for (const s of def.params) schemaMap[s.key] = s;
    const params = {};
    for (const s of def.params) params[s.key] = s.default;
    if (res.params.durationSec !== undefined && schemaMap.durationSec) {
      params.durationSec = Math.min(schemaMap.durationSec.max, Math.max(schemaMap.durationSec.min, res.params.durationSec));
    } else if (schemaMap.durationSec && modCtx.durationSec) {
      params.durationSec = Math.min(schemaMap.durationSec.max, Math.max(schemaMap.durationSec.min,
        params.durationSec * modCtx.durationSec.mul));
    }
    if (schemaMap.scale && modCtx.scale) params.scale = modCtx.scale.set;
    if (schemaMap.intensity && modCtx.intensity) {
      params.intensity = modCtx.intensity.set !== undefined ? modCtx.intensity.set
        : Math.min(schemaMap.intensity.max, params.intensity * modCtx.intensity.bump);
    }
    if (schemaMap.smoke && modCtx.smoke) params.smoke = modCtx.smoke.set;
    if (schemaMap.angle && modCtx.angle !== undefined) params.angle = modCtx.angle;
    if (schemaMap.wind && modCtx.wind !== undefined) params.wind = modCtx.wind;
    if (schemaMap.color && res.color) params.color = res.color;
    res.params = params;
    res.confidence = res.matched.length >= 2 ? 0.9 : 0.6;

    /* 6. 其余主题关联词也计入已理解（如同义词），避免误报 */
    for (const [words] of SUBJECTS) {
      for (const w of words) {
        const i = findWord(rest, w);
        if (i >= 0) { rest = rest.slice(0, i) + ' ' + rest.slice(i + w.length); res.matched.push({ token: w, meaning: { k: 'rel', v: w } }); }
      }
    }
    /* 常见填充字视为噪声 */
    for (const f of ZH_FILLERS) rest = rest.split(f).join(' ');
    rest = rest.replace(EN_FILLER_RE, ' ');
    res.unknown = leftoverTokens(rest);
    res.ok = true;
    return res;
  }

  function leftoverTokens(rest) {
    const out = [];
    for (const tk of rest.split(/[\s,，。.、!！?？;；:：]+/)) {
      if (tk && tk.trim()) out.push(tk.trim());
    }
    return out;
  }

  const EXAMPLES = [
    '蓝紫色环形爆炸，持续2秒，细碎火花，透明背景',
    '橙红色火焰爆炸，快速',
    '暴击命中，巨大，强烈',
    '金色升级光柱，3秒',
    '闪电，蓝白色，分叉',
    '循环的火把火焰',
    '暴雨，风大',
    '寒冰碎裂，浅蓝',
    'blue-violet ring explosion, 2s, fine sparks, transparent background',
    'orange-red fireball explosion, fast',
    'critical hit, huge, intense',
    'golden level up pillar, 3 seconds',
    'looping torch flame',
    'rainstorm, strong wind',
    'ice shatter, light blue',
  ];

  const PARSER = { parse, SUBJECTS, EXAMPLES };
  if (typeof globalThis !== 'undefined') {
    globalThis.PF_PARSER = PARSER;
    if (globalThis.PF) globalThis.PF.parser = PARSER;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = PARSER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
