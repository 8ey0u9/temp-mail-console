import { extractUniqueAddresses, normalizeEmailAddress } from "./email.js";

export const PAGE_SIZE = 20;
export const RULES_PAGE_SIZE = 12;

const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, from_address TEXT NOT NULL, to_address TEXT NOT NULL, subject TEXT NOT NULL, extracted_json TEXT NOT NULL, text_preview TEXT NOT NULL DEFAULT '', received_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails (received_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails (message_id)",
  "CREATE TABLE IF NOT EXISTS email_contents (email_id INTEGER PRIMARY KEY, text_body TEXT NOT NULL DEFAULT '', html_body TEXT NOT NULL DEFAULT '', raw_eml TEXT NOT NULL DEFAULT '', raw_size INTEGER NOT NULL DEFAULT 0, truncated INTEGER NOT NULL DEFAULT 0, received_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_contents_received_at ON email_contents (received_at)",
  "CREATE TABLE IF NOT EXISTS email_recipients (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER NOT NULL, recipient TEXT NOT NULL, received_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_recipients_lookup ON email_recipients (recipient, received_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_recipients_email_id ON email_recipients (email_id)",
  "CREATE INDEX IF NOT EXISTS idx_recipients_received_at ON email_recipients (received_at)",
  "CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY AUTOINCREMENT, remark TEXT, sender_filter TEXT, pattern TEXT NOT NULL, match_target TEXT NOT NULL DEFAULT 'body', enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS whitelist (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_pattern TEXT NOT NULL, remark TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)"
];

const CURRENT_SCHEMA_VERSION = 3;
const schemaReadyByDb = new WeakMap();

async function getTableColumns(db, tableName) {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set((result.results || []).map((row) => String(row.name)));
}

async function migrateSchemaIfNeeded(db) {
  const versionRow = await db
    .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
    .first();
  const currentVersion = Number(versionRow?.value || 0);
  if (currentVersion >= CURRENT_SCHEMA_VERSION) return;

  const [emailCols, ruleCols, whitelistCols] = await Promise.all([
    getTableColumns(db, "emails"),
    getTableColumns(db, "rules"),
    getTableColumns(db, "whitelist")
  ]);

  const migrations = [];
  if (!emailCols.has("text_preview")) {
    migrations.push("ALTER TABLE emails ADD COLUMN text_preview TEXT NOT NULL DEFAULT ''");
  }
  if (!ruleCols.has("match_target")) {
    migrations.push("ALTER TABLE rules ADD COLUMN match_target TEXT NOT NULL DEFAULT 'body'");
  }
  if (!ruleCols.has("enabled")) {
    migrations.push("ALTER TABLE rules ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!whitelistCols.has("remark")) {
    migrations.push("ALTER TABLE whitelist ADD COLUMN remark TEXT");
  }
  if (!whitelistCols.has("enabled")) {
    migrations.push("ALTER TABLE whitelist ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
  }

  if (migrations.length > 0) {
    await db.batch(migrations.map((sql) => db.prepare(sql)));
  }

  // 为升级前的历史邮件补全收件人索引表
  const [recipientCount, emailRows] = await db.batch([
    db.prepare("SELECT COUNT(1) as cnt FROM email_recipients"),
    db.prepare("SELECT id, to_address, received_at FROM emails")
  ]);
  const hasRecipients = Number(recipientCount?.results?.[0]?.cnt || 0) > 0;
  const existingEmails = emailRows?.results || [];

  if (!hasRecipients && existingEmails.length > 0) {
    const backfillStatements = [];
    for (const row of existingEmails) {
      const addresses = extractUniqueAddresses(String(row.to_address || "").split(","));
      for (const recipient of addresses) {
        backfillStatements.push(
          db.prepare("INSERT INTO email_recipients (email_id, recipient, received_at) VALUES (?, ?, ?)")
            .bind(row.id, recipient, row.received_at)
        );
      }
    }
    for (let i = 0; i < backfillStatements.length; i += 50) {
      await db.batch(backfillStatements.slice(i, i + 50));
    }
  }

  await db
    .prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)")
    .bind(String(CURRENT_SCHEMA_VERSION))
    .run();
}

export async function ensureSchema(db) {
  let promise = schemaReadyByDb.get(db);
  if (!promise) {
    promise = (async () => {
      await db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)));
      await migrateSchemaIfNeeded(db);
    })().catch((err) => {
      schemaReadyByDb.delete(db);
      console.error("Schema initialization failed:", err);
      throw err;
    });
    schemaReadyByDb.set(db, promise);
  }
  return promise;
}

export async function loadWhitelist(db) {
  const result = await db
    .prepare("SELECT id, sender_pattern, remark, enabled FROM whitelist ORDER BY created_at DESC")
    .all();
  return (result.results || []).map((row) => ({
    id: Number(row.id),
    sender_pattern: String(row.sender_pattern),
    remark: row.remark ? String(row.remark) : "",
    enabled: Number(row.enabled ?? 1) !== 0
  }));
}

export async function loadRules(db) {
  const result = await db
    .prepare("SELECT id, remark, sender_filter, pattern, match_target, enabled FROM rules ORDER BY created_at DESC")
    .all();
  return (result.results || []).map((row) => ({
    id: Number(row.id),
    remark: row.remark ? String(row.remark) : "",
    sender_filter: row.sender_filter ? String(row.sender_filter) : "",
    pattern: String(row.pattern),
    match_target: row.match_target ? String(row.match_target) : "body",
    enabled: Number(row.enabled ?? 1) !== 0
  }));
}

export async function insertEmail(
  db,
  {
    messageId,
    from,
    toList,
    subject,
    matches,
    textPreview,
    textBody = "",
    htmlBody = "",
    rawEml = "",
    rawSize = 0,
    truncated = false,
    receivedAt
  }
) {
  const recipients = extractUniqueAddresses(toList);
  const toAddressText = recipients.join(",");
  const insertResult = await db
    .prepare(
      "INSERT INTO emails (message_id, from_address, to_address, subject, extracted_json, text_preview, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      messageId,
      normalizeEmailAddress(from),
      toAddressText,
      subject,
      JSON.stringify(matches || []),
      textPreview || "",
      receivedAt
    )
    .run();

  const emailId = insertResult.meta?.last_row_id;
  if (emailId) {
    const batchStmts = recipients.map((recipient) =>
      db
        .prepare("INSERT INTO email_recipients (email_id, recipient, received_at) VALUES (?, ?, ?)")
        .bind(emailId, recipient, receivedAt)
    );
    batchStmts.push(
      db
        .prepare(
          "INSERT INTO email_contents (email_id, text_body, html_body, raw_eml, raw_size, truncated, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(emailId, textBody, htmlBody, rawEml, Number(rawSize || 0), truncated ? 1 : 0, receivedAt)
    );
    await db.batch(batchStmts);
  }
  return emailId;
}

export async function queryEmailsForApi(
  db,
  { address, limit = 1, since = null, onlyMatched = false, from = "" }
) {
  const targetAddress = normalizeEmailAddress(address);
  const conditions = ["er.recipient = ?"];
  const params = [targetAddress];

  const trimmedFrom = normalizeEmailAddress(from);
  if (trimmedFrom) {
    conditions.push("LOWER(e.from_address) LIKE ?");
    params.push(`%${trimmedFrom}%`);
  }
  if (since !== null && Number.isFinite(since)) {
    conditions.push("e.received_at > ?");
    params.push(since);
  }
  if (onlyMatched) {
    conditions.push("e.extracted_json != '[]'");
  }

  params.push(limit);

  const sql = `
    SELECT e.message_id, e.from_address, e.to_address, e.subject, e.extracted_json, e.received_at
    FROM emails e
    INNER JOIN email_recipients er ON er.email_id = e.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY e.received_at DESC, e.id DESC
    LIMIT ?
  `;
  const result = await db.prepare(sql).bind(...params).all();
  return result.results || [];
}

export async function queryAdminEmails(db, { page, search = "", to = "", onlyMatched = false }) {
  const offset = (page - 1) * PAGE_SIZE;
  const conditions = [];
  const params = [];

  const trimmedTo = normalizeEmailAddress(to);
  if (trimmedTo) {
    conditions.push(
      "EXISTS (SELECT 1 FROM email_recipients er WHERE er.email_id = e.id AND er.recipient LIKE ?)"
    );
    params.push(`%${trimmedTo}%`);
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    const like = `%${trimmedSearch}%`;
    conditions.push(
      "(e.subject LIKE ? OR e.from_address LIKE ? OR e.to_address LIKE ? OR e.extracted_json LIKE ?)"
    );
    params.push(like, like, like, like);
  }

  if (onlyMatched) {
    conditions.push("e.extracted_json != '[]'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const listSql = `
    SELECT e.message_id, e.from_address, e.to_address, e.subject, e.extracted_json, e.text_preview, e.received_at
    FROM emails e
    ${whereClause}
    ORDER BY e.received_at DESC, e.id DESC
    LIMIT ? OFFSET ?
  `;
  const countSql = `SELECT COUNT(1) as total FROM emails e ${whereClause}`;

  const [listResult, countResult] = await db.batch([
    db.prepare(listSql).bind(...params, PAGE_SIZE, offset),
    db.prepare(countSql).bind(...params)
  ]);

  return {
    items: listResult?.results || [],
    total: Number(countResult?.results?.[0]?.total || 0)
  };
}

export async function getEmailByMessageId(db, messageId) {
  return db
    .prepare(
      `SELECT e.id, e.message_id, e.from_address, e.to_address, e.subject, e.extracted_json, e.text_preview, e.received_at,
              c.email_id AS content_email_id, c.text_body, c.html_body, c.raw_eml, c.raw_size, c.truncated
       FROM emails e
       LEFT JOIN email_contents c ON c.email_id = e.id
       WHERE e.message_id = ?
       LIMIT 1`
    )
    .bind(messageId)
    .first();
}

export async function updateEmailExtracted(db, messageId, matches) {
  const jsonText = JSON.stringify(matches || []);
  await db
    .prepare("UPDATE emails SET extracted_json = ? WHERE message_id = ?")
    .bind(jsonText, messageId)
    .run();
  return jsonText;
}

export async function clearAllEmails(db) {
  const [, , emailRes] = await db.batch([
    db.prepare("DELETE FROM email_recipients"),
    db.prepare("DELETE FROM email_contents"),
    db.prepare("DELETE FROM emails")
  ]);
  return Number(emailRes?.meta?.changes || 0);
}

export async function queryTesterOptions(db) {
  const [rulesRes, emailsRes] = await db.batch([
    db.prepare(
      "SELECT id, remark, sender_filter, pattern, match_target, enabled FROM rules ORDER BY created_at DESC, id DESC LIMIT 100"
    ),
    db.prepare(
      "SELECT message_id, from_address, subject, received_at FROM emails ORDER BY received_at DESC, id DESC LIMIT 50"
    )
  ]);
  return {
    rules: rulesRes?.results || [],
    emails: emailsRes?.results || []
  };
}

export async function recordWhitelistBlocked(db, { from, subject, at }) {
  const row = await db
    .prepare("SELECT value FROM schema_meta WHERE key = 'whitelist_blocked_stats'")
    .first();
  let count = 0;
  try {
    const parsed = row?.value ? JSON.parse(row.value) : null;
    count = Number(parsed?.count || 0);
  } catch {
    count = 0;
  }
  const nextStats = {
    count: count + 1,
    last: {
      from: String(from || ""),
      subject: String(subject || "").slice(0, 120),
      at: Number(at || Date.now())
    }
  };
  await db
    .prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('whitelist_blocked_stats', ?)")
    .bind(JSON.stringify(nextStats))
    .run();
}

export async function getWhitelistBlockedStats(db) {
  const row = await db
    .prepare("SELECT value FROM schema_meta WHERE key = 'whitelist_blocked_stats'")
    .first();
  if (!row?.value) return { count: 0, last: null };
  try {
    const parsed = JSON.parse(row.value);
    return {
      count: Number(parsed?.count || 0),
      last: parsed?.last || null
    };
  } catch {
    return { count: 0, last: null };
  }
}

export async function resetWhitelistBlockedStats(db) {
  await db.prepare("DELETE FROM schema_meta WHERE key = 'whitelist_blocked_stats'").run();
}

export async function deleteEmailByMessageId(db, messageId) {
  const row = await db
    .prepare("SELECT id FROM emails WHERE message_id = ? LIMIT 1")
    .bind(messageId)
    .first();
  if (!row) return false;

  await db.batch([
    db.prepare("DELETE FROM email_recipients WHERE email_id = ?").bind(row.id),
    db.prepare("DELETE FROM email_contents WHERE email_id = ?").bind(row.id),
    db.prepare("DELETE FROM emails WHERE id = ?").bind(row.id)
  ]);
  return true;
}

export async function cleanupExpiredEmails(db, expirationTime) {
  const [recipientRes, contentRes, emailRes] = await db.batch([
    db.prepare("DELETE FROM email_recipients WHERE received_at < ?").bind(expirationTime),
    db.prepare("DELETE FROM email_contents WHERE received_at < ?").bind(expirationTime),
    db.prepare("DELETE FROM emails WHERE received_at < ?").bind(expirationTime)
  ]);
  return {
    deletedEmails: Number(emailRes?.meta?.changes || 0),
    deletedRecipients: Number(recipientRes?.meta?.changes || 0),
    deletedContents: Number(contentRes?.meta?.changes || 0)
  };
}

async function queryPagedTable(db, { table, columns, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const [listResult, countResult] = await db.batch([
    db
      .prepare(`SELECT ${columns} FROM ${table} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .bind(pageSize, offset),
    db.prepare(`SELECT COUNT(1) as total FROM ${table}`)
  ]);
  return {
    items: listResult?.results || [],
    total: Number(countResult?.results?.[0]?.total || 0)
  };
}

export async function queryPagedRules(db, page) {
  return queryPagedTable(db, {
    table: "rules",
    columns: "id, remark, sender_filter, pattern, match_target, enabled, created_at",
    page,
    pageSize: RULES_PAGE_SIZE
  });
}

export async function queryPagedWhitelist(db, page) {
  return queryPagedTable(db, {
    table: "whitelist",
    columns: "id, sender_pattern, remark, enabled, created_at",
    page,
    pageSize: RULES_PAGE_SIZE
  });
}

async function getMetaJson(db, key) {
  const row = await db.prepare("SELECT value FROM schema_meta WHERE key = ?").bind(key).first();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function setMetaJson(db, key, value, { onlyIfMissing = false } = {}) {
  const sql = onlyIfMissing
    ? "INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING"
    : "INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)";
  const res = await db.prepare(sql).bind(key, JSON.stringify(value)).run();
  return Number(res?.meta?.changes || 0) > 0;
}

export async function getAdminAuthConfig(db) {
  return getMetaJson(db, "admin_auth");
}

export async function setAdminAuthConfig(db, authConfig, options = {}) {
  return setMetaJson(db, "admin_auth", authConfig, options);
}

export async function getApiTokenConfig(db) {
  return getMetaJson(db, "api_token_config");
}

export async function setApiTokenConfig(db, token, options = {}) {
  return setMetaJson(db, "api_token_config", { token, updatedAt: Date.now() }, options);
}

export async function getRetentionConfig(db) {
  return getMetaJson(db, "retention_config");
}

export async function setRetentionConfig(db, hours) {
  return setMetaJson(db, "retention_config", { hours, updatedAt: Date.now() });
}

export async function getForwardConfig(db) {
  return getMetaJson(db, "forward_config");
}

export async function setForwardConfig(db, { enabled, email }) {
  return setMetaJson(db, "forward_config", {
    enabled: Boolean(enabled),
    email: String(email || "").trim(),
    updatedAt: Date.now()
  });
}

export async function setForwardError(db, message) {
  if (!message) {
    await db.prepare("DELETE FROM schema_meta WHERE key = 'forward_last_error'").run();
    return;
  }
  await setMetaJson(db, "forward_last_error", {
    message: String(message).slice(0, 300),
    at: Date.now()
  });
}

/**
 * 一次性读取所有系统配置与统计项，减少 D1 查询往返。
 */
export async function getAllSystemSettings(db) {
  const res = await db
    .prepare(
      "SELECT key, value FROM schema_meta WHERE key IN ('admin_auth', 'api_token_config', 'forward_config', 'forward_last_error', 'retention_config', 'whitelist_blocked_stats')"
    )
    .all();
  const map = {};
  for (const row of res?.results || []) {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = null;
    }
  }
  return map;
}
