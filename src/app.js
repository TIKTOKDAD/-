import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

import {
  getContentType,
  readJsonBody,
  sendEmpty,
  sendFile,
  sendJson,
  sendText,
} from "./http.js";
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  createPasswordHash,
  createSessionToken,
  getSessionTokenFromRequest,
  verifyPassword,
} from "./auth.js";
import {
  generateAppealRecord,
  generateCommentRecord,
  testAIConnection,
  testAIVisionConnection,
} from "./review-service.js";
import { SqliteStore } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT_DIR = path.resolve(__dirname, "..");
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 168);
const VALID_COMMENT_STATUSES = new Set(["pending", "approved", "rejected"]);
const LOGO_UPLOAD_SIZE_LIMIT = 5 * 1024 * 1024;
const LOGO_UPLOAD_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
]);

function normalizeText(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function createSlug(value, fallbackPrefix) {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `${fallbackPrefix}-${slug}` : `${fallbackPrefix}-${Date.now()}`;
}

function normalizeCommentRecord(comment) {
  const review = normalizeText(comment?.review);

  return {
    ...(comment ?? {}),
    review,
    originalReview: normalizeText(comment?.originalReview, review),
    reviewStatus: normalizeText(comment?.reviewStatus, "pending"),
    reviewNote: normalizeText(comment?.reviewNote),
    editedAt: normalizeText(comment?.editedAt),
    reviewedAt: normalizeText(comment?.reviewedAt),
    publishedAt: normalizeText(comment?.publishedAt),
    updatedAt: normalizeText(comment?.updatedAt, normalizeText(comment?.createdAt)),
  };
}

function normalizeAppealRecord(appeal) {
  const appealText = normalizeText(appeal?.appealText);

  return {
    ...(appeal ?? {}),
    complaintText: normalizeText(appeal?.complaintText),
    merchantNote: normalizeText(appeal?.merchantNote),
    appealText,
    originalAppealText: normalizeText(appeal?.originalAppealText, appealText),
    reviewStatus: normalizeText(appeal?.reviewStatus, "pending"),
    reviewNote: normalizeText(appeal?.reviewNote),
    reviewedAt: normalizeText(appeal?.reviewedAt),
    updatedAt: normalizeText(appeal?.updatedAt, normalizeText(appeal?.createdAt)),
    evidenceImages: Array.isArray(appeal?.evidenceImages) ? appeal.evidenceImages : [],
    userReviewImages: Array.isArray(appeal?.userReviewImages) ? appeal.userReviewImages : [],
    merchantAppealImages: Array.isArray(appeal?.merchantAppealImages)
      ? appeal.merchantAppealImages
      : [],
  };
}

function ensureStateDefaults(draft) {
  draft.defaultUsers = Array.isArray(draft.defaultUsers) ? draft.defaultUsers : [];
  draft.comments = Array.isArray(draft.comments)
    ? draft.comments.map((comment) => normalizeCommentRecord(comment))
    : [];
  draft.appeals = Array.isArray(draft.appeals)
    ? draft.appeals.map((appeal) => normalizeAppealRecord(appeal))
    : [];
  draft.counters = {
    guestUser: 0,
    comment: 0,
    appeal: 0,
    ...(draft.counters ?? {}),
  };
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createRecentDateKeys(days) {
  const result = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(today);
    cursor.setDate(today.getDate() - offset);
    result.push(toDateKey(cursor));
  }

  return result;
}

function buildProcessingTrend(appeals, days = 7) {
  const dateKeys = createRecentDateKeys(days);
  const bucket = new Map(
    dateKeys.map((date) => [date, { date, completedCount: 0, totalProcessingHours: 0 }]),
  );

  appeals.forEach((item) => {
    if (!["approved", "rejected"].includes(item.reviewStatus)) {
      return;
    }

    const createdAt = new Date(item.createdAt);
    const reviewedAt = new Date(item.reviewedAt);

    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(reviewedAt.getTime())) {
      return;
    }

    const dateKey = toDateKey(reviewedAt);
    const target = bucket.get(dateKey);

    if (!target) {
      return;
    }

    const durationHours = Math.max(0, reviewedAt.getTime() - createdAt.getTime()) / 3600000;
    target.completedCount += 1;
    target.totalProcessingHours += durationHours;
  });

  return dateKeys.map((date) => {
    const item = bucket.get(date) || { date, completedCount: 0, totalProcessingHours: 0 };
    const avg =
      item.completedCount > 0
        ? Number((item.totalProcessingHours / item.completedCount).toFixed(1))
        : 0;

    return {
      date,
      completedCount: item.completedCount,
      avgProcessingHours: avg,
    };
  });
}

function pickDashboard(data) {
  const comments = [...(data.comments ?? [])]
    .map((comment) => normalizeCommentRecord(comment))
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt || "").localeCompare(
        String(a.updatedAt || a.createdAt || ""),
      ),
    );
  const appeals = [...(data.appeals ?? [])]
    .map((appeal) => normalizeAppealRecord(appeal))
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt || "").localeCompare(
        String(a.updatedAt || a.createdAt || ""),
      ),
    );
  const pendingAppealCount = appeals.filter((item) => item.reviewStatus === "pending").length;
  const approvedAppealCount = appeals.filter((item) => item.reviewStatus === "approved").length;
  const rejectedAppealCount = appeals.filter((item) => item.reviewStatus === "rejected").length;
  const processingTrend = buildProcessingTrend(appeals, 7);
  const todayKey = toDateKey(new Date());
  const todayNewAppealCount = appeals.filter((item) => toDateKey(item.createdAt) === todayKey).length;

  return {
    summary: {
      platformCount: data.platforms.length,
      brandCount: data.brands.length,
      defaultUserCount: data.defaultUsers.length,
      pendingReviewCount: comments.filter((item) => item.reviewStatus === "pending").length,
      commentCount: comments.length,
      appealCount: appeals.length,
      pendingAppealCount,
      approvedAppealCount,
      rejectedAppealCount,
      todayNewAppealCount,
    },
    settings: data.settings,
    platforms: [...data.platforms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    brands: [...data.brands].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    defaultUsers: [...data.defaultUsers].slice(0, 20),
    comments: comments.slice(0, 50),
    appeals: appeals.slice(0, 50),
    processingTrend,
  };
}

function pickPublicCatalog(data) {
  const platforms = data.platforms.filter((item) => item.enabled);
  const platformIds = new Set(platforms.map((item) => item.id));
  const brands = data.brands.filter((brand) => {
    if (!Array.isArray(brand.platformIds) || brand.platformIds.length === 0) {
      return true;
    }

    return brand.platformIds.some((platformId) => platformIds.has(platformId));
  });

  return { platforms, brands };
}

function ensurePlatformPayload(payload) {
  const name = normalizeText(payload.name);
  const code = normalizeText(payload.code);

  if (!name) {
    throw new HttpError(400, "平台名称不能为空。");
  }

  if (!code) {
    throw new HttpError(400, "平台编码不能为空。");
  }

  return {
    name,
    code,
    description: normalizeText(payload.description),
    enabled: payload.enabled !== false,
    promptTemplate: normalizeText(payload.promptTemplate),
    appealPromptTemplate: normalizeText(payload.appealPromptTemplate),
  };
}

function ensureBrandPayload(payload) {
  const name = normalizeText(payload.name);

  if (!name) {
    throw new HttpError(400, "商标名称不能为空。");
  }

  return {
    name,
    logoUrl: normalizeText(payload.logoUrl),
    note: normalizeText(payload.note),
    platformIds: Array.isArray(payload.platformIds)
      ? payload.platformIds.map((item) => normalizeText(item)).filter(Boolean)
      : [],
  };
}

function touchPlatformsUpdatedAt(draft, platformIds, timestamp = nowIso()) {
  const ids = new Set((platformIds ?? []).map((item) => normalizeText(item)).filter(Boolean));

  if (ids.size === 0) {
    return;
  }

  draft.platforms.forEach((platform) => {
    if (ids.has(platform.id)) {
      platform.updatedAt = timestamp;
    }
  });
}

function mergeSettings(draftSettings, payload) {
  draftSettings.openai.baseUrl = normalizeText(
    payload.openai?.baseUrl ?? draftSettings.openai.baseUrl,
  );
  draftSettings.openai.apiKey = normalizeText(
    payload.openai?.apiKey ?? draftSettings.openai.apiKey,
  );
  draftSettings.openai.model =
    normalizeText(payload.openai?.model ?? draftSettings.openai.model) || "gpt-4.1-mini";
  draftSettings.openai.temperature = Number.isFinite(Number(payload.openai?.temperature))
    ? Number(payload.openai.temperature)
    : Number(draftSettings.openai.temperature) || 0.8;
  draftSettings.defaultSystemPrompt = normalizeText(
    payload.defaultSystemPrompt ?? draftSettings.defaultSystemPrompt,
  );
  draftSettings.defaultPromptTemplate = normalizeText(
    payload.defaultPromptTemplate ?? draftSettings.defaultPromptTemplate,
  );
  draftSettings.appealSystemPrompt = normalizeText(
    payload.appealSystemPrompt ?? draftSettings.appealSystemPrompt,
  );
  draftSettings.appealPromptTemplate = normalizeText(
    payload.appealPromptTemplate ?? draftSettings.appealPromptTemplate,
  );
  const nextAppealTemplateMode = normalizeText(
    payload.appealTemplateMode ?? draftSettings.appealTemplateMode,
    "default",
  );
  draftSettings.appealTemplateMode =
    nextAppealTemplateMode === "platform" ? "platform" : "default";
  draftSettings.defaultUserPrefix =
    normalizeText(payload.defaultUserPrefix ?? draftSettings.defaultUserPrefix) || "默认用户";
}

function matchId(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return "";
  }

  return decodeURIComponent(pathname.slice(prefix.length));
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sanitizeAdmin(admin) {
  return admin
    ? {
        id: admin.id,
        username: admin.username,
        mustChangePassword: Boolean(admin.mustChangePassword),
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
        lastLoginAt: admin.lastLoginAt,
      }
    : null;
}

async function getSession(req, store) {
  const sessionToken = getSessionTokenFromRequest(req);

  if (!sessionToken) {
    return null;
  }

  return store.getSession(sessionToken);
}

function requireAdmin(session) {
  if (!session) {
    throw new HttpError(401, "请先登录后台。");
  }
}

function isInsideDir(targetPath, rootDir) {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedTarget = path.resolve(targetPath);
  const rootWithSeparator = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;

  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(rootWithSeparator);
}

function ensureLogoUploadPayload(payload) {
  const originalName = normalizeText(payload.filename, "logo");
  const contentType = normalizeText(payload.contentType ?? payload.mimeType).toLowerCase();
  const contentBase64 = normalizeText(payload.contentBase64);
  const extension = LOGO_UPLOAD_TYPES.get(contentType);

  if (!extension) {
    throw new HttpError(400, "Logo ??? PNG?JPG?GIF ? WEBP ???");
  }

  if (!contentBase64) {
    throw new HttpError(400, "???????? Logo ???");
  }

  const buffer = Buffer.from(contentBase64, "base64");

  if (!buffer.length) {
    throw new HttpError(400, "??????????");
  }

  if (buffer.length > LOGO_UPLOAD_SIZE_LIMIT) {
    throw new HttpError(400, "Logo ???????? 5 MB?");
  }

  return {
    buffer,
    contentType,
    extension,
    originalName,
  };
}

async function saveLogoUpload(logosRoot, payload) {
  await fs.mkdir(logosRoot, { recursive: true });
  const originalBaseName = path.basename(payload.originalName, path.extname(payload.originalName));
  const baseName =
    normalizeText(originalBaseName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "logo";
  const fileName = baseName + "-" + Date.now() + "-" + randomUUID() + payload.extension;
  const filePath = path.join(logosRoot, fileName);

  await fs.writeFile(filePath, payload.buffer);

  return {
    fileName,
    contentType: payload.contentType,
    size: payload.buffer.length,
    url: "/uploads/logos/" + encodeURIComponent(fileName),
  };
}

async function resolveUploadAsset(uploadsRoot, pathname) {
  if (!pathname.startsWith("/uploads/")) {
    return "";
  }

  const relativePath = decodeURIComponent(pathname.slice("/uploads/".length));

  if (!relativePath) {
    return "";
  }

  try {
    const rootStat = await fs.stat(uploadsRoot);

    if (!rootStat.isDirectory()) {
      return "";
    }
  } catch {
    return "";
  }

  const assetPath = path.resolve(uploadsRoot, relativePath);

  if (!isInsideDir(assetPath, uploadsRoot)) {
    throw new HttpError(403, "?????");
  }

  try {
    const stat = await fs.stat(assetPath);

    if (stat.isFile()) {
      return assetPath;
    }
  } catch {
    return "";
  }

  return "";
}

async function resolveAdminAsset(adminRoot, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const hasExtension = Boolean(path.extname(pathname));

  try {
    const rootStat = await fs.stat(adminRoot);

    if (!rootStat.isDirectory()) {
      return "";
    }
  } catch {
    return "";
  }

  const assetPath = path.resolve(adminRoot, relativePath);

  if (!isInsideDir(assetPath, adminRoot)) {
    throw new HttpError(403, "禁止访问。");
  }

  try {
    const stat = await fs.stat(assetPath);

    if (stat.isFile()) {
      return assetPath;
    }
  } catch {
    // Ignore and fall back to SPA index below.
  }

  if (!hasExtension) {
    const indexPath = path.resolve(adminRoot, "index.html");

    try {
      const stat = await fs.stat(indexPath);

      if (stat.isFile()) {
        return indexPath;
      }
    } catch {
      return "";
    }
  }

  return "";
}

export function createAppServer(options = {}) {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const adminRoot = path.join(rootDir, "admin-pro", "dist");
  const uploadsRoot = path.join(rootDir, "data", "uploads");
  const logoUploadsRoot = path.join(uploadsRoot, "logos");
  const dbFile = options.dbFile ?? path.join(rootDir, "data", "app.db");
  const legacyDataFile =
    options.legacyDataFile ?? path.join(rootDir, "data", "store.json");
  const store = new SqliteStore(dbFile, { legacyDataFile });

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    const session = await getSession(req, store);

    try {
      if (req.method === "OPTIONS") {
        sendEmpty(res);
        return;
      }

      if (pathname === "/api/health" && req.method === "GET") {
        sendJson(res, 200, { status: "ok", now: nowIso() });
        return;
      }

      if (pathname === "/api/public/catalog" && req.method === "GET") {
        const data = await store.read();
        sendJson(res, 200, pickPublicCatalog(data));
        return;
      }

      if (pathname === "/api/comments/generate" && req.method === "POST") {
        const body = await readJsonBody(req);
        const record = await generateCommentRecord(store, body);
        sendJson(res, 201, record);
        return;
      }

      if (pathname === "/api/appeals/generate" && req.method === "POST") {
        const body = await readJsonBody(req);
        const record = await generateAppealRecord(store, body);
        sendJson(res, 201, record);
        return;
      }

      if (pathname === "/api/admin/session" && req.method === "GET") {
        sendJson(res, 200, {
          authenticated: Boolean(session),
          admin: sanitizeAdmin(session?.admin),
        });
        return;
      }

      if (pathname === "/api/admin/login" && req.method === "POST") {
        const body = await readJsonBody(req);
        const username = normalizeText(body.username);
        const password = normalizeText(body.password);

        if (!username || !password) {
          throw new HttpError(400, "用户名和密码不能为空。");
        }

        const admin = await store.findAdminByUsername(username);

        if (!admin || !verifyPassword(password, admin.passwordHash, admin.passwordSalt)) {
          throw new HttpError(401, "用户名或密码错误。");
        }

        const sessionToken = createSessionToken();
        const expiresAt = new Date(
          Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000,
        ).toISOString();

        await store.createSession(sessionToken, admin.id, expiresAt);
        await store.markAdminLogin(admin.id);

        res.setHeader("Set-Cookie", buildSessionCookie(sessionToken, expiresAt));
        sendJson(res, 200, {
          authenticated: true,
          admin: sanitizeAdmin(await store.getAdminById(admin.id)),
        });
        return;
      }

      if (pathname === "/api/admin/logout" && req.method === "POST") {
        const sessionToken = getSessionTokenFromRequest(req);

        if (sessionToken) {
          await store.deleteSession(sessionToken);
        }

        res.setHeader("Set-Cookie", buildClearedSessionCookie());
        sendJson(res, 200, { success: true });
        return;
      }

      if (pathname === "/api/admin/password" && req.method === "PUT") {
        requireAdmin(session);
        const body = await readJsonBody(req);
        const currentPassword = normalizeText(body.currentPassword);
        const newPassword = normalizeText(body.newPassword);
        const admin = await store.getAdminById(session.admin.id);

        if (!admin || !verifyPassword(currentPassword, admin.passwordHash, admin.passwordSalt)) {
          throw new HttpError(400, "当前密码不正确。");
        }

        if (newPassword.length < 8) {
          throw new HttpError(400, "新密码至少需要 8 位。");
        }

        const { hash, salt } = createPasswordHash(newPassword);
        const updatedAdmin = await store.updateAdminPassword(admin.id, hash, salt, false);

        sendJson(res, 200, { admin: sanitizeAdmin(updatedAdmin) });
        return;
      }

      if (pathname === "/api/dashboard" && req.method === "GET") {
        requireAdmin(session);
        const data = await store.read();
        sendJson(res, 200, pickDashboard(data));
        return;
      }

      if (pathname === "/api/settings" && req.method === "GET") {
        requireAdmin(session);
        const data = await store.read();
        sendJson(res, 200, data.settings);
        return;
      }

      if (pathname === "/api/settings" && req.method === "PUT") {
        requireAdmin(session);
        const body = await readJsonBody(req);
        const { result } = await store.update((draft) => {
          mergeSettings(draft.settings, body);
          return draft.settings;
        });

        sendJson(res, 200, result);
        return;
      }

      if (pathname === "/api/settings/test-ai" && req.method === "POST") {
        requireAdmin(session);
        const body = await readJsonBody(req);
        const data = await store.read();
        const testSettings = structuredClone(data.settings ?? {});

        mergeSettings(testSettings, body ?? {});
        const result = await testAIConnection({ openai: testSettings.openai });
        sendJson(res, 200, result);
        return;
      }

      if (pathname === "/api/settings/test-ai-vision" && req.method === "POST") {
        requireAdmin(session);
        const body = await readJsonBody(req);
        const data = await store.read();
        const testSettings = structuredClone(data.settings ?? {});

        mergeSettings(testSettings, body ?? {});
        const result = await testAIVisionConnection(
          { openai: testSettings.openai },
          body?.imageUrl,
        );
        sendJson(res, 200, result);
        return;
      }

      if (pathname === "/api/platforms" && req.method === "GET") {
        requireAdmin(session);
        const data = await store.read();
        sendJson(res, 200, data.platforms);
        return;
      }

      if (pathname === "/api/platforms" && req.method === "POST") {
        requireAdmin(session);
        const body = await readJsonBody(req);
        const input = ensurePlatformPayload(body);
        const { result } = await store.update((draft) => {
          const duplicate = draft.platforms.find(
            (item) =>
              normalizeText(item.name) === input.name ||
              (input.code && normalizeText(item.code) === input.code),
          );

          if (duplicate) {
            throw new HttpError(400, "平台名称或编码已存在。");
          }

          const timestamp = nowIso();
          const platform = {
            id: createSlug(input.code || input.name, "platform"),
            ...input,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          draft.platforms.unshift(platform);
          return platform;
        });

        sendJson(res, 201, result);
        return;
      }

      if (pathname.startsWith("/api/platforms/")) {
        requireAdmin(session);
        const platformId = matchId(pathname, "/api/platforms/");

        if (req.method === "PUT") {
          const body = await readJsonBody(req);
          const input = ensurePlatformPayload(body);
          const { result } = await store.update((draft) => {
            const platform = draft.platforms.find((item) => item.id === platformId);

            if (!platform) {
              throw new HttpError(404, "要更新的平台不存在。");
            }

            const duplicate = draft.platforms.find(
              (item) =>
                item.id !== platformId &&
                (normalizeText(item.name) === input.name ||
                  (input.code && normalizeText(item.code) === input.code)),
            );

            if (duplicate) {
              throw new HttpError(400, "平台名称或编码已被其他平台使用。");
            }

            Object.assign(platform, input, { updatedAt: nowIso() });
            return platform;
          });

          sendJson(res, 200, result);
          return;
        }

        if (req.method === "DELETE") {
          const { result } = await store.update((draft) => {
            ensureStateDefaults(draft);
            const index = draft.platforms.findIndex((item) => item.id === platformId);

            if (index === -1) {
              throw new HttpError(404, "要删除的平台不存在。");
            }

            const [removed] = draft.platforms.splice(index, 1);
            draft.brands = draft.brands
              .map((brand) => ({
                ...brand,
                platformIds: (brand.platformIds ?? []).filter((item) => item !== platformId),
                updatedAt: nowIso(),
              }))
              .filter((brand) => (brand.platformIds ?? []).length > 0);
            return removed;
          });

          sendJson(res, 200, result);
          return;
        }
      }

      if (pathname === "/api/brands" && req.method === "GET") {
        requireAdmin(session);
        const data = await store.read();
        sendJson(res, 200, data.brands);
        return;
      }

      if (pathname === "/api/brands" && req.method === "POST") {
        requireAdmin(session);
        const body = await readJsonBody(req);
        const input = ensureBrandPayload(body);
        const { result } = await store.update((draft) => {
          const duplicate = draft.brands.find(
            (item) => normalizeText(item.name) === input.name,
          );

          if (duplicate) {
            throw new HttpError(400, "商标名称已存在。");
          }

          const timestamp = nowIso();
          const brand = {
            id: createSlug(input.name, "brand"),
            ...input,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          draft.brands.unshift(brand);
          touchPlatformsUpdatedAt(draft, brand.platformIds, timestamp);
          return brand;
        });

        sendJson(res, 201, result);
        return;
      }

      if (pathname.startsWith("/api/brands/")) {
        requireAdmin(session);
        const brandId = matchId(pathname, "/api/brands/");

        if (req.method === "PUT") {
          const body = await readJsonBody(req);
          const input = ensureBrandPayload(body);
          const { result } = await store.update((draft) => {
            const brand = draft.brands.find((item) => item.id === brandId);

            if (!brand) {
              throw new HttpError(404, "要更新的商标不存在。");
            }

            const duplicate = draft.brands.find(
              (item) => item.id !== brandId && normalizeText(item.name) === input.name,
            );

            if (duplicate) {
              throw new HttpError(400, "商标名称已被其他记录使用。");
            }

            const timestamp = nowIso();
            const relatedPlatformIds = new Set([...(brand.platformIds ?? []), ...(input.platformIds ?? [])]);
            Object.assign(brand, input, { updatedAt: timestamp });
            touchPlatformsUpdatedAt(draft, Array.from(relatedPlatformIds), timestamp);
            return brand;
          });

          sendJson(res, 200, result);
          return;
        }

        if (req.method === "DELETE") {
          const { result } = await store.update((draft) => {
            ensureStateDefaults(draft);
            const index = draft.brands.findIndex((item) => item.id === brandId);

            if (index === -1) {
              throw new HttpError(404, "要删除的商标不存在。");
            }

            const [removed] = draft.brands.splice(index, 1);
            touchPlatformsUpdatedAt(draft, removed.platformIds, nowIso());
            return removed;
          });

          sendJson(res, 200, result);
          return;
        }
      }

      if (pathname === "/api/uploads/logo" && req.method === "POST") {
        requireAdmin(session);
        const body = await readJsonBody(req);
        const upload = ensureLogoUploadPayload(body);
        const result = await saveLogoUpload(logoUploadsRoot, upload);
        sendJson(res, 201, result);
        return;
      }

      if (pathname === "/api/default-users" && req.method === "GET") {
        requireAdmin(session);
        const data = await store.read();
        sendJson(res, 200, data.defaultUsers);
        return;
      }

      if (pathname === "/api/comments" && req.method === "GET") {
        requireAdmin(session);
        const data = await store.read();
        sendJson(
          res,
          200,
          (data.comments ?? []).map((comment) => normalizeCommentRecord(comment)),
        );
        return;
      }

      if (pathname === "/api/appeals" && req.method === "GET") {
        requireAdmin(session);
        const data = await store.read();
        sendJson(res, 200, data.appeals ?? []);
        return;
      }

      if (pathname.startsWith("/api/appeals/")) {
        requireAdmin(session);
        const appealId = matchId(pathname, "/api/appeals/");

        if (req.method === "PUT") {
          const body = await readJsonBody(req);
          const { result } = await store.update((draft) => {
            ensureStateDefaults(draft);
            const appeal = (draft.appeals ?? []).find((item) => item.id === appealId);

            if (!appeal) {
              throw new HttpError(404, "要更新的申诉记录不存在。");
            }

            const nextContent = normalizeText(body.appealText ?? appeal.appealText);
            const nextStatus = normalizeText(body.reviewStatus ?? (appeal.reviewStatus || "pending"));
            const nextNote = normalizeText(body.reviewNote ?? appeal.reviewNote);

            if (!nextContent) {
              throw new HttpError(400, "申诉内容不能为空。");
            }

            if (!VALID_COMMENT_STATUSES.has(nextStatus)) {
              throw new HttpError(400, "审核状态不合法。");
            }

            const timestamp = nowIso();
            appeal.appealText = nextContent;
            appeal.reviewStatus = nextStatus;
            appeal.reviewNote = nextNote;
            appeal.updatedAt = timestamp;
            appeal.reviewedAt = nextStatus === "pending" ? "" : appeal.reviewedAt || timestamp;
            return appeal;
          });

          sendJson(res, 200, result);
          return;
        }

        return;
      }

      if (pathname.startsWith("/api/comments/")) {
        requireAdmin(session);
        const commentId = matchId(pathname, "/api/comments/");

        if (req.method === "PUT") {
          const body = await readJsonBody(req);
          const { result } = await store.update((draft) => {
            ensureStateDefaults(draft);
            const comment = draft.comments.find((item) => item.id === commentId);

            if (!comment) {
              throw new HttpError(404, "要更新的评论记录不存在。");
            }

            const current = normalizeCommentRecord(comment);
            const review =
              body.review === undefined ? current.review : normalizeText(body.review);
            const reviewStatus =
              body.reviewStatus === undefined
                ? current.reviewStatus
                : normalizeText(body.reviewStatus);
            const reviewNote =
              body.reviewNote === undefined
                ? current.reviewNote
                : normalizeText(body.reviewNote);

            if (!review) {
              throw new HttpError(400, "评论内容不能为空。");
            }

            if (!VALID_COMMENT_STATUSES.has(reviewStatus)) {
              throw new HttpError(400, "审核状态不合法。");
            }

            const timestamp = nowIso();
            const reviewChanged = review !== current.review;
            const statusChanged = reviewStatus !== current.reviewStatus;

            comment.review = review;
            comment.originalReview = current.originalReview;
            comment.reviewStatus = reviewStatus;
            comment.reviewNote = reviewNote;
            comment.editedAt = reviewChanged ? timestamp : current.editedAt;
            comment.reviewedAt = statusChanged
              ? reviewStatus === "pending"
                ? ""
                : timestamp
              : current.reviewedAt;
            comment.publishedAt =
              reviewStatus === "approved" ? current.publishedAt || timestamp : "";
            comment.updatedAt = timestamp;

            return normalizeCommentRecord(comment);
          });

          sendJson(res, 200, result);
          return;
        }

        return;
      }

      const uploadAssetPath = await resolveUploadAsset(uploadsRoot, pathname);

      if (uploadAssetPath) {
        await sendFile(res, uploadAssetPath, getContentType(uploadAssetPath));
        return;
      }

      const assetPath = await resolveAdminAsset(adminRoot, pathname);

      if (!assetPath) {
        sendText(res, 404, "未找到页面。");
        return;
      }

      await sendFile(res, assetPath, getContentType(assetPath));
    } catch (error) {
      const statusCode = error.statusCode || 400;
      sendJson(res, statusCode, {
        message: error.message || "服务处理失败。",
      });
    }
  });

  return { server, store, rootDir, dbFile };
}
