import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createPasswordHash } from "./auth.js";

export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "ChangeMe123!";

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, fallback = "") {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ") || fallback;
}

export function createDefaultStore() {
  const timestamp = "2026-03-21T00:00:00.000Z";

  return {
    settings: {
      openai: {
        baseUrl: "",
        apiKey: "",
        model: "gpt-4.1-mini",
        temperature: 0.8,
      },
      defaultSystemPrompt:
        "你是一名中文本地生活平台运营助手。请根据平台特点与品牌信息，生成自然、可信、没有 AI 痕迹的中文好评。",
      defaultPromptTemplate: [
        "请基于以下信息，为 {{platformName}} 上的 {{brandName}} 生成一条中文好评。",
        "要求：35 到 80 字，语气自然、真实，突出服务或产品细节，不要夸张，不要出现模板化表达。",
        "用户名称：{{userName}}",
        "订单号：{{orderNumber}}",
        "评分：{{rating}} 星",
        "补充信息：{{customerNote}}",
      ].join("\n"),
      appealSystemPrompt:
        "你是一名中文本地生活平台申诉助手。你需要先理解用户差评及其证据，再结合商家申诉内容与商家证据，生成理性、克制、可执行的反驳申诉文案。",
      appealPromptTemplate: [
        "请基于以下信息生成一段可直接提交的平台申诉文案。",
        "平台：{{platformName}}",
        "品牌：{{brandName}}",
        "用户差评文本：{{userComplaintText}}",
        "用户差评图片概览：{{userReviewImageHint}}（共 {{userReviewImageCount}} 张）",
        "商家申诉文本：{{merchantAppealText}}",
        "商家申诉图片概览：{{merchantAppealImageHint}}（共 {{merchantAppealImageCount}} 张）",
        "全部证据总览：{{imageHint}}",
        "输出要求：",
        "1. 先客观复述用户差评争议点；",
        "2. 再结合商家申诉内容与证据逐点回应并反驳；",
        "3. 最后提出具体申诉请求（复核、调整展示或移除不实内容）；",
        "4. 全文 120 到 260 字，语气专业且克制，不攻击用户。",
      ].join("\n"),
      appealTemplateMode: "default",
      defaultUserPrefix: "默认用户",
    },
    platforms: [
      {
        id: "platform-meituan",
        name: "美团",
        code: "meituan",
        description: "适合到店餐饮、团购、外卖等评价生成。",
        enabled: true,
        promptTemplate: [
          "你要为 {{platformName}} 生成一条适合本地生活场景的中文好评。",
          "品牌：{{brandName}}",
          "用户：{{userName}}",
          "订单号：{{orderNumber}}",
          "评分：{{rating}} 星",
          "补充信息：{{customerNote}}",
          "输出要求：40 到 70 字，真实、接地气，尽量体现服务顺畅、体验满意。",
        ].join("\n"),
        appealPromptTemplate: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "platform-eleme",
        name: "饿了么",
        code: "eleme",
        description: "适合外卖场景评论生成。",
        enabled: true,
        promptTemplate: [
          "请以消费者视角，为 {{platformName}} 上的 {{brandName}} 生成一条中文好评。",
          "用户：{{userName}}",
          "订单号：{{orderNumber}}",
          "评分：{{rating}} 星",
          "补充信息：{{customerNote}}",
          "要求：强调配送、包装、口味或服务感受，语言简洁自然。",
        ].join("\n"),
        appealPromptTemplate: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    brands: [
      {
        id: "brand-demo",
        name: "示例商标",
        logoUrl: "",
        note: "这里可以放品牌定位、门店特色或营销信息。",
        platformIds: ["platform-meituan", "platform-eleme"],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    defaultUsers: [],
    comments: [],
    appeals: [],
    counters: {
      guestUser: 0,
      comment: 0,
      appeal: 0,
    },
  };
}

export function hydrateState(raw) {
  const fallback = createDefaultStore();
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    ...fallback,
    ...source,
    settings: {
      ...fallback.settings,
      ...(source.settings ?? {}),
      openai: {
        ...fallback.settings.openai,
        ...(source.settings?.openai ?? {}),
      },
    },
    platforms: Array.isArray(source.platforms) ? source.platforms : fallback.platforms,
    brands: Array.isArray(source.brands) ? source.brands : fallback.brands,
    defaultUsers: Array.isArray(source.defaultUsers) ? source.defaultUsers : [],
    comments: Array.isArray(source.comments) ? source.comments : [],
    appeals: Array.isArray(source.appeals) ? source.appeals : [],
    counters: {
      ...fallback.counters,
      ...(source.counters ?? {}),
    },
  };
}

const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
  );
`;

export class SqliteStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.legacyDataFile = options.legacyDataFile;
    this.defaultAdminUsername =
      normalizeText(process.env.ADMIN_USERNAME) ||
      normalizeText(options.defaultAdminUsername) ||
      DEFAULT_ADMIN_USERNAME;
    this.defaultAdminPassword =
      normalizeText(process.env.ADMIN_PASSWORD) ||
      normalizeText(options.defaultAdminPassword) ||
      DEFAULT_ADMIN_PASSWORD;
    this.ensurePromise = null;
    this.writeQueue = Promise.resolve();
    this.db = null;
    this.bootstrapInfo = {
      seededAdmin: false,
      username: "",
      usedDefaultPassword: false,
    };
  }

  async ensure() {
    if (!this.ensurePromise) {
      this.ensurePromise = this.initialize();
    }

    return this.ensurePromise;
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(SCHEMA_SQL);
    this.cleanupExpiredSessionsSync();

    const stateRow = this.db.prepare("SELECT id FROM app_state WHERE id = 1").get();

    if (!stateRow) {
      let state = createDefaultStore();

      if (this.legacyDataFile && fsSync.existsSync(this.legacyDataFile)) {
        try {
          const raw = await fs.readFile(this.legacyDataFile, "utf8");
          const legacy = JSON.parse(raw);

          if (legacy && typeof legacy === "object") {
            state = hydrateState({
              ...state,
              ...legacy,
            });
          }
        } catch {
          state = createDefaultStore();
        }
      }

      this.writeSync(state);
    }

    this.ensureDefaultAdminSync();
  }

  getBootstrapInfo() {
    return this.bootstrapInfo;
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.ensurePromise = null;
    }
  }

  readSync() {
    const row = this.db.prepare("SELECT payload FROM app_state WHERE id = 1").get();
    return row ? hydrateState(JSON.parse(row.payload)) : createDefaultStore();
  }

  writeSync(data) {
    const nextState = hydrateState(data);
    nextState.updatedAt = nowIso();

    this.db
      .prepare(
        `
          INSERT INTO app_state (id, payload, updated_at)
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        `,
      )
      .run(JSON.stringify(nextState, null, 2), nextState.updatedAt);
  }

  cleanupExpiredSessionsSync() {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso());
  }

  ensureDefaultAdminSync() {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM admins").get();

    if (Number(row?.count || 0) > 0) {
      return;
    }

    const timestamp = nowIso();
    const { hash, salt } = createPasswordHash(this.defaultAdminPassword);
    const usedDefaultPassword = !normalizeText(process.env.ADMIN_PASSWORD);

    this.db
      .prepare(
        `
          INSERT INTO admins (
            id, username, password_hash, password_salt, must_change_password,
            created_at, updated_at, last_login_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        "admin-root",
        this.defaultAdminUsername,
        hash,
        salt,
        usedDefaultPassword ? 1 : 0,
        timestamp,
        timestamp,
        null,
      );

    this.bootstrapInfo = {
      seededAdmin: true,
      username: this.defaultAdminUsername,
      usedDefaultPassword,
    };
  }

  mapAdmin(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      mustChangePassword: Boolean(row.must_change_password),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
    };
  }

  async read() {
    await this.ensure();
    return this.readSync();
  }

  async write(data) {
    await this.ensure();
    this.writeSync(data);
  }

  async update(mutator) {
    await this.ensure();

    const run = async () => {
      const current = this.readSync();
      const draft = structuredClone(current);
      const result = await mutator(draft);
      this.writeSync(draft);
      return { data: draft, result };
    };

    this.writeQueue = this.writeQueue.catch(() => {}).then(run);
    return this.writeQueue;
  }

  async findAdminByUsername(username) {
    await this.ensure();
    const row = this.db
      .prepare("SELECT * FROM admins WHERE username = ?")
      .get(normalizeText(username));
    return this.mapAdmin(row);
  }

  async getAdminById(adminId) {
    await this.ensure();
    const row = this.db.prepare("SELECT * FROM admins WHERE id = ?").get(adminId);
    return this.mapAdmin(row);
  }

  async updateAdminPassword(adminId, passwordHash, passwordSalt, mustChangePassword) {
    await this.ensure();
    const updatedAt = nowIso();

    this.db
      .prepare(
        `
          UPDATE admins
          SET password_hash = ?, password_salt = ?, must_change_password = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(passwordHash, passwordSalt, mustChangePassword ? 1 : 0, updatedAt, adminId);

    return this.getAdminById(adminId);
  }

  async markAdminLogin(adminId) {
    await this.ensure();
    const timestamp = nowIso();

    this.db
      .prepare(
        `
          UPDATE admins
          SET last_login_at = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(timestamp, timestamp, adminId);
  }

  async createSession(sessionId, adminId, expiresAt) {
    await this.ensure();
    const createdAt = nowIso();

    this.db
      .prepare(
        `
          INSERT INTO sessions (id, admin_id, created_at, expires_at)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(sessionId, adminId, createdAt, expiresAt);

    return {
      id: sessionId,
      adminId,
      createdAt,
      expiresAt,
    };
  }

  async getSession(sessionId) {
    await this.ensure();
    this.cleanupExpiredSessionsSync();

    const row = this.db
      .prepare(
        `
          SELECT
            sessions.id AS session_id,
            sessions.created_at AS session_created_at,
            sessions.expires_at AS session_expires_at,
            admins.id,
            admins.username,
            admins.password_hash,
            admins.password_salt,
            admins.must_change_password,
            admins.created_at,
            admins.updated_at,
            admins.last_login_at
          FROM sessions
          JOIN admins ON admins.id = sessions.admin_id
          WHERE sessions.id = ?
            AND sessions.expires_at > ?
        `,
      )
      .get(normalizeText(sessionId), nowIso());

    if (!row) {
      return null;
    }

    return {
      id: row.session_id,
      createdAt: row.session_created_at,
      expiresAt: row.session_expires_at,
      admin: this.mapAdmin(row),
    };
  }

  async deleteSession(sessionId) {
    await this.ensure();
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(normalizeText(sessionId));
  }
}
