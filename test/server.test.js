const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const {
   getRegionsData,
  isValidRegionId,
  classifyRegionGroup,
  parseOfficialRegionsSource,
  syncOfficialRegions,
  resetRegionsToBuiltin
} = require('../src/regions.js');

const { createAppServer } = require('../src/server.js');

const { Readable, Writable } = require('node:stream');

function invokeInMemory(server, method, reqPath) {
  return new Promise((resolve, reject) => {
    const req = new Readable({ read() { this.push(null); } });
    req.url = reqPath;
    req.method = method;
    req.headers = { host: 'localhost' };

    const chunks = [];
    const res = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      }
    });
    res.statusCode = 200;
    res.headers = {};
    res.writeHead = (code, hdrs = {}) => {
      res.statusCode = code;
      for (const [k, v] of Object.entries(hdrs)) {
        res.headers[k.toLowerCase()] = v;
      }
    };
    const origEnd = res.end.bind(res);
    res.end = (data) => {
      if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      origEnd();
    };
    res.on('finish', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try {
        json = JSON.parse(body);
      } catch (_) {}
      resolve({ status: res.statusCode, headers: res.headers, body, json });
    });
    res.on('error', reject);

    server.emit('request', req, res);
  });
}

function requestJson(server, method, reqPath) {
  const addr = typeof server.address === 'function' ? server.address() : null;
  if (!addr || !addr.port) {
    return invokeInMemory(server, method, reqPath);
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: reqPath,
        method
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, body, json });
        });
      }
    );
    req.on('error', (err) => {
      if (err && err.code === 'EACCES') {
        invokeInMemory(server, method, reqPath).then(resolve, reject);
      } else {
        reject(err);
      }
    });
    req.end();
  });
}

test('Builtin OCI regions contain 4 continent groups and 40 official regions', () => {
  resetRegionsToBuiltin();
  const data = getRegionsData();
  assert.equal(data.total, 40);
  assert.equal(data.groups.apac.nodes.length, 10);
  assert.equal(data.groups.europe.nodes.length, 11);
  assert.equal(data.groups.americas.nodes.length, 13);
  assert.equal(data.groups.mea.nodes.length, 6);

  for (const group of Object.values(data.groups)) {
    for (const node of group.nodes) {
      assert.ok(node.id);
      assert.ok(node.name);
      assert.equal(node.host, `objectstorage.${node.id}.oraclecloud.com`);
    }
  }
});

test('SSRF whitelist validation accepts official regions and rejects arbitrary hosts', () => {
  resetRegionsToBuiltin();
  assert.equal(isValidRegionId('ap-tokyo-1'), true);
  assert.equal(isValidRegionId('eu-frankfurt-1'), true);
  assert.equal(isValidRegionId('us-ashburn-1'), true);

  assert.equal(isValidRegionId(''), false);
  assert.equal(isValidRegionId('127.0.0.1'), false);
  assert.equal(isValidRegionId('localhost:8080'), false);
  assert.equal(isValidRegionId('ap-tokyo-1.evil.com'), false);
  assert.equal(isValidRegionId('../etc/passwd'), false);
});

test('Region prefix classifier maps prefixes to the 4 continent groups', () => {
  assert.equal(classifyRegionGroup('ap-batam-1'), 'apac');
  assert.equal(classifyRegionGroup('eu-madrid-2'), 'europe');
  assert.equal(classifyRegionGroup('uk-london-1'), 'europe');
  assert.equal(classifyRegionGroup('us-dallas-1'), 'americas');
  assert.equal(classifyRegionGroup('ca-toronto-1'), 'americas');
  assert.equal(classifyRegionGroup('mx-monterrey-1'), 'americas');
  assert.equal(classifyRegionGroup('sa-bogota-1'), 'americas');
  assert.equal(classifyRegionGroup('me-riyadh-1'), 'mea');
  assert.equal(classifyRegionGroup('af-casablanca-1'), 'mea');
  assert.equal(classifyRegionGroup('il-jerusalem-1'), 'mea');
});

test('Official SDK region sync parses OC1 regions, checks DNS, and falls back safely on error', async () => {
  resetRegionsToBuiltin();
  const samplePy = `
    REGIONS_SHORT_NAMES = {
      'nrt': 'ap-tokyo-1',
      'btm': 'ap-batam-1',
      'cas': 'af-casablanca-1',
      'gov': 'us-gov-ashburn-1'
    }
    REGION_REALMS = {
      'ap-tokyo-1': 'oc1',
      'ap-batam-1': 'oc1',
      'af-casablanca-1': 'oc1',
      'us-gov-ashburn-1': 'oc3'
    }
  `;

  const parsed = parseOfficialRegionsSource(samplePy);
  assert.ok(parsed.includes('ap-tokyo-1'));
  assert.ok(parsed.includes('ap-batam-1'));
  assert.ok(parsed.includes('af-casablanca-1'));
  assert.equal(parsed.includes('us-gov-ashburn-1'), false);

  // Sync with mock fetch and DNS where only ap-batam-1 resolves
  const syncRes = await syncOfficialRegions({
    fetchFn: async () => samplePy,
    dnsLookupFn: async (host) => {
      if (host === 'objectstorage.ap-batam-1.oraclecloud.com') {
        return { address: '134.70.1.1' };
      }
      throw new Error('ENOTFOUND');
    }
  });

  assert.equal(syncRes.ok, true);
  assert.deepEqual(syncRes.added, ['ap-batam-1']);
  assert.equal(getRegionsData().total, 41);
  assert.equal(isValidRegionId('ap-batam-1'), true);
  assert.equal(isValidRegionId('af-casablanca-1'), false);

  // Network error fallback keeps existing regions intact
  const failRes = await syncOfficialRegions({
    fetchFn: async () => {
      throw new Error('network timeout');
    }
  });
  assert.equal(failRes.ok, false);
  assert.equal(getRegionsData().total, 41);

  resetRegionsToBuiltin();
});

test('HTTP Server API endpoints (/api/health, /api/regions, /api/regions/sync, static files) and removal of server-side /api/ping', async () => {
  resetRegionsToBuiltin();

  const server = createAppServer({
    syncFn: async () => ({ ok: true, added: [], total: 40, source: 'builtin' })
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. /api/health
    const health = await requestJson(server, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.status, 'ok');
    assert.equal(typeof health.json.uptime, 'number');

    // 2. /api/regions
    const regions = await requestJson(server, 'GET', '/api/regions');
    assert.equal(regions.status, 200);
    assert.equal(regions.json.total, 40);
    assert.ok(regions.json.groups.apac);

    // 3. Server-side /api/ping is removed (returns 404 so server never sends probe packets)
    const pingResp = await requestJson(server, 'GET', '/api/ping?id=ap-tokyo-1');
    assert.equal(pingResp.status, 404);

    // 4. POST /api/regions/sync
    const syncResp = await requestJson(server, 'POST', '/api/regions/sync');
    assert.equal(syncResp.status, 200);
    assert.equal(syncResp.json.ok, true);

    // 5. Static index.html, style.css, app.js & removal of server ping UI
    const indexResp = await requestJson(server, 'GET', '/');
    assert.equal(indexResp.status, 200);
    assert.ok(indexResp.headers['content-type'].includes('text/html'));
    assert.ok(indexResp.body.includes('甲骨文'));
    assert.equal(indexResp.body.includes('modeServerBtn'), false);

    const cssResp = await requestJson(server, 'GET', '/style.css');
    assert.equal(cssResp.status, 200);
    assert.ok(cssResp.headers['content-type'].includes('text/css'));

    const jsResp = await requestJson(server, 'GET', '/app.js');
    assert.equal(jsResp.status, 200);
    assert.ok(jsResp.headers['content-type'].includes('application/javascript'));
    assert.equal(jsResp.body.includes('http://localhost'), false);
    assert.equal(jsResp.body.includes('127.0.0.1'), false);
    assert.equal(jsResp.body.includes('pingSingleNodeServer'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Remote bootstrap install.sh, update.sh, and uninstall.sh scripts exist and cover lifecycle actions', () => {
  const installPath = path.join(__dirname, '..', 'install.sh');
  const updatePath = path.join(__dirname, '..', 'update.sh');
  const uninstallPath = path.join(__dirname, '..', 'uninstall.sh');

  assert.equal(fs.existsSync(installPath), true);
  assert.equal(fs.existsSync(updatePath), true);
  assert.equal(fs.existsSync(uninstallPath), true);

  const installContent = fs.readFileSync(installPath, 'utf8');
  assert.ok(installContent.startsWith('#!/usr/bin/env bash'));
  assert.ok(installContent.includes('/dev/tty'));
  assert.ok(installContent.includes('HOST_PORT'));
  assert.ok(installContent.includes('do_update'));
  assert.ok(installContent.includes('do_uninstall'));
  assert.ok(installContent.includes('up -d --build'));

  const updateContent = fs.readFileSync(updatePath, 'utf8');
  assert.ok(updateContent.startsWith('#!/usr/bin/env bash'));
  assert.ok(updateContent.includes('.env.backup'));

  const uninstallContent = fs.readFileSync(uninstallPath, 'utf8');
  assert.ok(uninstallContent.startsWith('#!/usr/bin/env bash'));
  assert.ok(uninstallContent.includes('down --rmi local'));
});
