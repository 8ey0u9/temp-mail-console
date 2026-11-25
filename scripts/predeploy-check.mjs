import fs from "node:fs";
import path from "node:path";

const wranglerPath = path.resolve("wrangler.toml");
const content = fs.readFileSync(wranglerPath, "utf8");

if (content.includes("REPLACE_WITH_YOUR_D1_DATABASE_ID")) {
  console.error(
    "[predeploy] 错误: wrangler.toml 中的 database_id 仍为占位符 REPLACE_WITH_YOUR_D1_DATABASE_ID，请先替换为真实 D1 Database ID。"
  );
  process.exit(1);
}

const weakTokens = ["dev-admin-token", "dev-api-token"];
for (const weak of weakTokens) {
  if (content.includes(`"${weak}"`) || content.includes(`'${weak}'`)) {
    console.error(
      `[predeploy] 安全拦截: wrangler.toml 中包含默认弱口令 ${weak}，请改用 wrangler secret put 配置生产密钥。`
    );
    process.exit(1);
  }
}

console.log("[predeploy] 部署配置安全检查通过。");
