export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization"
};

export const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify({ code: status, data }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
  });
}

export function jsonError(message, status, extraHeaders = {}, errorCode = null, errorMeta = null) {
  const body = { code: status, message };
  if (errorCode) body.errorCode = errorCode;
  if (errorMeta) body.errorMeta = errorMeta;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
  });
}

export function clampPage(value) {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function clampLimit(value, defaultLimit = 20, maxLimit = 50) {
  if (value === null || value === undefined || value === "") return defaultLimit;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
  return Math.min(Math.floor(parsed), maxLimit);
}

export function safeParseJson(value) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function parseJsonBody(request) {
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "JSON body must be an object" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
}

/**
 * 从 URL 路径前缀提取正整数资源 ID（如 /admin/rules/12 -> 12）。
 */
export function parseResourceId(pathname, prefix) {
  const id = Number(pathname.slice(prefix.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}
