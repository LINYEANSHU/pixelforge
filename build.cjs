/* PixelForge —— 单文件打包脚本
 * 将 index.html + styles.css + 全部脚本合并为 dist/pixelforge-standalone.html
 * （无 Worker 环境 → 导出走主线程分片回退路径，功能一致）
 * 用法: node build.mjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SCRIPTS = [
  'src/core/pf.js', 'src/core/rng.js', 'src/core/palette.js', 'src/core/raster.js',
  'src/core/layers.js', 'src/core/effect.js', 'src/core/templates.js',
  'src/core/parser.js', 'src/core/variant.js', 'src/core/stage.js',
  'src/core/export/png.js', 'src/core/export/zip.js', 'src/core/export/job.js',
  'src/ui/i18n.js', 'src/ui/app.js',
];

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const scripts = SCRIPTS.map(rel => {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return '<!-- inline: ' + rel + ' -->\n<script>\n' + code + '\n</script>';
}).join('\n');

html = html.replace(/<link rel="stylesheet"[^>]*>/, '<style>\n' + css + '\n</style>');
html = html.replace(/<script src="[^"]*"><\/script>\s*/g, '');
html = html.replace('</body>', scripts + '\n</body>');
html = html.replace('<title>', '<!-- 单文件离线版：双击即用；导出在主线程分片执行 -->\n<title>');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'pixelforge-standalone.html');
fs.writeFileSync(out, html);
console.log('[build] 写出 ' + out + ' (' + (html.length / 1024).toFixed(0) + ' KB)');
