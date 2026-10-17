(() => {
  const root = document.documentElement;
  root.dataset.wasMode = "night";
  try {
    const mode = localStorage.getItem("was:appearance:v1");
    if (mode === "paper" || mode === "night") root.dataset.wasMode = mode;
    const size = localStorage.getItem("was:type:v1");
    if (["standard", "large", "larger"].includes(size)) root.dataset.wasType = size;
  } catch (_) { /* The chapter remains readable without browser storage. */ }
})();
(() => {
  const root = document.documentElement;
  let preference = "on";
  try { if (localStorage.getItem("was:motion:v1") === "off") preference = "off"; } catch (_) {}
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.dataset.wasMotion = reduced ? "off" : preference;
})();
