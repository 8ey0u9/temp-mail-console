# Temp Mail Console

基于 **Cloudflare Workers + D1 + Static Assets** 的临时邮箱控制台。接收邮件后，根据可配置的正则规则自动提取关键数据（如验证码、登录链接），并通过控制台与 RESTful API 对外提供管理与查询能力。

## 功能特性

- 🧩 **控制台管理**：支持邮件多维筛选、命中状态徽章、重新提取、原文沙箱预览（HTML / 纯文本 / EML）及一键清空。
- 🧪 **规则与在线测试**：支持多目标正则匹配（主题 / 正文 / HTML 源码）、原地编辑启停、常用模板与在线试跑。
- 🌐 **双语与双主题**：支持中文 / English 实时切换，以及深色 / 浅色双主题模式。
- 🛡️ **发件人白名单**：基于正则表达式过滤发信人，支持启停控制与拦截统计；无启用规则时接收所有邮件。
- 🖥️ **RESTful API**：支持按收件人、发件人（`from`）、时间游标（`since`）及命中状态查询结果。
- 🔄 **转发与自动清理**：支持 `FORWARD_TO` 自动转发原件，Cron 每小时清理过期记录（默认保留 48 小时）。
- ☁️ **边缘托管架构**：基于 Cloudflare Workers + D1 + Static Assets 部署，内置配置防泄露安全门禁。

## 界面预览

<table>
  <tr>
    <td align="center"><img src="images/pqvxt.png" alt="控制台-邮件列表" width="260" /></td>
    <td align="center"><img src="images/nldhs.png" alt="控制台-命中规则" width="260" /></td>
    <td align="center"><img src="images/kbrya.png" alt="控制台-白名单" width="260" /></td>
  </tr>
</table>

## 快速开始

### 方式一：一键部署（推荐）

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/8ey0u9/temp-mail-console)

> 点击上方按钮会引导授权 GitHub 并自动创建 D1 数据库、部署 Static Assets 与 Worker：
> 1. **切勿将密钥或个人邮箱提交到公开 Fork 仓库**：请在安装向导提示中填入高强度 `ADMIN_TOKEN` 与 `API_TOKEN`（会自动加密写入 Cloudflare Workers Secrets，不会写入 Git），或部署后前往 Cloudflare Worker 的 **Settings -> Variables and Secrets** 配置 `ADMIN_TOKEN`、`API_TOKEN` 与可选的 `FORWARD_TO`。
> 2. **Fork 仓库隐私保护（强烈建议）**：Cloudflare 仅要求模板源仓库为 Public，**一键部署完成后可在你自己的 GitHub 仓库 Settings 中改为 Private（私有）**，Workers Builds 仍可正常构建，避免公开暴露配置。
> 3. **线上弱口令强阻断**：非 `localhost` 环境下若 `ADMIN_TOKEN` / `API_TOKEN` 未配置或仍为公开默认口令（`dev-admin-token` / `dev-api-token`），系统将直接拒绝登录和接口调用。

---

### 方式二：本地 CLI 部署（无需在 GitHub 创建公开 Fork，最安全）

#### 1. 安装依赖

```bash
npm install
```

#### 2. 创建 D1 数据库（首次）

```bash
npx wrangler d1 create temp-email-db
# 将输出的 UUID 填入 wrangler.toml 的 database_id 字段（无需提交密钥到仓库）
```

> 可选手动初始化表结构（系统首次运行时也会通过 `schema_meta` 自动完成幂等建表与增量版本迁移）：
> ```bash
> npx wrangler d1 execute temp-email-db --remote --file=schema.sql
> ```

#### 3. 配置本地与生产环境变量

- **本地开发**：复制 `.dev.vars.example` 为 `.dev.vars`（已在 `.gitignore` 中忽略，仅本地 `localhost` 允许使用默认口令 `dev-admin-token` / `dev-api-token`）：

```bash
cp .dev.vars.example .dev.vars
```

- **线上 Secrets（生产环境必配，切勿写入 `wrangler.toml`）**：

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put API_TOKEN
# 可选：自动转发目标邮箱（需在 Cloudflare Email Routing 中完成验证）
npx wrangler secret put FORWARD_TO
```

- 非敏感参数可在 `wrangler.toml` 的 `[vars]` 中调整，如 `RETENTION_HOURS = "48"`。

#### 4. 本地开发与自动化测试

```bash
# 启动本地开发服务（访问 http://localhost:8787）
npm run dev

# 运行全部测试（单元测试 + i18n与UI脚本校验 + 打包校验 + Miniflare/D1/Assets 全链路集成测试）
npm test
```

> 本地调试 Email Handler 可使用仓库内置复杂测试夹具：
> ```bash
> curl -X POST "http://localhost:8787/cdn-cgi/handler/email?from=no-reply@acme-auth.io&to=alice.dev@yourdomain.com" \
>   --data-binary @./test/fixtures/complex-magic-link.eml
> ```

#### 5. 安全校验与发布上线

`npm run deploy` 已内置 `predeploy` 门禁（CI 亦默认运行 `--ci` 安全扫描）：会拦截意外写进 `wrangler.toml` 的密钥（`ADMIN_TOKEN`/`API_TOKEN`）、真实转发邮箱（`FORWARD_TO`）、弱默认口令以及缺失的 `database_id`（`--ci` 模式仅做防泄露检查），随后执行完整测试套件与打包检查：

```bash
npm run deploy
```

部署完成后可请求 `GET https://<your-worker-domain>/healthz` 验证服务与 D1 连通性。

---

## 邮件路由配置 (Email Routing)

- 在 Cloudflare 控制台左侧菜单进入 **Email -> Email Routing -> Routes**
- 配置 **Catch-all address** 或具体的 **Custom addresses**，Destination 选择 `Send to a Worker` 并指向 `temp-email-worker`。

> [!IMPORTANT]
> 当动作设置为 **"Send to a Worker"** 时，Cloudflare 不会自动把邮件投递到你原本的个人收件箱。如既要提取规则数据又要接收原件，请配置 `FORWARD_TO`（需在 Email Routing 的 Destination addresses 中先完成验证）。

---

## 管理控制台与 API

### 管理登录

- 访问 `https://<your-worker-domain>/`，输入 `ADMIN_TOKEN` 登录（服务端签发 `HttpOnly` Cookie）；也可在管理接口请求头携带 `Authorization: Bearer <ADMIN_TOKEN>`。

### 外部 API 鉴权

```
Authorization: Bearer <API_TOKEN>
```

### 查询最新命中结果

```
GET /api/emails/latest?address=<email_address>&from=<sender>&since=<timestamp_ms>&only_matched=true
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `address` | 是 | 收件人邮箱（自动忽略大小写，支持多收件人及密送收件人） |
| `from` | 否 | 发件人邮箱关键字过滤（不区分大小写，子串匹配） |
| `since` | 否 | 毫秒时间戳，仅返回 `received_at > since` 的新邮件 |
| `only_matched` | 否 | 设为 `true` 或 `1` 时，仅返回至少命中一条规则的邮件 |

**响应：**

```json
{
  "code": 200,
  "data": {
    "message_id": "550e8400-e29b-41d4-a716-446655440000",
    "from_address": "noreply@example.com",
    "to_address": "user@yourdomain.com",
    "subject": "Verification Code",
    "received_at": 1741881600000,
    "results": [
      { "rule_id": 1, "value": "123456", "remark": "验证码" }
    ]
  }
}
```

### 查询邮件列表

```
GET /api/emails?address=<email_address>&from=<sender>&limit=20&since=<timestamp_ms>&only_matched=true
```

### 健康检查

```
GET /healthz
```

## 规则说明

| 字段 | 说明 |
|------|------|
| `remark` | 备注名称，作为返回结果的标签（可选） |
| `match_target` | 匹配范围：`body`（正文，自动清洗 HTML）、`subject`（主题）、`both`（主题+正文）、`html`（原始 HTML 源码） |
| `sender_filter` | 发信人过滤正则，多个用逗号或换行分隔，留空匹配所有 |
| `pattern` | 内容提取正则；存在捕获组时优先提取第一个非空捕获组，否则取完整匹配 |
| `enabled` | 是否启用规则（支持原地编辑与启停而不改变 `rule_id`） |

## 项目结构

```
├── src/
│   ├── index.js            # Worker 入口（Email / Fetch / Cron 路由调度）
│   ├── db.js               # D1 数据库操作与基于 schema_meta 的幂等版本迁移
│   ├── email.js            # 邮件解析、HTML 清洗、原文截断与正则提取引擎
│   ├── auth.js             # 常量时间鉴权与 HttpOnly Cookie 管理
│   ├── http.js             # HTTP 响应、安全头与参数工具
│   └── ui.js               # 精简 HTML 骨架渲染（登录页与控制台外壳）
├── public/
│   ├── _headers            # Cloudflare Static Assets 缓存与安全头规则
│   └── assets/
│       ├── theme.css       # 深色 / 浅色 CSS 变量主题与防闪烁样式
│       ├── preinit.js      # 首帧主题与语言同步初始化脚本
│       ├── i18n.js         # 中英双语字典与翻译助手
│       ├── auth.js         # 登录页交互脚本
│       └── console.js      # 控制台 Vue 3 应用脚本
├── scripts/
│   └── predeploy-check.mjs # 发布前配置安全门禁脚本
├── test/
│   ├── unit.test.js        # 核心逻辑单元测试
│   ├── ui-syntax.test.js   # 静态资源、i18n 键对齐与 HTML 模板校验
│   ├── integration.test.js # Miniflare + D1 + Assets 全链路集成测试
│   ├── sample.eml          # 基础测试邮件
│   └── fixtures/           # 复杂场景测试夹具（Base64 / Quoted-Printable / 附件）
├── .github/workflows/ci.yml # GitHub Actions CI 自动校验
├── .dev.vars.example        # 本地环境变量模板
├── schema.sql               # D1 建表语句
└── wrangler.toml            # Wrangler 配置（含 Static Assets 与 Cron Triggers）
```

## License

MIT
