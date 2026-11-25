export const ASSET_VERSION = "0.4.0";

function renderBaseHead(title, { includeVue = false } = {}) {
  const v = ASSET_VERSION;
  return `<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="preconnect" href="https://cdn.tailwindcss.com" crossorigin />${
      includeVue ? `\n    <link rel="preconnect" href="https://unpkg.com" crossorigin />` : ""
    }
    <script src="/assets/preinit.js?v=${v}"></script>
    <link rel="stylesheet" href="/assets/theme.css?v=${v}" />
    <script src="https://cdn.tailwindcss.com"></script>${
      includeVue
        ? `\n    <script src="https://unpkg.com/vue@3.5/dist/vue.global.prod.js" defer></script>`
        : ""
    }
  </head>`;
}

export function renderAuthHtml({ setupMode = false, missingAdminToken = false, weakAdminToken = false } = {}) {
  const v = ASSET_VERSION;
  let bodyHtml = "";
  if (setupMode) {
    bodyHtml = `<p class="text-[13px] tmc-text-muted mb-6 leading-relaxed" data-i18n="auth.setupDesc">首次使用请设置管理员登录密码（至少 8 位且禁用默认弱口令），系统将自动为您生成随机 API_TOKEN。</p>
      <form class="space-y-4" onsubmit="return false;">
        <input
          id="setup-token"
          type="password"
          class="w-full px-4 py-2.5 rounded-xl tmc-input transition-all text-[13px]"
          placeholder="设置管理员密码 (至少 8 位)"
          data-i18n-placeholder="auth.setupPlaceholder"
          autocomplete="new-password"
        />
        <input
          id="setup-token-confirm"
          type="password"
          class="w-full px-4 py-2.5 rounded-xl tmc-input transition-all text-[13px]"
          placeholder="再次确认管理员密码"
          data-i18n-placeholder="auth.setupConfirmPlaceholder"
          autocomplete="new-password"
        />
        <div id="admin-error" class="text-[12px] tmc-badge-danger px-3 py-2 rounded-lg hidden"></div>
        <button
          id="setup-submit"
          type="button"
          class="w-full py-2.5 rounded-xl tmc-btn-primary font-medium text-[13px] transition-colors shadow-lg disabled:opacity-50"
          data-i18n="auth.setupBtn"
        >初始化并进入控制台</button>
      </form>`;
  } else if (weakAdminToken) {
    bodyHtml = `<div class="mt-4 p-4 rounded-xl tmc-badge-danger text-[12px] space-y-2 leading-relaxed">
              <div class="font-semibold" data-i18n="auth.weakTitle">生产环境已禁用默认口令</div>
              <p data-i18n="auth.weakDesc">检测到当前 ADMIN_TOKEN 仍为默认弱口令，出于安全限制已禁止登录。请前往 Cloudflare Worker 的 Settings → Variables and Secrets 设置强密码，切勿将密钥写入公开仓库。</p>
            </div>`;
  } else if (missingAdminToken) {
    bodyHtml = `<div class="mt-4 p-4 rounded-xl tmc-badge-warn text-[12px] space-y-2 leading-relaxed">
                <div class="font-semibold" data-i18n="auth.missingTitle">尚未配置 ADMIN_TOKEN</div>
                <p data-i18n="auth.missingLocal">本地开发请在项目根目录创建 .dev.vars 并设置 ADMIN_TOKEN。</p>
                <p data-i18n="auth.missingProd">线上部署请在 Cloudflare Worker 的 Settings → Variables and Secrets 中配置，或执行 wrangler secret put ADMIN_TOKEN（切勿写入公开仓库的 wrangler.toml）。</p>
              </div>`;
  } else {
    bodyHtml = `<p class="text-[13px] tmc-text-muted mb-8" data-i18n="auth.subtitle">请输入管理员令牌以继续</p>
      <form class="space-y-4" onsubmit="return false;">
        <input
          id="admin-token"
          type="password"
          class="w-full px-4 py-2.5 rounded-xl tmc-input transition-all text-[13px]"
          placeholder="管理员令牌 (ADMIN_TOKEN)"
          data-i18n-placeholder="auth.tokenPlaceholder"
          autocomplete="current-password"
        />
        <div id="admin-error" class="text-[12px] tmc-badge-danger px-3 py-2 rounded-lg hidden"></div>
        <button
          id="admin-submit"
          type="button"
          class="w-full py-2.5 rounded-xl tmc-btn-primary font-medium text-[13px] transition-colors shadow-lg disabled:opacity-50"
          data-i18n="auth.loginBtn"
        >安全登录</button>
      </form>`;
  }

  return `<!DOCTYPE html>
<html lang="zh" data-theme="dark">
  ${renderBaseHead("Temp Mail Console - Login")}
  <body class="antialiased flex items-center justify-center min-h-screen px-4 selection:bg-indigo-500/30">
    <div class="fixed inset-0 tmc-glow pointer-events-none"></div>

    <div class="fixed top-4 right-4 flex items-center gap-2 text-[11px] z-10">
      <button id="theme-toggle" type="button" class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost flex items-center gap-1.5 transition-colors"></button>
      <button id="lang-toggle" type="button" class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost font-medium transition-colors"></button>
    </div>

    <div class="w-full max-w-sm p-8 rounded-[1.5rem] tmc-card backdrop-blur-xl relative">
      <div class="w-12 h-12 mb-6 flex border border-white/10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-inner shadow-white/20">
        <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
      </div>
      <h1 class="text-xl font-semibold tmc-text-primary tracking-tight mb-1" data-i18n="${setupMode ? "auth.setupHeading" : "auth.heading"}">Temp Mail Console</h1>
      ${bodyHtml}
    </div>
    <script src="/assets/i18n.js?v=${v}" defer></script>
    <script src="/assets/auth.js?v=${v}" defer></script>
  </body>
</html>`;
}

export function renderHtml({ pageSize = 20, rulesPageSize = 12 } = {}) {
  const v = ASSET_VERSION;
  return `<!DOCTYPE html>
<html lang="zh" data-theme="dark">
  ${renderBaseHead("Temp Mail Console", { includeVue: true })}
  <body class="antialiased selection:bg-indigo-500/30">
    <div id="app" v-cloak data-page-size="${pageSize}" data-rules-page-size="${rulesPageSize}" class="min-h-screen">
      <header class="max-w-5xl mx-auto px-4 pt-4 pb-2">
        <div class="rounded-2xl tmc-card backdrop-blur-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="h-10 w-10 flex border border-white/10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-inner shadow-white/20">
              <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </div>
            <div>
              <h1 class="text-lg font-semibold tracking-tight tmc-text-primary">{{ t('header.brandTitle') }}</h1>
              <p class="text-xs tmc-text-muted mt-0.5">
                {{ t('header.brandSub', { hours: status.retentionHours }) }}
                <button
                  v-if="status.forwardEnabled"
                  type="button"
                  class="ml-1 text-emerald-500 font-medium hover:underline"
                  @click="activeTab = 'settings'"
                >· {{ t('header.forwardEnabled') }}</button>
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-[11px]">
            <button
              class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost transition-colors flex items-center gap-1.5"
              @click="autoRefresh = !autoRefresh"
              :title="autoRefresh ? t('header.liveTitlePause') : t('header.liveTitleResume')"
            >
              <span class="relative flex h-2 w-2">
                <span v-if="autoRefresh" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2" :class="autoRefresh ? 'bg-emerald-500' : 'bg-slate-500'"></span>
              </span>
              <span class="font-medium tracking-wider" :class="autoRefresh ? 'tmc-text-primary' : 'tmc-text-faint'">{{ autoRefresh ? t('header.live') : t('header.paused') }}</span>
            </button>
            <button class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost transition-colors flex items-center gap-1" @click="toggleTheme">
              <span>{{ theme === 'dark' ? '☀' : '☾' }}</span>
              <span>{{ theme === 'dark' ? t('common.themeToLight') : t('common.themeToDark') }}</span>
            </button>
            <button class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost font-medium transition-colors" :title="t('common.langTitle')" @click="toggleLang">{{ t('common.langSwitch') }}</button>
            <button class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost transition-colors" @click="refreshActive">{{ t('common.refresh') }}</button>
            <button class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost hover:text-red-500 transition-colors" @click="logout">{{ t('common.logout') }}</button>
          </div>
        </div>
      </header>

      <main class="max-w-5xl mx-auto px-4 py-4 space-y-5">
        <div v-if="warningMessages.length > 0" class="p-3.5 rounded-xl tmc-badge-warn text-xs space-y-1">
          <div v-for="(warn, idx) in warningMessages" :key="idx">⚠️ {{ warn }}</div>
        </div>

        <div class="p-1 flex flex-wrap items-center gap-1 tmc-subcard rounded-xl w-fit">
          <button
            class="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200"
            :class="activeTab === 'emails' ? 'tmc-tab-active' : 'tmc-tab-idle'"
            @click="activeTab = 'emails'"
          >{{ t('header.tabEmails') }}</button>
          <button
            class="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200"
            :class="activeTab === 'rules' ? 'tmc-tab-active' : 'tmc-tab-idle'"
            @click="activeTab = 'rules'"
          >{{ t('header.tabRules') }}</button>
          <button
            class="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200"
            :class="activeTab === 'whitelist' ? 'tmc-tab-active' : 'tmc-tab-idle'"
            @click="activeTab = 'whitelist'"
          >{{ t('header.tabWhitelist') }}</button>
          <button
            class="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200"
            :class="activeTab === 'api' ? 'tmc-tab-active' : 'tmc-tab-idle'"
            @click="activeTab = 'api'"
          >{{ t('header.tabApi') }}</button>
          <button
            class="px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200"
            :class="activeTab === 'settings' ? 'tmc-tab-active' : 'tmc-tab-idle'"
            @click="activeTab = 'settings'"
          >{{ t('header.tabSettings') }}</button>
        </div>

        <div v-if="globalError" class="p-3 rounded-xl tmc-badge-danger text-xs flex items-center justify-between">
          <span>{{ globalError }}</span>
          <button class="underline opacity-80 hover:opacity-100" @click="globalError = ''">{{ t('common.close') }}</button>
        </div>

        <!-- 邮件记录 -->
        <section v-if="activeTab === 'emails'" class="tmc-card rounded-2xl overflow-hidden backdrop-blur-sm">
          <div class="p-5 tmc-card-header flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <h2 class="text-sm font-semibold tmc-text-primary">{{ t('emails.title') }}</h2>
              <span class="text-[11px] tmc-text-faint">{{ t('emails.count', { total }) }}</span>
            </div>
            <div class="flex items-center gap-2 text-[11px]">
              <button
                v-if="total > 0"
                class="px-2.5 py-1.5 rounded-lg tmc-badge-danger transition-colors disabled:opacity-50"
                :disabled="clearingEmails"
                @click="clearAllEmails"
              >{{ t('emails.clearAll') }}</button>
              <button class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost transition-colors disabled:opacity-50 disabled:cursor-not-allowed" @click="prevPage" :disabled="page===1">{{ t('common.prev') }}</button>
              <span class="px-3 py-1 tmc-text-muted">{{ page }} / {{ totalPages }}</span>
              <button class="px-2.5 py-1.5 rounded-lg tmc-btn-ghost transition-colors disabled:opacity-50 disabled:cursor-not-allowed" @click="nextPage" :disabled="page>=totalPages">{{ t('common.next') }}</button>
            </div>
          </div>

          <div class="px-5 py-3 tmc-border-b tmc-subcard flex flex-wrap items-center gap-2.5 text-[12px]">
            <input
              v-model.trim="emailFilter.q"
              type="text"
              :placeholder="t('emails.searchPlaceholder')"
              class="flex-1 min-w-[180px] h-8 px-3 rounded-lg tmc-input"
              @keyup.enter="applyEmailFilter"
            />
            <input
              v-model.trim="emailFilter.to"
              type="text"
              :placeholder="t('emails.toPlaceholder')"
              class="w-48 h-8 px-3 rounded-lg tmc-input"
              @keyup.enter="applyEmailFilter"
            />
            <label class="flex items-center gap-1.5 tmc-text-muted cursor-pointer select-none px-2">
              <input v-model="emailFilter.onlyMatched" type="checkbox" class="rounded accent-indigo-500" @change="applyEmailFilter" />
              <span>{{ t('emails.onlyMatched') }}</span>
            </label>
            <button class="h-8 px-3 rounded-lg tmc-btn-ghost font-medium transition-colors" @click="applyEmailFilter">{{ t('emails.filterBtn') }}</button>
            <button v-if="emailFilter.q || emailFilter.to || emailFilter.onlyMatched" class="h-8 px-2.5 rounded-lg tmc-text-muted tmc-hover-primary transition-colors" @click="resetEmailFilter">{{ t('emails.resetBtn') }}</button>
          </div>

          <div class="p-5 space-y-3">
            <div class="hidden sm:grid grid-cols-[1.45fr,0.95fr,1fr,1fr,0.7fr] gap-4 px-3 text-[10px] tmc-text-faint uppercase tracking-widest font-medium">
              <div>{{ t('emails.colSubject') }}</div>
              <div>{{ t('emails.colReceived') }}</div>
              <div>{{ t('emails.colFrom') }}</div>
              <div>{{ t('emails.colTo') }}</div>
              <div class="text-right">{{ t('emails.colStatus') }}</div>
            </div>
            <div v-if="items.length===0" class="min-h-[240px] flex items-center justify-center text-xs tmc-text-muted">{{ t('emails.empty') }}</div>
            <div v-for="item in items" :key="item.message_id" class="p-3.5 rounded-xl tmc-row transition-all duration-200 cursor-pointer group" @click="toggleResult(item.message_id)">
              <div class="grid grid-cols-1 sm:grid-cols-[1.45fr,0.95fr,1fr,1fr,0.7fr] gap-2 sm:gap-4 items-center">
                <div class="min-w-0 flex items-center gap-2">
                  <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="hasResult(item.extracted_json) ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                  <div class="text-[13px] font-medium tmc-text-primary truncate transition-colors">{{ item.subject || t('emails.noSubject') }}</div>
                </div>
                <div class="text-[11px] tmc-text-muted tabular-nums whitespace-nowrap">{{ formatTime(item.received_at) }}</div>
                <div class="min-w-0 text-[11px] tmc-text-muted truncate">{{ item.from_address }}</div>
                <div class="min-w-0 text-[11px] tmc-text-muted truncate">{{ item.to_address }}</div>
                <div class="flex items-center sm:justify-end">
                  <span
                    v-if="matchCount(item.extracted_json) > 0"
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium tmc-badge-success whitespace-nowrap"
                  >{{ t('emails.matchedBadge', { count: matchCount(item.extracted_json) }) }}</span>
                  <span
                    v-else
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium tmc-badge-neutral whitespace-nowrap"
                  >{{ t('emails.unmatchedBadge') }}</span>
                </div>
              </div>

              <div v-if="expandedResults[item.message_id]" class="mt-3 pt-3 tmc-border-t space-y-3" @click.stop>
                <div v-if="hasResult(item.extracted_json)" class="relative group/copy">
                  <div class="text-[10px] uppercase tracking-wider tmc-text-muted mb-1">{{ t('emails.extractedLabel') }}</div>
                  <div class="text-[12px] tmc-accent-box rounded-lg p-3 whitespace-pre-wrap font-mono pr-16">{{ formatResult(item.extracted_json) }}</div>
                  <button
                    class="absolute top-7 right-2 px-2 py-1 rounded-md tmc-btn-ghost font-medium text-[10px] tracking-wider"
                    @click.stop="copyContent(formatResult(item.extracted_json), item.message_id)"
                  >{{ copyStatus[item.message_id] ? t('common.copied') : t('common.copy') }}</button>
                </div>
                <div v-else class="text-[11px] tmc-text-faint px-3 py-2 rounded-lg tmc-subcard">
                  {{ t('emails.unmatchedHint') }}
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[10px] uppercase tracking-wider tmc-text-faint">{{ t('emails.previewLabel') }}</span>
                    <div class="flex items-center gap-2 text-[11px]">
                      <button class="px-2 py-0.5 rounded tmc-btn-ghost transition-colors" @click.stop="openRawViewer(item.message_id)">{{ t('emails.viewRaw') }}</button>
                      <button
                        class="px-2 py-0.5 rounded tmc-btn-ghost transition-colors disabled:opacity-50"
                        :disabled="reparsingMap[item.message_id]"
                        @click.stop="reparseEmail(item)"
                      >{{ reparsingMap[item.message_id] ? t('emails.reparsing') : t('emails.reparseBtn') }}</button>
                      <button class="px-2 py-0.5 rounded tmc-btn-ghost transition-colors" @click.stop="sendEmailToTester(item)">{{ t('emails.testWithEmail') }}</button>
                      <button class="px-2 py-0.5 rounded tmc-badge-danger transition-colors" @click.stop="deleteEmail(item.message_id)">{{ t('common.delete') }}</button>
                    </div>
                  </div>
                  <pre class="text-[12px] tmc-code rounded-lg p-3 whitespace-pre-wrap break-words max-h-64 overflow-auto font-sans leading-relaxed">{{ item.text_preview || t('emails.noPlainText') }}</pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 命中规则 -->
        <section v-if="activeTab === 'rules'" class="tmc-card rounded-2xl overflow-hidden backdrop-blur-sm">
          <div class="p-5 tmc-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold tmc-text-primary">{{ t('rules.title') }}</h2>
              <p class="text-[11px] tmc-text-muted mt-0.5">
                {{ rulesView === 'manage' ? t('rules.descManage') : t('rules.descTest') }}
              </p>
            </div>
            <div class="p-1 flex items-center gap-1 rounded-xl tmc-subcard text-[12px]">
              <button
                class="px-3 py-1 rounded-lg font-medium transition-colors"
                :class="rulesView === 'manage' ? 'tmc-tab-active' : 'tmc-tab-idle'"
                @click="rulesView = 'manage'"
              >{{ t('rules.viewManage') }}</button>
              <button
                class="px-3 py-1 rounded-lg font-medium transition-colors"
                :class="rulesView === 'test' ? 'tmc-accent-box font-semibold' : 'tmc-tab-idle'"
                @click="rulesView = 'test'"
              >{{ t('rules.viewTest') }}</button>
            </div>
          </div>

          <!-- 规则管理视图 -->
          <div v-if="rulesView === 'manage'" class="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div class="lg:col-span-5">
              <div class="rounded-xl tmc-subcard p-5 lg:sticky lg:top-5">
                <div class="mb-4 flex items-center justify-between">
                  <div>
                    <div class="text-[13px] font-medium tmc-text-primary mb-0.5">{{ ruleForm.id ? t('rules.editTitle', { id: ruleForm.id }) : t('rules.addTitle') }}</div>
                    <div class="text-[11px] tmc-text-faint">{{ t('rules.formSub') }}</div>
                  </div>
                  <button v-if="ruleForm.id" class="text-[11px] tmc-text-muted tmc-hover-primary" @click="resetRuleForm">{{ t('rules.cancelEdit') }}</button>
                </div>

                <div class="mb-4 flex flex-wrap gap-1.5 text-[11px]">
                  <span class="tmc-text-faint py-0.5">{{ t('rules.templates') }}:</span>
                  <button
                    v-for="tpl in ruleTemplates"
                    :key="tpl.key"
                    type="button"
                    class="px-2 py-0.5 rounded tmc-btn-ghost"
                    @click="applyRuleTemplate(tpl.key, ruleForm)"
                  >{{ tpl.label }}</button>
                </div>

                <div class="space-y-4">
                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('rules.labelRemark') }}</label>
                    <input v-model="ruleForm.remark" type="text" class="w-full h-9 px-3 rounded-lg tmc-input text-[13px]" :placeholder="t('rules.placeholderRemark')" />
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('rules.labelTarget') }}</label>
                    <select v-model="ruleForm.match_target" class="w-full h-9 px-3 rounded-lg tmc-input text-[13px]">
                      <option value="body">{{ t('rules.targetBody') }}</option>
                      <option value="subject">{{ t('rules.targetSubject') }}</option>
                      <option value="both">{{ t('rules.targetBoth') }}</option>
                      <option value="html">{{ t('rules.targetHtml') }}</option>
                    </select>
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('rules.labelSenderFilter') }}</label>
                    <textarea v-model="ruleForm.sender_filter" rows="2" class="w-full px-3 py-2 rounded-lg tmc-input text-[13px] font-mono" :placeholder="t('rules.placeholderSenderFilter')"></textarea>
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('rules.labelPattern') }}</label>
                    <textarea v-model="ruleForm.pattern" rows="4" class="w-full px-3 py-2 rounded-lg tmc-input text-[13px] font-mono" :placeholder="t('rules.placeholderPattern')"></textarea>
                  </div>

                  <div v-if="ruleError" class="text-[12px] tmc-badge-danger px-3 py-2 rounded-lg">{{ ruleError }}</div>

                  <button
                    class="w-full py-2.5 rounded-lg tmc-btn-primary font-medium text-[13px] transition-colors shadow-lg disabled:opacity-50"
                    :disabled="savingRule"
                    @click="saveRule"
                  >{{ savingRule ? t('common.saving') : (ruleForm.id ? t('rules.btnUpdate') : t('rules.btnAdd')) }}</button>
                </div>
              </div>
            </div>

            <div class="lg:col-span-7">
              <div class="rounded-xl tmc-subcard flex flex-col min-h-[460px]">
                <div class="px-5 py-3 tmc-border-b flex items-center justify-between">
                  <div class="text-[12px] font-medium tmc-text-primary">{{ t('rules.existingTitle') }}</div>
                  <div class="flex items-center gap-2 text-[11px]">
                    <span class="tmc-text-faint mr-2">{{ t('common.total', { total: rulesTotal }) }}</span>
                    <button class="px-2.5 py-1 rounded tmc-btn-ghost transition-colors disabled:opacity-50" @click="prevRulesPage" :disabled="rulesPage===1">{{ t('common.prev') }}</button>
                    <span class="tmc-text-muted">{{ rulesPage }} / {{ rulesTotalPages }}</span>
                    <button class="px-2.5 py-1 rounded tmc-btn-ghost transition-colors disabled:opacity-50" @click="nextRulesPage" :disabled="rulesPage>=rulesTotalPages">{{ t('common.next') }}</button>
                  </div>
                </div>

                <div class="p-3 space-y-2 flex-1 overflow-auto">
                  <div v-if="rules.length===0" class="h-full flex items-center justify-center text-[12px] tmc-text-muted">{{ t('rules.empty') }}</div>
                  <div v-for="rule in rules" :key="rule.id" class="p-3.5 rounded-lg tmc-row transition-colors flex items-start justify-between gap-4 group" :class="{ 'opacity-50': isDisabled(rule) }">
                    <div class="min-w-0 space-y-1.5 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[11px] font-mono tmc-text-faint">#{{ rule.id }}</span>
                        <span v-if="rule.remark" class="text-[13px] font-medium tmc-text-primary truncate">{{ rule.remark }}</span>
                        <span class="px-1.5 py-0.5 rounded tmc-accent-box text-[10px]">{{ targetLabel(rule.match_target) }}</span>
                        <span v-if="isDisabled(rule)" class="px-1.5 py-0.5 rounded tmc-badge-neutral text-[10px]">{{ t('common.disabled') }}</span>
                      </div>
                      <div class="text-[11px] tmc-text-muted truncate flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded tmc-badge-neutral font-mono">{{ t('rules.badgeFrom') }}</span>
                        {{ rule.sender_filter || t('rules.anySender') }}
                      </div>
                      <div class="text-[11px] tmc-text-muted break-words flex items-start gap-2">
                        <span class="px-1.5 py-0.5 rounded tmc-badge-neutral font-mono shrink-0 pt-0.5">{{ t('rules.badgeRegex') }}</span>
                        <span class="font-mono tmc-text-regex">{{ rule.pattern }}</span>
                      </div>
                    </div>
                    <div class="shrink-0 flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button class="text-[11px] px-2 py-1 rounded-md tmc-badge-success" @click="testRuleInPlayground(rule)">{{ t('common.test') }}</button>
                      <button class="text-[11px] px-2 py-1 rounded-md tmc-btn-ghost" @click="toggleRuleEnabled(rule)">{{ isDisabled(rule) ? t('common.enable') : t('common.disable') }}</button>
                      <button class="text-[11px] px-2 py-1 rounded-md tmc-accent-box" @click="editRule(rule)">{{ t('common.edit') }}</button>
                      <button class="text-[11px] px-2 py-1 rounded-md tmc-badge-danger font-medium" @click="deleteRule(rule.id)">{{ t('common.delete') }}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 在线正则测试器视图 -->
          <div v-else class="p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl tmc-subcard">
              <div class="text-[12px] tmc-text-primary font-medium">{{ t('tester.barTitle') }}</div>
              <div class="flex flex-wrap items-center gap-2">
                <select v-model="tester.selectedMessageId" class="h-9 max-w-[280px] truncate px-3 rounded-lg tmc-input text-[12px]" @change="loadEmailIntoTester">
                  <option value="">{{ t('tester.importEmail') }}</option>
                  <option v-for="mail in testerOptions.emails" :key="mail.message_id" :value="mail.message_id">
                    {{ (mail.subject || t('emails.noSubject')) + ' · ' + mail.from_address }}
                  </option>
                </select>
                <button class="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-[12px] font-medium transition-colors" @click="runRuleTest">{{ t('tester.btnRunTest') }}</button>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div class="lg:col-span-5">
                <div class="rounded-xl tmc-subcard p-5 space-y-4">
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <div class="text-[13px] font-medium tmc-text-primary">{{ t('tester.ruleConfigTitle') }}</div>
                      <div class="text-[11px] tmc-text-faint">{{ t('tester.ruleConfigSub') }}</div>
                    </div>
                    <button v-if="testerRule.sourceId" class="text-[11px] tmc-text-muted tmc-hover-primary" @click="resetTesterRule">{{ t('tester.clear') }}</button>
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('tester.importRule') }}</label>
                    <select v-model="testerRule.sourceId" class="w-full h-9 px-3 rounded-lg tmc-input text-[12px]" @change="loadExistingRuleIntoTester">
                      <option value="">{{ t('tester.importRulePlaceholder') }}</option>
                      <option v-for="r in testerOptions.rules" :key="r.id" :value="String(r.id)">
                        #{{ r.id }} {{ r.remark || r.pattern }} [{{ targetLabel(r.match_target) }}]
                      </option>
                    </select>
                  </div>

                  <div class="flex flex-wrap gap-1.5 text-[11px]">
                    <span class="tmc-text-faint py-0.5">{{ t('rules.templates') }}:</span>
                    <button
                      v-for="tpl in ruleTemplates"
                      :key="tpl.key"
                      type="button"
                      class="px-2 py-0.5 rounded tmc-btn-ghost"
                      @click="applyRuleTemplate(tpl.key, testerRule)"
                    >{{ tpl.label }}</button>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="space-y-1.5">
                      <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('rules.labelRemark') }}</label>
                      <input v-model="testerRule.remark" type="text" class="w-full h-9 px-3 rounded-lg tmc-input text-[12px]" :placeholder="t('rules.placeholderRemark')" />
                    </div>
                    <div class="space-y-1.5">
                      <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('rules.labelTarget') }}</label>
                      <select v-model="testerRule.match_target" class="w-full h-9 px-3 rounded-lg tmc-input text-[12px]">
                        <option value="body">{{ t('rules.targetShortBody') }}</option>
                        <option value="subject">{{ t('rules.targetShortSubject') }}</option>
                        <option value="both">{{ t('rules.targetShortBoth') }}</option>
                        <option value="html">{{ t('rules.targetShortHtml') }}</option>
                      </select>
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('rules.labelSenderFilter') }}</label>
                    <textarea v-model="testerRule.sender_filter" rows="2" class="w-full px-3 py-2 rounded-lg tmc-input text-[12px] font-mono" :placeholder="t('rules.placeholderSenderFilter')"></textarea>
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('rules.labelPattern') }}</label>
                    <textarea v-model="testerRule.pattern" rows="4" class="w-full px-3 py-2 rounded-lg tmc-input text-[12px] font-mono" :placeholder="t('rules.placeholderPattern')"></textarea>
                  </div>

                  <div v-if="testerSaveMsg" class="text-[12px] tmc-badge-success px-3 py-2 rounded-lg">{{ testerSaveMsg }}</div>

                  <div class="flex flex-wrap gap-2 pt-1">
                    <button
                      class="flex-1 py-2 px-3 rounded-lg tmc-btn-primary font-medium text-[12px] transition-colors disabled:opacity-50"
                      :disabled="savingTesterRule"
                      @click="saveTesterRule(false)"
                    >{{ testerRule.sourceId ? t('tester.btnUpdate', { id: testerRule.sourceId }) : t('tester.btnSaveNew') }}</button>
                    <button
                      v-if="testerRule.sourceId"
                      class="py-2 px-3 rounded-lg tmc-btn-ghost text-[12px] transition-colors disabled:opacity-50"
                      :disabled="savingTesterRule"
                      @click="saveTesterRule(true)"
                    >{{ t('tester.btnSaveAsNew') }}</button>
                  </div>
                </div>
              </div>

              <div class="lg:col-span-7 flex flex-col gap-4">
                <div class="rounded-xl tmc-subcard p-5 space-y-3">
                  <div class="text-[13px] font-medium tmc-text-primary">{{ t('tester.mailTitle') }}</div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input v-model="tester.sender" type="text" :placeholder="t('tester.senderPlaceholder')" class="h-9 px-3 rounded-lg tmc-input text-[12px]" />
                    <input v-model="tester.subject" type="text" :placeholder="t('tester.subjectPlaceholder')" class="h-9 px-3 rounded-lg tmc-input text-[12px]" />
                  </div>
                  <textarea v-model="tester.text" rows="4" :placeholder="t('tester.textPlaceholder')" class="w-full px-3 py-2 rounded-lg tmc-input text-[12px] font-mono"></textarea>
                  <textarea v-model="tester.html" rows="4" :placeholder="t('tester.htmlPlaceholder')" class="w-full px-3 py-2 rounded-lg tmc-input text-[12px] font-mono"></textarea>
                </div>

                <div class="rounded-xl tmc-code p-5 flex-1 min-h-[150px] flex flex-col justify-center text-[12px]">
                  <div v-if="!tester.result && !tester.error" class="tmc-text-faint text-center">{{ t('tester.emptyResult') }}</div>
                  <div v-if="tester.error" class="tmc-badge-danger px-3 py-2 rounded-lg">{{ tester.error }}</div>
                  <div v-if="tester.result" class="space-y-3">
                    <div class="flex items-center gap-3">
                      <span class="px-2.5 py-1 rounded text-[11px]" :class="tester.result.sender_matched ? 'tmc-badge-success' : 'tmc-badge-danger'">
                        {{ tester.result.sender_matched ? t('tester.senderPass') : t('tester.senderFail') }}
                      </span>
                      <span class="px-2.5 py-1 rounded text-[11px]" :class="tester.result.matched ? 'tmc-accent-box' : 'tmc-badge-neutral'">
                        {{ tester.result.matched ? t('tester.matchPass') : t('tester.matchFail') }}
                      </span>
                    </div>
                    <pre v-if="tester.result.matched" class="p-3.5 rounded-lg tmc-accent-box font-mono whitespace-pre-wrap">{{ JSON.stringify(tester.result.results, null, 2) }}</pre>
                    <div v-else class="text-[11px] tmc-text-muted">{{ t('tester.noMatchHint') }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 发件人白名单 -->
        <section v-if="activeTab === 'whitelist'" class="tmc-card rounded-2xl overflow-hidden backdrop-blur-sm">
          <div class="p-5 tmc-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold tmc-text-primary">{{ t('whitelist.title') }}</h2>
              <p class="text-[11px] tmc-text-muted mt-0.5">{{ t('whitelist.subtitle') }}</p>
            </div>
            <div v-if="status.whitelistBlocked?.count > 0" class="flex flex-wrap items-center gap-2 text-[11px] px-3 py-1.5 rounded-xl tmc-badge-warn">
              <span>{{ t('whitelist.blockedSummary', { count: status.whitelistBlocked.count }) }}</span>
              <span v-if="status.whitelistBlocked.last" class="opacity-85">· {{ t('whitelist.lastBlocked', { from: status.whitelistBlocked.last.from, time: formatTime(status.whitelistBlocked.last.at) }) }}</span>
              <button class="underline ml-1 hover:opacity-80" @click="resetBlockedStats">{{ t('whitelist.resetBlocked') }}</button>
            </div>
          </div>
          <div class="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div class="lg:col-span-5">
              <div class="rounded-xl tmc-subcard p-5">
                <div class="mb-4 flex items-center justify-between">
                  <div>
                    <div class="text-[13px] font-medium tmc-text-primary mb-0.5">{{ whitelistForm.id ? t('whitelist.editTitle', { id: whitelistForm.id }) : t('whitelist.addTitle') }}</div>
                    <div class="text-[11px] tmc-text-faint">{{ t('whitelist.formSub') }}</div>
                  </div>
                  <button v-if="whitelistForm.id" class="text-[11px] tmc-text-muted tmc-hover-primary" @click="resetWhitelistForm">{{ t('rules.cancelEdit') }}</button>
                </div>
                <div class="space-y-4">
                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('whitelist.labelRemark') }}</label>
                    <input v-model="whitelistForm.remark" type="text" class="w-full h-9 px-3 rounded-lg tmc-input text-[13px]" :placeholder="t('whitelist.placeholderRemark')" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('whitelist.labelPattern') }}</label>
                    <textarea v-model="whitelistForm.sender_pattern" rows="4" class="w-full px-3 py-2 rounded-lg tmc-input text-[13px] font-mono" :placeholder="t('whitelist.placeholderPattern')"></textarea>
                  </div>
                  <div v-if="whitelistError" class="text-[12px] tmc-badge-danger px-3 py-2 rounded-lg">{{ whitelistError }}</div>
                  <button
                    class="w-full py-2.5 rounded-lg tmc-btn-primary font-medium text-[13px] transition-colors shadow-lg disabled:opacity-50"
                    :disabled="savingWhitelist"
                    @click="saveWhitelistEntry"
                  >{{ savingWhitelist ? t('common.saving') : (whitelistForm.id ? t('whitelist.btnUpdate') : t('whitelist.btnAdd')) }}</button>
                </div>
              </div>
            </div>
            <div class="lg:col-span-7">
              <div class="rounded-xl tmc-subcard flex flex-col min-h-[260px]">
                <div class="px-5 py-3 tmc-border-b flex items-center justify-between">
                  <div class="text-[12px] font-medium tmc-text-primary">{{ t('whitelist.listTitle') }}</div>
                  <div class="flex items-center gap-2 text-[11px]">
                    <span class="tmc-text-faint mr-2">{{ t('common.total', { total: whitelistTotal }) }}</span>
                    <button class="px-2.5 py-1 rounded tmc-btn-ghost transition-colors disabled:opacity-50" @click="prevWhitelistPage" :disabled="whitelistPage===1">{{ t('common.prev') }}</button>
                    <span class="tmc-text-muted">{{ whitelistPage }} / {{ whitelistTotalPages }}</span>
                    <button class="px-2.5 py-1 rounded tmc-btn-ghost transition-colors disabled:opacity-50" @click="nextWhitelistPage" :disabled="whitelistPage>=whitelistTotalPages">{{ t('common.next') }}</button>
                  </div>
                </div>
                <div class="p-3 space-y-2 flex-1 overflow-auto">
                  <div v-if="whitelistItems.length===0" class="h-full flex items-center justify-center text-[12px] tmc-text-muted">{{ t('whitelist.empty') }}</div>
                  <div v-for="item in whitelistItems" :key="item.id" class="p-3 rounded-lg tmc-row transition-colors flex items-center justify-between gap-4 group" :class="{ 'opacity-50': isDisabled(item) }">
                    <div class="min-w-0 space-y-0.5">
                      <div class="font-mono text-[12px] tmc-text-regex truncate">{{ item.sender_pattern }}</div>
                      <div v-if="item.remark || isDisabled(item)" class="text-[11px] tmc-text-muted">
                        {{ item.remark }}
                        <span v-if="isDisabled(item)" class="ml-1 tmc-text-faint">({{ t('common.disabled') }})</span>
                      </div>
                    </div>
                    <div class="shrink-0 flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button class="text-[11px] px-2 py-1 rounded-md tmc-btn-ghost" @click="toggleWhitelistEnabled(item)">{{ isDisabled(item) ? t('common.enable') : t('common.disable') }}</button>
                      <button class="text-[11px] px-2 py-1 rounded-md tmc-accent-box" @click="editWhitelistEntry(item)">{{ t('common.edit') }}</button>
                      <button class="text-[11px] px-2 py-1 rounded-md tmc-badge-danger font-medium" @click="deleteWhitelistEntry(item.id)">{{ t('common.delete') }}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- API 对接 -->
        <section v-if="activeTab === 'api'" class="tmc-card rounded-2xl overflow-hidden backdrop-blur-sm">
          <div class="p-5 tmc-card-header">
            <h2 class="text-sm font-semibold tmc-text-primary">{{ t('api.title') }}</h2>
          </div>
          <div class="p-6 space-y-6 text-[13px]">
            <div class="space-y-2">
              <div class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('api.authTitle') }}</div>
              <pre class="rounded-xl tmc-code p-4 font-mono text-[12px]">Authorization: Bearer &lt;API_TOKEN&gt;</pre>
              <p class="text-xs tmc-text-muted">
                {{ status.apiToken?.source === 'db' ? t('api.authDbHint') : t('api.authEnvHint') }}
                <button type="button" class="ml-1.5 text-indigo-400 hover:underline font-medium" @click="activeTab = 'settings'">{{ t('header.tabSettings') }}</button>
              </p>
            </div>
            <div class="space-y-2">
              <div class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('api.latestTitle') }}</div>
              <pre class="rounded-xl tmc-code p-4 font-mono text-[12px] overflow-auto">GET /api/emails/latest?address=&lt;email_address&gt;&amp;from=&lt;sender&gt;&amp;since=&lt;timestamp_ms&gt;&amp;only_matched=true

Response: {
  "code": 200,
  "data": {
    "message_id": "550e8400-e29b-41d4-a716-446655440000",
    "from_address": "sender@example.com",
    "to_address": "target@domain.com",
    "subject": "Your verification code",
    "received_at": 1741881600000,
    "results": [
      { "rule_id": 1, "value": "123456", "remark": "Verification Code" }
    ]
  }
}</pre>
            </div>
            <div class="space-y-2">
              <div class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('api.listTitle') }}</div>
              <pre class="rounded-xl tmc-code p-4 font-mono text-[12px] overflow-auto">GET /api/emails?address=&lt;email_address&gt;&amp;from=&lt;sender&gt;&amp;limit=20&amp;since=&lt;timestamp_ms&gt;&amp;only_matched=true
GET /healthz  {{ t('api.healthComment') }}</pre>
            </div>
          </div>
        </section>

        <!-- 系统设置 -->
        <section v-if="activeTab === 'settings'" class="space-y-6">
          <div class="tmc-card rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-2 backdrop-blur-sm">
            <div>
              <h2 class="text-sm font-semibold tmc-text-primary">{{ t('settings.title') }}</h2>
              <p class="text-[11px] tmc-text-faint mt-0.5">{{ t('settings.subtitle') }}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- 全局邮件转发 -->
            <div class="tmc-card rounded-2xl p-6 space-y-4 backdrop-blur-sm">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold tmc-text-primary">{{ t('settings.forwardTitle') }}</h3>
                  <p class="text-[11px] tmc-text-faint mt-0.5">{{ t('settings.forwardSub') }}</p>
                </div>
                <span class="px-2 py-0.5 rounded text-[11px] shrink-0" :class="status.forward?.source === 'db' ? 'tmc-accent-box' : 'tmc-badge-neutral'">
                  {{ settingsSourceLabel(status.forward?.source) }}
                </span>
              </div>
              <form class="space-y-3" @submit.prevent="saveForwardSettings">
                <label class="inline-flex items-center gap-2 text-xs tmc-text-secondary cursor-pointer select-none">
                  <input v-model="settingsForm.forwardEnabled" type="checkbox" class="rounded border-slate-500 text-indigo-500 focus:ring-indigo-500" />
                  {{ t('settings.forwardEnableLabel') }}
                </label>
                <div>
                  <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('settings.forwardEmailLabel') }}</label>
                  <input
                    v-model.trim="settingsForm.forwardEmail"
                    type="email"
                    :placeholder="t('settings.forwardPlaceholder')"
                    class="mt-1.5 w-full px-3.5 py-2 rounded-xl tmc-input text-[13px]"
                  />
                </div>
                <p class="text-[11px] tmc-text-faint leading-relaxed">{{ t('settings.forwardHint') }}</p>
                <div v-if="status.forward?.lastError" class="tmc-badge-danger px-3 py-2 rounded-lg text-[11px] leading-relaxed">
                  {{ t('settings.forwardLastError', { time: formatTime(status.forward.lastError.at), message: status.forward.lastError.message }) }}
                </div>
                <div v-if="settingsState.forwardErr" class="tmc-badge-danger px-3 py-2 rounded-lg text-xs">{{ settingsState.forwardErr }}</div>
                <div v-if="settingsState.forwardMsg" class="tmc-badge-success px-3 py-2 rounded-lg text-xs">{{ settingsState.forwardMsg }}</div>
                <button
                  type="submit"
                  :disabled="settingsState.savingForward"
                  class="px-4 py-2 rounded-xl tmc-btn-primary text-[13px] font-medium transition-colors disabled:opacity-50"
                >{{ settingsState.savingForward ? t('common.saving') : t('settings.btnSaveForward') }}</button>
              </form>
            </div>

            <!-- 邮件保留时长 -->
            <div class="tmc-card rounded-2xl p-6 space-y-4 backdrop-blur-sm">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold tmc-text-primary">{{ t('settings.retentionTitle') }}</h3>
                  <p class="text-[11px] tmc-text-faint mt-0.5">{{ t('settings.retentionSub') }}</p>
                </div>
                <span class="px-2 py-0.5 rounded text-[11px] shrink-0" :class="status.retentionSource === 'db' ? 'tmc-accent-box' : 'tmc-badge-neutral'">
                  {{ settingsSourceLabel(status.retentionSource) }}
                </span>
              </div>
              <form class="space-y-3" @submit.prevent="saveRetentionSettings">
                <div>
                  <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('settings.retentionLabel') }}</label>
                  <input
                    v-model.number="settingsForm.retentionHours"
                    type="number"
                    min="1"
                    max="8760"
                    step="1"
                    class="mt-1.5 w-full px-3.5 py-2 rounded-xl tmc-input text-[13px] font-mono"
                  />
                </div>
                <div v-if="settingsState.retentionErr" class="tmc-badge-danger px-3 py-2 rounded-lg text-xs">{{ settingsState.retentionErr }}</div>
                <div v-if="settingsState.retentionMsg" class="tmc-badge-success px-3 py-2 rounded-lg text-xs">{{ settingsState.retentionMsg }}</div>
                <button
                  type="submit"
                  :disabled="settingsState.savingRetention"
                  class="px-4 py-2 rounded-xl tmc-btn-primary text-[13px] font-medium transition-colors disabled:opacity-50"
                >{{ settingsState.savingRetention ? t('common.saving') : t('settings.btnSaveRetention') }}</button>
              </form>
            </div>

            <!-- 外部 API Token -->
            <div class="tmc-card rounded-2xl p-6 space-y-4 backdrop-blur-sm">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold tmc-text-primary">{{ t('settings.apiTokenTitle') }}</h3>
                  <p class="text-[11px] tmc-text-faint mt-0.5">{{ t('settings.apiTokenSub') }}</p>
                </div>
                <span class="px-2 py-0.5 rounded text-[11px] shrink-0" :class="status.apiToken?.source === 'db' ? 'tmc-accent-box' : 'tmc-badge-neutral'">
                  {{ settingsSourceLabel(status.apiToken?.source) }}
                </span>
              </div>
              <div v-if="status.apiToken?.source === 'env'" class="tmc-badge-warn px-3 py-2 rounded-lg text-[11px] leading-relaxed">
                {{ t('settings.apiTokenEnvNote', { masked: status.apiToken.masked }) }}
              </div>
              <form class="space-y-3" @submit.prevent="saveApiTokenSettings(false)">
                <div class="flex items-center gap-2">
                  <input
                    v-model.trim="settingsForm.apiToken"
                    :type="settingsForm.showApiToken ? 'text' : 'password'"
                    :placeholder="t('settings.apiTokenPlaceholder')"
                    class="flex-1 min-w-0 px-3.5 py-2 rounded-xl tmc-input text-[13px] font-mono"
                    autocomplete="off"
                  />
                  <button
                    type="button"
                    class="h-[38px] px-3 rounded-xl tmc-btn-ghost text-xs shrink-0"
                    @click="settingsForm.showApiToken = !settingsForm.showApiToken"
                  >{{ settingsForm.showApiToken ? t('settings.hideToken') : t('settings.showToken') }}</button>
                  <button
                    v-if="settingsForm.apiToken"
                    type="button"
                    class="h-[38px] px-3 rounded-xl tmc-accent-box text-xs shrink-0"
                    @click="copyApiToken"
                  >{{ settingsState.apiTokenCopied ? t('common.copied') : t('common.copy') }}</button>
                </div>
                <div v-if="settingsState.apiTokenErr" class="tmc-badge-danger px-3 py-2 rounded-lg text-xs">{{ settingsState.apiTokenErr }}</div>
                <div v-if="settingsState.apiTokenMsg" class="tmc-badge-success px-3 py-2 rounded-lg text-xs">{{ settingsState.apiTokenMsg }}</div>
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    :disabled="settingsState.savingApiToken"
                    class="px-4 py-2 rounded-xl tmc-btn-primary text-[13px] font-medium transition-colors disabled:opacity-50"
                  >{{ settingsState.savingApiToken ? t('common.saving') : t('settings.btnSaveApiToken') }}</button>
                  <button
                    type="button"
                    :disabled="settingsState.savingApiToken"
                    class="px-4 py-2 rounded-xl tmc-btn-ghost text-[13px] transition-colors disabled:opacity-50"
                    @click="saveApiTokenSettings(true)"
                  >{{ t('settings.btnRegenerate') }}</button>
                </div>
              </form>
            </div>

            <!-- 管理员密码 -->
            <div class="tmc-card rounded-2xl p-6 space-y-4 backdrop-blur-sm">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold tmc-text-primary">{{ t('settings.adminTokenTitle') }}</h3>
                  <p class="text-[11px] tmc-text-faint mt-0.5">{{ t('settings.adminTokenSub') }}</p>
                </div>
                <span class="px-2 py-0.5 rounded text-[11px] shrink-0" :class="status.adminSource === 'db' ? 'tmc-accent-box' : 'tmc-badge-neutral'">
                  {{ settingsSourceLabel(status.adminSource) }}
                </span>
              </div>
              <form class="space-y-3" @submit.prevent="saveAdminTokenSettings">
                <div>
                  <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('settings.currentPwdLabel') }}</label>
                  <input
                    v-model.trim="settingsForm.currentPassword"
                    type="password"
                    :placeholder="t('settings.currentPwdPlaceholder')"
                    class="mt-1.5 w-full px-3.5 py-2 rounded-xl tmc-input text-[13px]"
                    autocomplete="current-password"
                  />
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('settings.newPwdLabel') }}</label>
                    <input
                      v-model.trim="settingsForm.newPassword"
                      type="password"
                      :placeholder="t('settings.newPwdPlaceholder')"
                      class="mt-1.5 w-full px-3.5 py-2 rounded-xl tmc-input text-[13px]"
                      autocomplete="new-password"
                    />
                  </div>
                  <div>
                    <label class="text-[11px] font-medium tmc-text-faint uppercase tracking-widest">{{ t('settings.confirmPwdLabel') }}</label>
                    <input
                      v-model.trim="settingsForm.confirmPassword"
                      type="password"
                      :placeholder="t('settings.confirmPwdPlaceholder')"
                      class="mt-1.5 w-full px-3.5 py-2 rounded-xl tmc-input text-[13px]"
                      autocomplete="new-password"
                    />
                  </div>
                </div>
                <div v-if="settingsState.adminTokenErr" class="tmc-badge-danger px-3 py-2 rounded-lg text-xs">{{ settingsState.adminTokenErr }}</div>
                <div v-if="settingsState.adminTokenMsg" class="tmc-badge-success px-3 py-2 rounded-lg text-xs">{{ settingsState.adminTokenMsg }}</div>
                <button
                  type="submit"
                  :disabled="settingsState.savingAdminToken"
                  class="px-4 py-2 rounded-xl tmc-btn-primary text-[13px] font-medium transition-colors disabled:opacity-50"
                >{{ settingsState.savingAdminToken ? t('common.saving') : t('settings.btnSaveAdminToken') }}</button>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer class="max-w-5xl mx-auto px-4 py-6 text-xs tmc-text-muted">
        <div class="flex items-center justify-between tmc-border-t pt-4">
          <span>{{ t('header.footerBrand') }}</span>
          <a class="tmc-text-primary hover:underline" href="https://github.com/beyoug/temp-mail-console" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>

      <!-- 邮件原文预览弹窗 -->
      <div v-if="rawModal.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" @click.self="closeRawViewer">
        <div class="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl tmc-modal overflow-hidden">
          <div class="px-5 py-4 tmc-card-header flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h3 class="text-sm font-semibold tmc-text-primary truncate">{{ rawModal.data?.subject || t('rawModal.defaultTitle') }}</h3>
              <div v-if="rawModal.data" class="text-[11px] tmc-text-muted mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <span>{{ t('rawModal.sender') }}: <code class="tmc-text-primary">{{ rawModal.data.from_address }}</code></span>
                <span>{{ t('rawModal.recipient') }}: <code class="tmc-text-primary">{{ rawModal.data.to_address }}</code></span>
                <span v-if="rawModal.data.raw_size">{{ t('rawModal.size') }}: {{ formatBytes(rawModal.data.raw_size) }}</span>
              </div>
            </div>
            <button class="shrink-0 px-2.5 py-1 rounded-lg tmc-btn-ghost text-xs" @click="closeRawViewer">{{ t('common.close') }}</button>
          </div>

          <div v-if="rawModal.loading" class="p-12 text-center text-xs tmc-text-muted">{{ t('rawModal.loading') }}</div>
          <div v-else-if="rawModal.error" class="p-8 text-center text-xs tmc-badge-danger">{{ rawModal.error }}</div>
          <template v-else-if="rawModal.data">
            <div v-if="!rawModal.data.has_raw" class="px-5 py-2.5 tmc-badge-warn text-[11px]">
              {{ t('rawModal.legacyNotice') }}
            </div>
            <div v-else-if="rawModal.data.truncated" class="px-5 py-2.5 tmc-badge-warn text-[11px]">
              {{ t('rawModal.truncatedNotice', { size: formatBytes(rawModal.data.raw_size) }) }}
            </div>

            <div class="px-5 py-2.5 tmc-border-b tmc-subcard flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-1 text-[12px]">
                <button
                  v-for="tab in rawModalTabs"
                  :key="tab.key"
                  class="px-3 py-1 rounded-lg transition-colors"
                  :class="rawModal.view === tab.key ? 'tmc-tab-active' : 'tmc-tab-idle'"
                  @click="rawModal.view = tab.key"
                >{{ tab.label }}</button>
              </div>
              <div class="flex items-center gap-2 text-[11px]">
                <button class="px-2.5 py-1 rounded-lg tmc-btn-ghost" @click="copyRawView">{{ rawModal.copied ? t('common.copied') : t('rawModal.copyView') }}</button>
                <button class="px-2.5 py-1 rounded-lg tmc-accent-box" @click="useRawInTester">{{ t('rawModal.useInTester') }}</button>
              </div>
            </div>

            <div class="p-4 flex-1 overflow-auto min-h-[340px]">
              <template v-if="rawModal.view === 'html_render'">
                <iframe
                  v-if="rawModal.data.html_body"
                  sandbox=""
                  referrerpolicy="no-referrer"
                  :srcdoc="rawModal.data.html_body"
                  class="w-full h-[460px] rounded-xl bg-white border border-slate-200/30"
                ></iframe>
                <div v-else class="py-16 text-center text-xs tmc-text-muted">{{ t('rawModal.noHtml') }}</div>
              </template>
              <pre v-else-if="rawModal.view === 'html_source'" class="text-[12px] tmc-code tmc-text-regex rounded-xl p-4 whitespace-pre-wrap break-all font-mono">{{ rawModal.data.html_body || t('rawModal.noHtmlSource') }}</pre>
              <pre v-else-if="rawModal.view === 'text'" class="text-[12px] tmc-code rounded-xl p-4 whitespace-pre-wrap break-words font-sans leading-relaxed">{{ rawModal.data.text_body || rawModal.data.text_preview || t('rawModal.noText') }}</pre>
              <pre v-else class="text-[12px] tmc-code rounded-xl p-4 whitespace-pre-wrap break-all font-mono">{{ rawModal.data.raw_eml || t('rawModal.noRawEml') }}</pre>
            </div>
          </template>
        </div>
      </div>
    </div>

    <script src="/assets/i18n.js?v=${v}" defer></script>
    <script src="/assets/console.js?v=${v}" defer></script>
  </body>
</html>`;
}
