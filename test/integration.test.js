import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Miniflare } from "miniflare";

const DIST_SCRIPT = path.resolve("dist/index.js");

function createMiniflare(extraBindings = {}) {
  assert.equal(
    fs.existsSync(DIST_SCRIPT),
    true,
    "dist/index.js 不存在，请先运行 wrangler deploy --dry-run --outdir dist"
  );
  return new Miniflare({
    name: "temp-email-worker",
    modules: true,
    scriptPath: DIST_SCRIPT,
    compatibilityDate: "2024-11-01",
    unsafeTriggerHandlers: true,
    assets: {
      directory: path.resolve("public"),
      binding: "ASSETS",
      routerConfig: {
        has_user_worker: true,
        static_routing: {
          user_worker: ["/", "/api/*", "/admin/*", "/healthz"]
        }
      },
      assetConfig: {
        html_handling: "none",
        not_found_handling: "none"
      }
    },
    d1Databases: { DB: "test-temp-mail-db" },
    bindings: {
      ADMIN_TOKEN: "test-admin-secret",
      API_TOKEN: "test-api-secret",
      FORWARD_TO: "",
      RETENTION_HOURS: "48",
      ...extraBindings
    }
  });
}

async function loginAsAdmin(mf, token = "test-admin-secret") {
  const res = await mf.dispatchFetch("http://localhost/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "login should return Set-Cookie");
  return setCookie.split(";")[0];
}

test("end-to-end flow: healthz, auth, rules, whitelist, email ingestion, API queries, and cron cleanup", async () => {
  const mf = createMiniflare({ RETENTION_HOURS: "24" });
  try {
    // 1. Health check & Static Assets + Page Security Headers
    const healthRes = await mf.dispatchFetch("http://localhost/healthz");
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.data.status, "healthy");

    const cssRes = await mf.dispatchFetch("http://localhost/assets/theme.css");
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get("content-type") || "", /text\/css/);
    assert.match(cssRes.headers.get("cache-control") || "", /immutable/);

    const consoleJsRes = await mf.dispatchFetch("http://localhost/assets/console.js");
    assert.equal(consoleJsRes.status, 200);
    assert.match(consoleJsRes.headers.get("content-type") || "", /javascript/);
    assert.match(consoleJsRes.headers.get("cache-control") || "", /immutable/);

    const loginPageRes = await mf.dispatchFetch("http://localhost/");
    assert.equal(loginPageRes.status, 200);
    assert.equal(loginPageRes.headers.get("x-frame-options"), "DENY");
    assert.match(await loginPageRes.text(), /\/assets\/auth\.js/);

    // 2. Unauthenticated admin API should fail with 401
    const unauthRes = await mf.dispatchFetch("http://localhost/admin/emails");
    assert.equal(unauthRes.status, 401);

    // 3. Login via /admin/login and check status
    const cookie = await loginAsAdmin(mf);
    const statusRes = await mf.dispatchFetch("http://localhost/admin/status", {
      headers: { Cookie: cookie }
    });
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.deepEqual(statusJson.data.warnings, []);
    assert.equal(statusJson.data.retentionHours, 24);

    // 4. Reject invalid regex rule with 400 and structured errorCode
    const badRuleRes = await mf.dispatchFetch("http://localhost/admin/rules", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: "[unclosed" })
    });
    assert.equal(badRuleRes.status, 400);
    const badRuleJson = await badRuleRes.json();
    assert.equal(badRuleJson.errorCode, "INVALID_REGEX");

    // 5. Create extraction rule with capture group & whitelist
    const createRuleRes = await mf.dispatchFetch("http://localhost/admin/rules", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        remark: "验证码",
        sender_filter: ".*@example\\.com",
        pattern: "code is:?\\s*(\\d{6})",
        match_target: "body"
      })
    });
    assert.equal(createRuleRes.status, 200);
    const createRuleJson = await createRuleRes.json();
    assert.ok(Number.isInteger(createRuleJson.data?.id) && createRuleJson.data.id > 0);

    const createWlRes = await mf.dispatchFetch("http://localhost/admin/whitelist", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ sender_pattern: ".*@example\\.com", remark: "Allow Example" })
    });
    assert.equal(createWlRes.status, 200);

    // 6. Test inline rule tester endpoint
    const ruleTestRes = await mf.dispatchFetch("http://localhost/admin/rules/test", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender_filter: ".*@example\\.com",
        pattern: "code is:?\\s*(\\d{6})",
        match_target: "body",
        sender: "bot@example.com",
        text: "Your code is: 654321"
      })
    });
    assert.equal(ruleTestRes.status, 200);
    const ruleTestJson = await ruleTestRes.json();
    assert.equal(ruleTestJson.data.matched, true);
    assert.equal(ruleTestJson.data.results[0].value, "654321");

    // 7. Blocked sender by whitelist is ignored and recorded in status stats
    const blockedEmailRes = await mf.dispatchFetch(
      "http://localhost/cdn-cgi/handler/email?from=spam@evil.org&to=demouser@yourdomain.com",
      {
        method: "POST",
        body: "From: spam@evil.org\r\nTo: demouser@yourdomain.com\r\nSubject: Spam\r\nMessage-ID: <spam-001@evil.org>\r\n\r\nYour code is 111111"
      }
    );
    assert.equal(blockedEmailRes.status, 200);

    const blockedStatusRes = await mf.dispatchFetch("http://localhost/admin/status", {
      headers: { Cookie: cookie }
    });
    assert.equal(blockedStatusRes.status, 200);
    const blockedStatusJson = await blockedStatusRes.json();
    assert.equal(blockedStatusJson.data.whitelistBlocked?.count, 1);
    assert.equal(blockedStatusJson.data.whitelistBlocked?.last?.from, "spam@evil.org");
    assert.equal(blockedStatusJson.data.whitelistBlocked?.last?.subject, "Spam");

    const resetBlockedRes = await mf.dispatchFetch(
      "http://localhost/admin/whitelist/blocked/reset",
      { method: "POST", headers: { Cookie: cookie } }
    );
    assert.equal(resetBlockedRes.status, 200);
    const afterResetStatusRes = await mf.dispatchFetch("http://localhost/admin/status", {
      headers: { Cookie: cookie }
    });
    const afterResetJson = await afterResetStatusRes.json();
    assert.equal(afterResetJson.data.whitelistBlocked?.count, 0);
    assert.equal(afterResetJson.data.whitelistBlocked?.last, null);

    // 8. Ingest HTML multipart email with mixed-case To & multiple recipients + BCC envelope recipient
    const fixtureEml = fs.readFileSync(path.resolve("test/fixtures/html-fallback.eml"), "utf8");
    const okEmailRes = await mf.dispatchFetch(
      "http://localhost/cdn-cgi/handler/email?from=security@example.com&to=bcc-user@yourdomain.com",
      { method: "POST", body: fixtureEml }
    );
    assert.equal(okEmailRes.status, 200);

    // 9. Query /api/emails/latest case-insensitively on header recipient and BCC envelope recipient
    const latestRes = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=BACKUP@YOURDOMAIN.COM",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(latestRes.status, 200);
    const latestJson = await latestRes.json();
    assert.equal(latestJson.data.results[0].value, "849201");
    assert.equal(latestJson.data.subject, "[Service] Your code is 849201");
    assert.ok(latestJson.data.message_id);

    const bccRes = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=bcc-user@yourdomain.com",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(bccRes.status, 200);

    // 10. Query with `since` equal to received_at returns 404 (no newer mail)
    const sinceRes = await mf.dispatchFetch(
      `http://localhost/api/emails/latest?address=demouser@yourdomain.com&since=${latestJson.data.received_at}`,
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(sinceRes.status, 404);
    assert.equal(sinceRes.headers.get("Access-Control-Allow-Origin"), "*");

    // 11. Ingest a non-matching email and verify `only_matched=true` skips it
    const nonMatchingRes = await mf.dispatchFetch(
      "http://localhost/cdn-cgi/handler/email?from=news@example.com&to=demouser@yourdomain.com",
      {
        method: "POST",
        body: "From: news@example.com\r\nTo: demouser@yourdomain.com\r\nSubject: Newsletter\r\nMessage-ID: <news-001@example.com>\r\n\r\nJust saying hi."
      }
    );
    assert.equal(nonMatchingRes.status, 200);
    const onlyMatchedRes = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=demouser@yourdomain.com&only_matched=true",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(onlyMatchedRes.status, 200);
    const onlyMatchedJson = await onlyMatchedRes.json();
    assert.equal(onlyMatchedJson.data.results[0].value, "849201");

    // 12. Query /api/emails list + optional `from` filter
    const listApiRes = await mf.dispatchFetch(
      "http://localhost/api/emails?address=demouser@yourdomain.com&limit=10",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(listApiRes.status, 200);
    const listApiJson = await listApiRes.json();
    assert.equal(listApiJson.data.items.length, 2);

    const fromListApiRes = await mf.dispatchFetch(
      "http://localhost/api/emails?address=demouser@yourdomain.com&from=SECURITY",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(fromListApiRes.status, 200);
    const fromListApiJson = await fromListApiRes.json();
    assert.equal(fromListApiJson.data.items.length, 1);
    assert.equal(fromListApiJson.data.items[0].from_address, "security@example.com");

    const fromLatestApiRes = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=demouser@yourdomain.com&from=security",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(fromLatestApiRes.status, 200);
    const fromLatestApiJson = await fromLatestApiRes.json();
    assert.equal(fromLatestApiJson.data.results[0].value, "849201");

    // 13. Admin search + preview + edit rule + delete email
    const adminSearchRes = await mf.dispatchFetch(
      "http://localhost/admin/emails?page=1&only_matched=true",
      { headers: { Cookie: cookie } }
    );
    const adminSearchJson = await adminSearchRes.json();
    assert.equal(adminSearchJson.data.total, 1);
    assert.match(adminSearchJson.data.items[0].text_preview, /849201/);

    // 13.1 Fetch raw email content (text_body, html_body, raw_eml) & test html target rule
    const rawContentRes = await mf.dispatchFetch(
      `http://localhost/admin/emails/${encodeURIComponent(latestJson.data.message_id)}/content`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(rawContentRes.status, 200);
    const rawContentJson = await rawContentRes.json();
    assert.equal(rawContentJson.data.has_raw, true);
    assert.match(rawContentJson.data.html_body, /<strong>849201<\/strong>/);
    assert.match(rawContentJson.data.text_body, /modern HTML email client/);
    assert.match(rawContentJson.data.raw_eml, /Content-Type: multipart\/alternative/);

    const htmlRuleTestRes = await mf.dispatchFetch("http://localhost/admin/rules/test", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        message_id: latestJson.data.message_id,
        match_target: "html",
        pattern: "<strong>(\\d{6})</strong>"
      })
    });
    assert.equal(htmlRuleTestRes.status, 200);
    const htmlRuleTestJson = await htmlRuleTestRes.json();
    assert.equal(htmlRuleTestJson.data.matched, true);
    assert.equal(htmlRuleTestJson.data.results[0].value, "849201");

    const emptyHtmlOverrideRes = await mf.dispatchFetch("http://localhost/admin/rules/test", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        message_id: latestJson.data.message_id,
        match_target: "html",
        pattern: "<strong>(\\d{6})</strong>",
        html: ""
      })
    });
    assert.equal(emptyHtmlOverrideRes.status, 200);
    assert.equal((await emptyHtmlOverrideRes.json()).data.matched, false);

    // 13.2 Dedicated tester options endpoint exposes full rules & recent emails
    const testerOptionsRes = await mf.dispatchFetch("http://localhost/admin/tester/options", {
      headers: { Cookie: cookie }
    });
    assert.equal(testerOptionsRes.status, 200);
    const testerOptionsJson = await testerOptionsRes.json();
    assert.ok(testerOptionsJson.data.rules.length >= 1);
    assert.ok(testerOptionsJson.data.emails.length >= 2);

    const rulesRes = await mf.dispatchFetch("http://localhost/admin/rules?page=1", {
      headers: { Cookie: cookie }
    });
    const ruleId = (await rulesRes.json()).data.items[0].id;
    const putRuleRes = await mf.dispatchFetch(`http://localhost/admin/rules/${ruleId}`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        remark: "验证码-已修改",
        sender_filter: ".*@example\\.com",
        pattern: "code is:?\\s*(\\d{6})",
        match_target: "both",
        enabled: true
      })
    });
    assert.equal(putRuleRes.status, 200);

    // 13.3 Re-apply updated rules against stored email content
    const reparseRes = await mf.dispatchFetch(
      `http://localhost/admin/emails/${encodeURIComponent(latestJson.data.message_id)}/reparse`,
      { method: "POST", headers: { Cookie: cookie } }
    );
    assert.equal(reparseRes.status, 200);
    const reparseJson = await reparseRes.json();
    assert.equal(reparseJson.data.results[0].remark, "验证码-已修改");
    assert.equal(reparseJson.data.results[0].value, "849201");

    const afterReparseLatest = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=backup@yourdomain.com",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(afterReparseLatest.status, 200);
    assert.equal((await afterReparseLatest.json()).data.results[0].remark, "验证码-已修改");

    // 13.5 Test delete single email + verify cascading cleanup
    const delEmailRes = await mf.dispatchFetch(
      `http://localhost/admin/emails/${encodeURIComponent(latestJson.data.message_id)}`,
      { method: "DELETE", headers: { Cookie: cookie } }
    );
    assert.equal(delEmailRes.status, 200);
    const afterDelLatest = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=backup@yourdomain.com",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(afterDelLatest.status, 404);

    // 14. Cron cleanup deletes records older than 24h while keeping recent ones
    const db = await mf.getD1Database("DB");
    const oldTime = Date.now() - 25 * 60 * 60 * 1000;
    const insertOld = await db
      .prepare(
        "INSERT INTO emails (message_id, from_address, to_address, subject, extracted_json, text_preview, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind("old-msg-1", "old@example.com", "demouser@yourdomain.com", "Old", "[]", "old", oldTime)
      .run();
    await db
      .prepare("INSERT INTO email_recipients (email_id, recipient, received_at) VALUES (?, ?, ?)")
      .bind(insertOld.meta.last_row_id, "demouser@yourdomain.com", oldTime)
      .run();

    const worker = await mf.getWorker("temp-email-worker");
    const sched = await worker.scheduled({ cron: "0 * * * *" });
    assert.equal(sched.outcome, "ok");

    const oldAfterCron = await db
      .prepare("SELECT COUNT(1) as cnt FROM emails WHERE message_id = ?")
      .bind("old-msg-1")
      .first();
    assert.equal(Number(oldAfterCron.cnt), 0);

    // 15. Bulk clear all remaining emails from inbox
    const clearAllRes = await mf.dispatchFetch("http://localhost/admin/emails", {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    assert.equal(clearAllRes.status, 200);
    const clearAllJson = await clearAllRes.json();
    assert.equal(clearAllJson.data.ok, true);
    assert.ok(clearAllJson.data.deleted >= 1);

    const afterClearList = await mf.dispatchFetch("http://localhost/admin/emails?page=1", {
      headers: { Cookie: cookie }
    });
    assert.equal(afterClearList.status, 200);
    const afterClearJson = await afterClearList.json();
    assert.equal(afterClearJson.data.total, 0);
    assert.equal(afterClearJson.data.items.length, 0);
  } finally {
    await mf.dispose();
  }
});

test("legacy schema migration upgrades v1 tables and backfills recipients automatically", async () => {
  const mf = createMiniflare();
  try {
    const db = await mf.getD1Database("DB");
    await db.batch([
      db.prepare(
        "CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, from_address TEXT NOT NULL, to_address TEXT NOT NULL, subject TEXT NOT NULL, extracted_json TEXT NOT NULL, received_at INTEGER NOT NULL)"
      ),
      db.prepare(
        "CREATE TABLE rules (id INTEGER PRIMARY KEY AUTOINCREMENT, remark TEXT, sender_filter TEXT, pattern TEXT NOT NULL, created_at INTEGER NOT NULL)"
      ),
      db.prepare(
        "CREATE TABLE whitelist (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_pattern TEXT NOT NULL, created_at INTEGER NOT NULL)"
      ),
      db
        .prepare(
          "INSERT INTO emails (message_id, from_address, to_address, subject, extracted_json, received_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind("legacy-1", "a@example.com", "LegacyUser@Domain.COM,Other@Domain.COM", "Legacy", '[{"rule_id":1,"value":"999999","remark":"code"}]', Date.now())
    ]);

    const res = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=legacyuser@domain.com",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.message_id, "legacy-1");
    assert.equal(body.data.results[0].value, "999999");

    // Verify new columns exist and version was recorded
    const meta = await db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").first();
    assert.equal(meta.value, "3");

    // Verify legacy email content endpoint degrades gracefully with has_raw: false
    const legacyCookie = await loginAsAdmin(mf);
    const legacyRawRes = await mf.dispatchFetch("http://localhost/admin/emails/legacy-1/content", {
      headers: { Cookie: legacyCookie }
    });
    assert.equal(legacyRawRes.status, 200);
    const legacyRawJson = await legacyRawRes.json();
    assert.equal(legacyRawJson.data.has_raw, false);
  } finally {
    await mf.dispose();
  }
});


test("complex email scenarios: Base64 magic link, nested attachment with subject OTP, and Quoted-Printable multi-rule extraction", async () => {
  const mf = createMiniflare();
  try {
    const cookie = await loginAsAdmin(mf);

    const rulesToCreate = [
      {
        remark: "魔法登录链接",
        sender_filter: ".*@acme-auth\\.io",
        pattern: 'href="(https://auth\\.acme-auth\\.io/magic\\?[^"]+)"',
        match_target: "html"
      },
      {
        remark: "安全校验码",
        sender_filter: ".*@acme-auth\\.io",
        pattern: "安全校验码[:：]\\s*(\\d{6})",
        match_target: "body"
      },
      {
        remark: "主题动态口令",
        sender_filter: "noreply@acmecloud\\.com",
        pattern: "动态登录口令[:：]\\s*([A-Z0-9]{4}-[A-Z0-9]{4})",
        match_target: "subject"
      },
      {
        remark: "订单号",
        sender_filter: "billing@shop-demo\\.cn",
        pattern: "订单号[:：]\\s*(ORD-\\d{8}-\\d{4})",
        match_target: "body"
      },
      {
        remark: "实付金额",
        sender_filter: "billing@shop-demo\\.cn",
        pattern: "实付金额[:：]\\s*[¥￥]?([0-9]+\\.[0-9]{2})",
        match_target: "body"
      },
      {
        remark: "安全验证码",
        sender_filter: "billing@shop-demo\\.cn",
        pattern: "安全验证码[:：]\\s*(\\d{6})",
        match_target: "body"
      }
    ];

    for (const rule of rulesToCreate) {
      const res = await mf.dispatchFetch("http://localhost/admin/rules", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify(rule)
      });
      assert.equal(res.status, 200);
    }

    // 1) Base64 HTML magic link + safety code + CSS hex noise
    const eml1 = fs.readFileSync(path.resolve("test/fixtures/complex-magic-link.eml"), "utf8");
    const r1 = await mf.dispatchFetch(
      "http://localhost/cdn-cgi/handler/email?from=no-reply@acme-auth.io&to=alice.dev@yourdomain.com",
      { method: "POST", body: eml1 }
    );
    assert.equal(r1.status, 200);

    const api1 = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=alice.dev@yourdomain.com",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(api1.status, 200);
    const data1 = (await api1.json()).data;
    const map1 = Object.fromEntries(data1.results.map((item) => [item.remark, item.value]));
    assert.equal(
      map1["魔法登录链接"],
      "https://auth.acme-auth.io/magic?token=tk_live_9f8a7b6c5d&redirect=%2Fconsole"
    );
    assert.equal(map1["安全校验码"], "739204");

    // 2) Nested multipart/mixed with attachment & subject OTP
    const eml2 = fs.readFileSync(
      path.resolve("test/fixtures/complex-multipart-attachment.eml"),
      "utf8"
    );
    const r2 = await mf.dispatchFetch(
      "http://localhost/cdn-cgi/handler/email?from=noreply@acmecloud.com&to=ops@yourdomain.com",
      { method: "POST", body: eml2 }
    );
    assert.equal(r2.status, 200);

    const api2 = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=audit@yourdomain.com",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(api2.status, 200);
    const data2 = (await api2.json()).data;
    assert.equal(data2.results.length, 1);
    assert.equal(data2.results[0].remark, "主题动态口令");
    assert.equal(data2.results[0].value, "K9M4-X7P2");

    // Verify raw content endpoint still preserves decoded HTML & raw EML even with attachments
    const raw2 = await mf.dispatchFetch(
      `http://localhost/admin/emails/${encodeURIComponent(data2.message_id)}/content`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(raw2.status, 200);
    const raw2Data = (await raw2.json()).data;
    assert.match(raw2Data.html_body, /102938/);
    assert.match(raw2Data.raw_eml, /audit-log\.txt/);

    // 3) Quoted-Printable HTML email hitting 3 rules simultaneously while ignoring HTML comment 000000
    const eml3 = fs.readFileSync(path.resolve("test/fixtures/complex-multi-rule-qp.eml"), "utf8");
    const r3 = await mf.dispatchFetch(
      "http://localhost/cdn-cgi/handler/email?from=billing@shop-demo.cn&to=buyer@yourdomain.com",
      { method: "POST", body: eml3 }
    );
    assert.equal(r3.status, 200);

    const api3 = await mf.dispatchFetch(
      "http://localhost/api/emails/latest?address=buyer@yourdomain.com",
      { headers: { Authorization: "Bearer test-api-secret" } }
    );
    assert.equal(api3.status, 200);
    const data3 = (await api3.json()).data;
    const map3 = Object.fromEntries(data3.results.map((item) => [item.remark, item.value]));
    assert.equal(map3["订单号"], "ORD-20261125-8841");
    assert.equal(map3["实付金额"], "199.00");
    assert.equal(map3["安全验证码"], "391048");
    assert.equal(data3.results.length, 3);
  } finally {
    await mf.dispose();
  }
});
