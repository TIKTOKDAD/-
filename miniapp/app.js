const { DEFAULT_ENV_KEY, STORAGE_KEYS, buildRuntimeState } = require('./config/env');

function isDevtoolsRuntime() {
  try {
    const systemInfo = tt.getSystemInfoSync();
    return String(systemInfo?.platform || '').toLowerCase() === 'devtools';
  } catch (error) {
    return false;
  }
}

function safeGetStorageSync(key, fallbackValue) {
  try {
    const value = tt.getStorageSync(key);
    return value === '' || value === undefined || value === null ? fallbackValue : value;
  } catch (error) {
    return fallbackValue;
  }
}

function safeSetStorageSync(key, value) {
  try {
    tt.setStorageSync(key, value);
  } catch (error) {
    return;
  }
}

App({
  globalData: {
    runtimeConfig: null,
    runtimeEnvKey: DEFAULT_ENV_KEY,
    runtimeEnvName: '',
    runtimeEnvOptions: [],
    apiBaseUrl: '',
    customApiBaseUrl: '',
  },

  onLaunch() {
    this.bootstrapRuntimeConfig();
  },

  bootstrapRuntimeConfig() {
    const storedEnvKey = safeGetStorageSync(STORAGE_KEYS.runtimeEnvKey, DEFAULT_ENV_KEY);
    const envKey =
      storedEnvKey === 'local' && !isDevtoolsRuntime() ? 'lan' : storedEnvKey;
    const storedCustomApiBaseUrl = safeGetStorageSync(STORAGE_KEYS.customApiBaseUrl, '');
    return this.applyRuntimeConfig(envKey, {
      customApiBaseUrl: storedCustomApiBaseUrl,
    });
  },

  applyRuntimeConfig(envKey, options = {}) {
    const currentCustomApiBaseUrl =
      envKey === 'custom' && options.customApiBaseUrl !== undefined
        ? String(options.customApiBaseUrl || '')
        : this.globalData.customApiBaseUrl || '';
    const nextState = buildRuntimeState(envKey, currentCustomApiBaseUrl);

    Object.assign(this.globalData, nextState);

    safeSetStorageSync(STORAGE_KEYS.runtimeEnvKey, nextState.runtimeEnvKey);
    safeSetStorageSync(STORAGE_KEYS.customApiBaseUrl, nextState.customApiBaseUrl);

    return nextState.runtimeConfig;
  },

  getRuntimeConfig() {
    if (this.globalData.runtimeConfig) {
      return this.globalData.runtimeConfig;
    }

    return this.bootstrapRuntimeConfig();
  },
});
