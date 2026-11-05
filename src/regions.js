const https = require('node:https');
const dns = require('node:dns');

const OFFICIAL_OCI_REGIONS_PY_URL =
  'https://raw.githubusercontent.com/oracle/oci-python-sdk/master/src/oci/regions_definitions.py';

const BUILTIN_GROUPS = {
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

// 常见已知扩展区域中文名称字典（用于官方新区域同步后的友好展示）
const EXTRA_REGION_NAMES = {
  'ap-batam-1': '印尼巴淡岛 (Batam)',
  'ap-kulai-1': '马来西亚古来 (Kulai)',
  'ap-delhi-1': '印度德里 (Delhi)',
  'eu-madrid-2': '西班牙马德里2 (Madrid 2)',
  'eu-frankfurt-2': '德国法兰克福2 (Frankfurt 2)',
  'eu-jovanovac-1': '塞尔维亚约瓦诺瓦茨 (Jovanovac)',
  'us-dallas-1': '美国南部 (达拉斯 Dallas)',
  'us-desmoines-1': '美国中部 (得梅因 Des Moines)',
  'us-shawnee-1': '美国中部 (肖尼 Shawnee)',
  'us-culpeper-1': '美国东部 (卡尔佩珀 Culpeper)',
  'af-casablanca-1': '摩洛哥 (卡萨布兰卡 Casablanca)',
  'me-dcc-doha-1': '卡塔尔 (多哈 Doha)'
};

let activeGroups = null;
let validRegionMap = new Map();
let lastSyncAt = null;

function cloneBuiltinGroups() {
  const result = {};
  const map = new Map();
  for (const [groupKey, group] of Object.entries(BUILTIN_GROUPS)) {
    result[groupKey] = {
      title: group.title,
      subtitle: group.subtitle,
      nodes: group.nodes.map((n) => {
        const item = {
          id: n.id,
          name: n.name,
          group: groupKey,
          host: `objectstorage.${n.id}.oraclecloud.com`,
          builtin: true
        };
        map.set(n.id, item);
        return item;
      })
    };
  }
  activeGroups = result;
  validRegionMap = map;
}

cloneBuiltinGroups();

function resetRegionsToBuiltin() {
  cloneBuiltinGroups();
  lastSyncAt = null;
}

function getRegionsData() {
  return {
    total: validRegionMap.size,
    lastSyncAt,
    groups: activeGroups
  };
}

function isValidRegionId(id) {
  if (typeof id !== 'string' || !id) return false;
  if (!/^[a-z]{2}-[a-z0-9-]+-\d+$/.test(id)) return false;
  return validRegionMap.has(id);
}

function getRegionById(id) {
  return validRegionMap.get(id) || null;
}

function getAllRegionIds() {
  return Array.from(validRegionMap.keys());
}

function classifyRegionGroup(regionId) {
  if (typeof regionId !== 'string') return 'apac';
  if (regionId.startsWith('ap-')) return 'apac';
  if (regionId.startsWith('eu-') || regionId.startsWith('uk-')) return 'europe';
  if (
    regionId.startsWith('us-') ||
    regionId.startsWith('ca-') ||
    regionId.startsWith('mx-') ||
    regionId.startsWith('sa-')
  ) {
    return 'americas';
  }
  if (
    regionId.startsWith('me-') ||
    regionId.startsWith('il-') ||
    regionId.startsWith('af-')
  ) {
    return 'mea';
  }
  return 'apac';
}

function formatNewRegionName(regionId) {
  if (EXTRA_REGION_NAMES[regionId]) return EXTRA_REGION_NAMES[regionId];
  const parts = regionId.split('-');
  const city = parts.slice(1, -1).join(' ');
  const capCity = city.charAt(0).toUpperCase() + city.slice(1);
  return `官方新区域 (${capCity || regionId})`;
}

/**
 * 解析 Oracle 官方 oci-python-sdk 的 regions_definitions.py 文本，提取所有属于 oc1 商业云的区域代码
 */
function parseOfficialRegionsSource(text) {
  if (typeof text !== 'string' || !text) return [];
  const results = [];
  const regex = /['"]([a-z]{2}-[a-z0-9-]+-\d+)['"]\s*:\s*['"]oc1['"]/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const regionId = match[1].toLowerCase();
    // 过滤专有云/政府隔离区或内部测试前缀
    if (regionId.includes('-gov-') || regionId.includes('-dcc-')) continue;
    if (!results.includes(regionId)) {
      results.push(regionId);
    }
  }
  return results;
}

function defaultFetchText(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => {
      req.destroy(new Error('Fetch timeout'));
    });
    req.on('error', reject);
  });
}

function defaultDnsLookup(host) {
  return dns.promises.lookup(host);
}

/**
 * 从甲骨文官方 SDK 源同步最新区域，并对未内置的新区域进行 DNS 存活校验
 */
async function syncOfficialRegions(options = {}) {
  const fetchFn = options.fetchFn || defaultFetchText;
  const dnsLookupFn = options.dnsLookupFn || defaultDnsLookup;

  try {
    const sourceText = await fetchFn(OFFICIAL_OCI_REGIONS_PY_URL);
    const officialIds = parseOfficialRegionsSource(sourceText);
    const candidates = officialIds.filter((id) => !validRegionMap.has(id));
    const added = [];

    for (const candidateId of candidates) {
      const host = `objectstorage.${candidateId}.oraclecloud.com`;
      try {
        await dnsLookupFn(host);
        const groupKey = classifyRegionGroup(candidateId);
        const newNode = {
          id: candidateId,
          name: formatNewRegionName(candidateId),
          group: groupKey,
          host,
          builtin: false
        };
        activeGroups[groupKey].nodes.push(newNode);
        validRegionMap.set(candidateId, newNode);
        added.push(candidateId);
      } catch (_) {
        // DNS 尚未解析上线的新区域暂不加入测速列表
      }
    }

    lastSyncAt = new Date().toISOString();
    return {
      ok: true,
      added,
      total: validRegionMap.size,
      lastSyncAt
    };
  } catch (err) {
    return {
      ok: false,
      added: [],
      total: validRegionMap.size,
      lastSyncAt,
      error: err.message || '同步官方节点失败，已使用内置 40 节点兜底'
    };
  }
}

module.exports = {
  BUILTIN_GROUPS,
  getRegionsData,
  isValidRegionId,
  getRegionById,
  getAllRegionIds,
  classifyRegionGroup,
  parseOfficialRegionsSource,
  syncOfficialRegions,
  resetRegionsToBuiltin
};
