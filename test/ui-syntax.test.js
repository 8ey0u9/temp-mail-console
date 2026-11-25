import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { ASSET_VERSION, renderAuthHtml, renderHtml } from "../src/ui.js";

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
    "public/assets/theme.css",
    "public/assets/preinit.js",
    "public/assets/i18n.js",
    "public/assets/auth.js",
    "public/assets/console.js"
  ];
  for (const relPath of assetFiles) {
    assert.equal(fs.existsSync(path.resolve(relPath)), true, `Missing asset file: ${relPath}`);
  }

  for (const jsRel of assetFiles.filter((p) => p.endsWith(".js"))) {
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
  assert.equal(tmcHasKey("en", "errors.EMAIL_NOT_FOUND"), true);
  assert.equal(tmcHasKey("zh", "errors.NON_EXISTENT"), false);
  assert.match(TMC_I18N.zh.header.brandSub, /Cloudflare Workers · D1 Database/);
  assert.match(TMC_I18N.en.header.brandSub, /Cloudflare Workers · D1 Database/);

  const css = fs.readFileSync(path.resolve("public/assets/theme.css"), "utf8");
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /\[v-cloak\]/);
});

test("rendered HTML shells reference versioned static assets and contain no inline bloated scripts", () => {
  const authHtml = renderAuthHtml({ missingAdminToken: false });
  assert.match(authHtml, new RegExp(`/assets/theme\\.css\\?v=${ASSET_VERSION}`));
  assert.match(authHtml, new RegExp(`/assets/i18n\\.js\\?v=${ASSET_VERSION}`));
  assert.match(authHtml, new RegExp(`/assets/auth\\.js\\?v=${ASSET_VERSION}`));

  const missingTokenHtml = renderAuthHtml({ missingAdminToken: true });
  assert.match(missingTokenHtml, /ADMIN_TOKEN/);
  assert.match(missingTokenHtml, new RegExp(`/assets/auth\\.js\\?v=${ASSET_VERSION}`));
  assert.doesNotMatch(missingTokenHtml, /<form/);

  const weakTokenHtml = renderAuthHtml({ weakAdminToken: true });
  assert.match(weakTokenHtml, /auth\.weakTitle/);
  assert.doesNotMatch(weakTokenHtml, /<form/);

  const setupHtml = renderAuthHtml({ setupMode: true });
  assert.match(setupHtml, /setup-token/);
  assert.match(setupHtml, /setup-token-confirm/);
  assert.match(setupHtml, /auth\.setupHeading/);

  const consoleHtml = renderHtml({ pageSize: 20, rulesPageSize: 12 });
  assert.match(consoleHtml, /v-cloak/);
  assert.match(consoleHtml, new RegExp(`/assets/console\\.js\\?v=${ASSET_VERSION}`));
  assert.match(consoleHtml, /activeTab === 'settings'/);
  assert.match(consoleHtml, /data-page-size="20"/);
  assert.match(consoleHtml, /data-rules-page-size="12"/);
});
