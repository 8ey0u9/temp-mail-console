(function () {
  let currentLang = document.documentElement.lang === "en" ? "en" : "zh";
  let currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let lastErrorState = null;

  function tr(path, vars) {
    return window.tmcTranslate(currentLang, path, vars);
  }

  function renderError() {
    const errorEl = document.getElementById("admin-error");
    if (!errorEl || !lastErrorState) return;
    if (lastErrorState.key) {
      errorEl.textContent = tr(lastErrorState.key, lastErrorState.vars);
    } else {
      errorEl.textContent = lastErrorState.raw || "";
    }
    errorEl.classList.remove("hidden");
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
    renderError();
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

  const setErrorKey = (key, vars) => {
    lastErrorState = { key, vars };
    renderError();
  };

  const setApiError = async (res, fallbackKey) => {
    let payload = {};
    try {
      payload = await res.json();
    } catch {}
    const code = payload?.errorCode;
    if (code && typeof window.tmcHasKey === "function" && window.tmcHasKey(currentLang, "errors." + code)) {
      setErrorKey("errors." + code, payload.errorMeta);
      return;
    }
    if (payload?.error) {
      lastErrorState = { raw: payload.error };
      renderError();
      return;
    }
    setErrorKey(fallbackKey);
  };

  const input = document.getElementById("admin-token");
  const submit = document.getElementById("admin-submit");
  if (input) {
    input.focus();
    const attemptLogin = async () => {
      const token = input.value.trim();
      if (!token) {
        setErrorKey("auth.errEmptyToken");
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
          setErrorKey("auth.errWrongToken");
          return;
        }
        if (res.status === 409) {
          window.location.reload();
          return;
        }
        if (!res.ok) {
          await setApiError(res, "auth.errLoginFailed");
          return;
        }
        window.location.href = "/";
      } catch {
        setErrorKey("auth.errNetwork");
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = tr("auth.loginBtn");
        }
      }
    };
    if (submit) submit.addEventListener("click", attemptLogin);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") attemptLogin(); });
  }

  const setupInput = document.getElementById("setup-token");
  const setupConfirm = document.getElementById("setup-token-confirm");
  const setupSubmit = document.getElementById("setup-submit");
  if (setupInput && setupConfirm && setupSubmit) {
    setupInput.focus();
    const attemptSetup = async () => {
      const token = setupInput.value.trim();
      const confirmVal = setupConfirm.value.trim();
      if (!token) {
        setErrorKey("errors.SECRET_REQUIRED");
        return;
      }
      if (token.length < 8) {
        setErrorKey("errors.SECRET_TOO_SHORT", { min: 8 });
        return;
      }
      if (token !== confirmVal) {
        setErrorKey("auth.errSetupMismatch");
        return;
      }
      setupSubmit.disabled = true;
      setupSubmit.textContent = tr("auth.settingUp");
      try {
        const res = await fetch("/admin/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        if (!res.ok) {
          await setApiError(res, "auth.errSetupFailed");
          return;
        }
        window.location.href = "/";
      } catch {
        setErrorKey("auth.errNetwork");
      } finally {
        setupSubmit.disabled = false;
        setupSubmit.textContent = tr("auth.setupBtn");
      }
    };
    setupSubmit.addEventListener("click", attemptSetup);
    setupInput.addEventListener("keydown", (e) => { if (e.key === "Enter") setupConfirm.focus(); });
    setupConfirm.addEventListener("keydown", (e) => { if (e.key === "Enter") attemptSetup(); });
  }
})();
