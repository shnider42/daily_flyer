(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("rm-form");
  if (!form) return;

  // Always intercept first, including when the engine failed to load.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    roast();
  });

  const engine = window.RoastMachine;
  const fields = ["personality", "job", "hobby", "chat", "style", "habit", "occasion", "heat"];
  const heatDescriptions = {
    mild: "Mild: a little toast, plenty of affection.",
    medium: "Medium: a few bruises to the ego.",
    savage: "Savage: the ego is on its own."
  };
  const heatLabels = { mild: "Mild", medium: "Medium", savage: "Savage" };
  let lastResult = null;
  let roastNumber = 0;
  let animationTimer = null;
  let copyTimer = null;

  if (!engine || typeof engine.generate !== "function" || !Array.isArray(engine.fields)) {
    $("rm-form-status").textContent = "The machine didn't load. Please refresh and try again.";
    return;
  }

  for (const field of engine.fields) {
    if (!fields.includes(field.id)) continue;
    const select = $("rm-" + field.id);
    if (!select || !Array.isArray(field.options)) continue;
    select.replaceChildren();
    for (const item of field.options) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    }
  }

  function defaults() {
    for (const id of fields) {
      const select = $("rm-" + id);
      const requested = id === "heat" ? "medium" : id === "occasion" ? "just_because" : "";
      select.value = requested;
      if (select.selectedIndex < 0) select.selectedIndex = 0;
    }
    updateHeat();
  }

  function updateHeat() {
    $("rm-heat-description").textContent = heatDescriptions[$("rm-heat").value] || heatDescriptions.medium;
  }

  function updateCount() {
    $("rm-count").textContent = $("rm-details").value.length + " / 600";
  }

  function nameError(message) {
    const error = $("rm-name-error");
    error.textContent = message;
    error.hidden = !message;
    if (message) $("rm-name").setAttribute("aria-invalid", "true");
    else $("rm-name").removeAttribute("aria-invalid");
  }

  function getInputs() {
    const inputs = { name: $("rm-name").value.trim(), details: $("rm-details").value.trim() };
    for (const field of fields) inputs[field] = $("rm-" + field).value;
    return inputs;
  }

  function roast() {
    if (!engine) return;
    const inputs = getInputs();
    if (!inputs.name) {
      nameError("Enter a name or nickname.");
      $("rm-name").focus();
      return;
    }
    nameError("");
    let result;
    try {
      result = engine.generate(inputs, { previous: lastResult ? lastResult.text : "" });
      if (!result || !Array.isArray(result.paragraphs) || !result.paragraphs.length || !result.text) throw new Error("Empty roast");
    } catch (error) {
      $("rm-form-status").textContent = "The machine jammed. Try again with a shorter note.";
      return;
    }

    lastResult = result;
    roastNumber += 1;
    $("rm-batch").textContent = "No. " + String(roastNumber).padStart(3, "0");
    $("rm-target-name").textContent = result.name || inputs.name;
    $("rm-receipt-heat").textContent = (heatLabels[inputs.heat] || "Medium") + " roast";
    const paragraphs = result.paragraphs.map((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      return paragraph;
    });
    $("rm-roast-text").replaceChildren(...paragraphs);
    $("rm-empty").hidden = true;
    $("rm-result").hidden = false;
    $("rm-receipt").setAttribute("aria-labelledby", "rm-target-name");
    $("rm-result-actions").hidden = false;
    $("rm-copy-fallback").hidden = true;
    $("rm-copy-label").textContent = "Copy roast";
    $("rm-detail-note").textContent = result.detailNote || "";
    $("rm-detail-note").hidden = !result.detailNote;
    $("rm-form-status").textContent = "Roast ready.";
    $("rm-output-status").textContent = "Roast " + roastNumber + " for " + (result.name || inputs.name) + " is ready.";

    const printer = $("rm-printer");
    printer.classList.remove("rm-printing");
    void printer.offsetWidth;
    printer.classList.add("rm-printing");
    window.clearTimeout(animationTimer);
    animationTimer = window.setTimeout(() => printer.classList.remove("rm-printing"), 450);
    $("rm-receipt").focus({ preventScroll: true });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("rm-output-label").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function setChoice(id, candidates) {
    const select = $("rm-" + id);
    const options = Array.from(select.options);
    const chosen = options.find((option) => candidates.some((candidate) => option.value.toLowerCase().includes(candidate) || option.label.toLowerCase().includes(candidate)));
    if (chosen) select.value = chosen.value;
  }

  $("rm-example").addEventListener("click", () => {
    defaults();
    $("rm-name").value = "Alex";
    $("rm-details").value = "Always says 'five minutes away' while still at home. Bought an expensive coffee setup and now every cup comes with a lecture.";
    setChoice("personality", ["know", "overconfident", "confident"]);
    setChoice("job", ["office", "corporate", "tech"]);
    setChoice("hobby", ["coffee", "gamer", "gaming"]);
    setChoice("chat", ["voice", "essay", "paragraph"]);
    setChoice("style", ["hoodie", "athleisure"]);
    setChoice("habit", ["late"]);
    updateCount();
    nameError("");
    $("rm-form-status").textContent = "Example loaded. Edit it or hit ROAST.";
    $("rm-name").focus({ preventScroll: true });
  });

  $("rm-reset").addEventListener("click", () => {
    form.reset();
    defaults();
    updateCount();
    nameError("");
    lastResult = null;
    roastNumber = 0;
    $("rm-batch").textContent = "No. 000";
    $("rm-result").hidden = true;
    $("rm-empty").hidden = false;
    $("rm-result-actions").hidden = true;
    $("rm-detail-note").hidden = true;
    $("rm-detail-note").textContent = "";
    $("rm-copy-fallback").hidden = true;
    $("rm-copy-text").value = "";
    $("rm-roast-text").replaceChildren();
    $("rm-target-name").textContent = "";
    $("rm-receipt-heat").textContent = "Ready";
    $("rm-receipt").setAttribute("aria-labelledby", "rm-receipt-title");
    $("rm-form-status").textContent = "";
    $("rm-output-status").textContent = "Machine cleared.";
    window.clearTimeout(copyTimer);
    $("rm-copy-label").textContent = "Copy roast";
    $("rm-name").focus();
  });

  $("rm-again").addEventListener("click", roast);
  $("rm-copy").addEventListener("click", async () => {
    if (!lastResult) return;
    const copiedResult = lastResult;
    const copyText = copiedResult.text;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(copyText);
      if (lastResult !== copiedResult) return;
      $("rm-copy-label").textContent = "Copied!";
      $("rm-output-status").textContent = "Copied.";
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => { $("rm-copy-label").textContent = "Copy roast"; }, 2500);
    } catch (error) {
      if (lastResult !== copiedResult) return;
      $("rm-copy-text").value = copyText;
      $("rm-copy-fallback").hidden = false;
      $("rm-copy-text").focus();
      $("rm-copy-text").select();
      $("rm-copy-text").setSelectionRange(0, copyText.length);
      $("rm-output-status").textContent = "Your browser blocked one-tap copying. Select and copy the text below.";
    }
  });
  $("rm-name").addEventListener("input", () => { if ($("rm-name").value.trim()) nameError(""); });
  $("rm-details").addEventListener("input", updateCount);
  $("rm-heat").addEventListener("change", updateHeat);
  defaults();
  updateCount();
  $("rm-roast").disabled = false;
})();
