/* PixelForge —— 零依赖本地静态服务器 + 自动打开浏览器
 * 用法: node server.js [端口]   默认 8347，仅绑定 127.0.0.1
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const ROOT_PREFIX = (ROOT + path.sep).toLowerCase();
const PORT = Number(process.argv[2]) || 8347;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.zip': 'application/zip', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

function reject(res, code, msg) {
  /* 错误响应固定 text/plain 且不回显请求路径（防反射与目录信息泄露） */
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(msg);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { reject(res, 405, 'method not allowed'); return; }
  let p;
  try {
    p = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    reject(res, 400, 'bad request');   /* 非法百分号编码会让 decodeURIComponent 抛 URIError */
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  /* 带 path.sep 前缀且大小写不敏感比较：
   * 1) 防 "../" 穿越已被 normalize 消化后仍需双保险；
   * 2) 防同前缀兄弟目录（如 PixelForgeX）被误放行 —— 旧实现 startsWith(ROOT) 有此漏洞 */
  const lc = file.toLowerCase();
  if (!lc.startsWith(ROOT_PREFIX)) { reject(res, 403, 'forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { reject(res, 404, 'not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

/* 端口占用/权限错误：旧实现未监听 error 事件，EADDRINUSE 会以未捕获异常崩溃且无提示 */
server.on('error', e => {
  if (e && (e.code === 'EADDRINUSE' || e.code === 'EACCES')) {
    console.error('[PixelForge] 端口 ' + PORT + ' 不可用（' + e.code + '）。请换个端口启动: node server.js <端口>');
    process.exit(1);
  }
  console.error('[PixelForge] 服务器错误: ' + ((e && e.message) || e));
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + PORT;
  console.log('[PixelForge] 本地预览已启动: ' + url);
  console.log('[PixelForge] 离线运行，无任何网络依赖。Ctrl+C 停止。');
  if (process.argv.includes('--no-open')) return;
  try {
    if (process.platform === 'win32') {
      const candidates = [
        path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
        path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
        path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
      ];
      const browser = candidates.find(p => fs.existsSync(p));
      if (!browser) { console.log('[PixelForge] 未找到 Edge/Chrome。请使用关闭 GPU 加速的浏览器访问上方地址。'); return; }
      const profile = path.join(process.env.LOCALAPPDATA || ROOT, 'PixelForge', 'cpu-profile');
      const child = spawn(browser, ['--app=' + url, '--user-data-dir=' + profile,
        '--disable-gpu', '--disable-gpu-compositing', '--disable-webgl', '--no-first-run'],
        { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', () => console.log('[PixelForge] 浏览器未能自动启动，请手动访问上方地址。'));
      child.unref();
    }
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { /* 打不开浏览器无妨，手动访问即可 */ }
});
