import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAppServer } from "../src/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dbFile = path.join(rootDir, "data", "smoke-test.db");
const SAMPLE_LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn5v9kAAAAASUVORK5CYII=";

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function getCookie(response) {
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

function pickBrandForPlatform(catalog, platformId) {
  return catalog.brands.find((brand) => {
    if (!Array.isArray(brand.platformIds) || brand.platformIds.length === 0) {
      return true;
    }

    return brand.platformIds.includes(platformId);
  });
}

const { server, store } = createAppServer({ rootDir, dbFile });
let uploadedLogoFile = "";

try {
  await store.ensure();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const sessionCheck = await request(baseUrl, "/api/admin/session");
  assert.equal(sessionCheck.data.authenticated, false, "初始状态应该未登录");

  const unauthorizedDashboard = await request(baseUrl, "/api/dashboard");
  assert.equal(unauthorizedDashboard.response.status, 401, "后台接口应该要求登录");

  const login = await request(baseUrl, "/api/admin/login", {
    method: "POST",
    body: JSON.stringify({
      username: "admin",
      password: "ChangeMe123!",
    }),
  });

  assert.equal(login.response.status, 200, "默认管理员应该可以登录");
  const cookie = getCookie(login.response);
  assert.ok(cookie.includes("admin_session="), "登录后应该返回会话 Cookie");

  const changePassword = await request(baseUrl, "/api/admin/password", {
    method: "PUT",
    headers: {
      Cookie: cookie,
    },
    body: JSON.stringify({
      currentPassword: "ChangeMe123!",
      newPassword: "ChangeMe456!",
    }),
  });

  assert.equal(changePassword.response.status, 200, "应该允许修改密码");

  const shortPassword = await request(baseUrl, "/api/admin/password", {
    method: "PUT",
    headers: {
      Cookie: cookie,
    },
    body: JSON.stringify({
      currentPassword: "ChangeMe456!",
      newPassword: "1234567",
    }),
  });
  assert.equal(shortPassword.response.status, 400, "过短密码应该被拦截");

  const loginWithOldPassword = await request(baseUrl, "/api/admin/login", {
    method: "POST",
    body: JSON.stringify({
      username: "admin",
      password: "ChangeMe123!",
    }),
  });
  assert.equal(loginWithOldPassword.response.status, 401, "旧密码应该失效");

  const loginWithNewPassword = await request(baseUrl, "/api/admin/login", {
    method: "POST",
    body: JSON.stringify({
      username: "admin",
      password: "ChangeMe456!",
    }),
  });

  const freshCookie = getCookie(loginWithNewPassword.response);
  assert.ok(freshCookie.includes("admin_session="), "新密码登录也应该成功");

  const settingsUpdate = await request(baseUrl, "/api/settings", {
    method: "PUT",
    headers: {
      Cookie: freshCookie,
    },
    body: JSON.stringify({
      defaultUserPrefix: "测试用户",
    }),
  });
  assert.equal(settingsUpdate.response.status, 200, "设置更新应该成功");

  const logoUpload = await request(baseUrl, "/api/uploads/logo", {
    method: "POST",
    headers: {
      Cookie: freshCookie,
    },
    body: JSON.stringify({
      filename: "smoke-logo.png",
      contentType: "image/png",
      contentBase64: SAMPLE_LOGO_BASE64,
    }),
  });
  assert.equal(logoUpload.response.status, 201, "后台应支持上传 Logo 图片");
  assert.match(logoUpload.data.url, /^\/uploads\/logos\//, "上传后应返回可访问的 Logo 地址");

  uploadedLogoFile = path.join(
    rootDir,
    "data",
    "uploads",
    decodeURIComponent(String(logoUpload.data.url || "").replace(/^\/uploads\//, "")),
  );

  const uploadedAsset = await fetch(`${baseUrl}${logoUpload.data.url}`);
  assert.equal(uploadedAsset.status, 200, "上传后的 Logo 地址应该可以访问");
  assert.equal(uploadedAsset.headers.get("content-type"), "image/png", "上传 Logo 应返回正确图片类型");

  const catalog = await request(baseUrl, "/api/public/catalog");
  assert.ok(catalog.data.platforms.length >= 2, "默认平台至少应该有 2 个");
  assert.ok(catalog.data.brands.length >= 1, "默认商标至少应该有 1 个");

  const platform = catalog.data.platforms[0];
  const brand = pickBrandForPlatform(catalog.data, platform.id);
  assert.ok(platform, "应该能选到可用平台");
  assert.ok(brand, "应该能选到匹配平台的商标");

  const record = await request(baseUrl, "/api/comments/generate", {
    method: "POST",
    body: JSON.stringify({
      platformId: platform.id,
      brandId: brand.id,
      orderNumber: "",
      customerNote: "出餐很快，包装完整，整体体验不错",
      rating: "5",
    }),
  });

  assert.equal(record.response.status, 201, "公开评论生成接口应该可用");
  assert.ok(record.data.review, "应该生成评论内容");
  assert.equal(record.data.userName.startsWith("测试用户"), true, "未填单号时应生成默认用户");
  assert.equal(record.data.reviewStatus, "pending", "新生成评论默认应为待审核");

  const reviewUpdate = await request(
    baseUrl,
    `/api/comments/${encodeURIComponent(record.data.id)}`,
    {
      method: "PUT",
      headers: {
        Cookie: freshCookie,
      },
      body: JSON.stringify({
        review: "人工确认后的评论内容，语气更自然。",
        reviewStatus: "approved",
        reviewNote: "已人工审核并通过",
      }),
    },
  );

  assert.equal(reviewUpdate.response.status, 200, "后台应支持人工编辑评论");
  assert.equal(reviewUpdate.data.reviewStatus, "approved", "评论应可更新为已通过");
  assert.equal(reviewUpdate.data.originalReview, record.data.review, "应保留 AI 初稿");

  const createdPlatform = await request(baseUrl, "/api/platforms", {
    method: "POST",
    headers: {
      Cookie: freshCookie,
    },
    body: JSON.stringify({
      name: "测试平台",
      code: "test-platform",
      description: "用于冒烟验证",
      enabled: true,
      promptTemplate: "请为 {{platformName}} 和 {{brandName}} 生成自然中文好评。",
    }),
  });
  assert.equal(createdPlatform.response.status, 201, "后台应支持新增平台");

  const createdBrand = await request(baseUrl, "/api/brands", {
    method: "POST",
    headers: {
      Cookie: freshCookie,
    },
    body: JSON.stringify({
      name: "测试商标",
      logoUrl: logoUpload.data.url,
      note: "用于冒烟验证",
      platformIds: [createdPlatform.data.id],
    }),
  });
  assert.equal(createdBrand.response.status, 201, "后台应支持新增商标");
  assert.equal(createdBrand.data.logoUrl, logoUpload.data.url, "上传后的 Logo 地址应可保存到商标");
 
  const updatedBrand = await request(baseUrl, `/api/brands/${encodeURIComponent(createdBrand.data.id)}`, {
    method: "PUT",
    headers: {
      Cookie: freshCookie,
    },
    body: JSON.stringify({
      name: createdBrand.data.name,
      logoUrl: createdBrand.data.logoUrl,
      note: "smoke test updated note",
      platformIds: [createdPlatform.data.id],
    }),
  });
  assert.equal(updatedBrand.response.status, 200, "brand update should succeed");
 

  const dashboard = await request(baseUrl, "/api/dashboard", {
    headers: {
      Cookie: freshCookie,
    },
  });
  assert.equal(dashboard.response.status, 200, "登录后应该能读取后台概览");
  assert.ok(dashboard.data.comments.length >= 1, "后台应该能看到评论记录");
  assert.ok(dashboard.data.defaultUsers.length >= 1, "后台应该能看到默认用户");
  assert.equal(dashboard.data.summary.platformCount >= 3, true, "应该统计平台数量");
  assert.equal(dashboard.data.summary.brandCount >= 2, true, "应该统计商标数量");
  assert.equal(dashboard.data.summary.pendingReviewCount, 0, "审核通过后不应保留待审核评论");

  const updatedPlatform = dashboard.data.platforms.find((item) => item.id === createdPlatform.data.id);
  assert.ok(updatedPlatform, "created platform should be present in dashboard");
  assert.equal(updatedPlatform.updatedAt >= createdPlatform.data.updatedAt, true, "platform updatedAt should refresh after brand update");
  const reviewedComment = dashboard.data.comments.find((comment) => comment.id === record.data.id);
  assert.equal(reviewedComment?.reviewStatus, "approved", "后台应该能看到已审核状态");
  assert.equal(
    reviewedComment?.review,
    "人工确认后的评论内容，语气更自然。",
    "后台应该能看到人工编辑后的评论",
  );

  console.log("Smoke test passed");
  console.log(
    JSON.stringify(
      {
        admin: loginWithNewPassword.data.admin?.username,
        generatedCommentId: record.data.id,
        logoUrl: logoUpload.data.url,
        platformCount: dashboard.data.summary.platformCount,
        brandCount: dashboard.data.summary.brandCount,
        pendingReviewCount: dashboard.data.summary.pendingReviewCount,
        provider: record.data.provider,
        userName: record.data.userName,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await store.close();
  await fs.rm(uploadedLogoFile, { force: true });
  await fs.rm(dbFile, { force: true });
  await fs.rm(`${dbFile}-shm`, { force: true });
  await fs.rm(`${dbFile}-wal`, { force: true });
}
