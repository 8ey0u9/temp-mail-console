export const ADMIN_COOKIE_NAME = "admin_token";
export const DEFAULT_ADMIN_TOKENS = new Set(["dev-admin-token"]);
export const DEFAULT_API_TOKENS = new Set(["dev-api-token"]);

const textEncoder = new TextEncoder();

/**
 * 使用常量时间比对两个字符串，防止计时侧信道泄露令牌长度外的信息。
 */
export function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;

  if (typeof globalThis.crypto?.subtle?.timingSafeEqual === "function") {
    return globalThis.crypto.subtle.timingSafeEqual(aBytes, bBytes);
  }

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/**
 * 解析请求 Cookie 头；对畸形 URI 编码做容错回退，避免 Worker 抛出 URIError。
 */
export function parseCookies(cookieHeader) {
  const output = {};
  if (!cookieHeader) return output;
  for (const part of String(cookieHeader).split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const rawKey = trimmed.slice(0, eqIndex).trim();
    const rawVal = trimmed.slice(eqIndex + 1);
    if (!rawKey) continue;
    try {
      output[rawKey] = decodeURIComponent(rawVal);
    } catch {
      output[rawKey] = rawVal;
    }
  }
  return output;
}

export function isAdminAuthorized(request, adminToken) {
  const expected = String(adminToken || "").trim();
  if (!expected) return false;
  if (constantTimeEqual(getBearerToken(request), expected)) return true;
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  return constantTimeEqual(cookies[ADMIN_COOKIE_NAME] || "", expected);
}

export function isApiAuthorized(request, apiToken) {
  const expected = String(apiToken || "").trim();
  if (!expected) return false;
  return constantTimeEqual(getBearerToken(request), expected);
}

function isHttpsRequest(request) {
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    // 忽略异常 URL，继续读取代理头
  }
  return request.headers.get("x-forwarded-proto") === "https";
}

export function buildSessionCookie(token, request, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const secure = isHttpsRequest(request) ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function buildClearSessionCookie(request) {
  return buildSessionCookie("", request, 0);
}

export function isWeakOrMissingToken(token, defaultSet) {
  const trimmed = String(token || "").trim();
  return !trimmed || defaultSet.has(trimmed);
}
