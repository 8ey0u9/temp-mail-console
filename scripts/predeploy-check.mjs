import fs from "node:fs";
import path from "node:path";

const ciMode = process.argv.includes("--ci");
const wranglerPath = path.resolve("wrangler.toml");
const rawContent = fs.readFileSync(wranglerPath, "utf8");

// 剥离 TOML 行尾/整行注释，避免注释说明文本触发误报
const activeLines = rawContent
  .split(/\r?\n/)
  .map((line) => line.replace(/#.*$/, "").trim())
  .filter(Boolean);

for (const line of activeLines) {
  if (/^(ADMIN_TOKEN|API_TOKEN)\s*=/.test(line)) {
    console.error(
      `[security] 安全拦截: 禁止在 wrangler.toml 中直接配置 ${line.split("=")[0].trim()}，请使用 Cloudflare Secrets 或本地 .dev.vars。`
    );
    process.exit(1);
  }
  if (/^FORWARD_TO\s*=\s*(?!""$|''$)\S+/.test(line)) {
    console.error(
      "[security] 安全拦截: 禁止将真实转发邮箱 FORWARD_TO 写入公开 wrangler.toml，请改为 Cloudflare Secret 或本地 .dev.vars。"
    );
    process.exit(1);
  }
}

const weakTokens = ["dev-admin-token", "dev-api-token", "root"];
for (const weak of weakTokens) {
  const activeText = activeLines.join("\n");
  if (activeText.includes(`"${weak}"`) || activeText.includes(`'${weak}'`)) {
    console.error(
      `[security] 安全拦截: wrangler.toml 中包含默认弱口令 ${weak}，请改用 wrangler secret put 配置生产密钥。`
    );
    process.exit(1);
  }
}

if (!ciMode) {
  const dbLine = activeLines.find((line) => /^database_id\s*=/.test(line)) || "";
  const dbMatch = dbLine.match(/^database_id\s*=\s*["']([^"']*)["']/);
  const dbId = dbMatch ? dbMatch[1].trim() : "";
  if (!dbId || dbId === "REPLACE_WITH_YOUR_D1_DATABASE_ID") {
    console.error(
      "[predeploy] 错误: wrangler.toml 中的 database_id 为空或仍为占位符，请先执行 npx wrangler d1 create temp-email-db 并填入真实 UUID。"
    );
    process.exit(1);
  }
}

console.log(`[predeploy] ${ciMode ? "CI 仓库安全扫描" : "部署配置安全检查"}通过。`);
