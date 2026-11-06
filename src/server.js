const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const {
  getRegionsData,
  syncOfficialRegions
} = require('./regions.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(body);
}

function createAppServer(options = {}) {
  const syncFn = options.syncFn || syncOfficialRegions;
  const publicDir = options.publicDir || path.join(__dirname, '..', 'public');

  return http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const pathname = parsedUrl.pathname;

      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, {
          status: 'ok',
          uptime: Math.round(process.uptime()),
          timestamp: Date.now()
        });
      }

      if (req.method === 'GET' && pathname === '/api/regions') {
        return sendJson(res, 200, getRegionsData());
      }

      if (req.method === 'POST' && pathname === '/api/regions/sync') {
        const syncResult = await syncFn();
        return sendJson(res, 200, syncResult);
      }

      // 静态资源服务
      if (req.method === 'GET' || req.method === 'HEAD') {
        const safePath = pathname === '/' ? '/index.html' : pathname;
        const resolvedPath = path.resolve(publicDir, '.' + safePath);
        if (!resolvedPath.startsWith(path.resolve(publicDir))) {
          return sendJson(res, 403, { error: 'Forbidden' });
        }

        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
          const ext = path.extname(resolvedPath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          if (req.method === 'HEAD') return res.end();
          return fs.createReadStream(resolvedPath).pipe(res);
        }
      }

      return sendJson(res, 404, { error: 'Not Found' });
    } catch (err) {
      return sendJson(res, 500, { error: 'Internal Server Error' });
    }
  });
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const autoSync = (process.env.AUTO_SYNC_REGIONS || 'true').toLowerCase() !== 'false';
  const server = createAppServer();

  server.listen(port, '0.0.0.0', () => {
    console.log(`[oci-latency-monitor] 服务已启动，监听端口: ${port}`);
    if (autoSync) {
      // 启动后异步执行一次官方新区域同步（不阻塞主线程，失败自动使用内置 40 节点）
      syncOfficialRegions().catch(() => {});
      // 每 24 小时自动检查一次甲骨文官方新区域
      const timer = setInterval(() => {
        syncOfficialRegions().catch(() => {});
      }, 24 * 60 * 60 * 1000);
      if (typeof timer.unref === 'function') timer.unref();
    }
  });
}

module.exports = {
  createAppServer
};
