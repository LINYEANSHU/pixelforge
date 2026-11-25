(function (root) {
  'use strict';
  const PF = root.PF;
  const key = 'pf.project';
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const range = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const template = value => typeof value === 'string' && Object.hasOwn(PF.TEMPLATES, value);
  const validSlot = slot => record(slot) && template(slot.tpl) && typeof slot.on === 'boolean' &&
    [slot.start, slot.dur, slot.x, slot.y, slot.scale].every(Number.isFinite);
  const validConfig = config => record(config) && template(config.template) &&
    (config.seed === undefined || Number.isFinite(config.seed)) &&
    (config.params === undefined || record(config.params));
  const validLayer = layer => record(layer) && validConfig(layer.config) &&
    [layer.start, layer.dur, layer.scale].every(Number.isFinite) &&
    Array.isArray(layer.off) && layer.off.length === 2 && layer.off.every(Number.isFinite);

  function decode(text) {
    if (text.length > 2000000) throw new Error('Invalid PixelForge project');
    const { version, recipe, preview, editor } = JSON.parse(text) || {};
    if (version !== 1 || !record(recipe) || !record(preview) || !record(editor) ||
        !(recipe.combo ? Array.isArray(recipe.items) && recipe.items.every(validLayer) : validConfig(recipe)) ||
        ![64, 128, 256, 512].includes(recipe.canvasSize) || !range(recipe.budget, 64, 4000) ||
        !Number.isSafeInteger(preview.frame) || preview.frame < 0 ||
        ![0.25, 0.5, 1, 2].includes(preview.speed) || !['single', 'double'].includes(preview.stageMode) ||
        ![preview.playing, preview.stageOn, preview.shake, preview.reduceFlash, preview.hud]
          .every(value => typeof value === 'boolean') ||
        typeof editor.note !== 'string' ||
        !(editor.category === 'all' || PF.CATEGORIES.some(({ id }) => id === editor.category)) ||
        !record(editor.locks) || !Object.values(editor.locks).every(value => typeof value === 'boolean') ||
        !Array.isArray(editor.slots) || editor.slots.length > 4 || !editor.slots.every(validSlot) ||
        !['subtle', 'normal', 'wild'].includes(editor.variant)) {
      throw new Error('Invalid PixelForge project');
    }
    const parsed = PF.recipeFromJSON(recipe);
    if (!parsed.ok) throw new Error('Invalid PixelForge recipe');
    const config = parsed.config;
    const effect = recipe.combo ? PF.makeCombo(config) : PF.makeEffect(config);
    if (preview.frame >= effect.frameCount()) throw new Error('Invalid PixelForge preview frame');
    return { config, effect, preview, editor };
  }

  function encode({ config, preview, editor }) {
    const text = JSON.stringify({ version: 1, recipe: PF.recipeToJSON(config), preview, editor });
    decode(text);
    return text;
  }

  const projects = { key, encode, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = projects;
  else root.PF_PROJECT = projects;
})(globalThis);
