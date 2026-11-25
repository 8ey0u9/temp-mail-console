import fs from "node:fs";
import path from "node:path";

function parseJsonc(raw) {
  const withoutComments = raw.replace(
    /("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    (match, str) => str || ""
  );
  const cleanJson = withoutComments.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(cleanJson);
}

const ciMode = process.argv.includes("--ci");
const configPath = path.resolve("wrangler.jsonc");
if (!fs.existsSync(configPath)) {
  console.error("[security] 错误: 未找到 wrangler.jsonc 配置文件。");
  process.exit(1);
}

let config;
try {
  config = parseJsonc(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  console.error(`[security] 错误: wrangler.jsonc 解析失败: ${err.message}`);
  process.exit(1);
}

const vars = config?.vars && typeof config.vars === "object" ? config.vars : {};
for (const secretKey of ["ADMIN_TOKEN", "API_TOKEN"]) {
  if (Object.prototype.hasOwnProperty.call(vars, secretKey)) {
    console.error(
      `[security] 安全拦截: 禁止在 wrangler.jsonc 的 vars 中配置 ${secretKey}，请使用控制台初始化/设置或 Cloudflare Secrets。`
    );
    process.exit(1);
  }
}

if (String(vars.FORWARD_TO || "").trim() !== "") {
  console.error(
    "[security] 安全拦截: 禁止将真实转发邮箱 FORWARD_TO 写入公开 wrangler.jsonc，请在控制台系统设置中配置。"
  );
  process.exit(1);
}

const weakTokens = ["dev-admin-token", "dev-api-token", "root"];
const varsText = JSON.stringify(vars);
for (const weak of weakTokens) {
  if (varsText.includes(`"${weak}"`)) {
    console.error(`[security] 安全拦截: wrangler.jsonc 中包含默认弱口令 ${weak}。`);
    process.exit(1);
  }
}

if (!ciMode) {
  const d1List = Array.isArray(config?.d1_databases) ? config.d1_databases : [];
  const dbId = String(d1List[0]?.database_id || "").trim();
  if (!dbId || dbId === "REPLACE_WITH_YOUR_D1_DATABASE_ID") {
    console.error(
      "[predeploy] 错误: wrangler.jsonc 中的 database_id 为空或仍为占位符，请先执行 npx wrangler d1 create temp-email-db 并填入真实 UUID。"
    );
    process.exit(1);
  }
}

console.log(`[predeploy] ${ciMode ? "CI 仓库安全扫描" : "部署配置安全检查"}通过。`);
