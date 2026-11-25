(function () {
  let currentLang = document.documentElement.lang === "en" ? "en" : "zh";
  let currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let lastErrorKey = null;

  function tr(path) {
    return window.tmcTranslate(currentLang, path);
  }

  function renderControls() {
    document.title = tr("auth.pageTitle");
    document.documentElement.lang = currentLang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = tr(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", tr(el.getAttribute("data-i18n-placeholder")));
    });
    const langBtn = document.getElementById("lang-toggle");
    if (langBtn) {
      langBtn.textContent = tr("common.langSwitch");
      langBtn.title = tr("common.langTitle");
    }
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      const isDark = currentTheme === "dark";
      themeBtn.textContent = (isDark ? "☀ " : "☾ ") + tr(isDark ? "common.themeToLight" : "common.themeToDark");
    }
    const errorEl = document.getElementById("admin-error");
    if (errorEl && lastErrorKey && !errorEl.classList.contains("hidden")) {
      errorEl.textContent = tr(lastErrorKey);
    }
  }

  const langToggleBtn = document.getElementById("lang-toggle");
  if (langToggleBtn) {
    langToggleBtn.addEventListener("click", () => {
      currentLang = currentLang === "zh" ? "en" : "zh";
      try { localStorage.setItem("tmc_lang", currentLang); } catch {}
      renderControls();
    });
  }

  const themeToggleBtn = document.getElementById("theme-toggle");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = currentTheme;
      try { localStorage.setItem("tmc_theme", currentTheme); } catch {}
      renderControls();
    });
  }

  renderControls();

  const input = document.getElementById("admin-token");
  const error = document.getElementById("admin-error");
  const submit = document.getElementById("admin-submit");
  if (input) input.focus();

  const setError = (key) => {
    lastErrorKey = key;
    if (!error) return;
    error.textContent = tr(key);
    error.classList.remove("hidden");
  };

  const attempt = async () => {
    const token = input ? input.value.trim() : "";
    if (!token) {
      setError("auth.errEmptyToken");
      return;
    }
    if (submit) {
      submit.disabled = true;
      submit.textContent = tr("auth.loggingIn");
    }
    try {
      const res = await fetch("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (res.status === 401) {
        setError("auth.errWrongToken");
        return;
      }
      if (!res.ok) {
        let code = "";
        try {
          const payload = await res.json();
          code = payload?.errorCode || "";
        } catch {}
        if (code === "WEAK_ADMIN_TOKEN") {
          setError("auth.errWeakToken");
        } else if (code === "MISSING_ADMIN_TOKEN") {
          setError("auth.missingTitle");
        } else {
          setError("auth.errLoginFailed");
        }
        return;
      }
      window.location.href = "/";
    } catch {
      setError("auth.errNetwork");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = tr("auth.loginBtn");
      }
    }
  };

  if (submit) submit.addEventListener("click", attempt);
  if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
})();
