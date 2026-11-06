// Restore the reader's choice before the stylesheet paints the edition.
(() => {
  const root = document.documentElement;
  const key = "irish-today.appearance";
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved === "paper" || saved === "night") root.dataset.theme = saved;
  } catch {
    // The server-rendered appearance also works when storage is unavailable.
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("appearance");
    if (!button) return;
    function syncButton() {
      const night = root.dataset.theme === "night";
      button.setAttribute("aria-pressed", String(night));
      button.title = night ? "Switch to paper mode" : "Switch to night mode";
    }
    syncButton();
    button.hidden = false;
    button.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "night" ? "paper" : "night";
      syncButton();
      try {
        localStorage.setItem(key, JSON.stringify(root.dataset.theme));
      } catch {
        // The choice still applies for this page.
      }
    });
  });
})();
