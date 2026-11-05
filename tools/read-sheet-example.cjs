/* PixelForge —— 导出样例读取示例（零依赖 Node）
 * 演示：解析 sheet JSON → 解码 PNG → 按帧矩形提取第 k 帧 → 写出独立 PNG。
 * 用法: node read-sheet.js <sheet.json> <页png...> [帧号=0]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---- 极简 PNG 解码（8bit RGBA、filter 0-4 全支持） ---- */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('不是 PNG');
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  for (;;) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6) throw new Error('仅支持 8bit RGBA PNG，得到 depth=' + bitDepth + ' color=' + colorType);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(w * h * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      let v = cur[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride);
    cur.copy(prev);
  }
  return { width: w, height: h, data: out };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('用法: node read-sheet.js <sheet.json> <页png...> <帧号>');
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  /* 最后一个参数是帧号（纯数字），其余为页 PNG */
  const k = Number(args[args.length - 1]);
  if (!Number.isInteger(k) || k < 0) { console.error('帧号必须是非负整数'); process.exit(1); }
  const pageFiles = args.slice(1, -1);
  const pages = new Map();
  for (const f of pageFiles) {
    const img = decodePNG(fs.readFileSync(f));
    pages.set(path.basename(f), img);
  }
  const px = meta.meta.pixelfx;
  console.log('fps:', px.fps, '时间基:', px.timebase, '循环:', px.loop, '总帧:', px.frameCount, '页数:', px.pages.length);
  /* 帧键名规则: <name>_<0000>；从 JSON frames 里取 */
  const keys = Object.keys(meta.frames);
  const key = keys.find(kk => meta.frames[kk].index === k) || keys[k];
  const fr = meta.frames[key];
  if (!fr) { console.error('找不到帧', k); process.exit(1); }
  const pageName = px.pages.find(p => p.page === fr.page).image;
  const page = pages.get(pageName);
  if (!page) { console.error('缺少页文件', pageName, '（请把 ZIP 内的页 PNG 解出后作为参数传入）'); process.exit(1); }
  /* 提取帧矩形（含锚点信息） */
  const cell = Buffer.alloc(fr.frame.w * fr.frame.h * 4);
  for (let y = 0; y < fr.frame.h; y++) {
    const src = ((fr.frame.y + y) * page.width + fr.frame.x) * 4;
    page.data.copy(cell, y * fr.frame.w * 4, src, src + fr.frame.w * 4);
  }
  const outName = 'frame_' + String(k).padStart(4, '0') + '.png';
  encodeAndSave(cell, fr.frame.w, fr.frame.h, outName);
  console.log('已提取帧', k, '→', outName, '锚点', JSON.stringify(fr.anchor), '时间', fr.timeSec + 's', '页', fr.page);
}

function crc32buf(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
  c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32buf(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodeAndSave(rgba, w, h, file) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const idat = zlib.deflateSync(raw, { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}
main();
