const DEFAULT_ENV_KEY = 'lan';

const STORAGE_KEYS = {
  runtimeEnvKey: 'douyin-review-runtime-env-key',
  customApiBaseUrl: 'douyin-review-custom-api-base-url',
};

const BASE_REQUEST_HEADERS = {
  'content-type': 'application/json',
};

const ENVIRONMENTS = {
  local: {
    key: 'local',
    name: '本机开发',
    baseUrl: 'http://127.0.0.1:3000',
    editable: false,
    sceneLabel: '开发者工具本机调试',
    tips: [
      '127.0.0.1 只适合你在当前电脑上的开发者工具里联调。',
      '真机调试时不要继续使用 127.0.0.1，需要切到局域网、自定义或正式域名环境。',
    ],
  },
  lan: {
    key: 'lan',
    name: '局域网联调',
    baseUrl: 'http://192.168.2.10:3000',
    editable: false,
    sceneLabel: '同网段联调',
    tips: [
      '把这里的 IP 改成你电脑在局域网里的真实地址，再让手机和电脑处于同一网络。',
      '如果真机开启了域名校验，请改用已配置的 HTTPS 合法域名环境。',
    ],
  },
  staging: {
    key: 'staging',
    name: '预发布环境',
    baseUrl: 'https://staging-api.example.com',
    editable: false,
    sceneLabel: 'HTTPS 预发布',
    tips: [
      '请替换成你自己的预发布 HTTPS 域名。',
      '预发布和正式环境都建议使用已备案、已加入抖音开放平台白名单的域名。',
    ],
  },
  production: {
    key: 'production',
    name: '正式环境',
    baseUrl: 'https://api.example.com',
    editable: false,
    sceneLabel: '正式线上',
    tips: [
      '正式环境必须替换成真实线上接口域名。',
      '上线前请确认请求域名已经在抖音开放平台后台配置完成。',
    ],
  },
  custom: {
    key: 'custom',
    name: '自定义地址',
    baseUrl: '',
    editable: true,
    sceneLabel: '手动输入接口',
    tips: [
      '你可以在页面里临时填写一个自定义接口地址，适合快速切换测试网关。',
      '输入时只填服务根地址，例如 https://api.example.com，不要带结尾斜杠。',
    ],
  },
};

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function buildRuntimeWarnings(profile, baseUrl) {
  const warnings = [];
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    warnings.push('当前环境还没有配置接口地址。');
    return warnings;
  }

  if (/^http:\/\/127\.0\.0\.1/i.test(normalizedBaseUrl) || /^http:\/\/localhost/i.test(normalizedBaseUrl)) {
    warnings.push('127.0.0.1 或 localhost 只适合本机开发者工具调试，真机无法直接访问。');
  }

  if (/^http:\/\//i.test(normalizedBaseUrl) && (profile.key === 'staging' || profile.key === 'production')) {
    warnings.push('预发布和正式环境建议改成 HTTPS 域名，否则真机域名校验通常无法通过。');
  }

  if (!/^https?:\/\//i.test(normalizedBaseUrl)) {
    warnings.push('接口地址需要带上 http:// 或 https:// 协议头。');
  }

  return warnings;
}

function buildRuntimeState(envKey, customApiBaseUrl = '') {
  const profile = ENVIRONMENTS[envKey] || ENVIRONMENTS[DEFAULT_ENV_KEY];
  const baseUrl = profile.editable
    ? normalizeBaseUrl(customApiBaseUrl)
    : normalizeBaseUrl(profile.baseUrl);
  const warnings = buildRuntimeWarnings(profile, baseUrl);

  return {
    runtimeConfig: {
      envKey: profile.key,
      envName: profile.name,
      sceneLabel: profile.sceneLabel,
      apiBaseUrl: baseUrl,
      customApiBaseUrl: normalizeBaseUrl(customApiBaseUrl),
      canEditBaseUrl: profile.editable,
      requestTimeout: 15000,
      requestHeaders: BASE_REQUEST_HEADERS,
      healthPath: '/api/health',
      catalogPath: '/api/public/catalog',
      generateCommentPath: '/api/appeals/generate',
      tips: profile.tips.slice(),
      warnings,
      isReady: Boolean(baseUrl),
    },
    runtimeEnvKey: profile.key,
    runtimeEnvName: profile.name,
    apiBaseUrl: baseUrl,
    customApiBaseUrl: normalizeBaseUrl(customApiBaseUrl),
    runtimeEnvOptions: listRuntimeOptions(),
  };
}

function listRuntimeOptions() {
  return Object.keys(ENVIRONMENTS).map((key) => ({
    key,
    name: ENVIRONMENTS[key].name,
    sceneLabel: ENVIRONMENTS[key].sceneLabel,
    baseUrl: ENVIRONMENTS[key].baseUrl,
    editable: Boolean(ENVIRONMENTS[key].editable),
  }));
}

module.exports = {
  DEFAULT_ENV_KEY,
  STORAGE_KEYS,
  ENVIRONMENTS,
  normalizeBaseUrl,
  buildRuntimeState,
  listRuntimeOptions,
};
