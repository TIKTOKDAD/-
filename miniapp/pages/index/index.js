function getRuntimeConfig() {
  const app = getApp();

  if (app && typeof app.getRuntimeConfig === 'function') {
    return app.getRuntimeConfig();
  }

  return {
    apiBaseUrl: String((app && app.globalData && app.globalData.apiBaseUrl) || '').trim().replace(/\/+$/, ''),
    requestTimeout: 15000,
    requestHeaders: {
      'content-type': 'application/json',
    },
    catalogPath: '/api/public/catalog',
    generateCommentPath: '/api/appeals/generate',
    isReady: Boolean(app && app.globalData && app.globalData.apiBaseUrl),
  };
}

function buildRequestUrl(baseUrl, pathname) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedPathname = String(pathname || '').trim();

  if (/^https?:\/\//i.test(normalizedPathname)) {
    return normalizedPathname;
  }

  if (!normalizedBaseUrl) {
    return normalizedPathname;
  }

  if (!normalizedPathname) {
    return normalizedBaseUrl;
  }

  if (normalizedPathname.startsWith('/')) {
    return `${normalizedBaseUrl}${normalizedPathname}`;
  }

  return `${normalizedBaseUrl}/${normalizedPathname}`;
}

function request(pathname, options = {}) {
  const runtimeConfig = getRuntimeConfig();
  const requestUrl = buildRequestUrl(runtimeConfig.apiBaseUrl, pathname);

  return new Promise((resolve, reject) => {
    if (!runtimeConfig.apiBaseUrl) {
      reject(new Error('当前环境未配置接口地址，请先在“调试与环境”里设置。'));
      return;
    }

    tt.request({
      url: requestUrl,
      method: options.method || 'GET',
      data: options.data || {},
      timeout: options.timeout || runtimeConfig.requestTimeout || 15000,
      header: Object.assign({}, runtimeConfig.requestHeaders || {}, options.header || {}),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }

        reject(new Error((response.data && response.data.message) || `请求失败：${response.statusCode}`));
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function findIndexByField(list, fieldName, value) {
  if (!value) {
    return -1;
  }

  return list.findIndex((item) => item && item[fieldName] === value);
}

function resolveAssetUrl(assetPath, apiBaseUrl) {
  const value = String(assetPath || '').trim();
  const baseUrl = String(apiBaseUrl || '').replace(/\/+$/, '');

  if (!value) {
    return '';
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (!baseUrl) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${baseUrl}${value}`;
  }

  return `${baseUrl}/${value}`;
}

function normalizeBrands(brands, apiBaseUrl) {
  return (brands || []).map((brand) => ({
    ...brand,
    logoUrl: resolveAssetUrl(brand.logoUrl, apiBaseUrl),
  }));
}

function buildBrandOptions(platformId, brands) {
  return brands.filter((brand) => {
    if (!Array.isArray(brand.platformIds) || brand.platformIds.length === 0) {
      return true;
    }

    return brand.platformIds.includes(platformId);
  });
}

function buildSelectionState(platforms, brands, platformIndex = 0, brandIndex = 0) {
  const safePlatformIndex = platforms.length
    ? Math.min(Math.max(Number(platformIndex) || 0, 0), platforms.length - 1)
    : 0;
  const selectedPlatform = platforms[safePlatformIndex] || null;
  const filteredBrands = selectedPlatform ? buildBrandOptions(selectedPlatform.id, brands) : [];
  const safeBrandIndex = filteredBrands.length
    ? Math.min(Math.max(Number(brandIndex) || 0, 0), filteredBrands.length - 1)
    : 0;
  const selectedBrand = filteredBrands[safeBrandIndex] || null;

  return {
    selectedPlatform,
    selectedBrand,
    filteredBrands,
    platformNames: platforms.map((item) => item.name),
    brandNames: filteredBrands.map((item) => item.name),
    platformIndex: safePlatformIndex,
    brandIndex: safeBrandIndex,
    hasAvailableCatalog: platforms.length > 0,
    hasBrandOptions: filteredBrands.length > 0,
    selectedPlatformName: selectedPlatform ? selectedPlatform.name : '暂无平台',
    selectedPlatformStatusLabel: selectedPlatform
      ? selectedPlatform.enabled
        ? '已启用'
        : '未启用'
      : '待配置',
    selectedBrandName: selectedBrand ? selectedBrand.name : '请选择商标',
    selectedBrandNote: (selectedBrand && selectedBrand.note) || '',
    selectedBrandLogoUrl: (selectedBrand && selectedBrand.logoUrl) || '',
    selectedBrandInitial: selectedBrand && selectedBrand.name ? String(selectedBrand.name).slice(0, 1) : 'AI',
  };
}

function formatProviderLabel(provider) {
  if (provider === 'openai-compatible-responses-vision') {
    return 'Responses 多模态';
  }

  if (provider === 'openai-compatible-chat-completions-vision') {
    return 'Chat 多模态';
  }

  if (provider === 'openai-compatible-responses') {
    return 'Responses 网关';
  }

  if (provider === 'openai-compatible-chat-completions') {
    return 'Chat Completions 网关';
  }

  if (provider === 'fallback-after-error') {
    return '异常回退';
  }

  if (provider === 'mock') {
    return '本地演示';
  }

  return provider || '未标记来源';
}

function readImageAsDataUrl(filePath) {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error('无效的图片路径'));
      return;
    }

    const fs = tt.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success(result) {
        const ext = String(filePath).toLowerCase();
        const mimeType = ext.endsWith('.png')
          ? 'image/png'
          : ext.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
        resolve(`data:${mimeType};base64,${result.data || ''}`);
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function createStepItems(step) {
  return [
    { index: 1, title: '选择平台', active: step === 1, done: step > 1 },
    { index: 2, title: '上传差评证据', active: step === 2, done: step > 2 },
    { index: 3, title: '生成申诉文案', active: step === 3, done: false },
  ];
}

Page({
  data: {
    loading: true,
    generating: false,
    hasAvailableCatalog: false,
    hasBrandOptions: false,
    platforms: [],
    brands: [],
    filteredBrands: [],
    platformNames: [],
    brandNames: [],
    selectedPlatform: null,
    selectedBrand: null,
    selectedPlatformName: '暂无平台',
    selectedPlatformStatusLabel: '待配置',
    selectedBrandName: '请选择商标',
    selectedBrandNote: '',
    selectedBrandLogoUrl: '',
    selectedBrandInitial: 'AI',
    platformIndex: 0,
    brandIndex: 0,
    environmentReady: false,
    currentStep: 1,
    stepItems: createStepItems(1),
    complaintText: '',
    merchantNote: '',
    complaintLength: 0,
    merchantNoteLength: 0,
    evidenceImages: [],
    result: '',
    resultProvider: '',
    resultProviderLabel: '',
    resultGeneratedAt: '',
    warning: '',
    errorMessage: '',
  },

  onLoad() {
    this.syncRuntimeConfigState();
    this.loadCatalog();
  },

  onShow() {
    this.syncRuntimeConfigState();
  },

  onPullDownRefresh() {
    this.loadCatalog(true);
  },

  syncRuntimeConfigState() {
    const app = getApp();
    const runtimeConfig = app.getRuntimeConfig ? app.getRuntimeConfig() : getRuntimeConfig();

    this.setData({
      environmentReady: Boolean(runtimeConfig.isReady),
    });
  },

  setStep(nextStep) {
    const step = Math.min(Math.max(Number(nextStep) || 1, 1), 3);
    this.setData({
      currentStep: step,
      stepItems: createStepItems(step),
    });
  },

  async loadCatalog(fromPullDown = false) {
    const runtimeConfig = getRuntimeConfig();

    this.setData({
      loading: true,
      errorMessage: '',
    });

    if (!runtimeConfig.isReady) {
      this.setData({
        loading: false,
        hasAvailableCatalog: false,
        hasBrandOptions: false,
        errorMessage: '系统尚未配置接口地址，请联系管理员。',
      });

      if (fromPullDown) {
        tt.stopPullDownRefresh();
      }
      return;
    }

    try {
      const catalog = await request(runtimeConfig.catalogPath);
      const platforms = catalog.platforms || [];
      const brands = normalizeBrands(catalog.brands, runtimeConfig.apiBaseUrl);
      const currentPlatformId = (this.data.selectedPlatform && this.data.selectedPlatform.id) || '';
      const currentBrandId = (this.data.selectedBrand && this.data.selectedBrand.id) || '';
      const nextPlatformIndex = Math.max(findIndexByField(platforms, 'id', currentPlatformId), 0);
      const firstSelection = buildSelectionState(platforms, brands, nextPlatformIndex, 0);
      const nextBrandIndex = Math.max(findIndexByField(firstSelection.filteredBrands, 'id', currentBrandId), 0);
      const nextSelection = buildSelectionState(platforms, brands, nextPlatformIndex, nextBrandIndex);

      this.setData(
        Object.assign(
          {
            loading: false,
            platforms,
            brands,
          },
          nextSelection,
        ),
      );

      if (platforms.length > 0) {
        this.setStep(1);
      }
    } catch (error) {
      this.setData({
        loading: false,
        hasAvailableCatalog: false,
        hasBrandOptions: false,
        errorMessage: error.message || '加载平台数据失败。',
      });
    } finally {
      if (fromPullDown) {
        tt.stopPullDownRefresh();
      }
    }
  },

  handlePlatformChange(event) {
    const nextSelection = buildSelectionState(
      this.data.platforms,
      this.data.brands,
      Number(event.detail.value || 0),
      0,
    );

    this.setData(
      Object.assign({}, nextSelection, {
        result: '',
        warning: '',
        errorMessage: '',
      }),
    );
  },

  handleBrandChange(event) {
    const nextSelection = buildSelectionState(
      this.data.platforms,
      this.data.brands,
      this.data.platformIndex,
      Number(event.detail.value || 0),
    );

    this.setData(
      Object.assign({}, nextSelection, {
        result: '',
        warning: '',
        errorMessage: '',
      }),
    );
  },

  handleInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    const nextData = {
      [field]: value,
    };

    if (field === 'complaintText') {
      nextData.complaintLength = String(value || '').length;
    }

    if (field === 'merchantNote') {
      nextData.merchantNoteLength = String(value || '').length;
    }

    this.setData(nextData);
  },

  nextStepFromPlatform() {
    if (!this.data.selectedPlatform || !this.data.selectedBrand) {
      tt.showToast({
        title: '请先选择平台和商标',
        icon: 'none',
      });
      return;
    }

    this.setStep(2);
  },

  nextStepFromEvidence() {
    if (!String(this.data.complaintText || '').trim()) {
      tt.showToast({
        title: '请先填写差评文字',
        icon: 'none',
      });
      return;
    }

    this.setStep(3);
  },

  prevStep() {
    this.setStep(this.data.currentStep - 1);
  },

  async chooseEvidenceImages() {
    const remain = 3 - this.data.evidenceImages.length;

    if (remain <= 0) {
      tt.showToast({
        title: '最多上传 3 张',
        icon: 'none',
      });
      return;
    }

    tt.chooseImage({
      count: remain,
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const paths = res.tempFilePaths || [];

        try {
          const converted = await Promise.all(
            paths.map(async (path, index) => ({
              id: `${Date.now()}-${index}`,
              localPath: path,
              url: await readImageAsDataUrl(path),
            })),
          );

          const next = this.data.evidenceImages.concat(converted).slice(0, 3);
          this.setData({
            evidenceImages: next,
          });
        } catch (error) {
          tt.showToast({
            title: error.message || '读取图片失败',
            icon: 'none',
          });
        }
      },
    });
  },

  removeEvidenceImage(event) {
    const targetId = String(event.currentTarget.dataset.id || '');
    const next = this.data.evidenceImages.filter((item) => String(item.id) !== targetId);

    this.setData({
      evidenceImages: next,
    });
  },

  previewEvidenceImage(event) {
    const current = String(event.currentTarget.dataset.path || '');
    const urls = this.data.evidenceImages.map((item) => item.localPath).filter(Boolean);

    if (!current || !urls.length) {
      return;
    }

    tt.previewImage({
      current,
      urls,
    });
  },

  clearForm() {
    this.setData({
      complaintText: '',
      complaintLength: 0,
      merchantNote: '',
      merchantNoteLength: 0,
      evidenceImages: [],
      result: '',
      resultProvider: '',
      resultProviderLabel: '',
      resultGeneratedAt: '',
      warning: '',
      errorMessage: '',
    });
    this.setStep(1);
  },

  previewBrandLogo() {
    const logoUrl = this.data.selectedBrandLogoUrl;

    if (!logoUrl) {
      return;
    }

    tt.previewImage({
      urls: [logoUrl],
      current: logoUrl,
    });
  },

  async generateComment() {
    const platform = this.data.selectedPlatform;
    const brand = this.data.selectedBrand;
    const runtimeConfig = getRuntimeConfig();

    if (!runtimeConfig.isReady) {
      tt.showToast({
        title: '系统配置未完成',
        icon: 'none',
      });
      return;
    }

    if (!platform || !brand) {
      tt.showToast({
        title: '请先选择平台和商标',
        icon: 'none',
      });
      return;
    }

    this.setData({
      generating: true,
      errorMessage: '',
      result: '',
      warning: '',
      resultProviderLabel: '',
    });

    try {
      const result = await request(runtimeConfig.generateCommentPath, {
        method: 'POST',
        data: {
          platformId: platform.id,
          brandId: brand.id,
          complaintText: String(this.data.complaintText || '').trim(),
          merchantNote: String(this.data.merchantNote || '').trim(),
          evidenceImages: (this.data.evidenceImages || []).map((item) => ({
            url: item.url,
          })),
        },
      });

      this.setData({
        generating: false,
        result: result.appealText || '',
        resultProvider: result.provider || '',
        resultProviderLabel: formatProviderLabel(result.provider),
        resultGeneratedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        warning: result.warning || '',
      });
    } catch (error) {
      this.setData({
        generating: false,
        errorMessage: error.message || '生成申诉失败。',
      });
    }
  },

  copyResult() {
    if (!this.data.result) {
      return;
    }

    tt.setClipboardData({
      data: this.data.result,
      success: () => {
        tt.showToast({
          title: '已复制',
          icon: 'success',
        });
      },
    });
  },
});





