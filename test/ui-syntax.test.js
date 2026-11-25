import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

function collectKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, next));
    } else {
      keys.push(next);
    }
  }
  return keys.sort();
}

test("public static assets exist, parse cleanly, and i18n dictionaries stay aligned", () => {
  const assetFiles = [
    "public/_headers",
    "public/auth.html",
    "public/console.html",
    "public/assets/app.css",
    "public/assets/theme.css",
    "public/assets/vue.global.prod.js",
    "public/assets/preinit.js",
    "public/assets/i18n.js",
    "public/assets/auth.js",
    "public/assets/console.js",
    "migrations/0001_init.sql"
  ];
  for (const relPath of assetFiles) {
    assert.equal(fs.existsSync(path.resolve(relPath)), true, `Missing asset file: ${relPath}`);
  }

  for (const jsRel of assetFiles.filter((p) => p.endsWith(".js") && !p.endsWith(".prod.js"))) {
    const code = fs.readFileSync(path.resolve(jsRel), "utf8");
    assert.doesNotThrow(() => new vm.Script(code, { filename: jsRel }));
  }

  const i18nCode = fs.readFileSync(path.resolve("public/assets/i18n.js"), "utf8");
  const sandbox = {};
  vm.runInNewContext(i18nCode, sandbox);
  const { TMC_I18N, tmcHasKey } = sandbox;
  assert.ok(TMC_I18N?.zh && TMC_I18N?.en);
  assert.deepEqual(collectKeys(TMC_I18N.zh), collectKeys(TMC_I18N.en));
  assert.equal(typeof tmcHasKey, "function");
  assert.equal(tmcHasKey("zh", "errors.INVALID_REGEX"), true);
  assert.equal(tmcHasKey("zh", "errors.RATE_LIMITED"), true);
  assert.equal(tmcHasKey("en", "errors.RATE_LIMITED"), true);
  assert.equal(tmcHasKey("en", "errors.EMAIL_NOT_FOUND"), true);
  assert.equal(tmcHasKey("zh", "errors.NON_EXISTENT"), false);
  assert.match(TMC_I18N.zh.header.brandSub, /Cloudflare Workers · D1 Database · Free Plan/);
  assert.match(TMC_I18N.en.header.brandSub, /Cloudflare Workers · D1 Database · Free Plan/);

  const css = fs.readFileSync(path.resolve("public/assets/theme.css"), "utf8");
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /\[v-cloak\]/);

  const migrationSql = fs.readFileSync(path.resolve("migrations/0001_init.sql"), "utf8");
  for (const table of ["schema_meta", "emails", "email_contents", "email_recipients", "rules", "whitelist"]) {
    assert.match(migrationSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
});

test("static HTML pages bundle local assets without third-party runtime CDNs", () => {
  const authHtml = fs.readFileSync(path.resolve("public/auth.html"), "utf8");
  assert.doesNotMatch(authHtml, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(authHtml, /unpkg\.com/);
  assert.match(authHtml, /\/assets\/app\.css/);
  assert.match(authHtml, /\/assets\/theme\.css/);
  assert.match(authHtml, /\/assets\/i18n\.js/);
  assert.match(authHtml, /\/assets\/auth\.js/);
  assert.match(authHtml, /data-auth-view="setup"/);
  assert.match(authHtml, /data-auth-view="weak"/);
  assert.match(authHtml, /data-auth-view="missing"/);
  assert.match(authHtml, /data-auth-view="login"/);

  const consoleHtml = fs.readFileSync(path.resolve("public/console.html"), "utf8");
  assert.doesNotMatch(consoleHtml, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(consoleHtml, /unpkg\.com/);
  assert.match(consoleHtml, /v-cloak/);
  assert.match(consoleHtml, /\/assets\/app\.css/);
  assert.match(consoleHtml, /\/assets\/vue\.global\.prod\.js/);
  assert.match(consoleHtml, /\/assets\/console\.js/);
  assert.match(consoleHtml, /activeTab === 'settings'/);
  assert.match(consoleHtml, /data-page-size="20"/);
  assert.match(consoleHtml, /data-rules-page-size="12"/);
  assert.doesNotMatch(consoleHtml, /grid-cols-\[[^\]]*,[^\]]*\]/);

  const appCss = fs.readFileSync(path.resolve("public/assets/app.css"), "utf8");
  assert.match(appCss, /grid-template-columns:1\.45fr \.95fr 1fr 1fr \.7fr/);
});
