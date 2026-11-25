import {
  DEFAULT_ADMIN_TOKENS,
  DEFAULT_API_TOKENS,
  buildClearSessionCookie,
  buildSessionCookie,
  constantTimeEqual,
  getTokenSecurityState,
  isAdminAuthorized,
  isApiAuthorized,
  isWeakOrMissingToken
} from "./auth.js";
import {
  PAGE_SIZE,
  RULES_PAGE_SIZE,
  cleanupExpiredEmails,
  clearAllEmails,
  deleteEmailByMessageId,
  ensureSchema,
  getEmailByMessageId,
  getWhitelistBlockedStats,
  insertEmail,
  loadRules,
  loadWhitelist,
  queryAdminEmails,
  queryEmailsForApi,
  queryPagedRules,
  queryPagedWhitelist,
  queryTesterOptions,
  recordWhitelistBlocked,
  resetWhitelistBlockedStats,
  updateEmailExtracted
} from "./db.js";
import {
  VALID_MATCH_TARGETS,
  applyRules,
  parseIncomingEmail,
  senderInWhitelist,
  senderMatches,
  stripHtmlToText,
  validateRegexPattern,
  validateSenderFilter
} from "./email.js";
import {
  CORS_HEADERS,
  HTML_HEADERS,
  clampLimit,
  clampPage,
  json,
  jsonError,
  parseJsonBody,
  parseResourceId,
  safeParseJson
} from "./http.js";
import { renderAuthHtml, renderHtml } from "./ui.js";

const DEFAULT_RETENTION_HOURS = 48;

/**
 * 解析环境变量 RETENTION_HOURS，非法或非正数时兜底为 48 小时。
 */
export function parseRetentionHours(rawValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_HOURS;
}

export default {
  async email(message, env, ctx) {
    await ensureSchema(env.DB);
    const now = Date.now();
    const parsed = await parseIncomingEmail(message);

    // 启用中的白名单非空时，发件人不匹配则记录拦截统计并直接忽略
    const whitelist = await loadWhitelist(env.DB);
    if (!senderInWhitelist(parsed.from, whitelist)) {
      await recordWhitelistBlocked(env.DB, {
        from: parsed.from,
        subject: parsed.subject,
        at: now
      }).catch((err) => console.error("记录白名单拦截统计失败:", err));
      return;
    }

    const rules = await loadRules(env.DB);
    const matches = applyRules(parsed, parsed.from, rules);

    await insertEmail(env.DB, {
      messageId: crypto.randomUUID(),
      from: parsed.from,
      toList: parsed.to,
      subject: parsed.subject,
      matches,
      textPreview: parsed.textPreview,
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
      rawEml: parsed.rawEml,
      rawSize: parsed.rawSize,
      truncated: parsed.truncated,
      receivedAt: now
    });

    const forwardTo = String(env.FORWARD_TO || "").trim();
    if (forwardTo) {
      try {
        await message.forward(forwardTo);
      } catch (err) {
        console.error("邮件转发失败:", err);
      }
    }
  },

  async fetch(request, env) {
    try {
      return await handleFetch(request, env);
    } catch (err) {
      console.error("Unhandled fetch error:", err);
      return jsonError("Internal Server Error", 500, {}, "INTERNAL_ERROR");
    }
  },

  async scheduled(event, env, ctx) {
    await ensureSchema(env.DB);
    const retentionHours = parseRetentionHours(env.RETENTION_HOURS);
    const expirationTime = Date.now() - retentionHours * 60 * 60 * 1000;

    ctx.waitUntil(
      cleanupExpiredEmails(env.DB, expirationTime)
        .then(({ deletedEmails, deletedRecipients, deletedContents }) => {
          console.log(
            `[Cron] 清理完成 (超过 ${retentionHours} 小时): 删除邮件 ${deletedEmails} 封, 收件索引 ${deletedRecipients} 条, 原文 ${deletedContents} 条`
          );
        })
        .catch((err) => console.error("[Cron] 自动清理失败:", err))
    );
  }
};

async function handleFetch(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/healthz" && method === "GET") {
    try {
      await env.DB.prepare("SELECT 1 as ok").first();
      return json({ status: "healthy" });
    } catch (err) {
      console.error("Health check failed:", err);
      return jsonError("database unavailable", 503);
    }
  }

  // ── 外部 API (/api/*) ─────────────────────────────────────────────────────
  if (pathname === "/api/emails/latest" || pathname === "/api/emails") {
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (method !== "GET") return jsonError("Method Not Allowed", 405, CORS_HEADERS);
    const apiBlocked = checkTokenPolicy(env.API_TOKEN, DEFAULT_API_TOKENS, request, {
      name: "API_TOKEN",
      headers: CORS_HEADERS,
      missingCode: "MISSING_API_TOKEN",
      weakCode: "WEAK_API_TOKEN"
    });
    if (apiBlocked) return apiBlocked.response;
    if (!isApiAuthorized(request, env.API_TOKEN)) {
      return jsonError("Unauthorized", 401, CORS_HEADERS);
    }
    await ensureSchema(env.DB);
    return pathname === "/api/emails/latest"
      ? handleApiEmailsLatest(url, env)
      : handleApiEmailsList(url, env);
  }

  // ── 控制台页面 (/) ────────────────────────────────────────────────────────
  if (pathname === "/") {
    const adminState = getTokenSecurityState(env.ADMIN_TOKEN, DEFAULT_ADMIN_TOKENS, request);
    if (adminState !== "ok" || !isAdminAuthorized(request, env.ADMIN_TOKEN)) {
      return new Response(
        renderAuthHtml({
          missingAdminToken: adminState === "missing",
          weakAdminToken: adminState === "weak"
        }),
        { headers: HTML_HEADERS }
      );
    }
    return new Response(renderHtml({ pageSize: PAGE_SIZE, rulesPageSize: RULES_PAGE_SIZE }), {
      headers: HTML_HEADERS
    });
  }

  // ── 登录 / 登出端点 ───────────────────────────────────────────────────────
  if (pathname === "/admin/login" && method === "POST") {
    return handleAdminLogin(request, env);
  }
  if (pathname === "/admin/logout" && method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": buildClearSessionCookie(request) });
  }

  // ── 管理 API (/admin/*) ───────────────────────────────────────────────────
  if (pathname.startsWith("/admin/")) {
    const adminBlocked = checkTokenPolicy(env.ADMIN_TOKEN, DEFAULT_ADMIN_TOKENS, request, {
      name: "ADMIN_TOKEN",
      missingCode: "MISSING_ADMIN_TOKEN",
      weakCode: "WEAK_ADMIN_TOKEN"
    });
    if (adminBlocked) return adminBlocked.response;
    if (!isAdminAuthorized(request, env.ADMIN_TOKEN)) {
      return jsonError("Unauthorized", 401, {}, "UNAUTHORIZED");
    }
    await ensureSchema(env.DB);
    return routeAdminRequest(pathname, method, url, request, env);
  }

  if (env.ASSETS && (method === "GET" || method === "HEAD")) {
    return env.ASSETS.fetch(request);
  }
  return new Response("Not Found", { status: 404 });
}

async function routeAdminRequest(pathname, method, url, request, env) {
  if (pathname === "/admin/status" && method === "GET") return handleAdminStatus(env);
  if (pathname === "/admin/tester/options" && method === "GET") return handleAdminTesterOptions(env);

  if (pathname === "/admin/emails" && method === "GET") return handleAdminEmails(url, env);
  if (pathname === "/admin/emails" && method === "DELETE") return handleAdminEmailsClear(env);
  if (pathname.startsWith("/admin/emails/") && pathname.endsWith("/content") && method === "GET") {
    return handleAdminEmailContent(pathname, env);
  }
  if (pathname.startsWith("/admin/emails/") && pathname.endsWith("/reparse") && method === "POST") {
    return handleAdminEmailReparse(pathname, env);
  }
  if (pathname.startsWith("/admin/emails/") && method === "DELETE") {
    return handleAdminEmailDelete(pathname, env);
  }

  if (pathname === "/admin/rules" && method === "GET") return handleAdminRulesGet(url, env);
  if (pathname === "/admin/rules" && method === "POST") return handleAdminRulesPost(request, env);
  if (pathname === "/admin/rules/test" && method === "POST") return handleAdminRulesTest(request, env);
  if (pathname.startsWith("/admin/rules/") && method === "PUT") {
    return handleAdminRulesPut(pathname, request, env);
  }
  if (pathname.startsWith("/admin/rules/") && method === "DELETE") {
    return handleAdminRulesDelete(pathname, env);
  }

  if (pathname === "/admin/whitelist" && method === "GET") return handleAdminWhitelistGet(url, env);
  if (pathname === "/admin/whitelist" && method === "POST") {
    return handleAdminWhitelistPost(request, env);
  }
  if (pathname === "/admin/whitelist/blocked/reset" && method === "POST") {
    return handleAdminWhitelistBlockedReset(env);
  }
  if (pathname.startsWith("/admin/whitelist/") && method === "PUT") {
    return handleAdminWhitelistPut(pathname, request, env);
  }
  if (pathname.startsWith("/admin/whitelist/") && method === "DELETE") {
    return handleAdminWhitelistDelete(pathname, env);
  }

  return jsonError("Not Found", 404, {}, "NOT_FOUND");
}

// ─── External API Handlers ────────────────────────────────────────────────────

function parseApiFilterParams(url) {
  const address = String(url.searchParams.get("address") || "").trim();
  if (!address) return { error: "address is required" };

  const sinceRaw = url.searchParams.get("since");
  let since = null;
  if (sinceRaw !== null && sinceRaw !== "") {
    const parsedSince = Number(sinceRaw);
    if (!Number.isFinite(parsedSince) || parsedSince < 0) {
      return { error: "since must be a valid timestamp in ms" };
    }
    since = Math.floor(parsedSince);
  }

  const onlyMatchedRaw = String(url.searchParams.get("only_matched") || "").toLowerCase();
  const onlyMatched = onlyMatchedRaw === "true" || onlyMatchedRaw === "1";
  const from = String(url.searchParams.get("from") || "").trim();

  return { address, since, onlyMatched, from };
}

function formatApiEmailRow(row) {
  const parsed = safeParseJson(row.extracted_json);
  return {
    message_id: row.message_id,
    from_address: row.from_address,
    to_address: row.to_address,
    subject: row.subject,
    received_at: row.received_at,
    results: Array.isArray(parsed) ? parsed : []
  };
}

async function handleApiEmailsLatest(url, env) {
  const params = parseApiFilterParams(url);
  if (params.error) return jsonError(params.error, 400, CORS_HEADERS);

  const rows = await queryEmailsForApi(env.DB, { ...params, limit: 1 });
  if (rows.length === 0) return jsonError("message not found", 404, CORS_HEADERS);

  return json(formatApiEmailRow(rows[0]), 200, CORS_HEADERS);
}

async function handleApiEmailsList(url, env) {
  const params = parseApiFilterParams(url);
  if (params.error) return jsonError(params.error, 400, CORS_HEADERS);

  const limit = clampLimit(url.searchParams.get("limit"), 20, 50);
  const rows = await queryEmailsForApi(env.DB, { ...params, limit });

  return json({ items: rows.map(formatApiEmailRow) }, 200, CORS_HEADERS);
}

// ─── Admin Handlers ───────────────────────────────────────────────────────────

async function readValidatedBody(request, validator) {
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) {
    return { ok: false, response: jsonError(parsedBody.error, 400, {}, "INVALID_JSON") };
  }

  const validated = validator(parsedBody.data);
  if (!validated.ok) {
    return {
      ok: false,
      response: jsonError(validated.error, 400, {}, validated.errorCode, validated.errorMeta)
    };
  }

  return { ok: true, value: validated.value, raw: parsedBody.data };
}

function checkTokenPolicy(token, defaultSet, request, { name, headers = {}, missingCode, weakCode }) {
  const state = getTokenSecurityState(token, defaultSet, request);
  if (state === "ok") return null;
  const message = state === "missing"
    ? `${name} 环境变量未配置`
    : `生产环境禁止使用默认 ${name}，请在 Cloudflare Secrets 中修改为强密码`;
  return {
    state,
    response: jsonError(message, 503, headers, state === "missing" ? missingCode : weakCode)
  };
}

async function handleAdminLogin(request, env) {
  const adminBlocked = checkTokenPolicy(env.ADMIN_TOKEN, DEFAULT_ADMIN_TOKENS, request, {
    name: "ADMIN_TOKEN",
    missingCode: "MISSING_ADMIN_TOKEN",
    weakCode: "WEAK_ADMIN_TOKEN"
  });
  if (adminBlocked) return adminBlocked.response;

  const expected = String(env.ADMIN_TOKEN || "").trim();
  const parsed = await parseJsonBody(request);
  const candidate = parsed.ok ? String(parsed.data.token || "").trim() : "";
  if (!candidate) return jsonError("请输入访问密码", 400, {}, "EMPTY_TOKEN");

  if (!constantTimeEqual(candidate, expected)) {
    return jsonError("密码不正确，请重试", 401, {}, "WRONG_TOKEN");
  }

  return json({ ok: true }, 200, { "Set-Cookie": buildSessionCookie(expected, request) });
}

async function handleAdminStatus(env) {
  const warnings = [];
  const warningCodes = [];
  if (isWeakOrMissingToken(env.ADMIN_TOKEN, DEFAULT_ADMIN_TOKENS)) {
    warningCodes.push("default_admin_token");
    warnings.push("当前正在使用默认 ADMIN_TOKEN，请及时通过 Wrangler Secret 或控制台环境变量修改为强密码");
  }
  if (isWeakOrMissingToken(env.API_TOKEN, DEFAULT_API_TOKENS)) {
    warningCodes.push("default_api_token");
    warnings.push("API_TOKEN 未配置或仍为默认值，请尽快配置强密码后再对外集成");
  }

  const whitelistBlocked = await getWhitelistBlockedStats(env.DB);
  return json({
    warnings,
    warningCodes,
    retentionHours: parseRetentionHours(env.RETENTION_HOURS),
    forwardEnabled: Boolean(String(env.FORWARD_TO || "").trim()),
    whitelistBlocked
  });
}

async function handleAdminTesterOptions(env) {
  const options = await queryTesterOptions(env.DB);
  return json(options);
}

async function handleAdminEmails(url, env) {
  const page = clampPage(url.searchParams.get("page"));
  const search = String(url.searchParams.get("q") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  const onlyMatchedRaw = String(url.searchParams.get("only_matched") || "").toLowerCase();
  const onlyMatched = onlyMatchedRaw === "true" || onlyMatchedRaw === "1";

  const { items, total } = await queryAdminEmails(env.DB, { page, search, to, onlyMatched });
  return json({ page, pageSize: PAGE_SIZE, total, items });
}

async function handleAdminEmailsClear(env) {
  const deleted = await clearAllEmails(env.DB);
  return json({ ok: true, deleted });
}

async function handleAdminEmailContent(pathname, env) {
  const messageId = decodeURIComponent(
    pathname.slice("/admin/emails/".length, -"/content".length)
  ).trim();
  if (!messageId) return jsonError("invalid message id", 400, {}, "INVALID_ID");

  const row = await getEmailByMessageId(env.DB, messageId);
  if (!row) return jsonError("message not found", 404, {}, "EMAIL_NOT_FOUND");

  return json({
    message_id: row.message_id,
    from_address: row.from_address,
    to_address: row.to_address,
    subject: row.subject,
    received_at: row.received_at,
    text_preview: row.text_preview || "",
    has_raw: Boolean(row.content_email_id),
    text_body: row.text_body || "",
    html_body: row.html_body || "",
    raw_eml: row.raw_eml || "",
    raw_size: Number(row.raw_size || 0),
    truncated: Boolean(row.truncated)
  });
}

async function handleAdminEmailReparse(pathname, env) {
  const messageId = decodeURIComponent(
    pathname.slice("/admin/emails/".length, -"/reparse".length)
  ).trim();
  if (!messageId) return jsonError("invalid message id", 400, {}, "INVALID_ID");

  const row = await getEmailByMessageId(env.DB, messageId);
  if (!row) return jsonError("message not found", 404, {}, "EMAIL_NOT_FOUND");

  const rules = await loadRules(env.DB);
  const html = row.html_body || "";
  const htmlText = html ? stripHtmlToText(html) : "";
  const text = row.text_body || row.text_preview || "";
  const matches = applyRules(
    { subject: row.subject || "", text, html, htmlText },
    row.from_address || "",
    rules
  );
  const extractedJson = await updateEmailExtracted(env.DB, messageId, matches);

  return json({ message_id: messageId, extracted_json: extractedJson, results: matches });
}

async function handleAdminEmailDelete(pathname, env) {
  const messageId = decodeURIComponent(pathname.slice("/admin/emails/".length)).trim();
  if (!messageId) return jsonError("invalid message id", 400, {}, "INVALID_ID");

  const deleted = await deleteEmailByMessageId(env.DB, messageId);
  if (!deleted) return jsonError("message not found", 404, {}, "EMAIL_NOT_FOUND");
  return json({ ok: true });
}

async function handleAdminRulesGet(url, env) {
  const page = clampPage(url.searchParams.get("page"));
  const { items, total } = await queryPagedRules(env.DB, page);
  return json({ page, pageSize: RULES_PAGE_SIZE, total, items });
}

function validateRulePayload(data) {
  const remark = String(data.remark || "").trim();
  const patternCheck = validateRegexPattern(data.pattern, { label: "内容匹配正则", field: "pattern" });
  if (!patternCheck.ok) {
    return {
      ok: false,
      error: patternCheck.error,
      errorCode: patternCheck.errorCode,
      errorMeta: patternCheck.errorMeta
    };
  }

  const senderCheck = validateSenderFilter(data.sender_filter);
  if (!senderCheck.ok) {
    return {
      ok: false,
      error: senderCheck.error,
      errorCode: senderCheck.errorCode,
      errorMeta: senderCheck.errorMeta
    };
  }

  const matchTarget = String(data.match_target || "body").trim();
  if (!VALID_MATCH_TARGETS.has(matchTarget)) {
    return {
      ok: false,
      error: "match_target 仅支持 body、subject、both 或 html",
      errorCode: "INVALID_MATCH_TARGET"
    };
  }

  return {
    ok: true,
    value: {
      remark: remark || null,
      sender_filter: senderCheck.value || null,
      pattern: patternCheck.value,
      match_target: matchTarget,
      enabled: data.enabled === false || data.enabled === 0 ? 0 : 1
    }
  };
}

async function handleAdminRulesPost(request, env) {
  const body = await readValidatedBody(request, validateRulePayload);
  if (!body.ok) return body.response;

  const { remark, sender_filter, pattern, match_target, enabled } = body.value;
  const res = await env.DB.prepare(
    "INSERT INTO rules (remark, sender_filter, pattern, match_target, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(remark, sender_filter, pattern, match_target, enabled, Date.now())
    .run();

  return json({ ok: true, id: res.meta?.last_row_id || null });
}

async function handleAdminRulesPut(pathname, request, env) {
  const id = parseResourceId(pathname, "/admin/rules/");
  if (!id) return jsonError("invalid rule id", 400, {}, "INVALID_ID");

  const body = await readValidatedBody(request, validateRulePayload);
  if (!body.ok) return body.response;

  const { remark, sender_filter, pattern, match_target, enabled } = body.value;
  const res = await env.DB.prepare(
    "UPDATE rules SET remark = ?, sender_filter = ?, pattern = ?, match_target = ?, enabled = ? WHERE id = ?"
  )
    .bind(remark, sender_filter, pattern, match_target, enabled, id)
    .run();

  if (!res.meta?.changes) return jsonError("rule not found", 404, {}, "RULE_NOT_FOUND");
  return json({ ok: true });
}

async function handleAdminRulesDelete(pathname, env) {
  const id = parseResourceId(pathname, "/admin/rules/");
  if (!id) return jsonError("invalid rule id", 400, {}, "INVALID_ID");

  await env.DB.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function handleAdminRulesTest(request, env) {
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return jsonError(parsedBody.error, 400, {}, "INVALID_JSON");

  const data = parsedBody.data;
  const validated = validateRulePayload({ ...data, enabled: true });
  if (!validated.ok) {
    return jsonError(validated.error, 400, {}, validated.errorCode, validated.errorMeta);
  }

  let sender = data.sender !== undefined ? String(data.sender || "").trim() : undefined;
  let subject = data.subject !== undefined ? String(data.subject || "") : undefined;
  let text = data.text !== undefined ? String(data.text || "") : undefined;
  let html = data.html !== undefined ? String(data.html || "") : undefined;

  if (data.message_id) {
    const emailRow = await getEmailByMessageId(env.DB, String(data.message_id).trim());
    if (!emailRow) return jsonError("参考邮件不存在或已被清理", 404, {}, "EMAIL_NOT_FOUND");
    if (sender === undefined) sender = emailRow.from_address || "";
    if (subject === undefined) subject = emailRow.subject || "";
    if (text === undefined) text = emailRow.text_body || emailRow.text_preview || "";
    if (html === undefined) html = emailRow.html_body || "";
  }

  sender = sender || "";
  subject = subject || "";
  text = text || "";
  html = html || "";

  const htmlText = html ? stripHtmlToText(html) : "";
  const rule = { id: 0, ...validated.value, enabled: true };
  const senderMatched = senderMatches(sender.toLowerCase(), rule.sender_filter);
  const results = applyRules({ subject, text, html, htmlText }, sender, [rule]);

  return json({
    sender_matched: senderMatched,
    matched: results.length > 0,
    results,
    preview_text: text || htmlText
  });
}

async function handleAdminWhitelistGet(url, env) {
  const page = clampPage(url.searchParams.get("page"));
  const { items, total } = await queryPagedWhitelist(env.DB, page);
  return json({ page, pageSize: RULES_PAGE_SIZE, total, items });
}

function validateWhitelistPayload(data) {
  const patternCheck = validateRegexPattern(data.sender_pattern, {
    label: "发信人模式",
    field: "sender_pattern"
  });
  if (!patternCheck.ok) {
    return {
      ok: false,
      error: patternCheck.error,
      errorCode: patternCheck.errorCode,
      errorMeta: patternCheck.errorMeta
    };
  }

  const remark = String(data.remark || "").trim();
  return {
    ok: true,
    value: {
      sender_pattern: patternCheck.value,
      remark: remark || null,
      enabled: data.enabled === false || data.enabled === 0 ? 0 : 1
    }
  };
}

async function handleAdminWhitelistPost(request, env) {
  const body = await readValidatedBody(request, validateWhitelistPayload);
  if (!body.ok) return body.response;

  const { sender_pattern, remark, enabled } = body.value;
  await env.DB.prepare("INSERT INTO whitelist (sender_pattern, remark, enabled, created_at) VALUES (?, ?, ?, ?)")
    .bind(sender_pattern, remark, enabled, Date.now())
    .run();
  return json({ ok: true });
}

async function handleAdminWhitelistPut(pathname, request, env) {
  const id = parseResourceId(pathname, "/admin/whitelist/");
  if (!id) return jsonError("invalid whitelist id", 400, {}, "INVALID_ID");

  const body = await readValidatedBody(request, validateWhitelistPayload);
  if (!body.ok) return body.response;

  const { sender_pattern, remark, enabled } = body.value;
  const res = await env.DB.prepare(
    "UPDATE whitelist SET sender_pattern = ?, remark = ?, enabled = ? WHERE id = ?"
  )
    .bind(sender_pattern, remark, enabled, id)
    .run();

  if (!res.meta?.changes) return jsonError("whitelist item not found", 404, {}, "WHITELIST_NOT_FOUND");
  return json({ ok: true });
}

async function handleAdminWhitelistDelete(pathname, env) {
  const id = parseResourceId(pathname, "/admin/whitelist/");
  if (!id) return jsonError("invalid whitelist id", 400, {}, "INVALID_ID");

  await env.DB.prepare("DELETE FROM whitelist WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function handleAdminWhitelistBlockedReset(env) {
  await resetWhitelistBlockedStats(env.DB);
  return json({ ok: true });
}
