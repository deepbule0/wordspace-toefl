import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number(process.env.WORDSPACE_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const openBrowser = () => {
  if (process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', `http://127.0.0.1:${port}`], { windowsHide: true }, () => {});
};

const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    const url = new URL(request.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filename = path.resolve(root, '.' + name);
    if (!filename.startsWith(root) || name.includes('\0')) { response.writeHead(403).end(); return; }
    const info = await stat(filename);
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    const headers = { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': name.startsWith('/audio/') ? 'public, max-age=86400' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    let start = 0, end = info.size - 1;
    if (range) {
      start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
      if (start > end || start >= info.size) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(filename, { start, end }).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('无法打开这个文件');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被使用。若已启动，请直接打开 http://127.0.0.1:${port}` : error);
  process.exitCode = 1;
  if (error.code === 'EADDRINUSE' && process.argv.includes('--open')) {
    // Open only an identified existing copy of this app, not an unrelated local service.
    const request = http.get(`http://127.0.0.1:${port}/`, { timeout: 1500 }, response => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 20000) request.destroy(); });
      response.on('end', () => { if (body.includes('<title>词间 · 托福背词</title>')) openBrowser(); });
    });
    request.on('timeout', () => request.destroy()); request.on('error', () => {});
  }
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`词间已启动：${url}（按 Ctrl+C 关闭）`);
  if (process.argv.includes('--open')) openBrowser();
});
