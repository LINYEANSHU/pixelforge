/* PixelForge —— 导出任务（浏览器 Worker 与 Node 共用）
 *
 * 种类：
 *   frame    单帧 PNG（含透明通道）
 *   sequence PNG 序列 ZIP + timeline.json
 *   apng     APNG 动图（单文件，1/60s 每帧，无限循环）+ 配方 JSON
 *   batch    批量导出：多效果各取最佳时刻 PNG + 配方 JSON 合并为一个 ZIP
 *   sheet    多页 Sprite Sheet PNG ZIP + Aseprite 兼容 JSON
 *   recipe   效果配方 JSON
 *
 * 规则（务必与 docs/导出格式.md 一致）：
 *   - 采样时间 t = k / fps（fps=60），整数步 k —— 不做毫秒累加，不录屏
 *   - 循环导出：k ∈ [0, N-1]，帧 N ≡ 帧 0（周期逐位一致），不重复首帧
 *   - 非循环导出：k ∈ [0, N-1]，N = round(durationSec * fps)
 *   - sheet 逐页渲染编码：单页缓冲复用，页满即编码入 ZIP 并继续
 *     （全高分辨率帧从不同时驻留内存）
 *   - 取消：shouldCancel() 在每帧间检查 → 返回 {cancelled:true}，
 *     所有缓冲为局部变量，自然释放
 */
(function (root) {
  'use strict';
  const PF = root.PF || (root.parent && root.parent.PF);
  const PNG = root.PF_PNG || require('./png.js');
  const ZIP = root.PF_ZIP || require('./zip.js');

  const FPS = 60;

  function sanitizeName(s) {
    return String(s || 'effect').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 48) || 'effect';
  }

  /* 宏任务让步：确保 cancel 等消息事件有机会进入（纯 microtask 循环会饿死事件队列） */
  function yieldMacrotask() {
    return new Promise(res => {
      if (typeof MessageChannel !== 'undefined') {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => { ch.port1.close(); res(); };
        ch.port2.postMessage(0);
      } else {
        setTimeout(res, 0);
      }
    });
  }

  /* 核心：渲染第 k 帧 → RGBA buffer（复用传入的 raster 与 compositeOut） */
  function renderFrameRGBA(eff, k, R, compOut) {
    eff.renderFrame(k, R);
    return R.composite(compOut, false);
  }

  async function runJob(job, cb) {
    cb = cb || {};
    const onProgress = cb.onProgress || (() => {});
    const shouldCancel = cb.shouldCancel || (() => false);
    const kind = job.kind;
    const name = sanitizeName(job.name);
    const entries = [];   // {name, data:Uint8Array}
    const CpuRaster = PF.Renderer;

    if (kind === 'recipe') {
      const eff = (job.config && job.config.items) ? PF.makeCombo(job.config) : PF.makeEffect(job.config);
      const json = JSON.stringify(PF.recipeToJSON(eff, job.note || ''), null, 2);
      entries.push({ name: name + '.pfx.json', data: new TextEncoder().encode(json) });
      onProgress(1, 1, 'recipe');
      return { kind, name, entries, json: JSON.parse(json) };
    }

    if (kind === 'batch') {
      /* 批量导出：多个效果配置各取「最佳时刻」单帧 PNG + 配方 JSON，打成一个 ZIP。
       * 逐个构建渲染（同一时刻只驻留一个效果实例与一帧），内存有界。
       * 注意：此分支不依赖单一 job.config，须在下方 eff 构建之前返回。 */
      const items = Array.isArray(job.items) ? job.items.slice(0, 64) : [];
      if (!items.length) throw new Error('批量导出需要 items 配置数组（1..64）');
      const zip = new ZIP.ZipWriter();
      const manifest = [];
      const used = new Set();
      for (let i = 0; i < items.length; i++) {
        if (shouldCancel()) return { kind, cancelled: true, done: i };
        await yieldMacrotask();
        const it = items[i] || {};
        const cfg = it.config || it;
        const canvasSize = it.canvasSize || job.canvasSize || cfg.canvasSize || PF.DEFAULT_CANVAS;
        const effB = cfg.items
          ? PF.makeCombo(Object.assign({}, cfg, { canvasSize }))
          : PF.makeEffect(Object.assign({}, cfg, { canvasSize }));
        const s = effB.canvasSize;
        const Rb = new CpuRaster(s);
        const k = Math.max(0, Math.min(effB.frameCount() - 1, Math.round((it.timeSec !== undefined ? it.timeSec : effB.thumbTime()) * FPS)));
        effB.renderFrame(k, Rb);
        const png = await PNG.encodePNG(Rb.composite(null, false), s, s);
        let base = sanitizeName(it.name || cfg.template || ('item' + i));
        if (used.has(base)) base += '_' + i;   // 去重：同名单独追加序号
        used.add(base);
        zip.add(base + '_peak.png', png);
        zip.add(base + '.pfx.json', new TextEncoder().encode(JSON.stringify(PF.recipeToJSON(effB, job.note || ''), null, 2)));
        manifest.push({ index: i, name: base, template: cfg.template || (cfg.items ? 'combo' : '?'), canvas: s, frame: k, timeSec: k / FPS });
        onProgress(i + 1, items.length, 'batch');
      }
      zip.add(name + '.batch.json', new TextEncoder().encode(JSON.stringify({
        format: 'pixelforge.batch',
        version: 1,
        app: PF.APP_NAME + ' ' + PF.VERSION,
        count: items.length,
        items: manifest,
      }, null, 2)));
      entries.push({ name: name + '_batch.zip', data: zip.finish() });
      onProgress(items.length, items.length, 'batch');
      return { kind, name, entries, count: items.length, manifest };
    }

    const eff = (job.config && job.config.items)
      ? PF.makeCombo(Object.assign({}, job.config, { canvasSize: job.canvasSize || job.config.canvasSize || PF.DEFAULT_CANVAS }))
      : PF.makeEffect(Object.assign({}, job.config, {
          canvasSize: job.canvasSize || (job.config && job.config.canvasSize) || PF.DEFAULT_CANVAS,
        }));
    const size = eff.canvasSize;
    const loop = eff.loop;
    const total = eff.frameCount();       // 循环: N 帧（不含重复尾帧）；非循环: N 帧
    const R = new CpuRaster(size);
    let compOut = null;

    if (kind === 'frame') {
      const k = Math.max(0, Math.min(total - 1, Math.round((job.timeSec !== undefined ? job.timeSec : eff.thumbTime()) * FPS)));
      if (shouldCancel()) return { kind, cancelled: true };
      compOut = renderFrameRGBA(eff, k, R, compOut);
      const png = await PNG.encodePNG(compOut, size, size);
      entries.push({ name: name + '_' + String(k).padStart(4, '0') + '.png', data: png });
      onProgress(1, 1, 'frame');
      return { kind, name, entries, frameIndex: k, total };
    }

    if (kind === 'sequence') {
      const zip = new ZIP.ZipWriter();
      const framesInfo = [];
      for (let k = 0; k < total; k++) {
        if (shouldCancel()) return { kind, cancelled: true, done: k };
        await yieldMacrotask();
        compOut = renderFrameRGBA(eff, k, R, compOut);
        const png = await PNG.encodePNG(compOut, size, size);
        const fn = name + '_' + String(k).padStart(4, '0') + '.png';
        zip.add(fn, png);
        framesInfo.push({ index: k, file: fn, timeSec: k / FPS });
        if (k % 4 === 0 || k === total - 1) onProgress(k + 1, total, 'sequence');
      }
      const timeline = {
        format: 'pixelforge.timeline',
        version: 1,
        app: PF.APP_NAME + ' ' + PF.VERSION,
        name,
        fps: FPS,
        timebase: '1/' + FPS,
        frameCount: total,
        durationSec: total / FPS,
        loop,
        frameDurationMsExact: 1000 / FPS,
        frameTimeRule: 'frameTimeSec(k) = k / fps。请勿以累加舍入毫秒的方式重建时间轴。',
        canvas: { width: size, height: size },
        recipe: PF.recipeToJSON(eff),
        frames: framesInfo,
      };
      zip.add(name + '.timeline.json', new TextEncoder().encode(JSON.stringify(timeline, null, 2)));
      entries.push({ name: name + '_sequence.zip', data: zip.finish() });
      onProgress(total, total, 'sequence');
      return { kind, name, entries, frameCount: total, timeline };
    }

    if (kind === 'apng') {
      /* APNG 动图：单文件逐帧动画（1/60s/帧，无限循环），附配方 JSON。
       * 与 sequence 相同的内存纪律：逐帧渲染→压缩→只保留压缩字节。 */
      let compOut = null;
      const anim = await PNG.encodeAPNG(size, size, total, k => {
        if (shouldCancel()) return null;
        compOut = renderFrameRGBA(eff, k, R, compOut);
        return compOut;
      }, { delayNum: 1, delayDen: FPS, numPlays: 0, onFrame: k => { if (k % 4 === 0 || k === total - 1) onProgress(k + 1, total, 'apng'); } });
      if (anim.cancelled) return { kind, cancelled: true, done: anim.frames };
      entries.push({ name: name + '_anim.png', data: anim.data });
      entries.push({ name: name + '.pfx.json', data: new TextEncoder().encode(JSON.stringify(PF.recipeToJSON(eff, job.note || ''), null, 2)) });
      onProgress(total, total, 'apng');
      return { kind, name, entries, frameCount: total };
    }

    if (kind === 'sheet') {
      const padding = Math.max(0, Math.min(32, job.padding === undefined ? 2 : job.padding | 0));
      const maxPage = Math.max(256, Math.min(8192, job.maxPage === undefined ? 4096 : job.maxPage | 0));
      const cell = size;
      const step = cell + padding;
      const cols = Math.max(1, Math.floor((maxPage - padding) / step));
      const rows = cols;
      const perPage = cols * rows;
      const pages = Math.ceil(total / perPage);
      const zip = new ZIP.ZipWriter();
      const frameRects = [];   // {index,page,x,y,w,h,timeSec,anchor}
      const pageMeta = [];
      /* 实际页宽 = cols*step ≤ maxPage：页缓冲按真实尺寸预分配（旧实现按 maxPage²
       * 多留出最大 10~15% 死空间），blit 以 pageW 为行距，编码字节不变 */
      const pageW = Math.min(maxPage, cols * step);
      const compOutPage = new Uint8ClampedArray(pageW * pageW * 4); // 单页缓冲复用
      const clearPage = compOutPage.fill.bind(compOutPage, 0);
      let page = 0, idxInPage = 0;
      for (let k = 0; k < total; k++) {
        if (shouldCancel()) return { kind, cancelled: true, done: k, pages };
        await yieldMacrotask();
        if (idxInPage === 0) clearPage();
        compOut = renderFrameRGBA(eff, k, R, compOut);
        const col = idxInPage % cols, row = (idxInPage / cols) | 0;
        const px = col * step, py = row * step;
        /* blit 单元格（含 padding 间隙留白） */
        for (let y = 0; y < cell; y++) {
          const src = y * size * 4;
          const dst = ((py + y) * pageW + px) * 4;
          compOutPage.set(compOut.subarray(src, src + size * 4), dst);
        }
        frameRects.push({ index: k, page, x: px, y: py, w: cell, h: cell, timeSec: k / FPS, anchor: { x: cell >> 1, y: cell >> 1 } });
        idxInPage++;
        if (idxInPage === perPage || k === total - 1) {
          const usedRows = row + 1;
          /* 页宽 = cols*step，页高 = usedRows*step（单元格内含 padding 间隙） */
          const pw = Math.min(maxPage, cols * step);
          const ph = Math.min(maxPage, usedRows * step);
          const png = await PNG.encodePNG(compOutPage, pw, ph);
          const fn = name + '_sheet_' + String(page).padStart(2, '0') + '.png';
          zip.add(fn, png);
          pageMeta.push({ image: fn, page, size: { w: pw, h: ph }, frames: frameRects.filter(f => f.page === page).map(f => f.index) });
          page++; idxInPage = 0;
          onProgress(k + 1, total, 'sheet');
        } else if (k % 4 === 0) onProgress(k + 1, total, 'sheet');
      }
      const sheetJson = {
        frames: {},
        meta: {
          app: PF.APP_NAME + ' ' + PF.VERSION,
          format: 'RGBA8888',
          scale: '1',
          pixelfx: {
            fps: FPS,
            timebase: '1/' + FPS,
            frameDurationMsExact: 1000 / FPS,
            frameTimeRule: 'frameTimeSec(k) = k / fps',
            loop,
            frameCount: total,
            padding,
            cell: { w: cell, h: cell },
            anchorSpec: '每帧锚点为所在单元格中心，单位为页内像素',
            pages: pageMeta,
            recipe: PF.recipeToJSON(eff),
          },
        },
      };
      for (const f of frameRects) {
        const key = name + '_' + String(f.index).padStart(4, '0');
        sheetJson.frames[key] = {
          index: f.index,
          frame: { x: f.x, y: f.y, w: f.w, h: f.h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
          sourceSize: { w: f.w, h: f.h },
          duration: 1000 / FPS,
          page: f.page,
          timeSec: f.timeSec,
          anchor: f.anchor,
        };
      }
      zip.add(name + '.sheet.json', new TextEncoder().encode(JSON.stringify(sheetJson, null, 2)));
      entries.push({ name: name + '_sheet.zip', data: zip.finish() });
      onProgress(total, total, 'sheet');
      return { kind, name, entries, frameCount: total, pages, sheet: sheetJson };
    }

    throw new Error('未知导出种类: ' + kind);
  }

  const JOB = { runJob, renderFrameRGBA, sanitizeName };
  if (typeof globalThis !== 'undefined') {
    globalThis.PF_JOB = JOB;
    if (globalThis.PF) globalThis.PF.job = JOB;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = JOB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
