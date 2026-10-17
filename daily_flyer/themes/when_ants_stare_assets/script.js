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
    const marker = Number(currentPassage().dataset.passage);
    const marginalia = host.querySelector(".was-margin-quote");
    const observations = marker >= 16 ? "The Fool, who understands nothing…" : marker >= 14 ? "LOOK AWAY." : marker >= 9 ? "Too quiet—but only for a second." : marker >= 7 ? "The sun stared at the earth." : "Good morning class, take your seats.";
    if (marginalia.textContent !== observations) marginalia.textContent = observations;
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
  const cover = host.querySelector(".was-cover");
  const look = host.querySelector(".was-look");
  const motion = host.querySelector("#was-motion");
  const reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : {matches: true};
  let gazeFrame = 0;
  let gaze = {x:0, y:0};
  const resetGaze = () => {
    if (gazeFrame) cancelAnimationFrame(gazeFrame);
    gazeFrame = 0;
    cover.style.setProperty("--was-gaze-x", "0px");
    cover.style.setProperty("--was-gaze-y", "0px");
    cover.style.setProperty("--was-orbit-angle", "0deg");
  };
  let motionPreference = get("was:motion:v1") !== "off";
  const syncMotion = () => {
    const enabled = !reducedMotion.matches && motionPreference;
    root.dataset.wasMotion = enabled ? "on" : "off";
    motion.checked = enabled;
    motion.disabled = reducedMotion.matches;
    if (!enabled) resetGaze();
  };
  syncMotion();
  motion.addEventListener("change", () => {
    const enabled = motion.checked && !reducedMotion.matches;
    // Apply in memory even when saving preferences is unavailable.
    motionPreference = enabled;
    root.dataset.wasMotion = enabled ? "on" : "off";
    put("was:motion:v1", root.dataset.wasMotion);
    if (!enabled) resetGaze();
    announcement.textContent = enabled ? "Cover motion on." : "Cover motion off.";
  });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", syncMotion);
  look.addEventListener("click", () => {
    const awake = look.getAttribute("aria-pressed") !== "true";
    root.dataset.wasAwake = String(awake);
    look.setAttribute("aria-pressed", String(awake));
    look.querySelector(".was-look-label").textContent = awake ? "Look away" : "Look closer";
    announcement.textContent = awake ? "The eclipse opens to reveal a watchful sun." : "The eclipse returns.";
    if (!awake) resetGaze();
  });
  cover.addEventListener("pointermove", event => {
    if (root.dataset.wasMotion !== "on" || root.dataset.wasAwake !== "true" || event.pointerType !== "mouse" || document.hidden) return;
    const bounds = cover.getBoundingClientRect();
    gaze = {x: Math.max(-1,Math.min(1,(event.clientX-bounds.left)/Math.max(bounds.width,1)*2-1)), y: Math.max(-1,Math.min(1,(event.clientY-bounds.top)/Math.max(bounds.height,1)*2-1))};
    if (!gazeFrame) gazeFrame = requestAnimationFrame(() => {
      cover.style.setProperty("--was-gaze-x", (gaze.x*9).toFixed(2)+"px");
      cover.style.setProperty("--was-gaze-y", (gaze.y*7).toFixed(2)+"px");
      cover.style.setProperty("--was-orbit-angle", (gaze.x*3).toFixed(2)+"deg");
      gazeFrame = 0;
    });
  }, {passive:true});
  cover.addEventListener("pointerleave", resetGaze);
  document.addEventListener("visibilitychange", () => { if (document.hidden) resetGaze(); });

  const quotes = JSON.parse(host.querySelector("#was-keepsakes").textContent);
  const quoteButtons = [...host.querySelectorAll("[data-quote]")];
  const quoteText = host.querySelector(".was-kept-quote");
  const copyStatus = host.querySelector(".was-copy-status");
  let quoteIndex = Number(get("was:quote:v1"));
  let copyGeneration = 0;
  const chooseQuote = index => {
    quoteIndex = Number.isInteger(index) && index >= 0 && index < quotes.length ? index : 0;
    quoteText.textContent = quotes[quoteIndex].text;
    quoteButtons.forEach((button,i) => button.setAttribute("aria-pressed", String(i === quoteIndex)));
    copyStatus.textContent = "";
    copyGeneration += 1;
  };
  chooseQuote(quoteIndex);
  quoteButtons.forEach(button => button.addEventListener("click", () => {
    chooseQuote(Number(button.dataset.quote));
    put("was:quote:v1", quoteIndex);
  }));
  host.querySelector(".was-copy-quote").addEventListener("click", async () => {
    const generation = ++copyGeneration;
    const line = quoteText.textContent;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(line + "\n— When Ants Stare · Looking");
      if (generation === copyGeneration) copyStatus.textContent = "Copied. A little piece of the story to take with you.";
    } catch (_) {
      if (generation !== copyGeneration) return;
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange(); range.selectNodeContents(quoteText);
        selection.removeAllRanges(); selection.addRange(range);
        copyStatus.textContent = "The line is selected. Use your browser’s Copy command to keep it.";
      } else copyStatus.textContent = "Select the line above and use Copy to keep it.";
    }
  });
  root.classList.add("was-js");
  update(false);
})();
