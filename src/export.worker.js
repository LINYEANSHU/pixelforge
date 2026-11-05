/* PixelForge —— 导出 Worker
 * 与主线程共享同一导出核心（job.js）→ 预览与导出逐位一致。
 * 消息协议：
 *   in : {id, type:'run', job} | {id, type:'cancel'}
 *   out: {id, type:'progress', cur, total, stage}
 *        {id, type:'done', result}   result.cancelled=true 表示取消后干净退出
 *        {id, type:'error', message}
 */
'use strict';
importScripts('core/pf.js', 'core/rng.js', 'core/palette.js', 'core/raster.js',
  'core/layers.js', 'core/effect.js', 'core/templates.js',
  'core/export/png.js', 'core/export/zip.js', 'core/export/job.js');

let cancelling = false;

self.onmessage = async ev => {
  const m = ev.data;
  if (m.type === 'cancel') { cancelling = true; return; }
  if (m.type !== 'run') return;
  cancelling = false;
  try {
    const result = await PF.job.runJob(m.job, {
      onProgress: (cur, total, stage) => self.postMessage({ id: m.id, type: 'progress', cur, total, stage }),
      shouldCancel: () => cancelling,
    });
    /* transfer 压缩后字节 */
    const transfer = [];
    for (const e of result.entries || []) transfer.push(e.data.buffer);
    /* 瘦身回传：主线程只消费 entries/标量字段；
     * timeline/sheet 大 JSON（上千帧条目）留在 worker 内，省一次结构化克隆 */
    const slim = {};
    for (const k of Object.keys(result)) {
      if (k !== 'timeline' && k !== 'sheet') slim[k] = result[k];
    }
    self.postMessage({ id: m.id, type: 'done', result: slim }, transfer);
  } catch (e) {
    self.postMessage({ id: m.id, type: 'error', message: (e && e.message) || String(e) });
  }
};
