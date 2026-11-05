/* PixelForge —— 样例素材与关键帧接触表生成器
 * 产出：
 *   samples/contact/<id>_contact.png   每模板 6 帧接触表(起势/峰值/消散…)
 *   samples/single/<id>_peak.png       每模板峰值单帧（透明底）
 *   samples/exports/…                  单帧/序列ZIP/SheetZIP/配方JSON 全套真实样例
 *   samples/reader/read-sheet.js       读取 sheet JSON + PNG 解码示例
 * 用法: node tools/gen-samples.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function load(rel) { return require(path.join(ROOT, rel)); }
load('src/core/pf.js'); load('src/core/rng.js'); load('src/core/palette.js');
load('src/core/raster.js'); load('src/core/layers.js'); load('src/core/effect.js');
load('src/core/templates.js'); load('src/core/parser.js'); load('src/core/variant.js');
load('src/core/stage.js'); load('src/core/export/png.js'); load('src/core/export/zip.js');
load('src/core/export/job.js');
const PF = globalThis.PF;
const PNG = globalThis.PF_PNG;
const ZIP = globalThis.PF_ZIP;
const PARSER = globalThis.PF_PARSER;

const OUT = path.join(ROOT, 'samples');
for (const d of ['contact', 'single', 'exports', 'reader']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

async function main() {
  const ids = Object.keys(PF.TEMPLATES);
  console.log('生成', ids.length, '个模板的接触表与单帧…');

  for (const id of ids) {
    const eff = PF.makeEffect({ template: id, seed: 42, canvasSize: 96 });
    const N = eff.frameCount();
    const R = new PF.Renderer(96);
    /* 接触表：6 个关键帧：起势 12%、前峰 30%、峰值 40%、扩散 60%、消散 80%、尾 95% */
    const fr = [0.12, 0.3, 0.42, 0.6, 0.8, 0.95].map(u => Math.min(N - 1, Math.round(N * u)));
    const cell = 96, pad = 4, cols = 3;
    const rows = 2;
    const W = cols * (cell + pad) + pad, H = rows * (cell + pad) + pad;
    const sheet = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < fr.length; i++) {
      eff.renderFrame(fr[i], R);
      const out = R.composite(null, false);
      const cx = pad + (i % cols) * (cell + pad), cy = pad + ((i / cols) | 0) * (cell + pad);
      for (let y = 0; y < cell; y++) {
        sheet.set(out.subarray(y * cell * 4, (y + 1) * cell * 4), ((cy + y) * W + cx) * 4);
      }
    }
    const png = await PNG.encodePNG(sheet, W, H);
    fs.writeFileSync(path.join(OUT, 'contact', id + '_contact.png'), Buffer.from(png));

    /* 峰值单帧 128px 透明底 */
    const eff2 = PF.makeEffect({ template: id, seed: 42, canvasSize: 128 });
    const R2 = new PF.Renderer(128);
    eff2.renderFrame(Math.min(eff2.frameCount() - 1, Math.round(eff2.thumbTime() * 60)), R2);
    const png2 = await PNG.encodePNG(R2.composite(null, false), 128, 128);
    fs.writeFileSync(path.join(OUT, 'single', id + '_peak.png'), Buffer.from(png2));
  }
  console.log('接触表完成');

  /* ---- 全套真实导出样例（魔法爆炸） ---- */
  const name = 'magic_explosion';
  const cfg = { template: name, seed: 42, params: {} };
  const frameR = await PF.job.runJob({ kind: 'frame', config: cfg, timeSec: 0.5, name, canvasSize: 128 }, {});
  fs.writeFileSync(path.join(OUT, 'exports', frameR.entries[0].name), Buffer.from(frameR.entries[0].data));

  const seqR = await PF.job.runJob({ kind: 'sequence', config: cfg, name, canvasSize: 128 }, { });
  fs.writeFileSync(path.join(OUT, 'exports', seqR.entries[0].name), Buffer.from(seqR.entries[0].data));
  fs.writeFileSync(path.join(OUT, 'exports', name + '.timeline.json'), Buffer.from(JSON.stringify(seqR.timeline, null, 2)));

  const sheetR = await PF.job.runJob({ kind: 'sheet', config: cfg, name, canvasSize: 128, maxPage: 1024, padding: 2 }, {});
  fs.writeFileSync(path.join(OUT, 'exports', sheetR.entries[0].name), Buffer.from(sheetR.entries[0].data));
  fs.writeFileSync(path.join(OUT, 'exports', name + '.sheet.json'), Buffer.from(JSON.stringify(sheetR.sheet, null, 2)));

  const recR = await PF.job.runJob({ kind: 'recipe', config: cfg, name, note: '样例配方：蓝紫色魔法爆炸' }, {});
  fs.writeFileSync(path.join(OUT, 'exports', recR.entries[0].name), Buffer.from(recR.entries[0].data));

  /* 解析样例 */
  const parsed = PARSER.parse('蓝紫色环形爆炸，持续2秒，细碎火花，透明背景');
  fs.writeFileSync(path.join(OUT, 'exports', 'parse_sample.json'),
    Buffer.from(JSON.stringify({ input: '蓝紫色环形爆炸，持续2秒，细碎火花，透明背景', parsed }, null, 2)));

  /* 读取示例：解码 sheet JSON + PNG（零依赖） */
  fs.copyFileSync(path.join(__dirname, 'read-sheet-example.cjs'), path.join(OUT, 'reader', 'read-sheet.js'));

  /* 摘要 */
  const summary = {
    generatedAt: new Date().toISOString(),
    templates: ids.length,
    contactSheets: ids.length,
    exports: fs.readdirSync(path.join(OUT, 'exports')),
    notes: '接触表列序: 起势12% / 前峰30% / 峰值42% / 扩散60% / 消散80% / 尾95%；均由固定步进采样 t=k/60 生成',
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('样例完成 →', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
