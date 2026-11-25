const assert = require('node:assert/strict');
const { test } = require('node:test');
require('../src/core/pf.js');
require('../src/core/effect.js');
require('../src/core/templates.js');
const stage = require('../src/core/stage.js');
const projects = require('../src/ui/project.js');

const config = { template: 'magic_explosion', seed: 783, loop: false, budget: 450, canvasSize: 128 };
const frame = 25;
const preview = { frame, playing: false, speed: 0.5, stageOn: true, stageMode: 'double', shake: false, reduceFlash: true, hud: false };
const editor = { note: '蓝色爆炸', category: 'all', locks: { intensity: true }, slots: [], variant: 'normal' };

test('project checkpoint keeps the recipe, editor draft and paused frame', () => {
  const decoded = projects.decode(projects.encode({ config, preview, editor }));
  assert.deepEqual(decoded.config, { ...config, params: {} });
  assert.deepEqual(decoded.preview, preview);
  assert.deepEqual(decoded.editor, editor);
});

test('project checkpoint preserves a looping combo and defaults old combo recipes to one shot', () => {
  const combo = {
    canvasSize: 128, budget: 450, loop: true,
    items: [{ config, start: 0, dur: 2, off: [0, 0], scale: 1 }],
  };
  const text = projects.encode({ config: combo, preview, editor });
  assert.equal(projects.decode(text).effect.loop, true);
  const legacy = JSON.parse(text);
  delete legacy.recipe.loop;
  assert.equal(projects.decode(JSON.stringify(legacy)).effect.loop, false);
});

test('project checkpoint rejects an invalid timeline or an unknown template', () => {
  const text = projects.encode({ config, preview, editor });
  const bad = JSON.parse(text);
  bad.preview.frame = -1;
  assert.throws(() => projects.decode(JSON.stringify(bad)));
  bad.preview.frame = frame;
  bad.recipe.template = 'nonexistent-template';
  assert.throws(() => projects.decode(JSON.stringify(bad)));
});

test('double strike is staged as two distinct windup and impact windows', () => {
  assert.deepEqual(stage.attackStarts('single'), [0]);
  const double = stage.attackStarts('double');
  assert.equal(double.length, 2);
  assert.equal(stage.attackIndex('double', stage.WINDUP), 0);
  assert.equal(stage.attackIndex('double', double[1] - 0.01), 0);
  assert.equal(stage.attackIndex('double', double[1]), 1);
  assert.equal(stage.phase(double[1] + stage.WINDUP + 0.01 - double[1]).name, 'hit');
});
