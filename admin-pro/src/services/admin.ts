export type AdminUser = {
  id: string;
  username: string;
  mustChangePassword?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
};

export type SessionPayload = {
  authenticated: boolean;
  admin?: AdminUser;
};

export type OpenAISettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
};

export type SettingsPayload = {
  openai: OpenAISettings;
  defaultSystemPrompt: string;
  defaultPromptTemplate: string;
  appealSystemPrompt: string;
  appealPromptTemplate: string;
  appealTemplateMode: 'default' | 'platform';
  defaultUserPrefix: string;
};

export type AIConnectionTestResult = {
  ok: boolean;
  provider: string;
  warning?: string;
  latencyMs: number;
  preview?: string;
};

export type Platform = {
  id: string;
  name: string;
  code: string;
  description: string;
  enabled: boolean;
  promptTemplate: string;
  appealPromptTemplate?: string;
  createdAt: string;
  updatedAt: string;
};

export type Brand = {
  id: string;
  name: string;
  logoUrl: string;
  note: string;
  platformIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CommentRecord = {
  id: string;
  platformId: string;
  platformName: string;
  brandId: string;
  brandName: string;
  orderNumber: string;
  userId: string;
  userName: string;
  rating: string;
  customerNote: string;
  prompt: string;
  review: string;
  originalReview: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewNote: string;
  provider: string;
  status: string;
  warning: string;
  editedAt: string;
  reviewedAt: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AppealRecord = {
  id: string;
  platformId: string;
  platformName: string;
  brandId: string;
  brandName: string;
  complaintText: string;
  merchantNote: string;
  evidenceImages: Array<{
    url: string;
    caption?: string;
  }>;
  prompt: string;
  appealText: string;
  originalAppealText: string;
  provider: string;
  status: string;
  warning: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewNote: string;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardPayload = {
  summary: {
    platformCount: number;
    brandCount: number;
    defaultUserCount: number;
    pendingReviewCount: number;
    commentCount: number;
    appealCount: number;
    pendingAppealCount: number;
    approvedAppealCount: number;
    rejectedAppealCount: number;
    todayNewAppealCount: number;
  };
  settings: SettingsPayload;
  platforms: Platform[];
  brands: Brand[];
  defaultUsers: Array<{
    id: string;
    name: string;
    createdAt: string;
  }>;
  comments: CommentRecord[];
  appeals: AppealRecord[];
  processingTrend: Array<{
    date: string;
    completedCount: number;
    avgProcessingHours: number;
  }>;
};

export type LogoUploadPayload = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export type LogoUploadResult = {
  fileName: string;
  contentType: string;
  size: number;
  url: string;
};

type PlatformInput = Pick<
  Platform,
  'name' | 'code' | 'description' | 'enabled' | 'promptTemplate' | 'appealPromptTemplate'
>;

type BrandInput = Pick<Brand, 'name' | 'logoUrl' | 'note'> & {
  platformId: string;
};

type CommentUpdateInput = Pick<
  CommentRecord,
  'review' | 'reviewStatus' | 'reviewNote'
>;

type AppealUpdateInput = Pick<
  AppealRecord,
  'appealText' | 'reviewStatus' | 'reviewNote'
>;

type PasswordUpdateInput = {
  currentPassword: string;
  newPassword: string;
};

type JsonValue = Record<string, any> | string | number | boolean | null;

type HttpError = Error & {
  data?: {
    message?: string;
    [key: string]: any;
  };
  status?: number;
};

function jsonRequest<T>(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    credentials: 'include',
    ...init,
    headers,
  }).then(async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const error = new Error(
        typeof payload === 'object' && payload?.message
          ? payload.message
          : response.statusText || 'Request failed',
      ) as HttpError;

      error.status = response.status;
      error.data =
        typeof payload === 'object'
          ? payload
          : {
              message: String(payload || response.statusText || 'Request failed'),
            };
      throw error;
    }

    return payload as T;
  });
}

const withPlatformIds = ({ platformId, ...payload }: BrandInput) => ({
  ...payload,
  platformIds: [platformId],
});

const toJsonBody = (payload?: JsonValue) =>
  payload === undefined ? undefined : JSON.stringify(payload);

export async function fetchSession() {
  return jsonRequest<SessionPayload>('/api/admin/session');
}

export async function login(username: string, password: string) {
  return jsonRequest<SessionPayload>('/api/admin/login', {
    method: 'POST',
    body: toJsonBody({ username, password }),
  });
}

export async function logout() {
  return jsonRequest<{ success: boolean }>('/api/admin/logout', {
    method: 'POST',
  });
}

export async function updatePassword(payload: PasswordUpdateInput) {
  return jsonRequest<{ admin: AdminUser }>('/api/admin/password', {
    method: 'PUT',
    body: toJsonBody(payload),
  });
}

export async function fetchDashboard() {
  return jsonRequest<DashboardPayload>('/api/dashboard');
}

export async function fetchSettings() {
  return jsonRequest<SettingsPayload>('/api/settings');
}

export async function saveSettings(payload: Partial<SettingsPayload>) {
  return jsonRequest<SettingsPayload>('/api/settings', {
    method: 'PUT',
    body: toJsonBody(payload),
  });
}

export async function testAISettings(payload: Partial<SettingsPayload>) {
  return jsonRequest<AIConnectionTestResult>('/api/settings/test-ai', {
    method: 'POST',
    body: toJsonBody(payload),
  });
}

export async function testAIVisionSettings(payload: Partial<SettingsPayload> & { imageUrl: string }) {
  return jsonRequest<AIConnectionTestResult>('/api/settings/test-ai-vision', {
    method: 'POST',
    body: toJsonBody(payload),
  });
}

export async function createPlatform(payload: PlatformInput) {
  return jsonRequest<Platform>('/api/platforms', {
    method: 'POST',
    body: toJsonBody(payload),
  });
}

export async function updatePlatform(id: string, payload: PlatformInput) {
  return jsonRequest<Platform>(`/api/platforms/${id}`, {
    method: 'PUT',
    body: toJsonBody(payload),
  });
}

export async function deletePlatform(id: string) {
  return jsonRequest<Platform>(`/api/platforms/${id}`, {
    method: 'DELETE',
  });
}

export async function createBrand(payload: BrandInput) {
  return jsonRequest<Brand>('/api/brands', {
    method: 'POST',
    body: toJsonBody(withPlatformIds(payload)),
  });
}

export async function updateBrand(id: string, payload: BrandInput) {
  return jsonRequest<Brand>(`/api/brands/${id}`, {
    method: 'PUT',
    body: toJsonBody(withPlatformIds(payload)),
  });
}

export async function deleteBrand(id: string) {
  return jsonRequest<Brand>(`/api/brands/${id}`, {
    method: 'DELETE',
  });
}

export async function uploadBrandLogo(payload: LogoUploadPayload) {
  return jsonRequest<LogoUploadResult>('/api/uploads/logo', {
    method: 'POST',
    body: toJsonBody(payload),
  });
}

export async function fetchComments() {
  return jsonRequest<CommentRecord[]>('/api/comments');
}

export async function updateComment(id: string, payload: CommentUpdateInput) {
  return jsonRequest<CommentRecord>(`/api/comments/${id}`, {
    method: 'PUT',
    body: toJsonBody(payload),
  });
}

export async function fetchAppeals() {
  return jsonRequest<AppealRecord[]>('/api/appeals');
}

export async function updateAppeal(id: string, payload: AppealUpdateInput) {
  return jsonRequest<AppealRecord>(`/api/appeals/${id}`, {
    method: 'PUT',
    body: toJsonBody(payload),
  });
}
