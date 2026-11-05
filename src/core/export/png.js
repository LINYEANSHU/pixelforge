/* PixelForge —— PNG 编码器（零依赖，RGBA8）
 * IDAT 优先使用 CompressionStream('deflate')；不可用时退回 zlib store 块。
 * 输出：color type 6（RGBA，直通 alpha），8bit，scanline filter 0。
 */
(function (root) {
  'use strict';

  /* CRC32 */
  const CRC_TABLE = new Int32Array(256);
  (function () {
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  })();
  function crc32(buf, start, end) {
    start = start || 0; end = end === undefined ? buf.length : end;
    let c = 0xFFFFFFFF;
    for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function adler32(buf) {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  }

  function u32(v) { return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
  function u16(v) { return new Uint8Array([(v >>> 8) & 255, v & 255]); }   /* PNG 全部多字节字段为大端 */

  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    out.set(u32(data.length), 0);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const c = crc32(out, 4, 8 + data.length);
    out.set(u32(c), 8 + data.length);
    return out;
  }

  /* 原始数据 → deflate 流（含 zlib 头尾） */
  async function deflateRaw(raw) {
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('deflate');
        const w = cs.writable.getWriter();
        w.write(raw); w.close();
        const chunks = [];
        const reader = cs.readable.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        /* 单块直返：省一次全量拷贝（小图常见路径） */
        if (chunks.length === 1) return chunks[0];
        let total = 0;
        for (const c of chunks) total += c.length;
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        return out;
      } catch (e) { /* 落入 store 回退 */ }
    }
    return deflateStore(raw);
  }
  /* 回退：zlib store（无压缩但完全合法） */
  function deflateStore(raw) {
    const maxBlock = 65535;
    const nBlocks = Math.max(1, Math.ceil(raw.length / maxBlock));
    const out = new Uint8Array(2 + raw.length + nBlocks * 5 + 4);
    let o = 0;
    out[o++] = 0x78; out[o++] = 0x01;
    for (let i = 0; i < nBlocks; i++) {
      const st = i * maxBlock;
      const len = Math.min(maxBlock, raw.length - st);
      const final = i === nBlocks - 1 ? 1 : 0;
      out[o++] = final;
      out[o++] = len & 255; out[o++] = (len >>> 8) & 255;
      out[o++] = (~len) & 255; out[o++] = ((~len) >>> 8) & 255;
      out.set(raw.subarray(st, st + len), o); o += len;
    }
    const ad = adler32(raw);
    out[o++] = (ad >>> 24) & 255; out[o++] = (ad >>> 16) & 255; out[o++] = (ad >>> 8) & 255; out[o++] = ad & 255;
    return out;
  }

  const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  /* RGBA → 扫描线流（每行前缀 filter 0 字节） */
  function toScanlines(rgba, w, h) {
    const stride = w * 4;
    const raw = new Uint8Array((stride + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (stride + 1)] = 0;
      raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    return raw;
  }

  /* 编码 RGBA → PNG。rgba: Uint8ClampedArray/Uint8Array(w*h*4)
   * 单缓冲直写：IHDR/IDAT/IEND 直接写入最终输出，IDAT 只拷贝一次
   * （旧实现 chunk() 一次 + 拼装一次 = 两次全量拷贝），峰值内存与耗时均降。字节输出不变。 */
  async function encodePNG(rgba, w, h) {
    const raw = toScanlines(rgba, w, h);
    const idat = await deflateRaw(raw);
    const out = new Uint8Array(8 + 25 + (12 + idat.length) + 12);
    out.set(PNG_SIG, 0);
    /* IHDR（13 字节数据） */
    out[11] = 13;
    out[12] = 0x49; out[13] = 0x48; out[14] = 0x44; out[15] = 0x52;   // 'IHDR'
    out[16] = (w >>> 24) & 255; out[17] = (w >>> 16) & 255; out[18] = (w >>> 8) & 255; out[19] = w & 255;
    out[20] = (h >>> 24) & 255; out[21] = (h >>> 16) & 255; out[22] = (h >>> 8) & 255; out[23] = h & 255;
    out[24] = 8;   // bit depth
    out[25] = 6;   // color type RGBA
    out[26] = 0; out[27] = 0; out[28] = 0;
    out.set(u32(crc32(out, 12, 29)), 29);
    /* IDAT */
    const t0 = 33, d0 = 41;
    out.set(u32(idat.length), t0);
    out[37] = 0x49; out[38] = 0x44; out[39] = 0x41; out[40] = 0x54;   // 'IDAT'
    out.set(idat, d0);
    out.set(u32(crc32(out, 37, d0 + idat.length)), d0 + idat.length);
    /* IEND */
    const e = d0 + idat.length + 4;
    out[e] = 0; out[e + 1] = 0; out[e + 2] = 0; out[e + 3] = 0;
    out[e + 4] = 0x49; out[e + 5] = 0x45; out[e + 6] = 0x4E; out[e + 7] = 0x44;   // 'IEND'
    out.set(u32(crc32(out, e + 4, e + 8)), e + 8);
    return out;
  }

  /* 编码 APNG 动图（PNG 扩展：acTL/fcTL/fdAT，纯 CPU、确定性输出）。
   * 内存策略：逐帧「渲染→压缩→只保留压缩字节」，原始帧不驻留（与序列 ZIP 同一纪律）。
   * w/h：全画布尺寸；total：帧数；getFrame(k)：返回第 k 帧 RGBA（w*h*4），
   *      返回 null/undefined 表示提前取消 → 结果 { cancelled:true, frames:k }。
   * opts: { delayNum=1, delayDen=60, numPlays=0(无限循环), onFrame(k) }
   * 结构：IHDR → acTL → [fcTL(seq0) IDAT] [fcTL(seq) fdAT(seq)]… → IEND，
   *       全画布帧 dispose=APNG_DISPOSE_OP_NONE、blend=APNG_BLEND_OP_SOURCE。
   * 返回 { data, frames }。 */
  async function encodeAPNG(w, h, total, getFrame, opts) {
    opts = opts || {};
    const delayNum = (opts.delayNum || 1) & 0xFFFF;
    const delayDen = (opts.delayDen || 60) & 0xFFFF;
    const parts = [PNG_SIG];
    /* IHDR（声明整块画布） */
    const ihdr = new Uint8Array(13);
    ihdr.set(u32(w), 0); ihdr.set(u32(h), 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    parts.push(chunk('IHDR', ihdr));
    /* acTL：帧数 + 播放次数 */
    const actl = new Uint8Array(8);
    actl.set(u32(total), 0); actl.set(u32(opts.numPlays | 0), 4);
    parts.push(chunk('acTL', actl));
    let seq = 0;
    for (let k = 0; k < total; k++) {
      const rgba = await getFrame(k);
      if (!rgba) return { cancelled: true, frames: k };
      if (opts.onFrame) opts.onFrame(k);
      /* fcTL（26 字节数据）：全画布、偏移 0、dispose=0(NONE)、blend=0(SOURCE) */
      const fctl = new Uint8Array(26);
      fctl.set(u32(seq++), 0);
      fctl.set(u32(w), 4); fctl.set(u32(h), 8);
      fctl.set(u32(0), 12); fctl.set(u32(0), 16);
      fctl.set(u16(delayNum), 20); fctl.set(u16(delayDen), 22);
      fctl[24] = 0; fctl[25] = 0;
      parts.push(chunk('fcTL', fctl));
      const zbuf = await deflateRaw(toScanlines(rgba, w, h));
      if (k === 0) {
        parts.push(chunk('IDAT', zbuf));            /* 首帧走 IDAT（无 seq 前缀） */
      } else {
        const fdat = new Uint8Array(4 + zbuf.length);
        fdat.set(u32(seq++), 0);
        fdat.set(zbuf, 4);
        parts.push(chunk('fdAT', fdat));
      }
    }
    parts.push(chunk('IEND', new Uint8Array(0)));
    let totalLen = 0;
    for (const p of parts) totalLen += p.length;
    const out = new Uint8Array(totalLen);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return { data: out, frames: total };
  }

  const PNG = { encodePNG, encodeAPNG, crc32, deflateRaw };
  if (typeof globalThis !== 'undefined') {
    globalThis.PF_PNG = PNG;
    if (globalThis.PF) globalThis.PF.png = PNG;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = PNG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
