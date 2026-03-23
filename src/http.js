import fs from "node:fs/promises";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("请求体不是合法的 JSON。");
  }
}

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);

  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });

  res.end(body);
}

export function sendText(
  res,
  statusCode,
  body,
  contentType = "text/plain; charset=utf-8"
) {
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body)
  });

  res.end(body);
}

export function sendEmpty(res, statusCode = 204) {
  res.writeHead(statusCode, CORS_HEADERS);
  res.end();
}

export async function sendFile(res, filePath, contentType) {
  const body = await fs.readFile(filePath);

  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Type": contentType,
    "Content-Length": body.length
  });

  res.end(body);
}

export function getContentType(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filePath.endsWith(".gif")) {
    return "image/gif";
  }

  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }

  if (filePath.endsWith(".ico")) {
    return "image/x-icon";
  }

  return "application/octet-stream";
}
