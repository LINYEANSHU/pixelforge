/* PixelForge —— ZIP 写入器（store 方法，零依赖）
 * 逐条目追加压缩后数据，仅持有已压缩字节 → 内存可控。
 */
(function (root) {
  'use strict';

  const crc32 = (root.PF_PNG && root.PF_PNG.crc32) || (typeof module !== 'undefined' ? require('./png.js').crc32 : null);
  function u16(v) { return [(v) & 255, (v >>> 8) & 255]; }
  /* ZIP 规范：全部多字节字段为小端序 */
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }

  function dosTime(d) {
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
      date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF,
    };
  }

  class ZipWriter {
    constructor() {
      this.entries = [];
      this.central = [];
      this.offset = 0;
    }
    /* name: 字符串；data: Uint8Array */
    add(name, data) {
      const nameBytes = new TextEncoder().encode(name);
      const now = dosTime(new Date());
      const crc = crc32(data, 0, data.length);
      const local = new Uint8Array(30 + nameBytes.length);
      local.set(u32(0x04034b50), 0);
      local.set(u16(20), 4);            // version
      local.set(u16(0x0800), 6);        // UTF-8 flag
      local.set(u16(0), 8);             // store
      local.set(u16(now.time), 10);
      local.set(u16(now.date), 12);
      local.set(u32(crc), 14);
      local.set(u32(data.length), 18);
      local.set(u32(data.length), 22);
      local.set(u16(nameBytes.length), 26);
      local.set(u16(0), 28);
      local.set(nameBytes, 30);
      this.entries.push({ name: nameBytes, crc, size: data.length, offset: this.offset, time: now.time, date: now.date });
      this.central.push(data);          // 数据稍后统一拼接（仅压缩后字节）
      this.offset += local.length + data.length;
      return this;
    }
    finish() {
      const n = this.entries.length;
      const centralSize = 46 * n + this.entries.reduce((a, e) => a + e.name.length, 0);
      const out = new Uint8Array(this.offset + centralSize + 22);
      let o = 0;
      for (const e of this.entries) {
        const local = new Uint8Array(30 + e.name.length);
        local.set(u32(0x04034b50), 0);
        local.set(u16(20), 4);
        local.set(u16(0x0800), 6);
        local.set(u16(0), 8);
        local.set(u16(e.time), 10);
        local.set(u16(e.date), 12);
        local.set(u32(e.crc), 14);
        local.set(u32(e.size), 18);
        local.set(u32(e.size), 22);
        local.set(u16(e.name.length), 26);
        local.set(u16(0), 28);
        local.set(e.name, 30);
        out.set(local, o); o += local.length;
        out.set(this.central.shift(), o); o += e.size;
      }
      const cdStart = o;
      for (const e of this.entries) {
        const c = new Uint8Array(46 + e.name.length);
        c.set(u32(0x02014b50), 0);
        c.set(u16(20), 4); c.set(u16(20), 6);
        c.set(u16(0x0800), 8);
        c.set(u16(0), 10);
        c.set(u16(e.time), 12); c.set(u16(e.date), 14);
        c.set(u32(e.crc), 16);
        c.set(u32(e.size), 20); c.set(u32(e.size), 24);
        c.set(u16(e.name.length), 28);
        c.set(u16(0), 30); c.set(u16(0), 32); c.set(u16(0), 34);
        c.set(u16(0), 36); c.set(u32(0), 38);
        c.set(u32(e.offset), 42);
        c.set(e.name, 46);
        out.set(c, o); o += c.length;
      }
      /* EOCD */
      out.set(u32(0x06054b50), o);
      out.set(u16(0), o + 4); out.set(u16(0), o + 6);
      out.set(u16(n), o + 8); out.set(u16(n), o + 10);
      out.set(u32(centralSize), o + 12);
      out.set(u32(cdStart), o + 16);
      out.set(u16(0), o + 20);
      return out;
    }
  }

  const ZIP = { ZipWriter };
  if (typeof globalThis !== 'undefined') {
    globalThis.PF_ZIP = ZIP;
    if (globalThis.PF) globalThis.PF.zip = ZIP;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = ZIP;
})(typeof globalThis !== 'undefined' ? globalThis : this);
