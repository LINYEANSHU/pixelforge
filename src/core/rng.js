/* PixelForge —— 确定性随机数
 * 同 (种子, 层, 通道, 步数消费序列) 永远产生同一序列 —— 复现性的根基。
 * 无任何全局 Math.random 参与模拟（check 脚本会扫描违规）。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');

  /* xmur3 字符串/整数混合哈希 */
  function hashInt(h) {
    h = (h ^ 61) ^ (h >>> 16);
    h = (h + (h << 3)) | 0;
    h = h ^ (h >>> 4);
    h = Math.imul(h, 0x27d4eb2d);
    h = h ^ (h >>> 15);
    return h >>> 0;
  }
  function hashCombine(a, b) {
    let h = (a ^ 0x9E3779B9) | 0;
    h = Math.imul(h ^ (b | 0), 0x85EBCA6B);
    h = (h ^ (h >>> 13)) | 0;
    return hashInt(h >>> 0);
  }
  function hashStr(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return hashInt(h);
  }

  /* mulberry32：返回 [0,1) */
  function mulberry32(a) {
    a = a | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 创建一条可复现流：seed(整数或字符串) + channel(层id*16+用途) */
  function stream(seed, channel) {
    if (typeof seed === 'string') seed = hashStr(seed);
    return mulberry32(hashCombine(seed | 0, channel | 0));
  }

  /* RNG 助手：范围随机、加权选择 —— 全部挂在流上 */
  function range2(rng, a, b) { return a + (b - a) * rng(); }
  function pick(rng, arr) { return arr[(rng() * arr.length) | 0]; }
  function sign(rng) { return rng() < 0.5 ? -1 : 1; }

  /* 整数种子工具：字符串→32位；数字→|0 */
  function normSeed(seed) {
    if (typeof seed === 'string') return hashStr(seed) | 0;
    const n = seed | 0;
    return n === 0 ? 1 : n;
  }
  /* 随机一个新种子（仅 UI 层使用，不参与模拟） */
  function randomSeed() { return (Math.random() * 0x7FFFFFFF) | 0; }

  PF.rng = { hashInt, hashCombine, hashStr, mulberry32, stream, range2, pick, sign, normSeed, randomSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = PF.rng;
})(typeof globalThis !== 'undefined' ? globalThis : this);
