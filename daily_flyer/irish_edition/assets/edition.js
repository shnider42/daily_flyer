(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const { atlas, county, challenge, assets } = JSON.parse(
    byId("edition-interactions").textContent,
  );
  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Private reading session. */
    }
  }
  const appearance = byId("appearance");
  function setAppearance(mode) {
    document.documentElement.dataset.theme = mode;
    const label =
      mode === "night" ? "Switch to paper reading" : "Switch to night reading";
    appearance.setAttribute("aria-label", label);
    appearance.title = label;
  }
  appearance.hidden = false;
  setAppearance(read("irish-today.appearance") === "night" ? "night" : "paper");
  appearance.addEventListener("click", () => {
    const mode =
      document.documentElement.dataset.theme === "night" ? "paper" : "night";
    setAppearance(mode);
    write("irish-today.appearance", mode);
  });

  const archive = byId("archive");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && archive.open) {
      archive.open = false;
      archive.querySelector("summary").focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (archive.open && !archive.contains(e.target)) archive.open = false;
  });

  const selector = byId("county-select");
  byId("atlas-controls").hidden = false;
  selector.addEventListener("change", () => {
    const chosen = atlas.find((item) => item.slug === selector.value);
    if (!chosen) return;
    byId("county-name").textContent = chosen.name;
    byId("county-tag").textContent =
      (chosen.slug === county ? "This week · " : "") + chosen.province;
    byId("county-copy").textContent = chosen.body;
    byId("county-source").href = chosen.source.url;
    byId("county-image").src = assets + "counties/" + chosen.slug + ".webp";
  });

  const answers = byId("answers");
  const buttons = Array.from(answers.querySelectorAll("button"));
  const quizKey = challenge.key + ".quiz." + challenge.body;
  function finishQuiz(chosen) {
    buttons.forEach((button, i) => {
      button.disabled = true;
      if (i === challenge.answer) button.classList.add("right");
      else if (i === chosen) button.classList.add("wrong");
    });
    const correct = challenge.choices[challenge.answer];
    byId("feedback").textContent =
      (chosen === challenge.answer
        ? "Correct. "
        : "The answer is " + correct + ". ") + challenge.explanation;
  }
  answers.hidden = false;
  byId("quiz-fallback").hidden = true;
  buttons.forEach((button, i) =>
    button.addEventListener("click", () => {
      finishQuiz(i);
      write(quizKey, i);
    }),
  );
  const savedAnswer = read(quizKey);
  if (
    Number.isInteger(savedAnswer) &&
    savedAnswer >= 0 &&
    savedAnswer < buttons.length
  )
    finishQuiz(savedAnswer);

  if (challenge.mode !== "hurling") return;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const game = byId("hurling"),
    quiz = byId("quiz"),
    strike = byId("strike");
  // In reduced-motion mode the same daily challenge offers an untimed question.
  if (motion.matches) return;
  game.hidden = false;
  quiz.hidden = true;
  let shots = 0,
    points = 0,
    position = 0.5,
    frame = null,
    started = 0,
    lastHit = "";
  const bestKey = challenge.key + ".hurling";
  function scoreline() {
    const best = Number(read(bestKey)) || 0;
    byId("score").textContent =
      lastHit +
      points +
      " points · " +
      (5 - shots) +
      " strikes left · Best " +
      best;
  }
  function update(time) {
    position = 0.5 + 0.48 * Math.sin((time - started) / 360);
    byId("marker").style.left = position * 100 + "%";
    frame = requestAnimationFrame(update);
  }
  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }
  function untimed() {
    stop();
    game.hidden = true;
    quiz.hidden = false;
  }
  byId("untimed").addEventListener("click", () => {
    untimed();
    (
      buttons.find((b) => !b.disabled) || byId("challenge").querySelector("h2")
    ).focus();
  });
  if (motion.addEventListener)
    motion.addEventListener("change", (event) => {
      if (event.matches) untimed();
    });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && frame !== null) {
      stop();
      strike.textContent = "Resume shooting";
    }
  });
  strike.addEventListener("click", () => {
    if (frame === null) {
      if (shots === 5) {
        shots = 0;
        points = 0;
        lastHit = "";
      }
      started = performance.now() - 430;
      update(performance.now());
      strike.textContent = "Strike";
    } else {
      const distance = Math.abs(position - 0.5);
      const earned = distance <= 0.09 ? 3 : distance <= 0.26 ? 1 : 0;
      lastHit = ["Wide. ", "Over the bar! ", "", "Goal! "][earned];
      points += earned;
      shots += 1;
      if (shots === 5) {
        stop();
        write(bestKey, Math.max(Number(read(bestKey)) || 0, points));
        strike.textContent = "Play again";
      }
    }
    scoreline();
  });
  scoreline();
})();
