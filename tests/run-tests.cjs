/* PixelForge —— 测试套件（零依赖，node tests/run-tests.cjs 运行）
 * 覆盖：同种子复现 / seek 一致性 / 预览=导出 / 60FPS 帧数 / 透明通道 /
 *       分页导出 / JSON 往返 / 非法配置拒绝 / 取消清理 / 长循环无增长 /
 *       循环接缝逐位一致 / 组合器 / 断网静态扫描
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
function load(rel) { return require(path.join(ROOT, rel)); }
load('src/core/pf.js'); load('src/core/rng.js'); load('src/core/palette.js');
load('src/core/raster.js'); load('src/core/layers.js'); load('src/core/effect.js');
load('src/core/templates.js'); load('src/core/parser.js'); load('src/core/variant.js');
load('src/core/stage.js'); load('src/core/export/png.js'); load('src/core/export/zip.js');
load('src/core/export/job.js');
const PF = globalThis.PF;
const PNG = globalThis.PF_PNG;

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log('  ✓', name); })
    .catch(e => { fail++; failures.push(name + ' :: ' + e.message); console.log('  ✗', name, '::', e.message); });
}
function hashBuf(buf) {
  /* FNV-1a 32bit */
  let h = 0x811c9dc5;
  const b = buf.buffer ? new Uint8Array(buf.buffer || buf) : buf;
  for (let i = 0; i < buf.length; i++) { h ^= buf[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function main() {
  const ids = Object.keys(PF.TEMPLATES);
  console.log('PixelForge 测试套件 — 模板', ids.length, '个\n');

  /* ---- 1. 同种子复现 ---- */
  await test('同种子同帧逐位复现（全模板×3帧）', () => {
    const R1 = new PF.Renderer(64), R2 = new PF.Renderer(64);
    for (const id of ids) {
      const e1 = PF.makeEffect({ template: id, seed: 1234, canvasSize: 64 });
      const e2 = PF.makeEffect({ template: id, seed: 1234, canvasSize: 64 });
      for (const k of [3, Math.floor(e1.frameCount() / 2), e1.frameCount() - 1]) {
        e1.renderFrame(k, R1); e2.renderFrame(k, R2);
        const h1 = hashBuf(R1.composite(null, false));
        const h2 = hashBuf(R2.composite(null, false));
        if (h1 !== h2) throw new Error(id + ' 帧' + k + ' 哈希不同 ' + h1 + '≠' + h2);
      }
    }
  });
  await test('不同种子产生不同画面', () => {
    const R = new PF.Renderer(64);
    const e1 = PF.makeEffect({ template: 'magic_explosion', seed: 1, canvasSize: 64 });
    const e2 = PF.makeEffect({ template: 'magic_explosion', seed: 999, canvasSize: 64 });
    e1.renderFrame(30, R); const h1 = hashBuf(R.composite(null, false));
    e2.renderFrame(30, R); const h2 = hashBuf(R.composite(null, false));
    if (h1 === h2) throw new Error('不同种子画面相同');
  });

  /* ---- 2. seek 一致性（无状态纯函数证明） ---- */
  await test('seek 一致性：任意次序采样结果一致（全模板）', () => {
    const R = new PF.Renderer(64);
    for (const id of ids) {
      const e = PF.makeEffect({ template: id, seed: 77, canvasSize: 64 });
      const N = e.frameCount();
      const mid = Math.floor(N / 2);
      /* 先采早期，再跳中间，再回跳早期 */
      e.renderFrame(5, R); const hA = hashBuf(R.composite(null, false));
      e.renderFrame(mid, R); const hB = hashBuf(R.composite(null, false));
      e.renderFrame(5, R); const hA2 = hashBuf(R.composite(null, false));
      const e2 = PF.makeEffect({ template: id, seed: 77, canvasSize: 64 });
      e2.renderFrame(mid, R); const hB2 = hashBuf(R.composite(null, false));
      if (hA !== hA2) throw new Error(id + ' 回跳不一致');
      if (hB !== hB2) throw new Error(id + ' 中段不一致');
    }
  });

  /* ---- 3. 预览与导出一致（解码 PNG 对比直接渲染） ---- */
  await test('导出 PNG 像素 == 直接渲染像素（预览=导出）', async () => {
    const cfg = { template: 'ui_pulse', seed: 9, canvasSize: 64 };
    const r = await PF.job.runJob({ kind: 'sequence', config: cfg, name: 't_consist', canvasSize: 64 }, {});
    const zipBuf = Buffer.from(r.entries[0].data);
    /* 从 ZIP 中解出第 10 帧 PNG（store 方法） */
    function zipEntries(buf) {
      const out = [];
      let off = 0;
      for (;;) {
        if (buf.readUInt32LE(off) !== 0x04034b50) break;
        const method = buf.readUInt16LE(off + 8);
        const size = buf.readUInt32LE(off + 18);
        const nameLen = buf.readUInt16LE(off + 26);
        const extraLen = buf.readUInt16LE(off + 28);
        const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
        const dataOff = off + 30 + nameLen + extraLen;
        out.push({ name, data: buf.subarray(dataOff, dataOff + size), method });
        off = dataOff + size;
      }
      return out;
    }
    const entries = zipEntries(zipBuf);
    const pngEntry = entries.find(e => e.name.endsWith('_0010.png'));
    assert(pngEntry, 'ZIP 中缺少第10帧');
    /* 解码 PNG */
    function decodePNG(buf) {
      let off = 8, w = 0, h = 0;
      const idat = [];
      for (;;) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
        else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        off += 12 + len;
      }
      const raw = zlib.inflateSync(Buffer.concat(idat));
      const stride = w * 4;
      const outB = Buffer.alloc(w * h * 4);
      const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
      for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
          const a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
          let v = cur[i];
          if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
          else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
          cur[i] = v & 255;
        }
        cur.copy(outB, y * stride); cur.copy(prev);
      }
      return { w, h, data: outB };
    }
    const img = decodePNG(pngEntry.data);
    const eff = PF.makeEffect(cfg);
    const R = new PF.Renderer(64);
    eff.renderFrame(10, R);
    const direct = R.composite(null, false);
    for (let i = 0; i < direct.length; i++) {
      if (Math.abs(direct[i] - img.data[i]) > 0) throw new Error('帧像素不一致 @' + i + ' ' + direct[i] + '≠' + img.data[i]);
    }
  });

  /* ---- 4. 60FPS 帧数与时间基 ---- */
  await test('frameCount == round(duration×60)，timeline.fps==60', async () => {
    for (const id of ids) {
      const e = PF.makeEffect({ template: id, seed: 1 });
      const n = e.frameCount();
      assert(n === Math.round(e.durationSec * 60), id + ' 帧数不符 ' + n + ' vs ' + Math.round(e.durationSec * 60));
      const r = await PF.job.runJob({ kind: 'recipe', config: { template: id, seed: 1 }, name: 't' }, {});
      assert(r.entries.length === 1, id + ' recipe 导出异常');
    }
    const seq = await PF.job.runJob({ kind: 'sequence', config: { template: 'ui_pulse', seed: 1, params: { durationSec: 0.9 } }, name: 't', canvasSize: 32 }, {});
    assert(seq.timeline.fps === 60 && seq.timeline.timebase === '1/60', 'timeline 时间基错误');
    assert(seq.timeline.frameCount === 54, 'timeline 帧数 ' + seq.timeline.frameCount);
    assert(Math.abs(seq.timeline.frameDurationMsExact - 1000 / 60) < 1e-12, '帧时长未保留精确值');
  });

  /* ---- 5. 透明通道：导出无背景、角落透明 ---- */
  await test('导出含透明通道（角落 alpha=0，中心有内容）', async () => {
    const r = await PF.job.runJob({ kind: 'frame', config: { template: 'magic_explosion', seed: 5 }, timeSec: 0.5, name: 't_alpha', canvasSize: 64 }, {});
    const png = r.entries[0].data;
    /* IHDR color type 必须 6 */
    assert(png[25] === 6, 'colorType != 6 (RGBA)');
    /* 像素检查 */
    const R = new PF.Renderer(64);
    const eff = PF.makeEffect({ template: 'magic_explosion', seed: 5, canvasSize: 64 });
    eff.renderFrame(30, R);
    const out = R.composite(null, false);
    const corner = (out[3] + out[64 * 63 * 4 + 3] + out[(64 * 3 + 3)] + out[(64 * 60 + 60) * 4 + 3]) / 4;
    assert(corner < 2, '角落不透明 alpha=' + corner);
    let centerMax = 0;
    for (let y = 24; y < 40; y++) for (let x = 24; x < 40; x++) centerMax = Math.max(centerMax, out[(y * 64 + x) * 4 + 3]);
    assert(centerMax > 40, '中心无内容');
  });

  /* ---- 6. 分页导出 ---- */
  await test('Sheet 分页：页数、帧矩形、元数据一致', async () => {
    const r = await PF.job.runJob({ kind: 'sheet', config: { template: 'magic_explosion', seed: 5, params: { durationSec: 1 } }, name: 't_sheet', canvasSize: 64, maxPage: 256, padding: 2 }, {});
    assert(r.pages > 1, '未分页 pages=' + r.pages);
    const frames = Object.values(r.sheet.frames);
    assert(frames.length === r.frameCount, '元数据帧数不符');
    const pageMap = {};
    for (const f of frames) {
      pageMap[f.page] = (pageMap[f.page] || 0) + 1;
      assert(f.frame.x >= 0 && f.frame.y >= 0, '负坐标');
      assert(f.frame.x + f.frame.w <= 256 && f.frame.y + f.frame.h <= 256, '越界');
      assert(Math.abs(f.timeSec * 60 - f.index) < 1e-9, 'timeSec 规则错误');
    }
    for (const p of r.sheet.meta.pixelfx.pages) {
      assert(p.frames.length === pageMap[p.page], '页 ' + p.page + ' 帧列表不符');
    }
  });

  /* ---- 7. JSON 往返 ---- */
  await test('配方 JSON 往返：渲染哈希不变', async () => {
    const cfg = { template: 'holy_smite', seed: 321, params: { scale: 1.3, intensity: 1.4 }, canvasSize: 64 };
    const e1 = PF.makeEffect(cfg);
    e1.renderFrame(40, new PF.Renderer(64));
    const R1 = new PF.Renderer(64);
    e1.renderFrame(40, R1);
    const h1 = hashBuf(R1.composite(null, false));
    const json = PF.recipeToJSON(e1);
    const back = PF.recipeFromJSON(JSON.parse(JSON.stringify(json)));
    assert(back.ok, '往返解析失败: ' + back.errors);
    const e2 = PF.makeEffect(back.config);
    const R2 = new PF.Renderer(64);
    e2.renderFrame(40, R2);
    const h2 = hashBuf(R2.composite(null, false));
    if (h1 !== h2) throw new Error('往返后渲染不一致');
  });
  await test('组合器配方往返', async () => {
    const cfg = { items: [
      { config: { template: 'magic_explosion', seed: 1 }, start: 0, dur: 1.5, off: [0, 0], scale: 1 },
      { config: { template: 'hit_impact', seed: 2 }, start: 0.5, dur: 0.7, off: [0.3, 0.1], scale: 0.8 },
    ], budget: 600, canvasSize: 64 };
    const c1 = PF.makeCombo(cfg);
    const json = PF.recipeToJSON(c1);
    const back = PF.recipeFromJSON(JSON.parse(JSON.stringify(json)));
    assert(back.ok, '组合往返失败: ' + back.errors);
    const c2 = PF.makeCombo(back.config);
    const R = new PF.Renderer(64);
    c1.renderFrame(50, R); const h1 = hashBuf(R.composite(null, false));
    c2.renderFrame(50, R); const h2 = hashBuf(R.composite(null, false));
    if (h1 !== h2) throw new Error('组合往返渲染不一致');
  });

  /* ---- 8. 非法配置拒绝 ---- */
  await test('非法配置被拒绝（模板/参数/配方）', () => {
    let threw = 0;
    try { PF.makeEffect({ template: '不存在' }); } catch (e) { threw++; }
    try { PF.makeEffect({ template: 'magic_explosion', params: { scale: 'abc' } }); } catch (e) { threw++; }
    try { PF.makeEffect({ template: 'magic_explosion', params: { 未知参数: 1 } }); } catch (e) { threw++; }
    if (threw !== 3) throw new Error('仅 ' + threw + '/3 被拒绝');
    const bad1 = PF.recipeFromJSON({ format: 'wrong' });
    if (bad1.ok) throw new Error('错误 format 未拒绝');
    const bad2 = PF.recipeFromJSON({ format: 'pixelforge.recipe', version: 1, template: 'nope' });
    if (bad2.ok) throw new Error('错误模板未拒绝');
    const bad3 = PF.recipeFromJSON({ format: 'pixelforge.recipe', version: 1, combo: true, items: [] });
    if (bad3.ok) throw new Error('空组合未拒绝');
    /* 越界数值应钳制而非崩溃 */
    const e = PF.makeEffect({ template: 'magic_explosion', params: { scale: 999 } });
    if (e.params.scale !== 2) throw new Error('越界未钳制');
  });

  /* ---- 9. 取消后清理 ---- */
  await test('导出取消：干净返回 cancelled，无异常', async () => {
    let count = 0;
    const r = await PF.job.runJob(
      { kind: 'sequence', config: { template: 'magic_explosion', seed: 1, params: { durationSec: 3 } }, name: 't_cancel', canvasSize: 64 },
      { shouldCancel: () => ++count > 8, onProgress: () => {} });
    assert(r.cancelled === true, '未返回 cancelled');
    assert(r.done > 0 && r.done < 180, '取消点异常 ' + r.done);
  });
  await test('Sheet 导出取消', async () => {
    let count = 0;
    const r = await PF.job.runJob(
      { kind: 'sheet', config: { template: 'flame_jet', seed: 1 }, name: 't_cancel2', canvasSize: 64, maxPage: 256 },
      { shouldCancel: () => ++count > 20 });
    assert(r.cancelled === true, '未返回 cancelled');
  });

  /* ---- 10. 长循环无对象增长 ---- */
  await test('长循环 3600 步（60s）：活跃上限恒定、耗时稳定', () => {
    for (const id of ['flame_jet', 'rain_storm', 'buff_aura']) {
      const e = PF.makeEffect({ template: id, seed: 6, canvasSize: 64 });
      const R = new PF.Renderer(64);
      const N = e.frameCount();
      let t0 = process.hrtime.bigint();
      for (let k = 0; k < 600; k++) e.renderFrame(k % N, R);
      const early = Number(process.hrtime.bigint() - t0) / 1e6 / 600;
      t0 = process.hrtime.bigint();
      for (let k = 0; k < 3000; k++) e.renderFrame(k % N, R);
      const late = Number(process.hrtime.bigint() - t0) / 1e6 / 3000;
      if (late > early * 2.5) throw new Error(id + ' 每帧耗时增长: ' + early.toFixed(2) + '→' + late.toFixed(2) + 'ms');
      if (e.maxActive > 1000) throw new Error(id + ' 活跃上限异常 ' + e.maxActive);
    }
  });

  /* ---- 11. 循环接缝逐位一致 ---- */
  await test('循环效果：帧 N ≡ 帧 0（全循环模板逐位）', () => {
    const R = new PF.Renderer(64);
    for (const id of ids) {
      const def = PF.TEMPLATES[id];
      if (!def.loop) continue;
      const e = PF.makeEffect({ template: id, seed: 88, canvasSize: 64 });
      const N = e.frameCount();
      e.renderFrame(0, R); const h0 = hashBuf(R.composite(null, false));
      e.renderFrame(N, R); const hN = hashBuf(R.composite(null, false));
      if (h0 !== hN) throw new Error(id + ' 循环接缝不一致 ' + h0 + '≠' + hN);
    }
  });

  /* ---- 12. 组合器基本行为 ---- */
  await test('组合器：≤4 层、时间窗、变换生效', () => {
    let threw = 0;
    try { PF.makeCombo({ items: [1, 2, 3, 4, 5].map(() => ({ config: { template: 'ui_pulse' } })) }); } catch (e) { threw++; }
    if (!threw) throw new Error('5 层未被拒绝');
    const c = PF.makeCombo({ items: [
      { config: { template: 'ui_pulse', seed: 1 }, start: 0, dur: 0.9 },
      { config: { template: 'pickup_sparkle', seed: 2 }, start: 0.4, dur: 0.8, off: [0.4, 0], scale: 0.7 },
    ] });
    assert(c.durationSec >= 1.2, '总时长错误');
    const R = new PF.Renderer(64);
    c.renderFrame(10, R);
    const h1 = hashBuf(R.composite(null, false));
    c.renderFrame(40, R);
    const h2 = hashBuf(R.composite(null, false));
    if (h1 === h2) throw new Error('组合不同时刻画面相同');
  });

  /* ---- 13. 断网静态扫描 ---- */
  await test('断网运行：源码无网络调用', () => {
    const bad = [];
    function scan(dir) {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) { scan(p); continue; }
        if (!p.endsWith('.js') && !p.endsWith('.cjs')) continue;
        const src = fs.readFileSync(p, 'utf8');
        if (/fetch\s*\(|XMLHttpRequest|WebSocket|importScripts\(\s*['"]https?:|EventSource|navigator\.sendBeacon/.test(src)) {
          bad.push(path.relative(ROOT, p));
        }
      }
    }
    scan(path.join(ROOT, 'src'));
    if (bad.length) throw new Error('发现网络调用: ' + bad.join(', '));
  });

  /* ---- 14. 解析器 ---- */
  await test('文字配方解析：样例句全字段命中', () => {
    const r = PF.parser.parse('蓝紫色环形爆炸，持续2秒，细碎火花，透明背景');
    assert(r.ok && r.template === 'magic_explosion', '模板错误 ' + r.template);
    assert(r.params.durationSec === 2, '时长未解析');
    assert(r.params.color === '#7a4aff', '颜色未解析');
    assert(r.transparent === true, '透明背景未解析');
    const r2 = PF.parser.parse('哈喽世界乱七八糟');
    assert(!r2.ok, '乱码不应识别成功');
    const r3 = PF.parser.parse('循环的火把火焰');
    assert(r3.ok && r3.template === 'torch_fire' && r3.loop === true, '循环未解析');
  });

  /* ---- 15. 预算钳制 ---- */
  await test('粒子预算：紧预算被钳制，松预算不缩水', () => {
    const tight = PF.makeEffect({ template: 'flame_jet', seed: 1, budget: 64 });
    const loose = PF.makeEffect({ template: 'flame_jet', seed: 1, budget: 4000 });
    if (tight.maxActive > 64 + 40) throw new Error('紧预算超支 maxActive=' + tight.maxActive);
    if (loose.maxActive <= tight.maxActive) throw new Error('松预算未生效 ' + loose.maxActive + '<=' + tight.maxActive);
    /* 连续渲染后活跃量不超限（vstream 活跃数公式验证） */
    const R = new PF.Renderer(64);
    for (let k = 0; k < 120; k++) tight.renderFrame(k, R);
    if (tight.maxActive > 64 + 40) throw new Error('渲染后超限');
  });

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  if (fail) { console.log('失败项:\n - ' + failures.join('\n - ')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
