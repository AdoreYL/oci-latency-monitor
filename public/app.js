// 默认内置 40 节点备份（当后端 /api/regions 返回时优先以服务端最新区域为准）
const FALLBACK_GROUPS = {
  apac: {
    title: '🌏 亚太地区',
    subtitle: 'Asia Pacific Regions',
    nodes: [
      { id: 'ap-seoul-1', name: '韩国首尔 (Seoul)' },
      { id: 'ap-chuncheon-1', name: '韩国春川 (Chuncheon)' },
      { id: 'ap-tokyo-1', name: '日本东京 (Tokyo)' },
      { id: 'ap-osaka-1', name: '日本大阪 (Osaka)' },
      { id: 'ap-singapore-1', name: '新加坡 (Singapore)' },
      { id: 'ap-singapore-2', name: '新加坡西 (Singapore West)' },
      { id: 'ap-mumbai-1', name: '印度孟买 (Mumbai)' },
      { id: 'ap-hyderabad-1', name: '印度海得拉巴 (Hyderabad)' },
      { id: 'ap-sydney-1', name: '澳大利亚悉尼 (Sydney)' },
      { id: 'ap-melbourne-1', name: '澳大利亚墨尔本 (Melbourne)' }
    ]
  },
  europe: {
    title: '🌍 欧洲地区',
    subtitle: 'Europe Regions',
    nodes: [
      { id: 'eu-frankfurt-1', name: '德国法兰克福 (Frankfurt)' },
      { id: 'uk-london-1', name: '英国伦敦 (London)' },
      { id: 'uk-cardiff-1', name: '英国纽波特/卡迪夫 (Newport)' },
      { id: 'eu-amsterdam-1', name: '荷兰阿姆斯特丹 (Amsterdam)' },
      { id: 'eu-zurich-1', name: '瑞士苏黎世 (Zurich)' },
      { id: 'eu-paris-1', name: '法国巴黎 (Paris)' },
      { id: 'eu-marseille-1', name: '法国马赛 (Marseille)' },
      { id: 'eu-milan-1', name: '意大利米兰 (Milan)' },
      { id: 'eu-turin-1', name: '意大利都灵 (Turin)' },
      { id: 'eu-stockholm-1', name: '瑞典斯德哥尔摩 (Stockholm)' },
      { id: 'eu-madrid-1', name: '西班牙马德里 (Madrid)' }
    ]
  },
  americas: {
    title: '🌎 美洲地区',
    subtitle: 'Americas Regions',
    nodes: [
      { id: 'us-sanjose-1', name: '美国西部 (圣何塞 San Jose)' },
      { id: 'us-phoenix-1', name: '美国西部 (凤凰城 Phoenix)' },
      { id: 'us-ashburn-1', name: '美国东部 (阿什本 Ashburn)' },
      { id: 'us-chicago-1', name: '美国中部 (芝加哥 Chicago)' },
      { id: 'ca-toronto-1', name: '加拿大东南部 (多伦多 Toronto)' },
      { id: 'ca-montreal-1', name: '加拿大东南部 (蒙特利尔 Montreal)' },
      { id: 'mx-queretaro-1', name: '墨西哥中部 (克雷塔罗 Queretaro)' },
      { id: 'mx-monterrey-1', name: '墨西哥东北部 (蒙特雷 Monterrey)' },
      { id: 'sa-saopaulo-1', name: '巴西东南部 (圣保罗 Sao Paulo)' },
      { id: 'sa-vinhedo-1', name: '巴西南部 (维涅杜 Vinhedo)' },
      { id: 'sa-santiago-1', name: '智利中部 (圣地亚哥 Santiago)' },
      { id: 'sa-valparaiso-1', name: '智利西部 (瓦尔帕莱索 Valparaiso)' },
      { id: 'sa-bogota-1', name: '哥伦比亚中部 (波哥大 Bogota)' }
    ]
  },
  mea: {
    title: '🕌 中东与非洲',
    subtitle: 'Middle East & Africa Regions',
    nodes: [
      { id: 'me-dubai-1', name: '阿联酋东部 (迪拜 Dubai)' },
      { id: 'me-abudhabi-1', name: '阿联酋中部 (阿布扎比 Abu Dhabi)' },
      { id: 'me-jeddah-1', name: '沙特西部 (吉达 Jeddah)' },
      { id: 'me-riyadh-1', name: '沙特中部 (利雅得 Riyadh)' },
      { id: 'il-jerusalem-1', name: '以色列中部 (耶路撒冷 Jerusalem)' },
      { id: 'af-johannesburg-1', name: '南非北部 (约翰内斯堡 Johannesburg)' }
    ]
  }
};

let regionGroups = FALLBACK_GROUPS;
const nodeState = {};
let isRunning = false;
let roundCount = 0;
let loopTimer = null;
let currentRunAborted = false;
let activeModalNodeId = null;

async function fetchRegionsFromServer() {
  try {
    const res = await fetch('api/regions', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.groups) {
        regionGroups = data.groups;
      }
    }
  } catch (_) {
    // 离线直接打开 HTML 时使用内置 40 节点
  }
}

function renderRegionDOM() {
  const container = document.getElementById('regionsContainer');
  container.innerHTML = '';
  let totalNodes = 0;

  for (const [groupKey, group] of Object.entries(regionGroups)) {
    const groupCard = document.createElement('div');
    groupCard.className = 'region-group-card';
    groupCard.innerHTML = `
      <div class="region-group-header">
        <h2>${group.title}</h2>
        <span>${group.subtitle} (${group.nodes.length} 个节点)</span>
      </div>
      <div class="node-list" id="group-${groupKey}"></div>
    `;
    container.appendChild(groupCard);

    const listEl = groupCard.querySelector(`#group-${groupKey}`);
    group.nodes.forEach((node) => {
      totalNodes++;
      const host = node.host || `objectstorage.${node.id}.oraclecloud.com`;
      if (!nodeState[node.id]) {
        nodeState[node.id] = {
          id: node.id,
          name: node.name,
          groupKey,
          host,
          url: `https://${host}`,
          builtin: node.builtin !== false,
          samples: [], // 最近 50 次采样：{ ok: boolean, latency: number|null, ts: number }
          sent: 0,
          lost: 0,
          lossRate: 0,
          current: null,
          avg: null,
          min: null,
          max: null,
          warmedUp: false,
          timeout: false
        };
      }

      const st = nodeState[node.id];
      const newBadgeHtml = st.builtin ? '' : '<span class="new-badge">新区域</span>';

      const itemEl = document.createElement('div');
      itemEl.className = 'node-item';
      itemEl.id = `node-${node.id}`;
      itemEl.onclick = () => openDetailModal(node.id);
      itemEl.innerHTML = `
        <div class="node-top">
          <div class="node-title">
            <span class="status-dot" id="dot-${node.id}"></span>
            <span>${node.name}</span>
            ${newBadgeHtml}
          </div>
          <div class="node-top-right">
            <span class="node-endpoint" title="${host}">${host}</span>
            <span class="loss-badge" id="loss-${node.id}">丢包 0%</span>
          </div>
        </div>
        <div class="node-bottom">
          <div class="latency-and-sparkline">
            <div class="current-latency" id="cur-${node.id}">⚡ 待检测</div>
            <div class="sparkline-box" id="spark-${node.id}" title="点击查看详细 50 轮延迟折线图">
              ${renderSparklineSvg(st.samples, '')}
            </div>
          </div>
          <div class="metrics-badges">
            <div class="metric-pill">
              <span class="metric-pill-label">平均延迟</span>
              <span class="metric-pill-val" id="avg-${node.id}">--</span>
            </div>
            <div class="metric-pill">
              <span class="metric-pill-label">最低延迟</span>
              <span class="metric-pill-val" id="min-${node.id}">--</span>
            </div>
            <div class="metric-pill">
              <span class="metric-pill-label">最高延迟</span>
              <span class="metric-pill-val" id="max-${node.id}">--</span>
            </div>
          </div>
        </div>
      `;
      listEl.appendChild(itemEl);
      updateNodeUI(node.id);
    });
  }

  document.getElementById('statTotal').textContent = totalNodes;
}

function getLatencyLevel(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 150) return 'good';
  if (ms <= 300) return 'warn';
  return 'bad';
}

function getStrokeColor(level) {
  if (level === 'good') return '#10b981';
  if (level === 'warn') return '#f59e0b';
  if (level === 'bad') return '#ef4444';
  return '#94a3b8';
}

function renderSparklineSvg(samples, level) {
  const width = 108;
  const height = 26;
  const validPoints = samples.slice(-20);
  if (validPoints.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <line x1="0" y1="13" x2="${width}" y2="13" stroke="#cbd5e1" stroke-dasharray="3,3" stroke-width="1"/>
    </svg>`;
  }

  const latencies = validPoints.filter((s) => s.ok && s.latency !== null).map((s) => s.latency);
  const stroke = getStrokeColor(level);

  if (latencies.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <line x1="0" y1="22" x2="${width}" y2="22" stroke="#ef4444" stroke-width="1.5"/>
    </svg>`;
  }

  const minVal = Math.min(...latencies);
  const maxVal = Math.max(...latencies);
  const span = Math.max(20, maxVal - minVal);

  const coords = [];
  const timeoutDots = [];
  const count = validPoints.length;

  validPoints.forEach((pt, idx) => {
    const x = count === 1 ? width / 2 : Math.round((idx / (count - 1)) * (width - 8)) + 4;
    if (pt.ok && pt.latency !== null) {
      const norm = (pt.latency - minVal) / span;
      const y = Math.round(height - 4 - norm * (height - 8));
      coords.push(`${x},${y}`);
    } else {
      timeoutDots.push(`<circle cx="${x}" cy="4" r="2.2" fill="#ef4444" />`);
    }
  });

  const polyline = coords.length > 1
    ? `<polyline fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}" />`
    : `<circle cx="${coords[0].split(',')[0]}" cy="${coords[0].split(',')[1]}" r="2.5" fill="${stroke}" />`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${polyline}
    ${timeoutDots.join('')}
  </svg>`;
}

function recordProbeSample(nodeId, ok, latency) {
  const st = nodeState[nodeId];
  if (!st) return;

  st.sent++;
  if (!ok || latency === null) {
    st.lost++;
    st.timeout = true;
    st.current = null;
    st.samples.push({ ok: false, latency: null, ts: Date.now() });
  } else {
    st.timeout = false;
    st.current = latency;
    st.samples.push({ ok: true, latency, ts: Date.now() });
  }

  if (st.samples.length > 50) {
    st.samples.shift();
  }

  st.lossRate = st.sent > 0 ? Math.round((st.lost / st.sent) * 100) : 0;

  const validLatencies = st.samples.filter((s) => s.ok && s.latency !== null).map((s) => s.latency);
  if (validLatencies.length > 0) {
    const sum = validLatencies.reduce((a, b) => a + b, 0);
    st.avg = Math.round(sum / validLatencies.length);
    st.min = Math.min(...validLatencies);
    st.max = Math.max(...validLatencies);
  }
}

async function pingSingleNodeBrowser(nodeId) {
  const st = nodeState[nodeId];
  const timeoutMs = 4000;

  // 首次请求预热 DNS 与 TLS 握手
  if (!st.warmedUp) {
    try {
      const warmCtrl = new AbortController();
      const warmTimer = setTimeout(() => warmCtrl.abort(), timeoutMs);
      await fetch(`${st.url}/?warmup=${Date.now()}`, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: warmCtrl.signal
      });
      clearTimeout(warmTimer);
      st.warmedUp = true;
    } catch (_) {
      // 忽略预热异常
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = performance.now();

  try {
    await fetch(`${st.url}/?t=${Date.now()}_${Math.random()}`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timer);
    const rtt = Math.max(1, Math.round(performance.now() - startTime));
    recordProbeSample(nodeId, true, rtt);
  } catch (_) {
    clearTimeout(timer);
    recordProbeSample(nodeId, false, null);
  }

  updateNodeUI(nodeId);
}

function updateNodeUI(nodeId) {
  const st = nodeState[nodeId];
  if (!st) return;

  const dotEl = document.getElementById(`dot-${nodeId}`);
  const curEl = document.getElementById(`cur-${nodeId}`);
  const lossEl = document.getElementById(`loss-${nodeId}`);
  const sparkEl = document.getElementById(`spark-${nodeId}`);
  const avgEl = document.getElementById(`avg-${nodeId}`);
  const minEl = document.getElementById(`min-${nodeId}`);
  const maxEl = document.getElementById(`max-${nodeId}`);

  if (!dotEl) return;

  let level = '';
  if (st.timeout) {
    level = 'bad';
    dotEl.className = 'status-dot bad';
    curEl.className = 'current-latency bad';
    curEl.textContent = '⚡ 超时';
  } else if (st.current !== null) {
    level = getLatencyLevel(st.current);
    dotEl.className = `status-dot ${level}`;
    curEl.className = `current-latency ${level}`;
    curEl.textContent = `⚡ ${st.current}ms`;
  } else {
    dotEl.className = 'status-dot';
    curEl.className = 'current-latency';
    curEl.textContent = '⚡ 待检测';
  }

  lossEl.textContent = `丢包 ${st.lossRate}%`;
  if (st.lossRate === 0) {
    lossEl.className = 'loss-badge';
  } else if (st.lossRate <= 20) {
    lossEl.className = 'loss-badge warn';
  } else {
    lossEl.className = 'loss-badge bad';
  }

  sparkEl.innerHTML = renderSparklineSvg(st.samples, level || getLatencyLevel(st.avg));
  avgEl.textContent = st.avg !== null ? `${st.avg}ms` : '--';
  minEl.textContent = st.min !== null ? `${st.min}ms` : '--';
  maxEl.textContent = st.max !== null ? `${st.max}ms` : '--';

  if (activeModalNodeId === nodeId) {
    refreshModalContent(nodeId);
  }
}

function updateSummaryStats() {
  const states = Object.values(nodeState);
  const onlineNodes = states.filter((s) => s.current !== null && !s.timeout);
  const timeoutNodes = states.filter((s) => s.timeout);

  document.getElementById('statOnline').textContent = onlineNodes.length;
  document.getElementById('statTimeout').textContent = timeoutNodes.length;

  if (onlineNodes.length > 0) {
    const totalAvg = Math.round(
      onlineNodes.reduce((acc, s) => acc + (s.avg || s.current), 0) / onlineNodes.length
    );
    document.getElementById('statAvg').textContent = totalAvg;
  } else {
    document.getElementById('statAvg').textContent = '--';
  }
}

async function runBatchRound() {
  if (!isRunning) return;
  roundCount++;
  const allIds = Object.keys(nodeState);
  const total = allIds.length;
  let completed = 0;

  const statusTitle = document.getElementById('statusTitle');
  const progressBar = document.getElementById('progressBar');
  statusTitle.textContent = `正在实时检测中 · 第 ${roundCount} 轮 (0/${total})`;
  progressBar.style.width = '0%';

  const concurrency = 6;
  let index = 0;

  async function worker() {
    while (index < total && isRunning && !currentRunAborted) {
      const currentIndex = index++;
      const nodeId = allIds[currentIndex];
      await pingSingleNodeBrowser(nodeId);
      completed++;
      const pct = Math.round((completed / total) * 100);
      progressBar.style.width = `${pct}%`;
      statusTitle.textContent = `正在实时检测中 · 第 ${roundCount} 轮 (${completed}/${total})`;
      updateSummaryStats();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (isRunning && !currentRunAborted) {
    const intervalMs = parseInt(document.getElementById('intervalSelect').value, 10) || 3500;
    statusTitle.textContent = `第 ${roundCount} 轮检测完成 · 等待下一轮刷新...`;
    loopTimer = setTimeout(runBatchRound, intervalMs);
  }
}

function startContinuousTest() {
  if (isRunning) return;
  isRunning = true;
  currentRunAborted = false;
  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnStop').disabled = false;
  if (loopTimer) clearTimeout(loopTimer);
  runBatchRound();
}

function stopContinuousTest() {
  isRunning = false;
  currentRunAborted = true;
  if (loopTimer) clearTimeout(loopTimer);
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnStop').disabled = true;
  document.getElementById('statusTitle').textContent = `检测已暂停（已完成 ${roundCount} 轮）· 点击“开始检测”继续`;
}

function updateInterval() {
  if (isRunning && loopTimer) {
    clearTimeout(loopTimer);
    runBatchRound();
  }
}

function resetStats(forceRestart = false) {
  const shouldRun = forceRestart || isRunning;
  stopContinuousTest();
  roundCount = 0;

  for (const id of Object.keys(nodeState)) {
    const st = nodeState[id];
    st.samples = [];
    st.sent = 0;
    st.lost = 0;
    st.lossRate = 0;
    st.current = null;
    st.avg = null;
    st.min = null;
    st.max = null;
    st.timeout = false;
    updateNodeUI(id);
  }

  document.getElementById('statOnline').textContent = '0';
  document.getElementById('statTimeout').textContent = '0';
  document.getElementById('statAvg').textContent = '--';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('statusTitle').textContent = '统计数据已重置 · 准备就绪';

  if (shouldRun) {
    startContinuousTest();
  }
}

function sortNodesByLatency() {
  for (const groupKey of Object.keys(regionGroups)) {
    const listEl = document.getElementById(`group-${groupKey}`);
    if (!listEl) continue;
    const items = Array.from(listEl.children);
    items.sort((a, b) => {
      const idA = a.id.replace('node-', '');
      const idB = b.id.replace('node-', '');
      const valA = nodeState[idA]?.avg ?? nodeState[idA]?.current ?? 999999;
      const valB = nodeState[idB]?.avg ?? nodeState[idB]?.current ?? 999999;
      return valA - valB;
    });
    items.forEach((el) => listEl.appendChild(el));
  }
}

async function triggerOfficialSync() {
  const btn = document.getElementById('btnSync');
  const statusTitle = document.getElementById('statusTitle');
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = '☁️ 正在同步...';

  try {
    const res = await fetch('api/regions/sync', { method: 'POST' });
    const data = await res.json();
    await fetchRegionsFromServer();
    renderRegionDOM();

    if (data.ok) {
      if (data.added && data.added.length > 0) {
        statusTitle.textContent = `同步成功！新增 ${data.added.length} 个甲骨文官方区域：${data.added.join(', ')}（当前共 ${data.total} 个节点）`;
      } else {
        statusTitle.textContent = `同步完成：当前已是最新甲骨文官方区域列表（共 ${data.total} 个节点）`;
      }
    } else {
      statusTitle.textContent = `同步提示：${data.error || '使用内置 40 节点运行中'}`;
    }
  } catch (_) {
    statusTitle.textContent = '同步提示：无法连接后端同步接口，当前使用内置 40 个官方节点';
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// 详情大图弹窗逻辑
function openDetailModal(nodeId) {
  activeModalNodeId = nodeId;
  const modal = document.getElementById('chartModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  refreshModalContent(nodeId);
}

function closeDetailModal() {
  activeModalNodeId = null;
  const modal = document.getElementById('chartModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function handleBackdropClick(e) {
  if (e.target && e.target.id === 'chartModal') {
    closeDetailModal();
  }
}

function refreshModalContent(nodeId) {
  const st = nodeState[nodeId];
  if (!st) return;

  document.getElementById('modalTitle').textContent = `${st.name} · 历史延迟趋势`;
  document.getElementById('modalSubtitle').textContent = st.host;
  document.getElementById('modalCur').textContent = st.timeout
    ? '超时'
    : st.current !== null
      ? `${st.current} ms`
      : '--';
  document.getElementById('modalAvg').textContent = st.avg !== null ? `${st.avg} ms` : '--';
  document.getElementById('modalMinMax').textContent =
    st.min !== null ? `${st.min} ms / ${st.max} ms` : '-- / --';
  document.getElementById('modalLoss').textContent = `${st.lossRate}% (${st.lost}/${st.sent})`;

  const chartBox = document.getElementById('modalChartContainer');
  chartBox.innerHTML = renderDetailChartSvg(st);
}

function renderDetailChartSvg(st) {
  const width = 620;
  const height = 210;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const samples = st.samples;
  if (samples.length === 0) {
    return `<div style="color:#64748b;font-size:13px;">暂无采样数据，请等待检测完成...</div>`;
  }

  const valid = samples.filter((s) => s.ok && s.latency !== null).map((s) => s.latency);
  const minVal = valid.length ? Math.max(0, Math.min(...valid) - 15) : 0;
  const maxVal = valid.length ? Math.max(...valid) + 15 : 300;
  const span = Math.max(30, maxVal - minVal);

  const level = getLatencyLevel(st.avg ?? st.current);
  const stroke = getStrokeColor(level);

  const points = [];
  const circles = [];
  const n = samples.length;

  samples.forEach((s, idx) => {
    const x = n === 1 ? padLeft + plotW / 2 : Math.round(padLeft + (idx / (n - 1)) * plotW);
    if (s.ok && s.latency !== null) {
      const y = Math.round(padTop + plotH - ((s.latency - minVal) / span) * plotH);
      points.push(`${x},${y}`);
      circles.push(`<circle cx="${x}" cy="${y}" r="3" fill="${stroke}" />`);
    } else {
      const y = padTop + 6;
      circles.push(`<circle cx="${x}" cy="${y}" r="4" fill="#ef4444"><title>第 ${idx + 1} 样次：超时丢包</title></circle>`);
    }
  });

  const avgY = st.avg !== null
    ? Math.round(padTop + plotH - ((st.avg - minVal) / span) * plotH)
    : null;

  const avgLine = avgY !== null
    ? `<line x1="${padLeft}" y1="${avgY}" x2="${width - padRight}" y2="${avgY}" stroke="#3b82f6" stroke-dasharray="4,4" stroke-width="1.2" />
       <text x="${width - padRight - 4}" y="${Math.max(12, avgY - 5)}" text-anchor="end" fill="#2563eb" font-size="10">均值 ${st.avg}ms</text>`
    : '';

  const polyline = points.length > 1
    ? `<polyline fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${points.join(' ')}" />`
    : '';

  return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}">
    <!-- 背景网格线 -->
    <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="#e2e8f0" stroke-width="1" />
    <line x1="${padLeft}" y1="${padTop + plotH / 2}" x2="${width - padRight}" y2="${padTop + plotH / 2}" stroke="#f1f5f9" stroke-width="1" />
    <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#cbd5e1" stroke-width="1" />
    <!-- Y轴刻度文字 -->
    <text x="${padLeft - 6}" y="${padTop + 4}" text-anchor="end" fill="#64748b" font-size="10">${Math.round(maxVal)}ms</text>
    <text x="${padLeft - 6}" y="${padTop + plotH / 2 + 4}" text-anchor="end" fill="#64748b" font-size="10">${Math.round((maxVal + minVal) / 2)}ms</text>
    <text x="${padLeft - 6}" y="${padTop + plotH + 4}" text-anchor="end" fill="#64748b" font-size="10">${Math.round(minVal)}ms</text>
    <!-- X轴说明 -->
    <text x="${padLeft}" y="${height - 6}" fill="#94a3b8" font-size="10">最早采样</text>
    <text x="${width - padRight}" y="${height - 6}" text-anchor="end" fill="#94a3b8" font-size="10">最新采样 (共 ${samples.length} 次)</text>
    ${avgLine}
    ${polyline}
    ${circles.join('')}
  </svg>`;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeModalNodeId !== null) {
    closeDetailModal();
  }
});

async function initApp() {
  await fetchRegionsFromServer();
  renderRegionDOM();
  startContinuousTest();
}

window.addEventListener('DOMContentLoaded', initApp);
