(() => {
  "use strict";
  const host = document.getElementById("was-novel");
  if (!host) return;
  const root = document.documentElement;
  const chapter = host.querySelector(".was-prose");
  const passages = [...chapter.querySelectorAll("[data-passage]")];
  const settings = host.querySelector(".was-settings");
  const appearance = host.querySelector("#was-appearance");
  const type = host.querySelector("#was-type");
  const focus = host.querySelector("#was-focus");
  const toggle = host.querySelector(".was-mode-toggle");
  const progress = host.querySelector(".was-progress");
  const resume = host.querySelector(".was-resume");
  const announcement = host.querySelector("#was-announcement");
  const masthead = host.querySelector(".was-masthead");
  const keys = {appearance:"was:appearance:v1", type:"was:type:v1", place:"was:looking:place:v1"};
  const get = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const put = (key, value) => { try { localStorage.setItem(key, String(value)); return true; } catch (_) { return false; } };
  let storedPlace = Number(get(keys.place));
  if (!Number.isInteger(storedPlace) || storedPlace < 1 || storedPlace > passages.length) storedPlace = 0;
  if (storedPlace > 1) {
    resume.hidden = false;
    resume.href = "#passage-" + storedPlace;
  }
  const syncAppearance = () => {
    const paper = root.dataset.wasMode === "paper";
    appearance.value = paper ? "paper" : "night";
    toggle.innerHTML = (paper ? "Night" : "Paper") + ' <span aria-hidden="true">◐</span>';
    toggle.setAttribute("aria-label", "Switch to " + (paper ? "night" : "paper") + " appearance");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = paper ? "#eee9dc" : "#171813";
  };
  const changeAppearance = mode => {
    root.dataset.wasMode = mode === "paper" ? "paper" : "night";
    put(keys.appearance, root.dataset.wasMode);
    syncAppearance();
    announcement.textContent = root.dataset.wasMode === "paper" ? "Paper appearance on." : "Night appearance on.";
  };
  if (!["paper", "night"].includes(root.dataset.wasMode)) root.dataset.wasMode = "night";
  syncAppearance();
  type.value = ["standard", "large", "larger"].includes(root.dataset.wasType) ? root.dataset.wasType : "standard";
  toggle.addEventListener("click", () => changeAppearance(root.dataset.wasMode === "paper" ? "night" : "paper"));
  appearance.addEventListener("change", () => changeAppearance(appearance.value));
  const headerHeight = () => {
    const value = masthead.getBoundingClientRect().height;
    root.style.setProperty("--was-header", value + "px");
    return value;
  };
  headerHeight();
  if ("ResizeObserver" in window) new ResizeObserver(headerHeight).observe(masthead);
  const currentPassage = () => {
    const threshold = masthead.getBoundingClientRect().height + 110;
    return passages.find(p => p.getBoundingClientRect().bottom > threshold) || passages[passages.length - 1];
  };
  type.addEventListener("change", () => {
    const anchor = currentPassage();
    const inChapter = chapter.getBoundingClientRect().top < innerHeight && chapter.getBoundingClientRect().bottom > 0;
    root.dataset.wasType = type.value;
    put(keys.type, type.value);
    if (inChapter) anchor.scrollIntoView({block:"start", behavior:"instant"});
    announcement.textContent = type.options[type.selectedIndex].text + " text selected.";
    queueUpdate();
  });
  focus.addEventListener("change", () => {
    root.dataset.wasFocus = String(focus.checked);
    announcement.textContent = focus.checked ? "Focus reading on. Margin details are hidden." : "Focus reading off.";
  });
  document.addEventListener("pointerdown", event => {
    if (settings.open && !settings.contains(event.target)) settings.open = false;
  });
  settings.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      settings.open = false;
      settings.querySelector("summary").focus();
    }
  });
  host.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", () => { settings.open = false; });
  });
  let scheduled = false;
  let lastSaved = storedPlace;
  const update = (save = false) => {
    scheduled = false;
    const rect = chapter.getBoundingClientRect();
    const top = masthead.getBoundingClientRect().height + 86;
    const visibleHeight = Math.max(1, innerHeight - top);
    const amount = Math.max(0, Math.min(100, (visibleHeight - (rect.top - top)) / Math.max(1, rect.height) * 100));
    progress.value = amount;
    if (save && rect.top < top + 80 && rect.bottom > top) {
      const place = Number(currentPassage().dataset.passage);
      if (place !== lastSaved && put(keys.place, place)) lastSaved = place;
      if (place > 1) { resume.hidden = false; resume.href = "#passage-" + place; }
    }
  };
  function queueUpdate() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(() => update(true)); }
  }
  window.addEventListener("scroll", queueUpdate, {passive:true});
  window.addEventListener("resize", () => { headerHeight(); update(false); }, {passive:true});
  window.addEventListener("pagehide", () => update(true));
  root.classList.add("was-js");
  update(false);
})();
