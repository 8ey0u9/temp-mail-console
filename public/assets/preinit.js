(function () {
  try {
    var savedTheme = localStorage.getItem("tmc_theme");
    document.documentElement.dataset.theme =
      savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";

    var savedLang = localStorage.getItem("tmc_lang");
    var lang =
      savedLang === "zh" || savedLang === "en"
        ? savedLang
        : (navigator.language || "").toLowerCase().startsWith("zh")
          ? "zh"
          : "en";
    document.documentElement.lang = lang;
  } catch (e) {
    // 忽略隐私模式等禁用 localStorage 导致的异常
  }
})();
