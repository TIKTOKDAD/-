import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "admin_session";

function normalizeText(value) {
  return String(value ?? "").trim();
}

export function createPasswordHash(password, salt = randomBytes(16).toString("hex")) {
  const normalizedPassword = normalizeText(password);

  if (normalizedPassword.length < 8) {
    throw new Error("密码至少需要 8 位。");
  }

  const hash = scryptSync(normalizedPassword, Buffer.from(salt, "hex"), 64).toString(
    "hex"
  );

  return { salt, hash };
}

export function verifyPassword(password, expectedHash, salt) {
  const normalizedPassword = normalizeText(password);

  if (!normalizedPassword || !expectedHash || !salt) {
    return false;
  }

  const actualHash = scryptSync(
    normalizedPassword,
    Buffer.from(salt, "hex"),
    64
  ).toString("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function parseCookies(cookieHeader) {
  return String(cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

export function getSessionTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return normalizeText(cookies[SESSION_COOKIE_NAME]);
}

export function buildSessionCookie(token, expiresAt) {
  const expiryDate = new Date(expiresAt);
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((expiryDate.getTime() - Date.now()) / 1000)
  );

  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiryDate.toUTCString()}`,
    `Max-Age=${maxAgeSeconds}`
  ].join("; ");
}

export function buildClearedSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ].join("; ");
}
