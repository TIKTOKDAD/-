function normalizeText(value, fallback = '') {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ') || fallback;
}

function renderTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

function buildFallbackReview({ platform, brand, payload }) {
  const note = normalizeText(payload.customerNote, '整体体验都很顺畅');
  const ratingText = payload.rating ? `${payload.rating} 星` : '高分';

  return `这次在 ${platform.name} 下单 ${brand.name} 的体验很不错，${note}，整体满意度有 ${ratingText}，之后还会继续回购。`;
}

function buildApiBaseUrl(baseUrl) {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '');

  if (!normalized) {
    return '';
  }

  if (/\/v\d+$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/v1`;
}

function normalizeEvidenceImages(evidenceImages) {
  if (!Array.isArray(evidenceImages)) {
    return [];
  }

  return evidenceImages
    .map((item) => ({
      url: normalizeText(item?.url),
      caption: normalizeText(item?.caption),
    }))
    .filter((item) => item.url)
    .slice(0, 6);
}

function extractChatContent(data) {
  const messageContent = data?.choices?.[0]?.message?.content;

  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item.text === 'string') {
          return item.text;
        }

        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

function extractResponseContent(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) {
    return '';
  }

  return data.output
    .map((item) => {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        return item.content
          .map((content) => {
            if (typeof content === 'string') {
              return content;
            }

            if (typeof content?.text === 'string') {
              return content.text;
            }

            if (typeof content?.content === 'string') {
              return content.content;
            }

            return '';
          })
          .join('');
      }

      if (typeof item?.text === 'string') {
        return item.text;
      }

      return '';
    })
    .join('')
    .trim();
}

async function postJson(url, apiKey, payload, label) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`${label} 接口返回 ${response.status}：${errorText.slice(0, 300)}`);
    error.statusCode = response.status;
    error.responseText = errorText;
    throw error;
  }

  return response.json();
}

function shouldFallbackToChatCompletions(error) {
  const statusCode = Number(error?.statusCode || 0);
  const message = normalizeText(error?.message).toLowerCase();

  if ([404, 405, 415, 422, 501].includes(statusCode)) {
    return true;
  }

  if (message.includes('/responses') || message.includes('responses')) {
    return true;
  }

  return false;
}

async function callResponsesCompatible(settings, systemPrompt, prompt) {
  const apiBaseUrl = buildApiBaseUrl(settings.openai?.baseUrl);
  const apiKey = normalizeText(settings.openai?.apiKey);
  const model = normalizeText(settings.openai?.model, 'gpt-4.1-mini');
  const temperature = Number.isFinite(Number(settings.openai?.temperature))
    ? Number(settings.openai.temperature)
    : 0.8;
  const url = `${apiBaseUrl}/responses`;
  const payload = {
    model,
    instructions: systemPrompt,
    input: prompt,
    temperature,
    max_output_tokens: 220,
  };

  const data = await postJson(url, apiKey, payload, 'Responses');
  const review = extractResponseContent(data);

  if (!review) {
    throw new Error('Responses 接口没有返回评论内容。');
  }

  return {
    review,
    provider: 'openai-compatible-responses',
    status: 'success',
    warning: '',
  };
}

async function callResponsesAppealCompatible(settings, systemPrompt, prompt, evidenceImages) {
  const apiBaseUrl = buildApiBaseUrl(settings.openai?.baseUrl);
  const apiKey = normalizeText(settings.openai?.apiKey);
  const model = normalizeText(settings.openai?.model, 'gpt-4.1-mini');
  const temperature = Number.isFinite(Number(settings.openai?.temperature))
    ? Number(settings.openai.temperature)
    : 0.6;
  const url = `${apiBaseUrl}/responses`;
  const input = [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: prompt,
        },
        ...evidenceImages.map((item) => ({
          type: 'input_image',
          image_url: item.url,
        })),
      ],
    },
  ];
  const payload = {
    model,
    instructions: systemPrompt,
    input,
    temperature,
    max_output_tokens: 520,
  };

  const data = await postJson(url, apiKey, payload, 'Responses');
  const appealText = extractResponseContent(data);

  if (!appealText) {
    throw new Error('Responses 接口没有返回申诉内容。');
  }

  return {
    appealText,
    provider: 'openai-compatible-responses-vision',
    status: 'success',
    warning: '',
  };
}

async function callChatCompletionsCompatible(settings, messages, warning = '') {
  const apiBaseUrl = buildApiBaseUrl(settings.openai?.baseUrl);
  const apiKey = normalizeText(settings.openai?.apiKey);
  const url = `${apiBaseUrl}/chat/completions`;
  const payload = {
    model: normalizeText(settings.openai?.model, 'gpt-4.1-mini'),
    temperature: Number.isFinite(Number(settings.openai?.temperature))
      ? Number(settings.openai.temperature)
      : 0.8,
    max_tokens: 220,
    messages,
  };

  const data = await postJson(url, apiKey, payload, 'Chat Completions');
  const review = extractChatContent(data);

  if (!review) {
    throw new Error('Chat Completions 接口没有返回评论内容。');
  }

  return {
    review,
    provider: 'openai-compatible-chat-completions',
    status: 'success',
    warning: normalizeText(warning),
  };
}

async function callChatCompletionsAppealCompatible(settings, systemPrompt, prompt, evidenceImages, warning = '') {
  const imageSegments = evidenceImages.map((item) => ({
    type: 'image_url',
    image_url: {
      url: item.url,
    },
  }));
  const userContent = [
    {
      type: 'text',
      text: prompt,
    },
    ...imageSegments,
  ];
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userContent,
    },
  ];

  const apiBaseUrl = buildApiBaseUrl(settings.openai?.baseUrl);
  const apiKey = normalizeText(settings.openai?.apiKey);
  const url = `${apiBaseUrl}/chat/completions`;
  const payload = {
    model: normalizeText(settings.openai?.model, 'gpt-4.1-mini'),
    temperature: Number.isFinite(Number(settings.openai?.temperature))
      ? Number(settings.openai.temperature)
      : 0.6,
    max_tokens: 520,
    messages,
  };

  const data = await postJson(url, apiKey, payload, 'Chat Completions');
  const appealText = extractChatContent(data);

  if (!appealText) {
    throw new Error('Chat Completions 接口没有返回申诉内容。');
  }

  return {
    appealText,
    provider: 'openai-compatible-chat-completions-vision',
    status: 'success',
    warning: normalizeText(warning),
  };
}

async function callOpenAICompatible(settings, messages, systemPrompt, prompt) {
  const baseUrl = normalizeText(settings.openai?.baseUrl);
  const apiKey = normalizeText(settings.openai?.apiKey);

  if (!baseUrl || !apiKey) {
    return {
      review: '',
      provider: 'mock',
      status: 'mock',
      warning: '未配置 OpenAI 兼容接口，已返回本地演示评论。',
    };
  }

  try {
    return await callResponsesCompatible(settings, systemPrompt, prompt);
  } catch (responsesError) {
    if (!shouldFallbackToChatCompletions(responsesError)) {
      throw responsesError;
    }

    const fallbackWarning = `Responses 接口不可用，已自动回退到 Chat Completions。${normalizeText(
      responsesError.message,
    )}`.slice(0, 220);

    return callChatCompletionsCompatible(settings, messages, fallbackWarning);
  }
}

async function callOpenAIAppealCompatible(settings, systemPrompt, prompt, evidenceImages) {
  const baseUrl = normalizeText(settings.openai?.baseUrl);
  const apiKey = normalizeText(settings.openai?.apiKey);

  if (!baseUrl || !apiKey) {
    return {
      appealText: '',
      provider: 'mock',
      status: 'mock',
      warning: '未配置 OpenAI 兼容接口，已返回本地演示申诉文案。',
    };
  }

  try {
    return await callResponsesAppealCompatible(settings, systemPrompt, prompt, evidenceImages);
  } catch (responsesError) {
    if (!shouldFallbackToChatCompletions(responsesError)) {
      throw responsesError;
    }

    const fallbackWarning = `Responses 接口不可用，已自动回退到 Chat Completions。${normalizeText(
      responsesError.message,
    )}`.slice(0, 220);

    return callChatCompletionsAppealCompatible(
      settings,
      systemPrompt,
      prompt,
      evidenceImages,
      fallbackWarning,
    );
  }
}

function ensureCounters(draft) {
  draft.comments = Array.isArray(draft.comments) ? draft.comments : [];
  draft.defaultUsers = Array.isArray(draft.defaultUsers) ? draft.defaultUsers : [];
  draft.counters = {
    guestUser: 0,
    comment: 0,
    ...(draft.counters ?? {}),
  };
}

function resolveUser(draft, payload, settings) {
  const orderNumber = normalizeText(payload.orderNumber);

  if (orderNumber) {
    return {
      userId: `order-${orderNumber}`,
      userName: normalizeText(payload.userName, `订单用户-${orderNumber}`),
    };
  }

  draft.counters.guestUser += 1;
  const sequence = String(draft.counters.guestUser).padStart(4, '0');
  const userName = `${normalizeText(settings.defaultUserPrefix, '默认用户')}${sequence}`;
  const user = {
    id: `guest-${sequence}`,
    name: userName,
    createdAt: new Date().toISOString(),
  };

  draft.defaultUsers.unshift(user);
  draft.defaultUsers = draft.defaultUsers.slice(0, 100);

  return {
    userId: user.id,
    userName: user.name,
  };
}

async function generateCommentInDraft(draft, payload) {
  ensureCounters(draft);

  const platform = draft.platforms.find((item) => item.id === normalizeText(payload.platformId));
  const brand = draft.brands.find((item) => item.id === normalizeText(payload.brandId));

  if (!platform) {
    throw new Error('未找到对应的平台。');
  }

  if (!brand) {
    throw new Error('未找到对应的商标。');
  }

  if (
    Array.isArray(brand.platformIds) &&
    brand.platformIds.length > 0 &&
    !brand.platformIds.includes(platform.id)
  ) {
    throw new Error('当前商标未关联到所选平台。');
  }

  const orderNumber = normalizeText(payload.orderNumber, '未填写');
  const user = resolveUser(draft, payload, draft.settings);
  const promptTemplate =
    normalizeText(platform.promptTemplate) || normalizeText(draft.settings.defaultPromptTemplate);
  const systemPrompt = normalizeText(
    draft.settings.defaultSystemPrompt,
    '你是一名中文评论生成助手。',
  );

  const prompt = renderTemplate(promptTemplate, {
    platformName: platform.name,
    brandName: brand.name,
    orderNumber,
    userName: user.userName,
    rating: normalizeText(payload.rating, '5'),
    customerNote: normalizeText(payload.customerNote, '未提供更多补充信息'),
  });

  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: prompt,
    },
  ];

  let providerResult;

  try {
    providerResult = await callOpenAICompatible(draft.settings, messages, systemPrompt, prompt);
  } catch (error) {
    providerResult = {
      review: '',
      provider: 'fallback-after-error',
      status: 'fallback',
      warning: error.message,
    };
  }

  const review = normalizeText(providerResult.review) || buildFallbackReview({
    platform,
    brand,
    payload,
  });

  draft.counters.comment += 1;
  const commentId = `comment-${String(draft.counters.comment).padStart(6, '0')}`;
  const createdAt = new Date().toISOString();

  const record = {
    id: commentId,
    platformId: platform.id,
    platformName: platform.name,
    brandId: brand.id,
    brandName: brand.name,
    orderNumber: normalizeText(payload.orderNumber),
    userId: user.userId,
    userName: user.userName,
    rating: normalizeText(payload.rating, '5'),
    customerNote: normalizeText(payload.customerNote),
    prompt,
    review,
    originalReview: review,
    reviewStatus: 'pending',
    reviewNote: '',
    provider: providerResult.provider,
    status: providerResult.status,
    warning: normalizeText(providerResult.warning),
    editedAt: '',
    reviewedAt: '',
    publishedAt: '',
    createdAt,
    updatedAt: createdAt,
  };

  draft.comments.unshift(record);
  draft.comments = draft.comments.slice(0, 200);

  return record;
}

export async function generateCommentRecord(store, payload) {
  const { result } = await store.update((draft) => generateCommentInDraft(draft, payload));
  return result;
}

function buildFallbackAppeal({ platform, brand, complaintText, merchantNote }) {
  return [
    `尊敬的${platform.name}审核团队，您好。关于用户对${brand.name}的评价“${complaintText || '内容已收悉'}”，我们已完成门店与订单核验。`,
    `结合系统留存记录与现场服务流程，当前争议点与实际履约情况存在偏差。${merchantNote ? `商家补充说明：${merchantNote}。` : ''}`,
    '恳请平台结合证据材料复核该条差评的客观性，并协助调整展示或移除不实内容。谢谢。',
  ]
    .join(' ')
    .trim();
}

function mergeEvidenceImages(groups) {
  const merged = [];
  const seen = new Set();

  (groups || []).forEach((group) => {
    (group || []).forEach((item) => {
      const url = normalizeText(item?.url);

      if (!url || seen.has(url)) {
        return;
      }

      seen.add(url);
      merged.push({
        ...item,
        url,
      });
    });
  });

  return merged.slice(0, 6);
}

function buildImageHint(images) {
  if (!images.length) {
    return '未提供图片证据';
  }

  return images
    .map((item, index) => `图${index + 1}${item.caption ? `（${item.caption}）` : ''}`)
    .join('，');
}

function renderAppealTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

async function generateAppealInDraft(draft, payload) {
  ensureCounters(draft);
  draft.appeals = Array.isArray(draft.appeals) ? draft.appeals : [];
  draft.counters.appeal = Number(draft.counters.appeal || 0);

  const platform = draft.platforms.find((item) => item.id === normalizeText(payload.platformId));
  const brand = draft.brands.find((item) => item.id === normalizeText(payload.brandId));

  if (!platform) {
    throw new Error('未找到对应的平台。');
  }

  if (!brand) {
    throw new Error('未找到对应的商标。');
  }

  const complaintText = normalizeText(payload.userComplaintText ?? payload.complaintText);

  if (!complaintText) {
    throw new Error('差评文字不能为空。');
  }

  const userReviewImages = normalizeEvidenceImages(payload.userReviewImages);
  const merchantAppealImages = normalizeEvidenceImages(payload.merchantAppealImages);
  const legacyEvidenceImages = normalizeEvidenceImages(payload.evidenceImages);
  const evidenceImages = mergeEvidenceImages([
    userReviewImages,
    merchantAppealImages,
    legacyEvidenceImages,
  ]);
  const merchantNote = normalizeText(
    payload.merchantAppealText ?? payload.merchantNote,
    '暂无额外补充。',
  );
  const systemPrompt = normalizeText(
    draft.settings.appealSystemPrompt,
    '你是一名中文本地生活平台申诉助手。',
  );
  const templateMode = normalizeText(draft.settings.appealTemplateMode, 'default');
  const defaultAppealTemplate =
    normalizeText(draft.settings.appealPromptTemplate) ||
    normalizeText(draft.settings.defaultPromptTemplate);
  const promptTemplate =
    templateMode === 'platform'
      ? normalizeText(platform.appealPromptTemplate) || defaultAppealTemplate
      : defaultAppealTemplate;
  const prompt = renderAppealTemplate(promptTemplate, {
    platformName: platform.name,
    brandName: brand.name,
    complaintText,
    userComplaintText: complaintText,
    merchantNote,
    merchantAppealText: merchantNote,
    imageHint: buildImageHint(evidenceImages),
    userReviewImageHint: buildImageHint(userReviewImages),
    merchantAppealImageHint: buildImageHint(merchantAppealImages),
    userReviewImageCount: String(userReviewImages.length),
    merchantAppealImageCount: String(merchantAppealImages.length),
  });

  let providerResult;

  try {
    providerResult = await callOpenAIAppealCompatible(
      draft.settings,
      systemPrompt,
      prompt,
      evidenceImages,
    );
  } catch (error) {
    providerResult = {
      appealText: '',
      provider: 'fallback-after-error',
      status: 'fallback',
      warning: error.message,
    };
  }

  const appealText = normalizeText(providerResult.appealText) ||
    buildFallbackAppeal({
      platform,
      brand,
      complaintText,
      merchantNote,
    });
  const createdAt = new Date().toISOString();
  draft.counters.appeal += 1;

  const record = {
    id: `appeal-${String(draft.counters.appeal).padStart(6, '0')}`,
    platformId: platform.id,
    platformName: platform.name,
    brandId: brand.id,
    brandName: brand.name,
    complaintText,
    userComplaintText: complaintText,
    merchantNote,
    merchantAppealText: merchantNote,
    userReviewImages,
    merchantAppealImages,
    evidenceImages,
    prompt,
    appealText,
    originalAppealText: appealText,
    provider: providerResult.provider,
    status: providerResult.status,
    warning: normalizeText(providerResult.warning),
    reviewStatus: 'pending',
    reviewNote: '',
    reviewedAt: '',
    createdAt,
    updatedAt: createdAt,
  };

  draft.appeals.unshift(record);
  draft.appeals = draft.appeals.slice(0, 300);

  return record;
}

export async function generateAppealRecord(store, payload) {
  const { result } = await store.update((draft) => generateAppealInDraft(draft, payload));
  return result;
}

export async function testAIConnection(settings) {
  const baseUrl = normalizeText(settings?.openai?.baseUrl);
  const apiKey = normalizeText(settings?.openai?.apiKey);

  if (!baseUrl) {
    throw new Error('请先填写 Base URL。');
  }

  if (!apiKey) {
    throw new Error('请先填写 API Key。');
  }

  const systemPrompt = '你是一个接口连通性测试助手。';
  const prompt = '请只回复：连接成功';
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: prompt,
    },
  ];
  const startAt = Date.now();

  try {
    const result = await callResponsesCompatible(settings, systemPrompt, prompt);

    return {
      ok: true,
      provider: result.provider,
      warning: normalizeText(result.warning),
      latencyMs: Date.now() - startAt,
      preview: normalizeText(result.review).slice(0, 60),
    };
  } catch (responsesError) {
    if (!shouldFallbackToChatCompletions(responsesError)) {
      throw responsesError;
    }

    const fallbackWarning = `Responses 接口不可用，已自动回退到 Chat Completions。${normalizeText(
      responsesError.message,
    )}`.slice(0, 220);
    const result = await callChatCompletionsCompatible(settings, messages, fallbackWarning);

    return {
      ok: true,
      provider: result.provider,
      warning: normalizeText(result.warning),
      latencyMs: Date.now() - startAt,
      preview: normalizeText(result.review).slice(0, 60),
    };
  }
}

export async function testAIVisionConnection(settings, imageUrl) {
  const baseUrl = normalizeText(settings?.openai?.baseUrl);
  const apiKey = normalizeText(settings?.openai?.apiKey);
  const normalizedImageUrl = normalizeText(imageUrl);

  if (!baseUrl) {
    throw new Error('请先填写 Base URL。');
  }

  if (!apiKey) {
    throw new Error('请先填写 API Key。');
  }

  if (!normalizedImageUrl) {
    throw new Error('请先填写测试图片 URL。');
  }

  const systemPrompt = '你是一个多模态连通性测试助手。';
  const prompt = '请根据图片内容给出 12 字以内中文摘要。';
  const evidenceImages = [{ url: normalizedImageUrl }];
  const startAt = Date.now();

  const result = await callOpenAIAppealCompatible(
    settings,
    systemPrompt,
    prompt,
    evidenceImages,
  );

  return {
    ok: true,
    provider: result.provider,
    warning: normalizeText(result.warning),
    latencyMs: Date.now() - startAt,
    preview: normalizeText(result.appealText).slice(0, 60),
  };
}
