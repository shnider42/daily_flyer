import { loadCatalogue } from "./core/catalogue.js";
import { SPORTS } from "./sports/rules.js";
import { Match, ENGINE_VERSION } from "./core/engine.js";
import { playerActionRatings } from "./core/ballistics.js";
import { FixedClock, seeded } from "./core/math.js";
import { Arena } from "./core/view.js";
import { placeSportsMinimap } from "./core/sports-camera.js";
import { bindMinimapInput } from "./core/minimap-input.js";
import { Input, matchControlsActive } from "./core/input.js";
import { Sound } from "./core/sound.js";
import { HockeyNetwork } from "./core/hockey-network.js";
import { HockeyRoomUI } from "./core/hockey-room-ui.js";
import {
  DEFAULT_SETTINGS,
  defaultCameraSettings,
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
  sound = new Sound(settings),
  actionLabels = new Map();
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
  activeBinding = null,
  minimapInput = null,
  minimapFrameKey = null,
  minimapPlacementKey = null,
  minimapGame = null,
  networkState = { room: null, game: null, seatId: null, connected: false, rtt: null },
  roomUI = null;
const field = new Arena($("field")),
  preview = new Arena($("preview"));
const cameraMap = $("camera-map"),
  cameraOverview = $("camera-overview"),
  cameraFollow = $("camera-follow");
const input = new Input({
  stick: $("stick"),
  knob: $("knob"),
  shoot: $("shoot"),
  pass: $("pass"),
  lob: $("lob"),
  through: $("through"),
  sprint: $("sprint"),
  switcher: $("switch"),
  settings,
  controlMode: matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard",
  onControlMode: (next) => {
    game?.setControlMode(next);
    updateControlHint();
  },
  autoSprint: () => game?.sport === "soccer" && settings.touchAssist,
  footballControls: () => game?.sport === "soccer",
  hockeyControls: () => game?.sport === "hockey",
  hockeyActor: () => game?.sport === "hockey" && game.phase === "play" && game.isPlayerActive(game.user) ? game.user?.id : null,
  defending: () =>
    game?.sport === "soccer" && game.phase === "play" && !game.hasBall,
  canChargeShot: () => game?.sport === "hockey" ? game.canPlayPuck() :
    game?.sport !== "soccer" ||
    (game.phase === "play" && game.hasBall) ||
    (["restart", "restart_ready"].includes(game.phase) &&
      game.restartData?.side === 0),
  shotContext: () =>
    game?.sport === "soccer"
      ? game.phase === "play"
        ? game.owner
        : game.restartData
      : game?.puckControlContext(),
  active: () => matchControlsActive(game, paused || (game?.network && (networkState.room?.status !== "playing" || !networkState.connected)), $("dialog").open),
  onAction: (a, v, p, details) => {
    if (game?.network) hockeyNetwork.action(a, field.toWorld(v), p, details);
    else game?.action(a, field.toWorld(v), p, details);
    input.syncShotContext();
  },
  onPause: () => (game ? togglePause() : null),
});
function minimapLayout() {
  const box = cameraOverview.getBoundingClientRect();
  return box.width && box.height ? field.camera.minimapLayout(box.width, box.height) : null;
}
function updateMinimapLabel() {
  const manual = field.camera.manual;
  cameraMap.classList.toggle("manual", manual);
  $("camera-map-state").textContent = manual ? "MANUAL VIEW" : "FOLLOWING PLAY";
  cameraFollow.disabled = !manual;
  cameraFollow.textContent = manual ? "Follow play" : "Tap / drag to look";
}
function followPlay() {
  minimapInput?.cancel();
  field.camera.followPlay();
  updateMinimapLabel();
}
minimapInput = bindMinimapInput(cameraOverview, {
  enabled: () => !!game && !paused && !$("dialog").open && !cameraMap.hidden && field.camera.zoomed,
  getViewRect: () => {
    const layout = minimapLayout();
    return layout ? field.camera.minimapViewRect(layout) : null;
  },
  onPan: ({ x, y }) => {
    const layout = minimapLayout();
    if (!layout) return;
    field.camera.setManualCenter(field.camera.minimapUnproject({ x: x * layout.width, y: y * layout.height }, layout));
    updateMinimapLabel();
  },
  onStart: () => {
    cameraOverview.classList.add("dragging");
  },
  onEnd: () => cameraOverview.classList.remove("dragging"),
  onFollow: followPlay,
});
cameraFollow.onclick = (event) => {
  event.stopPropagation();
  followPlay();
};
// The shared map handler owns only its navigation keys. WASD and pause still
// reach gameplay while the map has focus, and previously held keys can release.
// The sibling button owns its native activation keys so Space/Enter cannot
// begin a gameplay action as well as returning the camera to the play.
cameraFollow.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " " || event.code === "Space")
    event.stopPropagation();
});
function positionMinimap() {
  const landscape = matchMedia("(max-height:520px) and (orientation:landscape)").matches;
  const key = `${landscape}:${field.width}:${field.height}:${innerWidth}:${innerHeight}:${sport}:${settings.stick}:${settings.buttons}:${settings.leftHanded}`;
  if (minimapPlacementKey === key) return;
  minimapPlacementKey = key;
  cameraMap.style.removeProperty("right");
  cameraMap.style.removeProperty("bottom");
  if (!landscape) return;
  const stage = $("field").getBoundingClientRect();
  const size = cameraMap.getBoundingClientRect();
  const controls = [...document.querySelectorAll("#controls .move-control, #controls .action-controls, #controls .center-control")]
    .map((element) => element.getBoundingClientRect());
  const placement = placeSportsMinimap(stage, size, controls);
  cameraMap.style.right = `${placement.right}px`;
  cameraMap.style.bottom = `${placement.bottom}px`;
}
function renderMinimap(state, replay) {
  const visible = field.camera.zoomed && (settings.camera[sport].minimap || field.camera.manual);
  const frameKey = `${!!replay}:${field.width}:${field.height}`;
  if (!visible || minimapFrameKey !== frameKey || minimapGame !== game) minimapInput.cancel();
  minimapFrameKey = frameKey;
  minimapGame = game;
  cameraMap.hidden = !visible;
  if (!visible) {
    minimapPlacementKey = null;
    return;
  }
  cameraMap.classList.toggle("landscape", field.rotated);
  positionMinimap();
  updateMinimapLabel();
  field.overview(cameraOverview, state, sport === "hockey");
}
const clock = new FixedClock((dt) => {
  if (!game || game.network || paused || $("dialog").open) return;
  game.aimAssist = settings.assist;
  const phaseBefore = game.phase;
  input.syncShotContext();
  game.step(dt, field.toWorld(input.vector()));
  input.syncShotContext();
  if (phaseBefore === "play" && game.phase !== "play") { input.cancelShot(); input.cancelThrough(); }
  if (game.phase === "play") {
    frames.push(game.snapshot());
    if (frames.length > 130) frames.shift();
  }
  if (game.phase === "goal") replayTime += dt;
});
const hockeyNetwork = new HockeyNetwork({
  onError: (error) => toast(error.message),
  onUpdate: (state) => {
    const wasOnline = !!game?.network;
    networkState = state;
    if (state.room && !state.game && data.hockey) {
      const config = state.room.config;
      if ($("home").value !== config.homeTeamId || $("away").value !== config.awayTeamId) {
        $("home").value = config.homeTeamId;
        $("away").value = config.awayTeamId;
        updateTeams();
      }
      $("difficulty").value = config.difficulty;
      $("duration").value = config.duration;
    }
    if (!state.game || state.room?.status === "closed") roomUI?.render(state);
    if (state.game && state.room?.status !== "closed") {
      if (game !== state.game) {
        cup = null;
        enterMatchView(state.game);
        toast("Match connected. Your highlighted skater is yours to control.");
      }
      if (state.room.status !== "playing" || !state.connected) input.clear();
    } else if (wasOnline) {
      leaveGame(false);
      if (state.room?.reason) toast(state.room.reason);
    }
  },
});
roomUI = new HockeyRoomUI({
  network: hockeyNetwork,
  resumeCode: HockeyNetwork.savedRoom(),
  getOptions: () => ({ homeTeamId: $("home").value, awayTeamId: $("away").value,
    difficulty: $("difficulty").value, duration: Number($("duration").value) }),
  onNotice: toast,
  onChanged: () => { if (!game) updateMode(); },
});
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2800);
}
function updateControlHint() {
  $("move-caption").textContent =
    sport === "soccer" && input.controlMode === "touch" && settings.touchAssist
      ? "EDGE TO SPRINT"
      : "MOVE";
}
function applySettings() {
  minimapInput?.cancel();
  minimapPlacementKey = null;
  game?.setTouchAssist(settings.touchAssist);
  updateControlHint();
  const fit =
    innerWidth <= 440
      ? Math.min(
          1,
          (innerWidth - 86) /
            (Number(settings.stick) +
              Number(settings.buttons) * 2.55),
        )
      : 1;
  const stickSize = Number(settings.stick) * fit,
    buttonSize = Number(settings.buttons) * fit;
  document.documentElement.style.setProperty(
    "--stick",
    stickSize + "px",
  );
  document.documentElement.style.setProperty(
    "--button",
    buttonSize + "px",
  );
  document.documentElement.style.setProperty(
    "--landscape-move-space",
    Math.max(stickSize + 20, 108) + 24 + "px",
  );
  document.documentElement.style.setProperty(
    "--landscape-action-space",
    buttonSize * 2.55 + 24 + "px",
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
  const size = Math.max(155, Math.ceil(buttonSize * 2.55 + 20), stickSize + 40);
  $("game").style.setProperty(
    "grid-template-rows",
    matchMedia("(max-height:520px) and (orientation:landscape)").matches
      ? "48px 1fr"
      : `${touch ? 56 : 64}px minmax(0,1fr) ${size}px ${touch ? 0 : 25}px`,
  );
  sound.update(game, { paused: paused || (game?.network && networkState.room?.status !== "playing"), menu: $("dialog").open || !game });
}
function keyLabel(code) {
  return code === "Space"
    ? "SPACE"
    : code.replace("Key", "").replace("Digit", "");
}
applySettings();
window.addEventListener("resize", applySettings);
function selectSport(next) {
  if (next !== sport && hockeyNetwork.room) hockeyNetwork.leave();
  if (next !== "hockey" && mode === "online") mode = "quick";
  minimapInput?.cancel();
  field.camera.clearManualViews();
  cameraMap.hidden = true;
  sport = next;
  document.body.dataset.sport = sport;
  const soccer = sport === "soccer";
  document.querySelector(".center-control").append($("sprint"));
  for (const id of ["lob", "through"]) $(id).hidden = false;
  $("online-tab").hidden = soccer;
  $("hockey-status").hidden = soccer;
  $("hockey-hold-status").hidden = soccer;
  $("control-preview-actions").textContent = soccer
    ? "Pass · loft · through · shoot"
    : "Pass · shoot · saucer · dump";
  $("sprint").querySelector(".action-label").textContent = soccer
    ? "SPRINT"
    : "BURST";
  applySettings();
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
  if (sport === "hockey") {
    const select = $("hockey-player"), previous = Number(select.value) || readStore("hockey.player", 1);
    select.innerHTML = previewGame.players.filter((p) => p.side === 0 && !p.keeper)
      .map((p) => `<option value="${p.id}">${p.number} · ${esc(p.name)} · ${esc(p.role)}</option>`).join("");
    if ([...select.options].some((option) => Number(option.value) === previous)) select.value = previous;
    select.disabled = $("hockey-control-mode").value !== "skater";
  }
}
function updateMode() {
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.mode === mode);
    b.setAttribute("aria-selected", b.dataset.mode === mode);
  });
  const online = sport === "hockey" && mode === "online";
  const inRoom = !!networkState.room && networkState.room.status !== "closed";
  $("hockey-online").hidden = !online;
  $("hockey-control-options").hidden = sport !== "hockey" || online;
  $("start").hidden = online;
  $("home").disabled = inRoom;
  $("away").disabled = mode === "cup" || inRoom;
  $("duration").disabled = mode === "practice" || inRoom;
  $("difficulty").disabled = inRoom;
  $("mode-note").textContent =
    online ? "Private hockey · Up to four players · Any mix of sides and locked skaters"
      : mode === "cup"
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
    online || !saved ||
      saved.finished ||
      !data[sport]?.teams.some((t) => t.id === saved.home),
  );
}
$("hockey-control-mode").value = readStore("hockey.control-mode", "team");
$("hockey-control-mode").onchange = () => {
  $("hockey-player").disabled = $("hockey-control-mode").value !== "skater";
  writeStore("hockey.control-mode", $("hockey-control-mode").value);
};
$("hockey-player").onchange = () => writeStore("hockey.player", Number($("hockey-player").value));
for (const b of document.querySelectorAll(".sport-switch button"))
  b.onclick = () => selectSport(b.dataset.sport);
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => {
    if (b.dataset.mode !== "online" && hockeyNetwork.room) hockeyNetwork.leave();
    mode = b.dataset.mode;
    updateMode();
  };
$("home").onchange = () => updateTeams("home");
$("away").onchange = () => updateTeams("away");
function modal(title, subtitle, html) {
  minimapInput?.cancel();
  input.clear();
  if (game?.network) hockeyNetwork.clearInput();
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
    if (game.network && networkState.room?.status === "paused") hockeyNetwork.resume().catch((error) => toast(error.message));
  }
}
$("dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
function showRoster(side) {
  const t = team($(side).value);
  const aerial = sport === "soccer" ? "crossing" : "lofting";
  const rows = t.players.map((p) => {
    const ratings = playerActionRatings(p, sport);
    return `<tr><td>${p.number}</td><th scope="row">${esc(p.name)}<small>${esc(p.position)}</small></th><td>${ratings.passing}</td><td>${ratings[aerial]}</td><td>${ratings.shooting}</td></tr>`;
  }).join("");
  modal(
    t.name,
    (sport === "hockey"
      ? "Representative arcade lineup · "
      : "Representative arcade XI · ") + (t.season || data[sport].season),
    `<p class="settings-tip">Action ratings out of 99. These are arcade ratings based on position, shared across clubs. Higher ratings mean more accurate execution; pressure, fatigue and difficult deliveries still matter.</p><table class="roster-table action-ratings"><thead><tr><th scope="col">No.</th><th scope="col">Player</th><th scope="col">Pass</th><th scope="col">${sport === "soccer" ? "Cross" : "Loft"}</th><th scope="col">Shot</th></tr></thead><tbody>${rows}</tbody></table><p class="settings-tip">Snapshot: ${esc(t.asOf || data[sport].asOf)}. ${sport === "hockey" ? "One playable line and a goalie; line changes are not included." : "Representative XI; availability and substitutions are not modelled."}</p>${t.notes ? `<p class="settings-tip">${esc(t.notes)}</p>` : ""}${t.sourceUrls.map((s, i) => `<a class="dialog-link" target="_blank" rel="noopener" href="${esc(s)}">Official roster source ${i + 1} →</a>`).join("")}`,
  );
}
$("home-roster").onclick = () => showRoster("home");
$("away-roster").onclick = () => showRoster("away");
function showAbout() {
  modal(
    "ROSTERS & RULES",
    `Pocket Sports · DailyFlyer · ${ENGINE_VERSION}`,
    `<div class="settings-group"><h3>THE GAME</h3><p class="dialog-subtitle">${SPORTS[sport].rules}</p></div><div class="settings-group"><h3>THE TEAMS</h3><p class="dialog-subtitle">${esc(data[sport]?.notes || "Loading roster information.")}</p><p class="settings-tip">Player names and numbers are roster facts. Action ratings are balanced by playing position, with the same role values across clubs. They are arcade ratings, not official player rankings. Your direction sets the intended placement; ability and the difficulty of the attempt affect execution. The away team wears a light kit for readability. This is an independent fan-made game.${sport === "hockey" ? " Matching fighting penalties bring generic bench skaters onto the ice." : ""}</p></div><div class="settings-group"><h3>YOUR PROGRESS</h3><p class="dialog-subtitle">Settings, completed matches and your cup are saved in this browser. ${sport === "hockey" ? "Private online matches support up to four players on either side, switching skaters or locking one player. Rooms are temporary; use the invite link to play on the same server." : "Soccer is solo play."}</p></div>`,
  );
}
$("about-open").onclick = showAbout;
function showHelp(startAfter = false) {
  const soccer = sport === "soccer";
  const attackHelp = soccer
    ? `<span class="help-action a">A</span> Ground pass<br><span class="help-action b">B</span> Hold, release to shoot<br><span class="help-action x">X</span> Lofted pass / cross<br><span class="help-action y">Y</span> Through ball into space`
    : `<span class="help-action a">A</span> Ground pass<br><span class="help-action b">B</span> Tap for a wrist shot; hold for a slap shot<br><span class="help-action x">X</span> Saucer pass over sticks<br><span class="help-action y">Y</span> Hold, then release for a high dump`;
  const defenceHelp = soccer
    ? `<span class="help-action a">A</span> Switch player<br><span class="help-action b">B</span> Standing tackle<br><span class="help-action x">X</span> Sliding tackle<br>Hold <span class="help-action y">Y</span> to rush your keeper`
    : `<span class="help-action a">A</span> Switch skater, or call for a pass when locked<br><span class="help-action b">B</span> Body check<br><span class="help-action x">X</span> Poke check<br><span class="help-action y">Y</span> Hold for 3 seconds to challenge a nearby opponent`;
  modal(
    "FOUR BUTTONS. YOUR GAME.",
    soccer
      ? "Y on top. B right. A below. X left. The letters stay put; their jobs change with possession."
      : "Y on top. B right. A below. X left. Your own skater’s puck reach decides the action.",
    `<div class="help-grid"><div class="help-card"><b>LEFT THUMB</b><p>Move your highlighted player. Point toward a teammate to choose a pass; the same stick adds lead in that direction. Ease the stick toward the middle for a pass closer to their feet. ${soccer && settings.touchAssist ? "On touch, push to the outer edge to sprint; ease back to save stamina." : "Push further for a full stride."} Attack toward the arrow.</p></div><div class="help-card"><b>IN POSSESSION</b><p class="control-lines">${attackHelp}</p></div><div class="help-card"><b>WITHOUT THE ${soccer ? "BALL" : "PUCK"}</b><p class="control-lines">${defenceHelp}</p>${soccer ? '<p>Contain helps you stay goal-side; it does not tackle. A slide commits your player, so time it carefully.</p>' : '<p>Reachable loose pucks count as playable. A teammate’s possession does not turn your own buttons into passes or shots.</p>'}</div><div class="help-card"><b>${soccer ? "CONTAIN & SPRINT" : "YOUR SKATER"}</b><p>${soccer ? "Hold the separate CONTAIN button to stay goal-side while defending. Release it to move freely. Hold SPRINT for a burst of speed. Release Y to bring your keeper back toward goal." : "Switch skaters to run a team, or lock one skater in the lobby. In a lock, A asks an AI teammate for a pass. Hold BURST for speed; a little glide is part of skating."}</p></div></div>${soccer ? `<p class="dialog-subtitle help-note">X crosses into the box from an attacking wing; elsewhere it sends a lofted pass. Steer to place it ahead, behind or across the runner. Y plays further into space along the ground. Hold B for power and aim as you release; steer across goal to choose a side.</p><p class="dialog-subtitle">At restarts, keep aiming and choose a pass or kick; you can queue it during the brief setup. For throw-ins, A is short, X is long and Y leads a runner. On an opponent’s restart, move to mark and tap A to switch defenders.</p>` : '<p class="dialog-subtitle help-note">Hold B for about half a second to wind up a slap shot. Aim with the stick as you release B or Y. Longer Y holds give a higher, longer dump; aiming it straight over the glass from your defensive zone brings a delay-of-game minor. Aim up ice or play it off the boards.</p><p class="dialog-subtitle">Off the puck, Y needs an uninterrupted three-second hold near an opponent. Human opponents accept by holding Y themselves; an AI can decline. Fighting brings matching majors. Penalty clocks are shortened for arcade matches; a locked skater stays in the box until released. No icing or offside yet.</p>'}<p class="dialog-subtitle help-note"><b>PLACEMENT &amp; ACCURACY</b> · The small cross marks your intended target; its letter matches the action button and its number is that player’s action rating. The shaded area shows room for error. Pressure, tired legs, awkward movement and long or powerful attempts widen it. Even a 99 can miss under pressure. See your lineup for Pass, ${soccer ? "Cross" : "Loft"} and Shot ratings. Turn aiming guides off in settings for a cleaner view.</p><p class="settings-tip"><b>KEYBOARD</b> · WASD / arrows move. ${keyLabel(settings.keys.pass)} = A, ${keyLabel(settings.keys.shoot)} = B, ${keyLabel(settings.keys.lob)} = X, ${keyLabel(settings.keys.through)} = Y. ${soccer ? "Hold " : ""}${keyLabel(settings.keys.switch)} ${soccer ? "to contain while defending" : "switches or calls"}; ${keyLabel(settings.keys.sprint)} ${soccer ? "sprints" : "bursts"}. Remap in settings.</p><button class="start-button" id="help-done"><span>${startAfter ? "LET’S PLAY" : "GOT IT"}</span><span>→</span></button>`,
  );
  $("help-done").onclick = () => {
    writeStore(sport + ".learned", true);
    if (sport === "hockey") writeStore("hockey.abxy-learned", true);
    closeModal();
  };
}
$("how-open").onclick = () => showHelp();
function cameraSettingsMarkup() {
  const camera = settings.camera[sport];
  return `<div class="settings-group camera-settings"><h3>YOUR VIEW · ${sport === "hockey" ? "HOCKEY" : "SOCCER"}</h3><label class="setting"><span>Camera</span><select id="set-camera-mode" aria-describedby="camera-mode-help"><option value="full" ${camera.mode === "full" ? "selected" : ""}>Full view · stable</option><option value="fit" ${camera.mode === "fit" ? "selected" : ""}>Fit ${sport === "hockey" ? "boards" : "sidelines"}</option><option value="follow" ${camera.mode === "follow" ? "selected" : ""}>Follow play</option></select></label><label class="setting"><span>Zoom<output id="camera-zoom-out">${camera.zoom.toFixed(2)}×</output></span><input type="range" id="set-camera-zoom" min="1" max="2.2" step="0.05" value="${camera.zoom}" aria-label="Camera zoom" aria-describedby="camera-mode-help"></label><label class="setting"><span>Focus</span><select id="set-camera-focus"><option value="play" ${camera.focus === "play" ? "selected" : ""}>Play</option><option value="ball" ${camera.focus === "ball" ? "selected" : ""}>${sport === "hockey" ? "Puck" : "Ball"}</option><option value="player" ${camera.focus === "player" ? "selected" : ""}>Selected player</option></select></label><label class="setting"><span>Overview when zoomed</span><input type="checkbox" id="set-camera-minimap" ${camera.minimap ? "checked" : ""}></label><p class="settings-tip" id="camera-mode-help"></p><p class="settings-tip">The camera allows small movements before following gently. ${sport === "hockey" ? "Amber marks the puck; the blue ring marks your skater." : "The bright ring marks your player."} Edge arrows point to action outside your view. Settings save separately for each sport.</p></div>`;
}
function bindCameraSettings() {
  const camera = settings.camera[sport];
  const refresh = () => {
    $("set-camera-zoom").disabled = camera.mode !== "follow";
    $("set-camera-focus").disabled = camera.mode === "full";
    $("set-camera-minimap").disabled = camera.mode === "full";
    $("camera-zoom-out").textContent = camera.mode === "follow" ? `${camera.zoom.toFixed(2)}×` : "Auto fit";
    $("camera-mode-help").textContent = camera.mode === "full"
      ? `The whole ${sport === "hockey" ? "rink" : "pitch"} stays in view with no camera movement. Zoom and focus are available in Follow play.`
      : camera.mode === "fit"
        ? `Keeps both ${sport === "hockey" ? "side boards" : "sidelines"} visible and follows along the ${sport === "hockey" ? "rink" : "pitch"}. Zoom is automatic; turn to landscape for a side-to-side view.`
        : "Drag this slider to bring the play closer. Tap the bottom-right overview to center anywhere, or drag its view rectangle. The view stays there until Follow play; zoom stays unchanged.";
  };
  for (const key of ["mode", "focus", "minimap", "zoom"]) {
    $("set-camera-" + key)[key === "zoom" ? "oninput" : "onchange"] = (event) => {
      camera[key] = key === "zoom" ? +event.target.value : key === "minimap" ? event.target.checked : event.target.value;
      refresh();
      applySettings();
    };
  }
  refresh();
}
function showSettings() {
  modal(
    "CAMERA & CONTROLS",
    `Changes save automatically in this browser.${game?.network && networkState.room?.status === "playing" ? " The online match continues while this menu is open." : ""}`,
    `${cameraSettingsMarkup()}<div class="settings-group"><h3>YOUR THUMBS</h3>${[
      ["stick", "Joystick size", 72, 126, 1, "px"],
      ["buttons", "Action button size", 44, 74, 1, "px"],
      ["sensitivity", "Stick sensitivity", 0.6, 1.6, 0.1, "×"],
      ["assist", game?.network ? "Shot assist · shared online" : "Shot assist", 0, 1, 0.05, ""],
      ...(sport === "hockey" ? [["crowd", "Crowd volume", 0, 1, 0.05, ""]] : []),
    ]
      .map(
        ([id, label, min, max, step, unit]) =>
          `<label class="setting"><span>${label}<output id="${id}-out">${settings[id]}${unit}</output></span><input type="range" id="set-${id}" min="${min}" max="${max}" step="${step}" value="${settings[id]}" aria-label="${label}"></label>`,
      )
      .join("")}${sport === "soccer" ? `<label class="setting"><span>Touch assistance</span><input type="checkbox" id="set-touchAssist" aria-describedby="touch-assist-help" ${settings.touchAssist ? "checked" : ""}></label><p class="settings-tip touch-assist-tip" id="touch-assist-help">More time to react and automatic sprinting at the stick’s outer edge.</p>` : ""}${[
      ["leftHanded", "Swap control sides"],
      ["guidance", "Aiming guides"],
      ["sound", sport === "hockey" ? "Arena sound" : "Sound effects"],
      ["reduced", "Reduce animation"],
    ]
      .map(
        ([id, label]) =>
          `<label class="setting"><span>${label}</span><input type="checkbox" id="set-${id}" ${settings[id] ? "checked" : ""}></label>`,
      )
      .join(
        "",
      )}</div><div class="settings-group"><h3>YOUR KEYBOARD</h3><p class="settings-tip">Movement: WASD / arrows. Pause: P / Esc. Select an action, then press a key.</p>${[
      ["shoot", sport === "soccer" ? "B · Shoot / tackle" : "B · Shoot / hold slap shot / hit"],
      ["pass", sport === "soccer" ? "A · Pass / switch player" : "A · Pass / switch / call"],
      ...(sport === "soccer"
        ? [
            ["lob", "X · Loft / cross / slide"],
            ["through", "Y · Through / hold keeper rush"],
          ]
        : [["lob", "X · Saucer pass / poke check"], ["through", "Y · Dump / hold to fight"]]),
      ["sprint", sport === "hockey" ? "Burst" : "Sprint"],
      ["switch", sport === "soccer" ? "Hold contain" : "Switch player"],
    ]
      .map(
        ([id, label]) =>
          `<div class="setting"><span>${label}</span><button class="binding" data-key="${id}">${keyLabel(settings.keys[id])}</button></div>`,
      )
      .join(
        "",
      )}</div><button class="secondary" id="restore-settings">RESTORE DEFAULTS</button><button class="start-button" id="settings-done"><span>${game ? "RESUME MATCH" : "DONE"}</span><span>→</span></button><a class="sports-home-link" href="/pocket-sports/">← POCKET SPORTS HOME</a>${game ? '<p class="settings-tip">Returning home leaves this match.</p>' : ""}`,
  );
  bindCameraSettings();
  $("set-assist").disabled = !!game?.network;
  if (game?.network) {
    $("set-assist").value = game.aimAssist;
    $("assist-out").textContent = game.aimAssist;
  }
  for (const id of ["stick", "buttons", "sensitivity", "assist", ...(sport === "hockey" ? ["crowd"] : [])])
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
  for (const id of [
    "leftHanded",
    "guidance",
    "sound",
    "reduced",
    ...(sport === "soccer" ? ["touchAssist"] : []),
  ])
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
    field.camera.clearManualViews();
    Object.assign(settings, structuredClone(DEFAULT_SETTINGS));
    const touch = matchMedia("(pointer: coarse)").matches;
    settings.camera = { hockey: defaultCameraSettings(touch), soccer: defaultCameraSettings(touch) };
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
$("camera-open").onclick = showSettings;
async function togglePause() {
  if (!game) return;
  if ($("dialog").open) return closeModal();
  if (game.network && networkState.room?.status === "playing") {
    input.clear();
    try { await hockeyNetwork.pause(); }
    catch (error) { toast(error.message); }
    if (!game) return;
  }
  paused = true;
  modal(
    "TIME OUT",
    `${game.teams[0].name} ${game.score[0]} — ${game.score[1]} ${game.teams[1].name}`,
    `<button class="start-button" id="resume"><span>RESUME MATCH</span><span>→</span></button><button class="secondary" id="pause-settings">CAMERA, CONTROLS & SOUND</button><button class="secondary" id="pause-help">HOW TO PLAY</button><button class="secondary" id="leave">LEAVE MATCH</button><a class="sports-home-link" href="/pocket-sports/">← POCKET SPORTS HOME</a><p class="settings-tip">${game.network ? "Pausing stops play for the whole room. Everyone chooses Resume when ready. Leaving this match ends the room; a brief connection interruption allows reconnection from this tab." : cup ? "Completed cup rounds are saved. Leaving this match lets you restart this round." : "Leaving or returning home discards this match."}</p>`,
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
  if (mode === "online") return;
  minimapInput?.cancel();
  cameraMap.hidden = true;
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
    controlMode: input.controlMode,
    touchAssist: settings.touchAssist,
    seconds: cup?.seconds || +$("duration").value,
    practice: mode === "practice",
    cup: !!cup,
    seed: Date.now(),
  });
  if (sport === "hockey") {
    game.setControllers([{ id: "local", side: 0, mode: $("hockey-control-mode").value,
      playerId: Number($("hockey-player").value) }], "local");
  }
  enterMatchView(game);
  if (!readStore(sport === "hockey" ? "hockey.abxy-learned" : sport + ".learned", false)) showHelp(true);
  else if (cup) showCupRound();
}
function enterMatchView(match) {
  game = match;
  sport = game.sport;
  document.body.dataset.sport = sport;
  minimapInput?.cancel();
  cameraMap.hidden = true;
  field.camera.clearManualViews();
  sound.unlock();
  finishedShown = false;
  paused = false;
  frames = [];
  goalFrames = [];
  lastEvent = 0;
  replayTime = 0;
  document.body.classList.add("playing");
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("score-home").textContent = game.teams[0].short;
  $("score-away").textContent = game.teams[1].short;
  field.resize();
  input.clear();
  clock.reset();
  lastNow = performance.now();
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
function leaveGame(leaveRoom = true) {
  if (leaveRoom && hockeyNetwork.room) hockeyNetwork.leave();
  minimapInput?.cancel();
  field.camera.clearManualViews();
  cameraMap.hidden = true;
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
  const homeWin = game.winner === (game.network ? game.localSide : 0);
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
    `<div class="result-score">${game.score[0]} — ${game.score[1]}</div>${["shots", "saves", "passes", "tackles"].map((key) => `<div class="stat-row"><b>${game.stats[0][key]}</b><span>${key.toUpperCase()}</span><b>${game.stats[1][key]}</b></div>`).join("")}<div class="stat-row"><b>${Math.round((game.stats[0].possession / total) * 100)}%</b><span>POSSESSION</span><b>${Math.round((game.stats[1].possession / total) * 100)}%</b></div><button class="start-button" style="margin-top:22px" id="result-next"><span>${game.network ? "BACK TO MULTIPLAYER" : advance ? "NEXT ROUND" : cup ? "BACK TO CLUBHOUSE" : "PLAY AGAIN"}</span><span>→</span></button><button class="secondary" id="result-home">BACK TO CLUBHOUSE</button>`,
  );
  $("result-next").onclick = () => {
    closeModal();
    if (game.network) leaveGame();
    else if (advance) startMatch(true);
    else if (cup) leaveGame();
    else startMatch();
  };
  $("result-home").onclick = leaveGame;
}
function setActionLabel(id, label, description = label, available = true) {
  const next = `${label}|${description}|${available}`;
  if (actionLabels.get(id) === next) return;
  actionLabels.set(id, next);
  const button = $(id);
  button.querySelector(".action-label").textContent = label;
  button.setAttribute(
    "aria-label",
    available ? description : `${description} · Wait for play to resume`,
  );
  button.setAttribute("aria-disabled", String(!available));
  button.classList.toggle("unavailable", !available);
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
    sport === "soccer" && game.restartData && ["restart", "restart_ready"].includes(game.phase)
      ? game.restartData
      : null;
  $("possession").textContent = restart
    ? `${game.teams[restart.side].short} · ${restart.type}`
    : game.ball.owner === null
      ? "LOOSE " + game.rules.noun.toUpperCase()
      : game.hasBall
        ? "YOUR POSSESSION"
        : "DEFEND YOUR GOAL";
  if (sport === "hockey") {
    $("possession").textContent = game.user?.offIce ? "IN THE PENALTY BOX"
      : game.canPlayPuck() ? "PLAY THE PUCK"
      : game.owner?.side === (game.user?.side ?? game.localSide ?? 0) ? "TEAMMATE HAS PUCK"
      : game.owner ? "DEFEND YOUR GOAL" : "LOOSE PUCK";
  }
  $("player-name").textContent = game.user
    ? `${game.user.number} · ${game.user.name}`
    : "";
  $("stamina").style.width = (game.user?.stamina || 0) * 100 + "%";
  if (sport === "soccer") {
    if ($("switch").dataset.label !== "CONTAIN") {
      $("switch").dataset.label = "CONTAIN";
      $("switch").innerHTML = `CONTAIN <kbd>${keyLabel(settings.keys.switch)}</kbd>`;
      $("switch").setAttribute("aria-label", "Hold to contain while defending");
    }
    const ownRestart = restart?.side === 0,
      attacking = ownRestart || (!restart && game.hasBall),
      available = game.phase === "play" || ownRestart,
      throwIn = ownRestart && restart.type === "THROW-IN",
      crossing = attacking && game.canCross();
    setActionLabel(
      "pass",
      attacking ? (throwIn ? "THROW" : "PASS") : "SWITCH",
      attacking
        ? `A: ${throwIn ? "short throw" : "ground pass"}`
        : "A: switch player",
      game.phase === "play" || !!restart,
    );
    setActionLabel(
      "shoot",
      attacking
        ? throwIn
          ? "THROW"
          : ownRestart
            ? restart.type === "KICK-OFF"
              ? "PASS"
              : ["KEEPER BALL", "GOAL KICK"].includes(restart.type)
                ? "PUNT"
                : "KICK"
            : "SHOOT"
        : "TACKLE",
      attacking ? "B: hold, then release for power" : "B: standing tackle",
      available,
    );
    setActionLabel(
      "lob",
      attacking ? (throwIn ? "LONG" : crossing ? "CROSS" : "LOFT") : "SLIDE",
      attacking
        ? `X: ${throwIn ? "long throw" : crossing ? "cross into the box" : "lofted pass"}`
        : "X: sliding tackle",
      available,
    );
    setActionLabel(
      "through",
      attacking ? (throwIn ? "LEAD" : "THROUGH") : "KEEPER",
      attacking
        ? `Y: ${throwIn ? "lead throw to a runner" : "through ball into space"}`
        : "Y: hold to rush the goalkeeper",
      available,
    );
  } else {
    const playable = game.canPlayPuck(), actor = game.user;
    const locked = game.controllers?.find((seat) => seat.id === game.localControllerId)?.mode === "skater";
    const available = game.phase === "play" && game.isPlayerActive(actor) && (!game.network || networkState.room?.status === "playing");
    const slap = input.chargeKind === "hockey-shot" && input.chargeStart !== null &&
      (game.network ? (actor?.shotHold || 0) >= 0.45 : (performance.now() - input.chargeStart) >= 450);
    const progress = input.hockeyProgress();
    if (progress.kind === "fight" && game.network) {
      progress.seconds = actor?.fightHold || 0;
      progress.power = Math.min(1, progress.seconds / 3);
    }
    setActionLabel("pass", playable ? "PASS" : locked ? "CALL" : "SWITCH",
      playable ? "A: pass the puck" : locked ? "A: call for a pass from an AI teammate" : "A: switch skater", available);
    setActionLabel("shoot", playable ? slap ? "SLAP" : "SHOOT" : "HIT",
      playable ? "B: tap for a wrist shot; hold, then release for a slap shot" : "B: body check", available);
    setActionLabel("lob", playable ? "SAUCER" : "POKE",
      playable ? "X: saucer pass over sticks" : "X: poke check", available);
    setActionLabel("through", playable ? "DUMP" : "FIGHT",
      playable ? "Y: hold, then release to dump the puck" : "Y: hold for three seconds near an opponent to challenge or accept a fight", available);
    $("dump-charge").style.height = (progress?.power || 0) * 100 + "%";
    $("through").classList.toggle("fight-ready", progress?.kind === "fight" && progress.seconds >= 3);
    const holdText = progress?.kind === "fight" ? `FIGHT\n${Math.min(3, Math.floor(progress.seconds * 10) / 10).toFixed(1)}/3`
      : progress?.kind === "dump" ? `DUMP\n${Math.round(progress.power * 100)}%`
      : slap ? "SLAP" : "";
    if ($("hockey-hold-status").textContent !== holdText) $("hockey-hold-status").textContent = holdText;
    const penalties = (game.penalties || []).map((penalty) => `${game.teams[penalty.side].short} ${penalty.kind} · ${penalty.queued ? "queued" : Math.ceil(penalty.remaining) + "s"}`);
    $("hockey-penalty-status").textContent = penalties.join("  /  ");
    const challenge = game.fightChallenge;
    $("hockey-fight-status").textContent = actor?.offIce && actor.penalty
      ? `${actor.penalty.kind} · Back in ${Math.ceil(actor.penalty.remaining)}s of play`
      : challenge?.target === actor?.id ? "FIGHT CHALLENGE · Hold Y for 3s to accept"
      : challenge?.from === actor?.id ? "Challenge sent · Waiting for opponent"
      : "";
    $("hockey-network-status").textContent = game.network
      ? !networkState.connected ? "Reconnecting…"
        : networkState.room?.status === "paused" ? networkState.room.players.find((seat) => seat.id === networkState.seatId)?.ready ? "PAUSED · Waiting for everyone to resume" : "PAUSED · Open pause and choose Resume"
        : `${game.teams[game.localSide].short} · ${locked ? "Locked skater" : "Switch skaters"}${networkState.rtt == null ? "" : ` · ${networkState.rtt}ms`}`
      : locked ? "LOCKED SKATER · A calls for a pass" : "";
    const switchLabel = locked ? "CALL" : "SWITCH";
    if ($("switch").dataset.label !== switchLabel) {
      $("switch").dataset.label = switchLabel;
      $("switch").innerHTML = `${switchLabel} <kbd>${keyLabel(settings.keys.switch)}</kbd>`;
      $("switch").setAttribute("aria-label", locked ? "Call for a pass" : "Switch player");
    }
  }
  $("charge").style.height = input.power() * 100 + "%";
  $("sprint").querySelector(".action-label").textContent =
    sport === "hockey" ? "BURST" : "SPRINT";
  const announce = ["goal", "break", "restart", "restart_ready", "fight"].includes(
    game.phase,
  );
  $("announcement").classList.toggle("set-piece", !!restart || (sport === "hockey" && game.phase === "restart"));
  $("announcement").classList.toggle("hidden", !announce);
  $("announcement").textContent =
    game.phase === "goal"
      ? (game.nextSide === 1 ? game.teams[0].short : game.teams[1].short) +
        " GOAL!"
      : restart
        ? `${restart.type} · ${game.teams[restart.side].short}\n${restart.side === 1 ? "Move to mark · A switches player" : restart.pending ? "Restart queued · Keep aiming" : game.phase === "restart" ? "Getting set · Tap A to queue" : "Aim with the stick · Tap A to " + (restart.type === "THROW-IN" ? "throw" : "pass")}`
        : game.message;
  const ev = game.events.filter((e) => (game.network ? e.networkId : e.time) > lastEvent);
  for (const e of ev) {
    sound.event(e.type, sport, e);
    if (e.type === "goal") {
      goalFrames = frames.slice();
      replayTime = 0;
      input.cancelShot();
      input.cancelThrough();
    }
    if (["fight-declined", "fight-challenge", "penalty"].includes(e.type) && sport === "hockey") {
      if (e.type === "fight-declined" && e.player === game.controlled) toast(e.reason || "Fight declined.");
      if (e.type === "penalty") toast(`${game.teams[e.side].short} · ${e.kind}`);
    }
    if (e.type === "finished") result();
  }
  if (game.events.length) lastEvent = game.network ? game.events.at(-1).networkId : game.events.at(-1).time;
  if (game.phase === "finished" && !finishedShown) result();
}
function aimingGuides() {
  if (!settings.guidance || !game || paused || $("dialog").open || game.phase !== "play") return [];
  const vector = field.toWorld(input.vector());
  const guides = [];
  const add = (name, label, power = 0.65) => {
    const plan = game.aimPreview(name, vector, power);
    if (plan) guides.push({ ...plan, label });
  };
  if (input.chargeStart !== null) {
    add(sport === "soccer" ? "shoot" : "hockey-shot", "B", input.power());
  } else {
    const hold = input.hockeyProgress();
    if (sport === "hockey" && hold.kind === "dump") add("hockey-dump", "Y", hold.power);
    else {
      add(sport === "soccer" ? "ground" : "hockey-pass", "A");
      if (sport === "soccer" && game.canCross()) add("lob", "X");
    }
  }
  return guides;
}
function frame(now) {
  const dt = Math.min(0.12, (now - lastNow) / 1000 || 0);
  lastNow = now;
  sound.update(game, { paused: paused || (game?.network && networkState.room?.status !== "playing"), menu: $("dialog").open || !game, dt });
  if (game) {
    if (game.network) {
      input.syncShotContext();
      const active = input.active() && !document.hidden;
      hockeyNetwork.setInput(active ? field.toWorld(input.vector()) : {});
      hockeyNetwork.step(dt);
      if (networkState.room?.status === "playing") {
        if (game.phase === "play") { frames.push(game.snapshot()); if (frames.length > 130) frames.shift(); }
        if (game.phase === "goal") replayTime += dt;
      }
    } else clock.advance(dt);
    hud();
    let replay = null;
    if (game.phase === "goal" && goalFrames.length > 20 && !settings.reduced) {
      const i = Math.min(goalFrames.length - 1, Math.floor(replayTime * 45));
      replay = goalFrames[i];
    }
    $("replay-tag").classList.toggle("hidden", !replay);
    field.draw(game, {
      guide: settings.guidance,
      aim: replay ? [] : aimingGuides(),
      replay,
      reduced: settings.reduced,
      camera: settings.camera[sport],
      dt,
    });
    renderMinimap(replay || game, replay);
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
      dt,
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
if (sport === "hockey" && (new URLSearchParams(location.search).has("room") || HockeyNetwork.savedRoom())) mode = "online";
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
