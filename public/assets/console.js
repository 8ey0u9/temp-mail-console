(function () {
  const appEl = document.getElementById("app");
  const pageSize = Number(appEl?.dataset.pageSize || 20);
  const rulesPageSize = Number(appEl?.dataset.rulesPageSize || 12);
  const { createApp } = Vue;

  createApp({
    data() {
      return {
        lang: document.documentElement.lang === "en" ? "en" : "zh",
        theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
        page: 1,
        total: 0,
        items: [],
        emailFilter: { q: "", to: "", onlyMatched: false },
        clearingEmails: false,
        reparsingMap: {},
        rules: [],
        rulesPage: 1,
        rulesTotal: 0,
        ruleForm: { id: null, remark: "", sender_filter: "", pattern: "", match_target: "body", enabled: true },
        ruleError: "",
        savingRule: false,
        testerOptions: { rules: [], emails: [] },
        testerRule: { sourceId: "", remark: "", sender_filter: "", pattern: "", match_target: "body" },
        testerSaveMsg: "",
        savingTesterRule: false,
        tester: { selectedMessageId: "", sender: "", subject: "", text: "", html: "", result: null, error: "" },
        rawModal: { open: false, loading: false, error: "", view: "html_render", data: null, copied: false },
        whitelistItems: [],
        whitelistPage: 1,
        whitelistTotal: 0,
        whitelistForm: { id: null, sender_pattern: "", remark: "", enabled: true },
        whitelistError: "",
        savingWhitelist: false,
        status: {
          warnings: [],
          warningCodes: [],
          retentionHours: 48,
          forwardEnabled: false,
          whitelistBlocked: { count: 0, last: null }
        },
        activeTab: "emails",
        rulesView: "manage",
        autoRefresh: true,
        globalError: "",
        poller: null,
        expandedResults: {},
        copyStatus: {}
      };
    },
    watch: {
      activeTab(val) {
        if (val === "emails") {
          this.loadList();
          this.loadStatus();
        } else if (val === "rules" && this.rulesView === "test") {
          this.loadTesterOptions();
        } else if (val === "whitelist") {
          this.loadStatus();
        }
      },
      rulesView(val) {
        if (val === "test") this.loadTesterOptions();
      }
    },
    computed: {
      totalPages() {
        return Math.max(1, Math.ceil(this.total / pageSize));
      },
      rulesTotalPages() {
        return Math.max(1, Math.ceil(this.rulesTotal / rulesPageSize));
      },
      whitelistTotalPages() {
        return Math.max(1, Math.ceil(this.whitelistTotal / rulesPageSize));
      },
      warningMessages() {
        const codes = Array.isArray(this.status.warningCodes) ? this.status.warningCodes : [];
        if (codes.length > 0) {
          return codes.map((code) => {
            if (code === "default_admin_token") return this.t("header.warnAdminToken");
            if (code === "default_api_token") return this.t("header.warnApiToken");
            return code;
          });
        }
        return Array.isArray(this.status.warnings) ? this.status.warnings : [];
      },
      ruleTemplates() {
        return [
          { key: "otp6", label: this.t("rules.tplOtp6") },
          { key: "otpAlnum", label: this.t("rules.tplOtpAlnum") },
          { key: "link", label: this.t("rules.tplLink") }
        ];
      },
      rawModalTabs() {
        return [
          { key: "html_render", label: this.t("rawModal.viewHtmlRender") },
          { key: "html_source", label: this.t("rawModal.viewHtmlSource") },
          { key: "text", label: this.t("rawModal.viewText") },
          { key: "raw_eml", label: this.t("rawModal.viewRawEml") }
        ];
      }
    },
    mounted() {
      document.title = this.t("header.pageTitle");
      this.loadStatus();
      this.loadList();
      this.loadRules();
      this.loadWhitelistData();
      this.startPolling();
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      document.addEventListener("keydown", this.handleKeydown);
    },
    beforeUnmount() {
      this.stopPolling();
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      document.removeEventListener("keydown", this.handleKeydown);
    },
    methods: {
      t(path, vars) {
        return window.tmcTranslate(this.lang, path, vars);
      },
      isDisabled(row) {
        return Number(row?.enabled ?? 1) === 0;
      },
      formatApiError(payload, status) {
        if (payload?.errorCode && window.tmcHasKey(this.lang, "errors." + payload.errorCode)) {
          return this.t("errors." + payload.errorCode, payload.errorMeta || {});
        }
        return payload?.message || this.t("common.requestFailed", { status });
      },
      toggleLang() {
        this.lang = this.lang === "zh" ? "en" : "zh";
        document.documentElement.lang = this.lang;
        document.title = this.t("header.pageTitle");
        try { localStorage.setItem("tmc_lang", this.lang); } catch {}
      },
      toggleTheme() {
        this.theme = this.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = this.theme;
        try { localStorage.setItem("tmc_theme", this.theme); } catch {}
      },
      handleKeydown(e) {
        if (e.key === "Escape" && this.rawModal.open) this.closeRawViewer();
      },
      handleVisibilityChange() {
        if (document.visibilityState === "visible" && this.autoRefresh && this.activeTab === "emails") {
          this.loadList();
        }
      },
      startPolling() {
        this.stopPolling();
        this.poller = setInterval(() => {
          if (this.autoRefresh && document.visibilityState === "visible" && this.activeTab === "emails") {
            this.loadList();
          }
        }, 5000);
      },
      stopPolling() {
        if (this.poller) {
          clearInterval(this.poller);
          this.poller = null;
        }
      },
      async requestApi(url, options = {}) {
        try {
          const res = await fetch(url, options);
          if (res.status === 401) {
            window.location.reload();
            return null;
          }
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            return {
              ok: false,
              status: res.status,
              message: this.formatApiError(payload, res.status)
            };
          }
          return { ok: true, data: payload.data };
        } catch {
          return { ok: false, status: 0, message: this.t("common.networkError") };
        }
      },
      async loadStatus() {
        const res = await this.requestApi("/admin/status");
        if (res && res.ok) this.status = res.data;
      },
      async loadTesterOptions() {
        const res = await this.requestApi("/admin/tester/options");
        if (res && res.ok) {
          this.testerOptions = {
            rules: res.data.rules || [],
            emails: res.data.emails || []
          };
        }
      },
      async logout() {
        await fetch("/admin/logout", { method: "POST" });
        window.location.reload();
      },
      refreshActive() {
        if (this.activeTab === "emails") {
          this.loadList();
        } else if (this.activeTab === "rules") {
          this.loadRules();
          if (this.rulesView === "test") this.loadTesterOptions();
        } else if (this.activeTab === "whitelist") {
          this.loadWhitelistData();
          this.loadStatus();
        }
      },
      async loadList({ resetExpand = false } = {}) {
        const params = new URLSearchParams({ page: String(this.page) });
        if (this.emailFilter.q) params.set("q", this.emailFilter.q);
        if (this.emailFilter.to) params.set("to", this.emailFilter.to);
        if (this.emailFilter.onlyMatched) params.set("only_matched", "true");

        const res = await this.requestApi("/admin/emails?" + params.toString());
        if (!res) return;
        if (!res.ok) {
          this.globalError = res.message;
          return;
        }
        this.items = res.data.items || [];
        this.total = res.data.total || 0;

        if (resetExpand) {
          this.expandedResults = {};
        }
      },
      async applyEmailFilter() {
        this.page = 1;
        await this.loadList({ resetExpand: true });
      },
      async resetEmailFilter() {
        this.emailFilter = { q: "", to: "", onlyMatched: false };
        this.page = 1;
        await this.loadList({ resetExpand: true });
      },
      async reparseEmail(item) {
        const id = item.message_id;
        this.reparsingMap[id] = true;
        try {
          const res = await this.requestApi("/admin/emails/" + encodeURIComponent(id) + "/reparse", {
            method: "POST"
          });
          if (!res) return;
          if (!res.ok) {
            this.globalError = res.message;
            return;
          }
          item.extracted_json = res.data.extracted_json;
          this.expandedResults[id] = true;
        } finally {
          this.reparsingMap[id] = false;
        }
      },
      async clearAllEmails() {
        if (!confirm(this.t("emails.confirmClearAll", { total: this.total }))) return;
        this.clearingEmails = true;
        try {
          const res = await this.requestApi("/admin/emails", { method: "DELETE" });
          if (!res) return;
          if (!res.ok) {
            this.globalError = res.message;
            return;
          }
          this.page = 1;
          this.expandedResults = {};
          await this.loadList({ resetExpand: true });
        } finally {
          this.clearingEmails = false;
        }
      },
      async deleteEmail(messageId) {
        if (!confirm(this.t("emails.confirmDelete"))) return;
        const res = await this.requestApi("/admin/emails/" + encodeURIComponent(messageId), { method: "DELETE" });
        if (!res) return;
        if (!res.ok) {
          this.globalError = res.message;
          return;
        }
        delete this.expandedResults[messageId];
        await this.loadList();
        if (this.items.length === 0 && this.page > 1) {
          this.page -= 1;
          await this.loadList({ resetExpand: true });
        }
      },
      async openRawViewer(messageId) {
        this.rawModal = { open: true, loading: true, error: "", view: "html_render", data: null, copied: false };
        const res = await this.requestApi("/admin/emails/" + encodeURIComponent(messageId) + "/content");
        if (!res) return;
        this.rawModal.loading = false;
        if (!res.ok) {
          this.rawModal.error = res.message;
          return;
        }
        const data = res.data;
        this.rawModal.data = data;
        if (data.html_body) this.rawModal.view = "html_render";
        else if (data.raw_eml) this.rawModal.view = "raw_eml";
        else this.rawModal.view = "text";
      },
      closeRawViewer() {
        this.rawModal.open = false;
      },
      currentRawViewText() {
        const d = this.rawModal.data;
        if (!d) return "";
        if (this.rawModal.view === "html_render" || this.rawModal.view === "html_source") return d.html_body || "";
        if (this.rawModal.view === "text") return d.text_body || d.text_preview || "";
        return d.raw_eml || "";
      },
      async copyRawView() {
        const text = this.currentRawViewText();
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          this.rawModal.copied = true;
          setTimeout(() => { this.rawModal.copied = false; }, 2000);
        } catch (err) {
          console.error("Failed to copy raw view:", err);
        }
      },
      useRawInTester() {
        const d = this.rawModal.data;
        if (!d) return;
        this.tester.selectedMessageId = d.message_id || "";
        this.tester.sender = d.from_address || "";
        this.tester.subject = d.subject || "";
        this.tester.text = d.text_body || d.text_preview || "";
        this.tester.html = d.html_body || "";
        this.tester.result = null;
        this.tester.error = "";
        this.closeRawViewer();
        this.activeTab = "rules";
        this.rulesView = "test";
      },
      formatBytes(bytes) {
        if (!bytes || bytes < 1024) return (bytes || 0) + " B";
        return (bytes / 1024).toFixed(1) + " KB";
      },
      async sendEmailToTester(item) {
        await this.loadTesterSampleById(item.message_id, item);
        this.activeTab = "rules";
        this.rulesView = "test";
      },
      async loadEmailIntoTester() {
        if (!this.tester.selectedMessageId) return;
        const fallback = this.testerOptions.emails.find((r) => r.message_id === this.tester.selectedMessageId)
          || this.items.find((r) => r.message_id === this.tester.selectedMessageId);
        await this.loadTesterSampleById(this.tester.selectedMessageId, fallback);
      },
      async loadTesterSampleById(messageId, fallback = null) {
        this.tester.selectedMessageId = messageId;
        this.tester.sender = fallback?.from_address || "";
        this.tester.subject = fallback?.subject || "";
        this.tester.text = fallback?.text_preview || "";
        this.tester.html = "";
        this.tester.result = null;
        this.tester.error = "";
        const res = await this.requestApi("/admin/emails/" + encodeURIComponent(messageId) + "/content");
        if (res && res.ok) {
          this.tester.sender = res.data.from_address || "";
          this.tester.subject = res.data.subject || "";
          this.tester.text = res.data.text_body || res.data.text_preview || "";
          this.tester.html = res.data.html_body || "";
        }
      },
      testRuleInPlayground(rule) {
        this.testerRule = {
          sourceId: String(rule.id),
          remark: rule.remark || "",
          sender_filter: rule.sender_filter || "",
          pattern: rule.pattern || "",
          match_target: rule.match_target || "body"
        };
        this.testerSaveMsg = "";
        this.tester.error = "";
        this.tester.result = null;
        this.activeTab = "rules";
        this.rulesView = "test";
      },
      loadExistingRuleIntoTester() {
        const pool = this.testerOptions.rules.length > 0 ? this.testerOptions.rules : this.rules;
        const found = pool.find((r) => String(r.id) === this.testerRule.sourceId);
        if (!found) return;
        this.testerRule.remark = found.remark || "";
        this.testerRule.sender_filter = found.sender_filter || "";
        this.testerRule.pattern = found.pattern || "";
        this.testerRule.match_target = found.match_target || "body";
        this.testerSaveMsg = "";
        this.tester.error = "";
      },
      resetTesterRule() {
        this.testerRule = { sourceId: "", remark: "", sender_filter: "", pattern: "", match_target: "body" };
        this.testerSaveMsg = "";
        this.tester.error = "";
      },
      async runRuleTest() {
        this.tester.error = "";
        this.testerSaveMsg = "";
        this.tester.result = null;
        // 仅提交当前输入框中用户正在编辑的邮件内容，避免被历史记录覆盖
        const res = await this.requestApi("/admin/rules/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            remark: this.testerRule.remark,
            pattern: this.testerRule.pattern,
            sender_filter: this.testerRule.sender_filter,
            match_target: this.testerRule.match_target,
            sender: this.tester.sender,
            subject: this.tester.subject,
            text: this.tester.text,
            html: this.tester.html
          })
        });
        if (!res) return;
        if (!res.ok) {
          this.tester.error = res.message;
          return;
        }
        this.tester.result = res.data;
      },
      async submitRuleRequest({ id = null, payload }) {
        const isEdit = Boolean(id);
        return this.requestApi(isEdit ? "/admin/rules/" + id : "/admin/rules", {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      },
      async saveTesterRule(saveAsNew = false) {
        this.tester.error = "";
        this.testerSaveMsg = "";
        if (!this.testerRule.pattern.trim()) {
          this.tester.error = this.t("rules.errPatternRequired");
          return;
        }
        this.savingTesterRule = true;
        try {
          const updateId = !saveAsNew && this.testerRule.sourceId ? this.testerRule.sourceId : null;
          const res = await this.submitRuleRequest({
            id: updateId,
            payload: {
              remark: this.testerRule.remark,
              sender_filter: this.testerRule.sender_filter,
              pattern: this.testerRule.pattern,
              match_target: this.testerRule.match_target,
              enabled: true
            }
          });
          if (!res) return;
          if (!res.ok) {
            this.tester.error = res.message;
            return;
          }
          if (!updateId && res.data?.id) {
            this.testerRule.sourceId = String(res.data.id);
          }
          await Promise.all([this.loadRules(), this.loadTesterOptions()]);
          const savedId = updateId || res.data?.id || "";
          this.testerSaveMsg = updateId
            ? this.t("tester.updatedMsg", { id: updateId })
            : this.t("tester.savedMsg", { id: savedId });
        } finally {
          this.savingTesterRule = false;
        }
      },
      async loadRules() {
        const res = await this.requestApi("/admin/rules?page=" + this.rulesPage);
        if (!res) return;
        if (!res.ok) {
          this.globalError = res.message;
          return;
        }
        this.rules = res.data.items || [];
        this.rulesTotal = res.data.total || 0;
      },
      applyRuleTemplate(key, targetForm = this.ruleForm) {
        if (key === "otp6") {
          targetForm.remark = targetForm.remark || (this.lang === "zh" ? "验证码" : "Verification Code");
          targetForm.pattern = "\\b(\\d{6})\\b";
        } else if (key === "otpAlnum") {
          targetForm.remark = targetForm.remark || (this.lang === "zh" ? "验证码" : "OTP Code");
          targetForm.pattern = "(?:code|验证码)[:：\\s]*([A-Za-z0-9]{4,8})";
        } else if (key === "link") {
          targetForm.remark = targetForm.remark || (this.lang === "zh" ? "验证链接" : "Verification Link");
          targetForm.pattern = "(https://[^\\s\"'<>]+)";
        }
      },
      editRule(rule) {
        this.ruleError = "";
        this.ruleForm = {
          id: rule.id,
          remark: rule.remark || "",
          sender_filter: rule.sender_filter || "",
          pattern: rule.pattern || "",
          match_target: rule.match_target || "body",
          enabled: !this.isDisabled(rule)
        };
      },
      resetRuleForm() {
        this.ruleError = "";
        this.ruleForm = { id: null, remark: "", sender_filter: "", pattern: "", match_target: "body", enabled: true };
      },
      async saveRule() {
        this.ruleError = "";
        if (!this.ruleForm.pattern.trim()) {
          this.ruleError = this.t("rules.errPatternRequired");
          return;
        }
        this.savingRule = true;
        try {
          const isEdit = Boolean(this.ruleForm.id);
          const res = await this.submitRuleRequest({ id: this.ruleForm.id, payload: this.ruleForm });
          if (!res) return;
          if (!res.ok) {
            this.ruleError = res.message;
            return;
          }
          this.resetRuleForm();
          if (!isEdit) this.rulesPage = 1;
          await this.loadRules();
        } finally {
          this.savingRule = false;
        }
      },
      async toggleRuleEnabled(rule) {
        const res = await this.submitRuleRequest({
          id: rule.id,
          payload: {
            remark: rule.remark || "",
            sender_filter: rule.sender_filter || "",
            pattern: rule.pattern,
            match_target: rule.match_target || "body",
            enabled: this.isDisabled(rule)
          }
        });
        if (!res) return;
        if (!res.ok) {
          this.globalError = res.message;
          return;
        }
        await this.loadRules();
      },
      async deleteRule(id) {
        const res = await this.requestApi("/admin/rules/" + id, { method: "DELETE" });
        if (!res) return;
        if (!res.ok) {
          this.globalError = res.message;
          return;
        }
        if (this.ruleForm.id === id) this.resetRuleForm();
        if (this.testerRule.sourceId === String(id)) this.resetTesterRule();
        await this.loadRules();
        if (this.rules.length === 0 && this.rulesPage > 1) {
          this.rulesPage -= 1;
          await this.loadRules();
        }
      },
      targetLabel(target) {
        if (target === "subject") return this.t("rules.targetShortSubject");
        if (target === "both") return this.t("rules.targetShortBoth");
        if (target === "html") return this.t("rules.targetShortHtml");
        return this.t("rules.targetShortBody");
      },
      async nextPage() {
        if (this.page < this.totalPages) {
          this.page += 1;
          await this.loadList({ resetExpand: true });
        }
      },
      async prevPage() {
        if (this.page > 1) {
          this.page -= 1;
          await this.loadList({ resetExpand: true });
        }
      },
      async nextRulesPage() {
        if (this.rulesPage < this.rulesTotalPages) {
          this.rulesPage += 1;
          await this.loadRules();
        }
      },
      async prevRulesPage() {
        if (this.rulesPage > 1) {
          this.rulesPage -= 1;
          await this.loadRules();
        }
      },
      async loadWhitelistData() {
        const res = await this.requestApi("/admin/whitelist?page=" + this.whitelistPage);
        if (!res) return;
        if (!res.ok) {
          this.globalError = res.message;
          return;
        }
        this.whitelistItems = res.data.items || [];
        this.whitelistTotal = res.data.total || 0;
      },
      async resetBlockedStats() {
        const res = await this.requestApi("/admin/whitelist/blocked/reset", { method: "POST" });
        if (res && res.ok) await this.loadStatus();
      },
      editWhitelistEntry(item) {
        this.whitelistError = "";
        this.whitelistForm = {
          id: item.id,
          sender_pattern: item.sender_pattern || "",
          remark: item.remark || "",
          enabled: !this.isDisabled(item)
        };
      },
      resetWhitelistForm() {
        this.whitelistError = "";
        this.whitelistForm = { id: null, sender_pattern: "", remark: "", enabled: true };
      },
      async saveWhitelistEntry() {
        this.whitelistError = "";
        if (!this.whitelistForm.sender_pattern.trim()) {
          this.whitelistError = this.t("whitelist.errPatternRequired");
          return;
        }
        this.savingWhitelist = true;
        try {
          const isEdit = Boolean(this.whitelistForm.id);
          const url = isEdit ? "/admin/whitelist/" + this.whitelistForm.id : "/admin/whitelist";
          const res = await this.requestApi(url, {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.whitelistForm)
          });
          if (!res) return;
          if (!res.ok) {
            this.whitelistError = res.message;
            return;
          }
          this.resetWhitelistForm();
          if (!isEdit) this.whitelistPage = 1;
          await this.loadWhitelistData();
        } finally {
          this.savingWhitelist = false;
        }
      },
      async toggleWhitelistEnabled(item) {
        const res = await this.requestApi("/admin/whitelist/" + item.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender_pattern: item.sender_pattern,
            remark: item.remark || "",
            enabled: this.isDisabled(item)
          })
        });
        if (!res) return;
        if (!res.ok) {
          this.globalError = res.message;
          return;
        }
        await this.loadWhitelistData();
      },
      async deleteWhitelistEntry(id) {
        const res = await this.requestApi("/admin/whitelist/" + id, { method: "DELETE" });
        if (!res) return;
        if (!res.ok) {
          this.globalError = res.message;
          return;
        }
        if (this.whitelistForm.id === id) this.resetWhitelistForm();
        await this.loadWhitelistData();
        if (this.whitelistItems.length === 0 && this.whitelistPage > 1) {
          this.whitelistPage -= 1;
          await this.loadWhitelistData();
        }
      },
      async nextWhitelistPage() {
        if (this.whitelistPage < this.whitelistTotalPages) {
          this.whitelistPage += 1;
          await this.loadWhitelistData();
        }
      },
      async prevWhitelistPage() {
        if (this.whitelistPage > 1) {
          this.whitelistPage -= 1;
          await this.loadWhitelistData();
        }
      },
      toggleResult(messageId) {
        this.expandedResults[messageId] = !this.expandedResults[messageId];
      },
      async copyContent(text, messageId) {
        try {
          await navigator.clipboard.writeText(text);
          this.copyStatus[messageId] = true;
          setTimeout(() => { this.copyStatus[messageId] = false; }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
        }
      },
      parseExtracted(raw) {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      },
      matchCount(raw) {
        return this.parseExtracted(raw).length;
      },
      hasResult(raw) {
        return this.matchCount(raw) > 0;
      },
      formatResult(raw) {
        const parsed = this.parseExtracted(raw);
        if (parsed.length > 0) {
          return JSON.stringify(parsed, null, 2);
        }
        return raw || "";
      },
      formatTime(ts) {
        const locale = this.lang === "zh" ? "zh-CN" : "en-US";
        return new Date(ts).toLocaleString(locale);
      }
    }
  }).mount("#app");
})();
