import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  constantTimeEqual,
  getBearerToken,
  getTokenSecurityState,
  hashAdminPassword,
  isAdminAuthorized,
  isApiAuthorized,
  isLocalDevRequest,
  isWeakOrMissingToken,
  signSessionToken,
  validateSecretValue,
  verifyAdminPassword,
  verifySessionToken,
  DEFAULT_ADMIN_TOKENS,
  parseCookies
} from "../src/auth.js";
import {
  applyRules,
  extractUniqueAddresses,
  pickPreviewText,
  senderInWhitelist,
  senderMatches,
  stripHtmlToText,
  validateForwardEmail,
  validateRegexPattern,
  validateSenderFilter
} from "../src/email.js";
import { clampLimit, clampPage, safeParseJson } from "../src/http.js";
import { parseRetentionHours } from "../src/index.js";

test("parseCookies tolerates malformed URI sequences", () => {
  const parsed = parseCookies("bad=%E0%A4%A; admin_token=abc%20123; empty=; =noname");
  assert.equal(parsed.bad, "%E0%A4%A");
  assert.equal(parsed.admin_token, "abc 123");
  assert.equal(parsed.empty, "");
  assert.equal(Object.hasOwn(parsed, ""), false);
});

test("constantTimeEqual and authorization helpers work correctly", () => {
  assert.equal(constantTimeEqual("secret-123", "secret-123"), true);
  assert.equal(constantTimeEqual("secret-123", "secret-124"), false);
  assert.equal(constantTimeEqual("secret", "secret-long"), false);

  const reqBearer = new Request("https://example.com/api/emails/latest", {
    headers: { Authorization: "Bearer my-api-token" }
  });
  assert.equal(getBearerToken(reqBearer), "my-api-token");
  assert.equal(isApiAuthorized(reqBearer, "my-api-token"), true);
  assert.equal(isApiAuthorized(reqBearer, "other"), false);
  assert.equal(isApiAuthorized(reqBearer, ""), false);

  const reqCookie = new Request("https://example.com/", {
    headers: { Cookie: "admin_token=my-admin-token" }
  });
  assert.equal(isAdminAuthorized(reqCookie, "my-admin-token"), true);
  assert.equal(isAdminAuthorized(reqCookie, "wrong"), false);

  const httpsCookie = buildSessionCookie("tok+1", new Request("https://mail.example.com/"));
  assert.match(httpsCookie, /HttpOnly/);
  assert.match(httpsCookie, /SameSite=Lax/);
  assert.match(httpsCookie, /Secure/);

  const httpCookie = buildClearSessionCookie(new Request("http://localhost:8787/"));
  assert.match(httpCookie, /Max-Age=0/);
  assert.doesNotMatch(httpCookie, /Secure/);

  assert.equal(isWeakOrMissingToken("dev-admin-token", DEFAULT_ADMIN_TOKENS), true);
  assert.equal(isWeakOrMissingToken("", DEFAULT_ADMIN_TOKENS), true);
  assert.equal(isWeakOrMissingToken("strong-random-token", DEFAULT_ADMIN_TOKENS), false);

  const localReq = new Request("http://localhost:8787/");
  const prodReq = new Request("https://mail.example.com/");
  assert.equal(isLocalDevRequest(localReq), true);
  assert.equal(isLocalDevRequest(prodReq), false);
  assert.equal(getTokenSecurityState("", DEFAULT_ADMIN_TOKENS, localReq), "missing");
  assert.equal(getTokenSecurityState("dev-admin-token", DEFAULT_ADMIN_TOKENS, localReq), "ok");
  assert.equal(getTokenSecurityState("dev-admin-token", DEFAULT_ADMIN_TOKENS, prodReq), "weak");
  assert.equal(getTokenSecurityState("strong-random-token", DEFAULT_ADMIN_TOKENS, prodReq), "ok");
});

test("stripHtmlToText removes tags/scripts/styles and decodes entities", () => {
  const html = `
    <html>
      <head><style>body { color: #123456; }</style></head>
      <body>
        <!-- comment 654321 -->
        <script>const x = 999999;</script>
        <p>Hello&nbsp;World &amp; &quot;Team&quot;</p>
        <div>Code: <b>123456</b>&#39;s valid</div>
      </body>
    </html>
  `;
  const text = stripHtmlToText(html);
  assert.doesNotMatch(text, /#123456/);
  assert.doesNotMatch(text, /654321/);
  assert.doesNotMatch(text, /999999/);
  assert.match(text, /Hello World & "Team"/);
  assert.match(text, /Code: 123456 's valid|Code: 123456's valid/);
});

test("pickPreviewText prefers HTML text when plain text is a short placeholder", () => {
  const preview = pickPreviewText(
    "Please view in HTML",
    "Welcome! Your verification code is 849201 and it expires in 10 minutes. Do not share it."
  );
  assert.match(preview, /849201/);
});

test("applyRules supports capture groups, match_target, disabled rules and HTML fallback", () => {
  const rules = [
    {
      id: 1,
      remark: "正文捕获组",
      sender_filter: ".*@example\\.com",
      pattern: "code is:\\s*(\\d{6})",
      match_target: "body",
      enabled: 1
    },
    {
      id: 2,
      remark: "主题匹配",
      sender_filter: "",
      pattern: "\\[Service\\]\\s+Your code is (\\d{6})",
      match_target: "subject",
      enabled: true
    },
    {
      id: 3,
      remark: "禁用规则",
      sender_filter: "",
      pattern: "(\\d{6})",
      match_target: "both",
      enabled: 0
    },
    {
      id: 4,
      remark: "无捕获组",
      sender_filter: "",
      pattern: "\\b849201\\b",
      match_target: "body",
      enabled: 1
    },
    {
      id: 5,
      remark: "HTML属性提取",
      sender_filter: "",
      pattern: 'href="(https://[^"]+)"',
      match_target: "html",
      enabled: 1
    }
  ];

  const results = applyRules(
    {
      subject: "[Service] Your code is 849201",
      text: "Please view this email in HTML",
      html: '<p>Your verification code is: 849201.</p><a href="https://example.com/verify?t=abc">Verify</a>',
      htmlText: "Your verification code is: 849201."
    },
    "Security@Example.COM",
    rules
  );

  assert.deepEqual(results, [
    { rule_id: 1, value: "849201", remark: "正文捕获组" },
    { rule_id: 2, value: "849201", remark: "主题匹配" },
    { rule_id: 4, value: "849201", remark: "无捕获组" },
    { rule_id: 5, value: "https://example.com/verify?t=abc", remark: "HTML属性提取" }
  ]);
});

test("whitelist and regex validators handle enabled flags and invalid syntax", () => {
  assert.equal(senderInWhitelist("a@example.com", []), true);
  assert.equal(
    senderInWhitelist("a@evil.com", [{ sender_pattern: ".*@example\\.com", enabled: 1 }]),
    false
  );
  assert.equal(
    senderInWhitelist("a@evil.com", [{ sender_pattern: ".*@example\\.com", enabled: 0 }]),
    true
  );

  assert.equal(senderMatches("noreply@foo.com", "bar.com,\nnoreply@foo\\.com"), true);
  const badRegex = validateRegexPattern("[invalid");
  assert.equal(badRegex.ok, false);
  assert.equal(badRegex.errorCode, "INVALID_REGEX");
  assert.equal(typeof badRegex.errorMeta?.detail, "string");
  assert.equal(validateRegexPattern("").errorCode, "PATTERN_REQUIRED");
  assert.equal(validateRegexPattern("", { field: "sender_pattern" }).errorCode, "WHITELIST_PATTERN_REQUIRED");
  assert.equal(validateRegexPattern("", { field: "sender_filter" }).errorCode, "SENDER_FILTER_REQUIRED");
  const tooLong = validateRegexPattern("a".repeat(501));
  assert.equal(tooLong.errorCode, "REGEX_TOO_LONG");
  assert.equal(tooLong.errorMeta?.max, 500);
  assert.equal(validateRegexPattern("\\b(\\d{6})\\b").ok, true);
  const badFilter = validateSenderFilter("ok@a.com, [broken");
  assert.equal(badFilter.ok, false);
  assert.equal(badFilter.errorCode, "INVALID_SENDER_FILTER");
  assert.equal(validateSenderFilter("").ok, true);
});

test("http and config utilities clamp inputs safely", () => {
  assert.equal(clampPage("0"), 1);
  assert.equal(clampPage("3.8"), 3);
  assert.equal(clampLimit("100", 20, 50), 50);
  assert.equal(clampLimit("invalid", 20, 50), 20);
  assert.deepEqual(safeParseJson('{"a":1}'), { a: 1 });
  assert.equal(safeParseJson("bad-json"), null);
  assert.deepEqual(extractUniqueAddresses([" A@B.com ", "a@b.com", "c@d.com"]), ["a@b.com", "c@d.com"]);
  assert.equal(parseRetentionHours("24"), 24);
  assert.equal(parseRetentionHours("0"), 48);
  assert.equal(parseRetentionHours(undefined), 48);
});

test("PBKDF2 password hashing, HMAC session tokens, and settings validators work correctly", async () => {
  const hashed = await hashAdminPassword("StrongPass#2026");
  assert.equal(hashed.salt.length, 32);
  assert.equal(hashed.hash.length, 64);
  assert.equal(hashed.iterations, 20000);
  assert.equal(await verifyAdminPassword("StrongPass#2026", hashed), true);
  assert.equal(await verifyAdminPassword("WrongPass#2026", hashed), false);

  const legacyHashed = await hashAdminPassword("LegacyPass#100k", undefined, 100000);
  assert.equal(
    await verifyAdminPassword("LegacyPass#100k", { salt: legacyHashed.salt, hash: legacyHashed.hash }),
    true
  );

  const sessionTok = await signSessionToken("secret-key-hex");
  assert.equal(await verifySessionToken(sessionTok, "secret-key-hex"), true);
  assert.equal(await verifySessionToken(sessionTok, "other-secret"), false);
  assert.equal(await verifySessionToken(sessionTok.replace("v1.", "v2."), "secret-key-hex"), false);

  assert.equal(validateSecretValue("").errorCode, "SECRET_REQUIRED");
  assert.equal(validateSecretValue("1234567").errorCode, "SECRET_TOO_SHORT");
  assert.equal(validateSecretValue("dev-admin-token").errorCode, "DISALLOWED_DEFAULT_SECRET");
  assert.equal(validateSecretValue("ValidSecret#123").ok, true);
  assert.equal(validateSecretValue("", { kind: "api" }).errorCode, "API_TOKEN_REQUIRED");

  assert.equal(validateForwardEmail("", { required: true }).errorCode, "FORWARD_EMAIL_REQUIRED");
  assert.equal(validateForwardEmail("", { required: false }).ok, true);
  assert.equal(validateForwardEmail("bad-email").errorCode, "INVALID_FORWARD_EMAIL");
  assert.equal(validateForwardEmail(" User@Example.COM ", { required: true }).value, "user@example.com");
});
