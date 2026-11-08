import { loadCatalogue } from "./core/catalogue.js";
import { SPORTS } from "./sports/rules.js";
import { Match } from "./core/engine.js";
import { FixedClock, seeded } from "./core/math.js";
import { Arena } from "./core/view.js";
import { Input } from "./core/input.js";
import { Sound } from "./core/sound.js";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  readStore,
  writeStore,
} from "./core/storage.js";
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const settings = loadSettings(),
  sound = new Sound(settings);
let sport =
  new URLSearchParams(location.search).get("sport") ||
  readStore("sport", "hockey");
if (!SPORTS[sport]) sport = "hockey";
let data = {},
  mode = "quick",
  game = null,
  previewGame = null,
  paused = false,
  frames = [],
  goalFrames = [],
  replayTime = 0,
  lastEvent = 0,
  lastNow = 0,
  previewTick = 0,
  cup = null,
  finishedShown = false,
  toastTimer,
  activeBinding = null;
const field = new Arena($("field")),
  preview = new Arena($("preview"));
const input = new Input({
  stick: $("stick"),
  knob: $("knob"),
  shoot: $("shoot"),
  pass: $("pass"),
  sprint: $("sprint"),
  switcher: $("switch"),
  settings,
  active: () =>
    !!game &&
    !paused &&
    (game.phase === "play" ||
      (game.phase === "restart_ready" && game.restartData?.side === 0)) &&
    !$("dialog").open,
  onAction: (a, v, p) => game?.action(a, field.toWorld(v), p),
  onPause: () => (game ? togglePause() : null),
});
const clock = new FixedClock((dt) => {
  if (!game || paused || $("dialog").open) return;
  game.aimAssist = settings.assist;
  game.step(dt, field.toWorld(input.vector()));
  if (game.phase === "play") {
    frames.push(game.snapshot());
    if (frames.length > 130) frames.shift();
  }
  if (game.phase === "goal") replayTime += dt;
});
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2800);
}
function applySettings() {
  const fit =
    innerWidth <= 440
      ? Math.min(
          1,
          (innerWidth - 82) /
            (Number(settings.stick) + Number(settings.buttons) * 2.14 + 4),
        )
      : 1;
  document.documentElement.style.setProperty(
    "--stick",
    settings.stick * fit + "px",
  );
  document.documentElement.style.setProperty(
    "--button",
    settings.buttons * fit + "px",
  );
  document.body.classList.toggle("left-handed", settings.leftHanded);
  document.body.classList.toggle("reduced", settings.reduced);
  $("sound-toggle").textContent = settings.sound ? "♪" : "×";
  $("sound-toggle").setAttribute(
    "aria-label",
    settings.sound ? "Mute sound" : "Enable sound",
  );
  for (const [name, code] of Object.entries(settings.keys)) {
    const e = $(name === "switch" ? "switch" : name);
    const k = e?.querySelector("kbd");
    if (k) k.textContent = keyLabel(code);
  }
  if (!writeStore("settings", settings))
    toast("Settings work for this visit; browser storage is unavailable.");
  const touch = matchMedia("(max-width:760px)").matches;
  const size = Math.max(
    155,
    Number(settings.buttons) * 2 + 22,
    Number(settings.stick) + 40,
  );
  $("game").style.setProperty(
    "grid-template-rows",
    matchMedia("(max-height:520px) and (orientation:landscape)").matches
      ? "48px 1fr"
      : `${touch ? 56 : 64}px minmax(0,1fr) ${size}px ${touch ? 0 : 25}px`,
  );
}
function keyLabel(code) {
  return code === "Space"
    ? "SPACE"
    : code.replace("Key", "").replace("Digit", "");
}
applySettings();
window.addEventListener("resize", applySettings);
function selectSport(next) {
  sport = next;
  document.body.dataset.sport = sport;
  writeStore("sport", sport);
  const url = new URL(location);
  url.searchParams.set("sport", sport);
  history.replaceState(null, "", url);
  document.title = SPORTS[sport].title + " · DailyFlyer";
  $("title").innerHTML =
    sport === "hockey"
      ? "POCKET<br><em>HOCKEY.</em>"
      : "POCKET<br><em>SOCCER.</em>";
  $("eyebrow").textContent = SPORTS[sport].eyebrow;
  $("tagline").textContent = SPORTS[sport].description;
  $("league").textContent = SPORTS[sport].league;
  $("preview-caption").textContent =
    sport === "hockey" ? "NIGHT AT THE RINK" : "EUROPEAN NIGHTS";
  document.querySelectorAll("[data-sport]").forEach((b) => {
    if (b.tagName === "BUTTON") {
      b.classList.toggle("active", b.dataset.sport === sport);
      b.setAttribute("aria-pressed", b.dataset.sport === sport);
    }
  });
  if (data[sport]) populate();
}
function populate() {
  const teams = data[sport].teams,
    defaults = sport === "hockey" ? ["bos", "mtl"] : ["liv", "rma"];
  const saved = readStore(sport + ".teams", defaults);
  for (const [i, id] of ["home", "away"].entries()) {
    const el = $(id);
    const groups = new Map();
    for (const t of teams) {
      const group =
        t.group ||
        (sport === "hockey" ? "NHL" : "Champions League · 2025/26 last 16");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(t);
    }
    el.innerHTML = [...groups]
      .map(
        ([label, clubs]) =>
          `<optgroup label="${esc(label)}">${clubs.map((t) => `<option value="${t.id}">${esc(t.name)}${t.season ? " · " + esc(t.season) : ""}</option>`).join("")}</optgroup>`,
      )
      .join("");
    el.value = teams.some((t) => t.id === saved[i]) ? saved[i] : teams[i].id;
  }
  if ($("home").value === $("away").value)
    $("away").value = teams.find((t) => t.id !== $("home").value).id;
  updateTeams();
  $("start").disabled = false;
  $("start-label").textContent = SPORTS[sport].start;
  updateMode();
}
function team(id) {
  return data[sport].teams.find((t) => t.id === id);
}
function updateTeams(changed = "home") {
  if ($("home").value === $("away").value) {
    const other = changed === "home" ? "away" : "home";
    $(other).value = data[sport].teams.find(
      (t) => t.id !== $(changed).value,
    ).id;
  }
  for (const id of ["home", "away"]) {
    const t = team($(id).value);
    const e = $(id + "-badge");
    e.textContent = t.short;
    e.style.background = t.colors[0];
    e.style.color = t.colors[1];
    e.style.borderColor = t.colors[1];
  }
  writeStore(sport + ".teams", [$("home").value, $("away").value]);
  previewGame = new Match({
    sport,
    home: team($("home").value),
    away: team($("away").value),
    practice: true,
    seed: 13,
    autoplay: true,
  });
  previewGame.controlled = -1;
  previewGame.time = 1;
  previewTick = 0;
}
function updateMode() {
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.mode === mode);
    b.setAttribute("aria-selected", b.dataset.mode === mode);
  });
  $("away").disabled = mode === "cup";
  $("duration").disabled = mode === "practice";
  $("mode-note").textContent =
    mode === "cup"
      ? "Four wins to the cup · Single-match ties · Saved between rounds"
      : mode === "practice"
        ? "Unlimited clock · CPU opposition · Learn the controls"
        : `Solo vs CPU · ${SPORTS[sport].count}-on-${SPORTS[sport].count} · ${sport === "hockey" ? "Three periods" : "Two halves"}`;
  $("start-label").textContent =
    mode === "cup"
      ? "START A CUP RUN"
      : mode === "practice"
        ? "ENTER PRACTICE"
        : SPORTS[sport].start;
  const saved = readStore(sport + ".cup", null);
  $("resume-cup").classList.toggle(
    "hidden",
    !saved ||
      saved.finished ||
      !data[sport]?.teams.some((t) => t.id === saved.home),
  );
}
for (const b of document.querySelectorAll(".sport-switch button"))
  b.onclick = () => selectSport(b.dataset.sport);
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => {
    mode = b.dataset.mode;
    updateMode();
  };
$("home").onchange = () => updateTeams("home");
$("away").onchange = () => updateTeams("away");
function modal(title, subtitle, html) {
  input.clear();
  if (game) paused = true;
  $("dialog-content").innerHTML =
    `<div class="dialog-top"><h2>${title}</h2><button class="close" aria-label="Close dialog">×</button></div>${subtitle ? `<p class="dialog-subtitle">${subtitle}</p>` : ""}${html}`;
  if (!$("dialog").open) $("dialog").showModal();
  $("dialog").querySelector(".close").onclick = closeModal;
}
function closeModal() {
  activeBinding = null;
  $("dialog").close();
  input.clear();
  if (game) {
    paused = false;
    clock.reset();
    lastNow = performance.now();
  }
}
$("dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
function showRoster(side) {
  const t = team($(side).value);
  modal(
    t.name,
    (sport === "hockey"
      ? "Representative arcade lineup · "
      : "Representative arcade XI · ") + (t.season || data[sport].season),
    `<table class="roster-table">${t.players.map((p) => `<tr><td>${p.number}</td><td>${esc(p.name)}</td><td>${esc(p.position)}</td></tr>`).join("")}</table><p class="settings-tip">Snapshot: ${esc(t.asOf || data[sport].asOf)}. ${sport === "hockey" ? "One playable line and a goalie; line changes are not included." : "Representative XI; availability and substitutions are not modelled."}</p>${t.notes ? `<p class="settings-tip">${esc(t.notes)}</p>` : ""}${t.sourceUrls.map((s, i) => `<a class="dialog-link" target="_blank" rel="noopener" href="${esc(s)}">Official roster source ${i + 1} →</a>`).join("")}`,
  );
}
$("home-roster").onclick = () => showRoster("home");
$("away-roster").onclick = () => showRoster("away");
function showAbout() {
  modal(
    "ROSTERS & RULES",
    "Pocket Sports · DailyFlyer · 1.1",
    `<div class="settings-group"><h3>THE GAME</h3><p class="dialog-subtitle">${SPORTS[sport].rules}</p></div><div class="settings-group"><h3>THE TEAMS</h3><p class="dialog-subtitle">${esc(data[sport]?.notes || "Loading roster information.")}</p><p class="settings-tip">Player names and numbers are roster facts. Team abilities are balanced arcade behavior; this build does not claim official ratings. The away team wears a light kit for readability. This is an independent fan-made game.</p></div><div class="settings-group"><h3>YOUR PROGRESS</h3><p class="dialog-subtitle">Settings, completed matches and your cup are saved in this browser. Solo play only in this release.</p></div>`,
  );
}
$("about-open").onclick = showAbout;
function showHelp(startAfter = false) {
  modal(
    "TWO THUMBS. ONE GAME.",
    sport === "hockey"
      ? "A little glide is part of skating. Plan the turn."
      : "Create space before you ask for the ball.",
    `<div class="help-grid"><div class="help-card"><b>LEFT THUMB</b><p>Move your highlighted player. Push further for a full stride. Attack toward the arrow above the playing surface.</p></div><div class="help-card"><b>RIGHT THUMB</b><p>Tap PASS. Hold SHOOT, then release for power. Hold ${sport === "hockey" ? "BURST" : "SPRINT"} to spend stamina.</p></div><div class="help-card"><b>WITHOUT THE BALL</b><p>PASS becomes SWITCH. SHOOT becomes ${sport === "hockey" ? "CHECK" : "TACKLE"}. Get close, then commit.</p></div><div class="help-card"><b>ON DESKTOP</b><p>WASD or arrows move. ${keyLabel(settings.keys.pass)} passes, ${keyLabel(settings.keys.shoot)} shoots, ${keyLabel(settings.keys.sprint)} ${sport === "hockey" ? "bursts" : "sprints"}. Remap in settings.</p></div></div><p class="dialog-subtitle">Passing follows your movement direction toward a teammate. Shots are assisted toward goal; steer across the goal to pick a side. You control movement; teammates handle their own positions.${sport === "soccer" ? " At a restart, wait for players to get set, aim with the left stick and press PASS to take it. You choose when to restart." : ""}</p><button class="start-button" id="help-done"><span>${startAfter ? "LET’S PLAY" : "GOT IT"}</span><span>→</span></button>`,
  );
  $("help-done").onclick = () => {
    writeStore(sport + ".learned", true);
    closeModal();
  };
}
$("how-open").onclick = () => showHelp();
function showSettings() {
  modal(
    "MAKE IT YOURS",
    "Controls are shared across both games. Changes save automatically.",
    `<div class="settings-group"><h3>YOUR THUMBS</h3>${[
      ["stick", "Joystick size", 72, 126, 1, "px"],
      ["buttons", "Action button size", 44, 74, 1, "px"],
      ["sensitivity", "Stick sensitivity", 0.6, 1.6, 0.1, "×"],
      ["assist", "Shot assist", 0, 1, 0.05, ""],
    ]
      .map(
        ([id, label, min, max, step, unit]) =>
          `<label class="setting"><span>${label}<output id="${id}-out">${settings[id]}${unit}</output></span><input type="range" id="set-${id}" min="${min}" max="${max}" step="${step}" value="${settings[id]}" aria-label="${label}"></label>`,
      )
      .join("")}${[
      ["leftHanded", "Swap control sides"],
      ["guidance", "Passing guides"],
      ["sound", "Sound effects"],
      ["reduced", "Reduce animation"],
    ]
      .map(
        ([id, label]) =>
          `<label class="setting"><span>${label}</span><input type="checkbox" id="set-${id}" ${settings[id] ? "checked" : ""}></label>`,
      )
      .join(
        "",
      )}</div><div class="settings-group"><h3>YOUR KEYBOARD</h3><p class="settings-tip">Movement: WASD / arrows. Pause: P / Esc. Select an action, then press a key.</p>${[
      ["shoot", "Shoot / tackle"],
      ["pass", "Pass / switch"],
      ["sprint", sport === "hockey" ? "Burst" : "Sprint"],
      ["switch", "Switch player"],
    ]
      .map(
        ([id, label]) =>
          `<div class="setting"><span>${label}</span><button class="binding" data-key="${id}">${keyLabel(settings.keys[id])}</button></div>`,
      )
      .join(
        "",
      )}</div><button class="secondary" id="restore-settings">RESTORE DEFAULTS</button><button class="start-button" id="settings-done"><span>${game ? "RESUME MATCH" : "DONE"}</span><span>→</span></button>`,
  );
  for (const id of ["stick", "buttons", "sensitivity", "assist"])
    $("set-" + id).oninput = (e) => {
      settings[id] = +e.target.value;
      $(id + "-out").textContent =
        settings[id] +
        (["stick", "buttons"].includes(id)
          ? "px"
          : id === "sensitivity"
            ? "×"
            : "");
      applySettings();
    };
  for (const id of ["leftHanded", "guidance", "sound", "reduced"])
    $("set-" + id).onchange = (e) => {
      settings[id] = e.target.checked;
      applySettings();
      if (settings.sound) sound.unlock();
    };
  document.querySelectorAll("[data-key]").forEach(
    (b) =>
      (b.onclick = () => {
        activeBinding = b.dataset.key;
        b.textContent = "PRESS A KEY…";
      }),
  );
  $("restore-settings").onclick = () => {
    Object.assign(settings, structuredClone(DEFAULT_SETTINGS));
    applySettings();
    showSettings();
  };
  $("settings-done").onclick = closeModal;
}
window.addEventListener(
  "keydown",
  (e) => {
    if (!activeBinding) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Escape",
        "KeyP",
        "Tab",
      ].includes(e.code)
    ) {
      toast("That key is reserved for movement or navigation.");
      return;
    }
    const conflict = Object.entries(settings.keys).find(
      ([a, c]) => c === e.code && a !== activeBinding,
    );
    if (conflict) {
      toast("Already used by " + conflict[0] + ". Choose another key.");
      return;
    }
    settings.keys[activeBinding] = e.code;
    activeBinding = null;
    applySettings();
    showSettings();
  },
  true,
);
$("settings-open").onclick = showSettings;
function togglePause() {
  if (!game) return;
  if ($("dialog").open) return closeModal();
  paused = true;
  modal(
    "TIME OUT",
    `${game.teams[0].name} ${game.score[0]} — ${game.score[1]} ${game.teams[1].name}`,
    `<button class="start-button" id="resume"><span>RESUME MATCH</span><span>→</span></button><button class="secondary" id="pause-settings">CONTROLS & SOUND</button><button class="secondary" id="pause-help">HOW TO PLAY</button><button class="secondary" id="leave">LEAVE MATCH</button><p class="settings-tip">${cup ? "Completed cup rounds are saved. Leaving this match lets you restart this round." : "Leaving discards this match."}</p>`,
  );
  $("resume").onclick = closeModal;
  $("pause-settings").onclick = showSettings;
  $("pause-help").onclick = () => showHelp();
  $("leave").onclick = leaveGame;
}
$("pause").onclick = togglePause;
$("sound-toggle").onclick = () => {
  settings.sound = !settings.sound;
  applySettings();
  sound.unlock();
};
function createCup() {
  const rng = seeded(Date.now()),
    home = $("home").value,
    others = data[sport].teams.filter((t) => t.id !== home).map((t) => t.id);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  return {
    home,
    opponents: others.slice(0, 4),
    round: 0,
    results: [],
    difficulty: $("difficulty").value,
    seconds: +$("duration").value,
    finished: false,
  };
}
function startMatch(resume = false) {
  sound.unlock();
  if (mode === "cup") {
    cup = resume ? readStore(sport + ".cup", null) : createCup();
    if (!cup) return;
    writeStore(sport + ".cup", cup);
  } else cup = null;
  const home = cup ? team(cup.home) : team($("home").value),
    away = cup ? team(cup.opponents[cup.round]) : team($("away").value);
  game = new Match({
    sport,
    home,
    away,
    difficulty: cup?.difficulty || $("difficulty").value,
    seconds: cup?.seconds || +$("duration").value,
    practice: mode === "practice",
    cup: !!cup,
    seed: Date.now(),
  });
  finishedShown = false;
  paused = false;
  frames = [];
  goalFrames = [];
  lastEvent = 0;
  replayTime = 0;
  document.body.classList.add("playing");
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("score-home").textContent = home.short;
  $("score-away").textContent = away.short;
  field.resize();
  input.clear();
  clock.reset();
  lastNow = performance.now();
  if (!readStore(sport + ".learned", false)) showHelp(true);
  else if (cup) showCupRound();
}
function showCupRound() {
  const names = ["ROUND OF 16", "QUARTER-FINAL", "SEMI-FINAL", "FINAL"];
  modal(
    names[cup.round],
    `${team(cup.home).name} vs ${team(cup.opponents[cup.round]).name}`,
    `<div class="cup-progress">${names.map((n, i) => `<span class="${i < cup.round ? "won" : ""}">${i < cup.round ? "✓ " : ""}${n}</span>`).join("")}</div><p class="dialog-subtitle">One match. A level score goes to golden-goal overtime. Win four rounds to lift the cup.</p><button class="start-button" id="cup-ready"><span>${SPORTS[sport].start}</span><span>→</span></button>`,
  );
  $("cup-ready").onclick = closeModal;
}
$("start").onclick = () => startMatch();
$("resume-cup").onclick = () => {
  mode = "cup";
  startMatch(true);
};
function leaveGame() {
  game = null;
  cup = null;
  paused = false;
  input.clear();
  $("dialog").close();
  document.body.classList.remove("playing");
  $("game").classList.add("hidden");
  $("lobby").classList.remove("hidden");
  $("announcement").classList.add("hidden");
  $("replay-tag").classList.add("hidden");
  updateMode();
  preview.resize();
}
function result() {
  if (finishedShown) return;
  finishedShown = true;
  paused = true;
  const homeWin = game.winner === 0;
  let title =
    game.winner === null
      ? "HONOURS EVEN"
      : homeWin
        ? "THAT’S A WIN."
        : "NEXT ONE IS YOURS.";
  let advance = false;
  if (cup) {
    cup.results.push({ opponent: game.teams[1].id, score: [...game.score] });
    if (homeWin) {
      cup.round++;
      advance = cup.round < 4;
      cup.finished = !advance;
      title = advance ? "THROUGH TO THE NEXT." : "CUP CHAMPIONS.";
    } else cup.finished = true;
    writeStore(sport + ".cup", cup);
  }
  const history = readStore(sport + ".history", []);
  history.unshift({
    home: game.teams[0].id,
    away: game.teams[1].id,
    score: game.score,
    date: new Date().toISOString(),
  });
  writeStore(sport + ".history", history.slice(0, 30));
  const total = game.stats[0].possession + game.stats[1].possession || 1;
  modal(
    title,
    `${game.teams[0].name} vs ${game.teams[1].name}`,
    `<div class="result-score">${game.score[0]} — ${game.score[1]}</div>${["shots", "saves", "passes", "tackles"].map((key) => `<div class="stat-row"><b>${game.stats[0][key]}</b><span>${key.toUpperCase()}</span><b>${game.stats[1][key]}</b></div>`).join("")}<div class="stat-row"><b>${Math.round((game.stats[0].possession / total) * 100)}%</b><span>POSSESSION</span><b>${Math.round((game.stats[1].possession / total) * 100)}%</b></div><button class="start-button" style="margin-top:22px" id="result-next"><span>${advance ? "NEXT ROUND" : cup ? "BACK TO CLUBHOUSE" : "PLAY AGAIN"}</span><span>→</span></button><button class="secondary" id="result-home">BACK TO CLUBHOUSE</button>`,
  );
  $("result-next").onclick = () => {
    closeModal();
    if (advance) startMatch(true);
    else if (cup) leaveGame();
    else startMatch();
  };
  $("result-home").onclick = leaveGame;
}
function hud() {
  if (!game) return;
  $("home-score").textContent = game.score[0];
  $("away-score").textContent = game.score[1];
  const seconds = Math.ceil(game.remaining);
  $("clock").textContent = game.practice
    ? "∞"
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  $("period").textContent = game.practice
    ? "PRACTICE"
    : game.period > game.rules.periods
      ? "GOLDEN GOAL"
      : `${game.rules.periodName} ${game.period}`;
  const restart =
    game.restartData && ["restart", "restart_ready"].includes(game.phase)
      ? game.restartData
      : null;
  $("possession").textContent = restart
    ? `${game.teams[restart.side].short} · ${restart.type}`
    : game.ball.owner === null
      ? "LOOSE " + game.rules.noun.toUpperCase()
      : game.hasBall
        ? "YOUR POSSESSION"
        : "DEFEND YOUR GOAL";
  $("player-name").textContent = game.user
    ? `${game.user.number} · ${game.user.name}`
    : "";
  $("stamina").style.width = (game.user?.stamina || 0) * 100 + "%";
  $("pass").querySelector("span").textContent = restart
    ? game.phase === "restart_ready" && restart.side === 0
      ? restart.type === "THROW-IN"
        ? "THROW"
        : "PASS"
      : "WAIT"
    : game.hasBall
      ? "PASS"
      : "SWITCH";
  $("shoot").querySelector("span").textContent = restart
    ? game.phase === "restart_ready" && restart.side === 0
      ? restart.type === "THROW-IN"
        ? "THROW"
        : restart.type === "KICK-OFF"
          ? "PASS"
          : "KICK"
      : "WAIT"
    : game.hasBall
      ? "SHOOT"
      : sport === "hockey"
        ? "CHECK"
        : "TACKLE";
  $("charge").style.height = input.power() * 100 + "%";
  $("sprint").querySelector("span").textContent =
    sport === "hockey" ? "BURST" : "SPRINT";
  const announce = ["goal", "break", "restart", "restart_ready"].includes(
    game.phase,
  );
  $("announcement").classList.toggle("set-piece", !!restart);
  $("announcement").classList.toggle("hidden", !announce);
  $("announcement").textContent =
    game.phase === "goal"
      ? (game.nextSide === 1 ? game.teams[0].short : game.teams[1].short) +
        " GOAL!"
      : restart
        ? `${restart.type} · ${game.teams[restart.side].short}\n${game.phase === "restart" ? "Getting into position…" : restart.side === 0 ? "Aim with the stick · Tap " + (restart.type === "THROW-IN" ? "THROW" : "PASS") : "Waiting for the restart…"}`
        : game.message;
  const ev = game.events.filter((e) => e.time > lastEvent);
  for (const e of ev) {
    sound.event(e.type, sport);
    if (e.type === "goal") {
      goalFrames = frames.slice();
      replayTime = 0;
      input.clear();
    }
    if (e.type === "finished") result();
  }
  if (game.events.length) lastEvent = game.events.at(-1).time;
  if (game.phase === "finished" && !finishedShown) result();
}
function frame(now) {
  const dt = Math.min(0.12, (now - lastNow) / 1000 || 0);
  lastNow = now;
  if (game) {
    clock.advance(dt);
    hud();
    let replay = null;
    if (game.phase === "goal" && goalFrames.length > 20 && !settings.reduced) {
      const i = Math.min(goalFrames.length - 1, Math.floor(replayTime * 45));
      replay = goalFrames[i];
    }
    $("replay-tag").classList.toggle("hidden", !replay);
    field.draw(game, {
      guide: settings.guidance,
      replay,
      reduced: settings.reduced,
    });
  } else if (previewGame && !document.hidden) {
    previewTick += dt;
    if (previewTick > 1 / 30) {
      previewGame.step(Math.min(previewTick, 0.06));
      previewTick = 0;
    }
    preview.draw(previewGame, {
      guide: false,
      preview: true,
      reduced: settings.reduced,
    });
  }
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  input.clear();
  clock.reset();
  lastNow = performance.now();
  if (document.hidden && game && !paused && game.phase !== "finished")
    togglePause();
});
selectSport(sport);
requestAnimationFrame(frame);
try {
  const results = await Promise.all(
    ["hockey", "soccer"].map(async (s) => {
      const catalogue = await loadCatalogue(s, {
        apiBase: location.pathname.startsWith("/sports/")
          ? "/api/v1/sports"
          : null,
      });
      return [s, catalogue];
    }),
  );
  data = Object.fromEntries(results);
  populate();
} catch (err) {
  $("load-error").textContent =
    "The team files could not load. Reload this page to try again.";
  $("load-error").classList.remove("hidden");
  $("start-label").textContent = "TEAMS UNAVAILABLE";
}
