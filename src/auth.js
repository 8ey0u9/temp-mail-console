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

/**
 * 判断请求是否来自本地开发环境（localhost / loopback / .local），
 * 仅本地开发允许使用公开默认示例口令。
 */
export function isLocalDevRequest(request) {
  try {
    const host = new URL(request.url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".local");
  } catch {
    return false;
  }
}

/**
 * 返回令牌当前安全状态：missing（未配置）、weak（非本地环境仍使用公开默认口令）、ok（可用）。
 */
export function getTokenSecurityState(token, defaultSet, request) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return "missing";
  if (defaultSet.has(trimmed) && !isLocalDevRequest(request)) return "weak";
  return "ok";
}

export const MIN_SECRET_LENGTH = 8;
export const MAX_SECRET_LENGTH = 256;
const PBKDF2_ITERATIONS = 100000;

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex) {
  const clean = String(hex || "");
  if (clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

export function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * 使用 PBKDF2-SHA256 对管理员口令进行加盐哈希。
 */
export async function hashAdminPassword(password, saltHex = randomHex(16)) {
  const saltBytes = hexToBytes(saltHex);
  if (!saltBytes) throw new Error("Invalid salt hex");
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return { salt: saltHex, hash: bytesToHex(new Uint8Array(bits)) };
}

export async function verifyAdminPassword(candidate, adminAuth) {
  if (!adminAuth?.salt || !adminAuth?.hash) return false;
  const input = String(candidate || "");
  if (!input) return false;
  const derived = await hashAdminPassword(input, adminAuth.salt);
  return constantTimeEqual(derived.hash, adminAuth.hash);
}

async function computeHmacHex(secret, message) {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * 生成带有效期与 HMAC-SHA256 签名的会话令牌，避免在 Cookie 中存储明文密码。
 */
export async function signSessionToken(sessionSecret, ttlSeconds = 60 * 60 * 24 * 7) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = `v1.${expiresAt}`;
  const sigHex = await computeHmacHex(sessionSecret, payload);
  return `${payload}.${sigHex}`;
}

export async function verifySessionToken(token, sessionSecret) {
  if (!token || !sessionSecret) return false;
  const parts = String(token).split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expectedSig = await computeHmacHex(sessionSecret, `${parts[0]}.${parts[1]}`);
  return constantTimeEqual(parts[2], expectedSig);
}

/**
 * 校验管理请求鉴权：优先验证 D1 admin_auth（签名 Cookie 或 Bearer 口令），未初始化时回退环境变量。
 */
export async function isRequestAdminAuthorized(request, { adminAuth, envAdminToken } = {}) {
  if (adminAuth?.hash && adminAuth?.sessionSecret) {
    const cookies = parseCookies(request.headers.get("Cookie") || "");
    if (await verifySessionToken(cookies[ADMIN_COOKIE_NAME] || "", adminAuth.sessionSecret)) {
      return true;
    }
    const bearer = getBearerToken(request);
    if (bearer && (await verifyAdminPassword(bearer, adminAuth))) {
      return true;
    }
    return false;
  }
  return isAdminAuthorized(request, envAdminToken);
}

/**
 * 校验控制台设置或首次初始化提交的管理员密码 / API Token 强度。
 */
export function validateSecretValue(value, { kind = "admin", defaultSet = DEFAULT_ADMIN_TOKENS } = {}) {
  const trimmed = String(value || "").trim();
  const isAdmin = kind === "admin";
  if (!trimmed) {
    return {
      ok: false,
      error: isAdmin ? "管理员密码不能为空" : "API_TOKEN 不能为空",
      errorCode: isAdmin ? "SECRET_REQUIRED" : "API_TOKEN_REQUIRED"
    };
  }
  if (trimmed.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      error: `长度不能少于 ${MIN_SECRET_LENGTH} 个字符`,
      errorCode: "SECRET_TOO_SHORT",
      errorMeta: { min: MIN_SECRET_LENGTH }
    };
  }
  if (trimmed.length > MAX_SECRET_LENGTH) {
    return {
      ok: false,
      error: `长度不能超过 ${MAX_SECRET_LENGTH} 个字符`,
      errorCode: "SECRET_TOO_LONG",
      errorMeta: { max: MAX_SECRET_LENGTH }
    };
  }
  if (defaultSet.has(trimmed)) {
    return {
      ok: false,
      error: "禁止使用公开默认弱口令，请更换为强随机密码",
      errorCode: "DISALLOWED_DEFAULT_SECRET"
    };
  }
  return { ok: true, value: trimmed };
}
