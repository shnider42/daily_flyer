from __future__ import annotations

import json
from html import escape


def _json_attr(value: object) -> str:
    return escape(json.dumps(value, ensure_ascii=False, separators=(",", ":")), quote=True)


def render_interactive_host(
    *,
    widget_type: str,
    card_id: str,
    config: dict,
    intro: str = "",
    footnote: str = "",
) -> str:
    intro_html = f'<p class="df-lab-intro">{escape(intro)}</p>' if intro else ""
    footnote_html = f'<p class="df-lab-footnote">{escape(footnote)}</p>' if footnote else ""
    return f"""
<div class="df-lab-widget" data-lab-widget="{escape(widget_type)}" data-lab-card-id="{escape(card_id)}" data-lab-config="{_json_attr(config)}">
  {intro_html}
  <div class="df-lab-mount"></div>
  <noscript>This card has an interactive mode when JavaScript is enabled.</noscript>
  {footnote_html}
</div>
""".strip()


def interactive_showcase_css() -> str:
    return r"""
.df-lab-widget { display: grid; gap: 0.85rem; }
.df-lab-intro, .df-lab-footnote { margin: 0; color: var(--ink-soft); }
.df-lab-footnote { font-size: 0.86rem; opacity: 0.82; }
.df-lab-shell {
    display: grid;
    gap: 0.85rem;
    padding: 0.95rem;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.09);
    background: rgba(255,255,255,0.035);
}
.df-lab-statrow {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}
.df-lab-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.46rem 0.72rem;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    color: var(--ink);
    font-size: 0.84rem;
}
.df-lab-meta {
    color: var(--muted);
    font-size: 0.9rem;
}
.df-lab-question {
    font-size: 1.04rem;
    line-height: 1.55;
    color: var(--ink);
}
.df-lab-options,
.df-lab-grid,
.df-lab-wordbank {
    display: grid;
    gap: 0.65rem;
}
.df-lab-grid--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}
.df-lab-option,
.df-lab-ghost,
.df-lab-primary,
.df-lab-chip,
.df-lab-stack-btn,
.df-lab-tile,
.df-lab-clue-btn {
    appearance: none;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    font: inherit;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, opacity 160ms ease;
}
.df-lab-option {
    width: 100%;
    padding: 0.82rem 0.9rem;
    text-align: left;
    color: var(--ink);
    background: rgba(255,255,255,0.055);
}
.df-lab-option:hover,
.df-lab-ghost:hover,
.df-lab-primary:hover,
.df-lab-chip:hover,
.df-lab-stack-btn:hover,
.df-lab-tile:hover,
.df-lab-clue-btn:hover {
    transform: translateY(-1px);
    border-color: rgba(255,255,255,0.22);
}
.df-lab-option[disabled],
.df-lab-chip[disabled],
.df-lab-tile[disabled] {
    cursor: default;
    opacity: 0.95;
}
.df-lab-option.is-correct,
.df-lab-chip.is-correct,
.df-lab-stack-btn.is-correct {
    background: rgba(41,179,106,0.18);
    border-color: rgba(41,179,106,0.65);
}
.df-lab-option.is-wrong,
.df-lab-chip.is-wrong,
.df-lab-stack-btn.is-wrong {
    background: rgba(215,90,90,0.18);
    border-color: rgba(215,90,90,0.52);
}
.df-lab-result {
    min-height: 1.5rem;
    color: var(--ink-soft);
    line-height: 1.5;
}
.df-lab-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
}
.df-lab-ghost,
.df-lab-primary,
.df-lab-clue-btn {
    padding: 0.7rem 0.95rem;
}
.df-lab-ghost,
.df-lab-clue-btn {
    color: var(--ink);
    background: rgba(255,255,255,0.045);
}
.df-lab-primary {
    color: #062016;
    background: linear-gradient(180deg, rgba(143,230,203,0.96), rgba(118,211,183,0.96));
    border-color: rgba(143,230,203,0.7);
    font-weight: 700;
}
.df-lab-canvas-wrap {
    display: grid;
    gap: 0.75rem;
}
.df-lab-canvas {
    width: 100%;
    height: auto;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.10);
    background:
        radial-gradient(circle at top, rgba(90,140,255,0.18), transparent 32%),
        linear-gradient(180deg, rgba(4,14,30,0.98), rgba(5,18,24,0.98));
}
.df-lab-help {
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.45;
}
.df-lab-clue-list,
.df-lab-answer-line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}
.df-lab-clue-list {
    flex-direction: column;
    gap: 0.45rem;
}
.df-lab-clue-chip {
    padding: 0.42rem 0.65rem;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.045);
    font-size: 0.88rem;
    line-height: 1.45;
}
.df-lab-clue-chip.is-hidden {
    opacity: 0.55;
}
.df-lab-stack-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.55rem;
    align-items: center;
    padding: 0.75rem 0.8rem;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.045);
}
.df-lab-stack-controls {
    display: flex;
    gap: 0.4rem;
}
.df-lab-stack-btn {
    padding: 0.45rem 0.6rem;
    background: rgba(255,255,255,0.04);
    color: var(--ink);
}
.df-lab-tile {
    min-height: 78px;
    display: grid;
    place-items: center;
    padding: 0.8rem;
    text-align: center;
    color: var(--ink);
    background: rgba(255,255,255,0.05);
}
.df-lab-tile.is-hidden {
    background: rgba(255,255,255,0.03);
    color: transparent;
}
.df-lab-tile.is-open {
    background: rgba(125,183,217,0.18);
    border-color: rgba(125,183,217,0.5);
}
.df-lab-tile.is-matched {
    background: rgba(41,179,106,0.18);
    border-color: rgba(41,179,106,0.55);
}
.df-lab-chip {
    padding: 0.62rem 0.78rem;
    color: var(--ink);
    background: rgba(255,255,255,0.055);
}
.df-lab-chip.is-used {
    opacity: 0.45;
    cursor: default;
}
.df-lab-answer-slot {
    min-height: 46px;
    min-width: 90px;
    padding: 0.55rem 0.7rem;
    border-radius: 12px;
    border: 1px dashed rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.03);
    color: var(--ink-soft);
}
@media (max-width: 720px) {
    .df-lab-shell { padding: 0.8rem; }
    .df-lab-question { font-size: 0.98rem; }
    .df-lab-grid--two { grid-template-columns: 1fr; }
}
"""


def interactive_showcase_js() -> str:
    return r"""
(function () {
    const STORAGE_PREFIX = "dailyflyer:interactive-showcase:";

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function parseConfig(el) {
        try {
            return JSON.parse(el.dataset.labConfig || "{}");
        } catch (error) {
            console.error("Invalid interactive card config", error, el);
            return {};
        }
    }

    function readState(cardId, fallback) {
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + cardId);
            return Object.assign({}, fallback, raw ? JSON.parse(raw) : {});
        } catch (error) {
            return Object.assign({}, fallback);
        }
    }

    function writeState(cardId, state) {
        try {
            localStorage.setItem(STORAGE_PREFIX + cardId, JSON.stringify(state));
        } catch (error) {
            console.warn("Could not persist interactive card state", error);
        }
    }

    function shuffleCopy(items) {
        const next = items.slice();
        for (let index = next.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            const temp = next[index];
            next[index] = next[swapIndex];
            next[swapIndex] = temp;
        }
        return next;
    }

    function mountQuizCard(widgetEl, flavorLabel) {
        const mount = widgetEl.querySelector(".df-lab-mount");
        const config = parseConfig(widgetEl);
        const questions = Array.isArray(config.questions) ? config.questions : [];
        const cardId = widgetEl.dataset.labCardId || flavorLabel;
        if (!mount || !questions.length) {
            if (mount) {
                mount.innerHTML = "<div class=\"df-lab-result\">No questions were configured for this card yet.</div>";
            }
            return;
        }

        const state = readState(cardId, { position: 0, asked: 0, correct: 0, streak: 0, bestStreak: 0 });
        let locked = false;

        function currentQuestion() {
            return questions[state.position % questions.length];
        }

        function updateStatrow(statrowEl) {
            statrowEl.innerHTML = `
                <div class="df-lab-pill">Asked: ${state.asked}</div>
                <div class="df-lab-pill">Correct: ${state.correct}</div>
                <div class="df-lab-pill">Streak: ${state.streak}</div>
                <div class="df-lab-pill">Best: ${state.bestStreak}</div>
            `;
        }

        function renderQuestion() {
            const question = currentQuestion();
            locked = false;
            mount.innerHTML = `
                <div class="df-lab-shell">
                    <div class="df-lab-statrow"></div>
                    ${question.meta ? `<div class="df-lab-meta">${escapeHtml(question.meta)}</div>` : ""}
                    <div class="df-lab-question">${escapeHtml(question.prompt || "Question")}</div>
                    <div class="df-lab-options"></div>
                    <div class="df-lab-result" aria-live="polite"></div>
                    <div class="df-lab-actions">
                        <button class="df-lab-ghost" type="button" data-action="next">Next prompt</button>
                        <button class="df-lab-ghost" type="button" data-action="reset">Reset stats</button>
                    </div>
                </div>
            `;

            const statrowEl = mount.querySelector(".df-lab-statrow");
            const optionsWrap = mount.querySelector(".df-lab-options");
            const resultEl = mount.querySelector(".df-lab-result");
            updateStatrow(statrowEl);

            (question.options || []).forEach((optionText, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "df-lab-option";
                button.innerHTML = escapeHtml(optionText);
                button.addEventListener("click", function () {
                    if (locked) return;
                    locked = true;
                    const isCorrect = index === question.answerIndex;
                    state.asked += 1;
                    if (isCorrect) {
                        state.correct += 1;
                        state.streak += 1;
                        state.bestStreak = Math.max(state.bestStreak, state.streak);
                    } else {
                        state.streak = 0;
                    }
                    writeState(cardId, state);

                    optionsWrap.querySelectorAll(".df-lab-option").forEach((optionButton, optionIndex) => {
                        optionButton.disabled = true;
                        if (optionIndex === question.answerIndex) {
                            optionButton.classList.add("is-correct");
                        } else if (optionIndex === index) {
                            optionButton.classList.add("is-wrong");
                        }
                    });

                    const lead = isCorrect ? "Correct." : "Not quite.";
                    const explanation = question.explanation ? ` ${escapeHtml(question.explanation)}` : "";
                    resultEl.innerHTML = `${lead}${explanation}`;
                    updateStatrow(statrowEl);
                });
                optionsWrap.appendChild(button);
            });

            mount.querySelector('[data-action="next"]').addEventListener("click", function () {
                state.position = (state.position + 1) % questions.length;
                writeState(cardId, state);
                renderQuestion();
            });

            mount.querySelector('[data-action="reset"]').addEventListener("click", function () {
                state.position = 0;
                state.asked = 0;
                state.correct = 0;
                state.streak = 0;
                state.bestStreak = 0;
                writeState(cardId, state);
                renderQuestion();
            });
        }

        renderQuestion();
    }

    function mountFlySwatter(widgetEl) {
        const mount = widgetEl.querySelector(".df-lab-mount");
        const config = parseConfig(widgetEl);
        const cardId = widgetEl.dataset.labCardId || "fly-swatter";
        if (!mount) return;

        const stored = readState(cardId, { bestScore: 0 });
        mount.innerHTML = `
            <div class="df-lab-shell">
                <div class="df-lab-statrow">
                    <div class="df-lab-pill" data-stat="score">Swats: 0</div>
                    <div class="df-lab-pill" data-stat="time">Time: 30s</div>
                    <div class="df-lab-pill" data-stat="best">Best: ${stored.bestScore}</div>
                </div>
                <div class="df-lab-canvas-wrap">
                    <canvas class="df-lab-canvas" width="340" height="220"></canvas>
                    <div class="df-lab-help">Click or tap the buzzing flies before they escape the card. Simple, silly, and perfect for an experimental branch.</div>
                    <div class="df-lab-actions">
                        <button class="df-lab-primary" type="button" data-action="start">Start round</button>
                        <button class="df-lab-ghost" type="button" data-action="reset">Reset best</button>
                    </div>
                </div>
            </div>
        `;

        const canvas = mount.querySelector("canvas");
        const ctx = canvas.getContext("2d");
        const scoreEl = mount.querySelector('[data-stat="score"]');
        const timeEl = mount.querySelector('[data-stat="time"]');
        const bestEl = mount.querySelector('[data-stat="best"]');
        const startButton = mount.querySelector('[data-action="start"]');
        const resetButton = mount.querySelector('[data-action="reset"]');

        const game = { running: false, lastFrame: 0, spawnClock: 0, score: 0, timeLeft: Number(config.roundSeconds || 30), bestScore: stored.bestScore || 0, flies: [], animationId: 0 };

        function updateHud() {
            scoreEl.textContent = `Swats: ${game.score}`;
            timeEl.textContent = `Time: ${Math.max(0, Math.ceil(game.timeLeft))}s`;
            bestEl.textContent = `Best: ${game.bestScore}`;
        }

        function spawnFly() {
            const radius = 12 + Math.random() * 8;
            const speed = 45 + Math.random() * 55;
            const angle = Math.random() * Math.PI * 2;
            game.flies.push({ x: 28 + Math.random() * (canvas.width - 56), y: 28 + Math.random() * (canvas.height - 56), radius, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, wing: Math.random() * Math.PI * 2 });
        }

        function startGame() {
            game.running = true;
            game.lastFrame = 0;
            game.spawnClock = 0;
            game.score = 0;
            game.timeLeft = Number(config.roundSeconds || 30);
            game.flies = [];
            updateHud();
            startButton.textContent = "Restart round";
            cancelAnimationFrame(game.animationId);
            game.animationId = requestAnimationFrame(loop);
        }

        function finishGame() {
            game.running = false;
            if (game.score > game.bestScore) {
                game.bestScore = game.score;
                writeState(cardId, { bestScore: game.bestScore });
            }
            updateHud();
            startButton.textContent = "Play again";
        }

        function update(dt) {
            if (!game.running) return;
            game.timeLeft -= dt;
            if (game.timeLeft <= 0) {
                game.timeLeft = 0;
                finishGame();
                return;
            }
            game.spawnClock += dt;
            const spawnEvery = Number(config.spawnEverySeconds || 0.65);
            while (game.spawnClock >= spawnEvery) {
                game.spawnClock -= spawnEvery;
                spawnFly();
            }
            game.flies.forEach((fly) => {
                fly.x += fly.vx * dt;
                fly.y += fly.vy * dt;
                fly.wing += dt * 16;
                if (fly.x <= fly.radius || fly.x >= canvas.width - fly.radius) fly.vx *= -1;
                if (fly.y <= fly.radius || fly.y >= canvas.height - fly.radius) fly.vy *= -1;
            });
            updateHud();
        }

        function drawFly(fly) {
            ctx.save();
            ctx.translate(fly.x, fly.y);
            ctx.fillStyle = "rgba(28, 28, 28, 0.92)";
            ctx.beginPath();
            ctx.ellipse(0, 0, fly.radius * 0.65, fly.radius * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(200, 235, 255, 0.62)";
            const wingOffset = Math.sin(fly.wing) * 3;
            ctx.beginPath();
            ctx.ellipse(-fly.radius * 0.35, -fly.radius * 0.35, fly.radius * 0.45, fly.radius * 0.26 + wingOffset * 0.04, -0.8, 0, Math.PI * 2);
            ctx.ellipse(fly.radius * 0.35, -fly.radius * 0.35, fly.radius * 0.45, fly.radius * 0.26 - wingOffset * 0.04, 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(255, 87, 87, 0.8)";
            ctx.beginPath();
            ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "rgba(8, 20, 18, 0.96)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "rgba(32, 74, 52, 0.25)";
            for (let i = 0; i < 6; i += 1) ctx.fillRect(i * 62, 0, 3, canvas.height);
            game.flies.forEach(drawFly);
            ctx.fillStyle = "rgba(255,255,255,0.72)";
            ctx.font = "12px system-ui, sans-serif";
            ctx.fillText("FLY SWATTER // experimental microgame", 12, 18);
        }

        function loop(timestamp) {
            if (!game.running) {
                draw();
                return;
            }
            if (!game.lastFrame) game.lastFrame = timestamp;
            const dt = Math.min(0.033, (timestamp - game.lastFrame) / 1000);
            game.lastFrame = timestamp;
            update(dt);
            draw();
            if (game.running) game.animationId = requestAnimationFrame(loop);
        }

        canvas.addEventListener("pointerdown", function (event) {
            if (!game.running) return;
            const bounds = canvas.getBoundingClientRect();
            const scaleX = canvas.width / bounds.width;
            const scaleY = canvas.height / bounds.height;
            const x = (event.clientX - bounds.left) * scaleX;
            const y = (event.clientY - bounds.top) * scaleY;
            game.flies = game.flies.filter((fly) => {
                const dx = fly.x - x;
                const dy = fly.y - y;
                const hit = (dx * dx) + (dy * dy) <= (fly.radius + 10) * (fly.radius + 10);
                if (hit) game.score += 1;
                return !hit;
            });
            updateHud();
        });

        document.addEventListener("visibilitychange", function () {
            if (document.hidden && game.running) {
                game.running = false;
                startButton.textContent = "Resume round";
            }
        });

        startButton.addEventListener("click", function () {
            if (startButton.textContent === "Resume round" && !game.running) {
                game.running = true;
                game.lastFrame = 0;
                startButton.textContent = "Restart round";
                game.animationId = requestAnimationFrame(loop);
                return;
            }
            startGame();
        });

        resetButton.addEventListener("click", function () {
            game.bestScore = 0;
            writeState(cardId, { bestScore: 0 });
            updateHud();
        });

        updateHud();
        draw();
    }

    function mountHistorySort(widgetEl) {
        const mount = widgetEl.querySelector(".df-lab-mount");
        const config = parseConfig(widgetEl);
        const rounds = Array.isArray(config.rounds) ? config.rounds : [];
        const cardId = widgetEl.dataset.labCardId || "history-sort";
        if (!mount || !rounds.length) return;

        const state = readState(cardId, { position: 0, solved: 0, attempts: 0 });

        function currentRound() { return rounds[state.position % rounds.length]; }

        function renderRound() {
            const round = currentRound();
            const items = shuffleCopy(round.items || []);
            mount.innerHTML = `
                <div class="df-lab-shell">
                    <div class="df-lab-statrow">
                        <div class="df-lab-pill">Solved: ${state.solved}</div>
                        <div class="df-lab-pill">Attempts: ${state.attempts}</div>
                    </div>
                    <div class="df-lab-question">${escapeHtml(round.prompt || "Put these in order.")}</div>
                    <div class="df-lab-grid" data-stack></div>
                    <div class="df-lab-result" aria-live="polite"></div>
                    <div class="df-lab-actions">
                        <button class="df-lab-primary" type="button" data-action="check">Check order</button>
                        <button class="df-lab-ghost" type="button" data-action="shuffle">Shuffle again</button>
                        <button class="df-lab-ghost" type="button" data-action="next">Next round</button>
                    </div>
                </div>
            `;
            const stackEl = mount.querySelector("[data-stack]");
            const resultEl = mount.querySelector(".df-lab-result");

            function drawStack() {
                stackEl.innerHTML = "";
                items.forEach((item, index) => {
                    const row = document.createElement("div");
                    row.className = "df-lab-stack-item";
                    row.innerHTML = `
                        <div>${escapeHtml(item.label)}</div>
                        <div class="df-lab-stack-controls">
                            <button class="df-lab-stack-btn" type="button" data-dir="-1">↑</button>
                            <button class="df-lab-stack-btn" type="button" data-dir="1">↓</button>
                        </div>
                    `;
                    row.querySelectorAll("[data-dir]").forEach((btn) => {
                        btn.addEventListener("click", function () {
                            const direction = Number(btn.dataset.dir);
                            const swapIndex = index + direction;
                            if (swapIndex < 0 || swapIndex >= items.length) return;
                            const current = items[index];
                            items[index] = items[swapIndex];
                            items[swapIndex] = current;
                            drawStack();
                        });
                    });
                    stackEl.appendChild(row);
                });
            }

            drawStack();
            mount.querySelector('[data-action="check"]').addEventListener("click", function () {
                state.attempts += 1;
                const years = items.map((item) => item.year);
                const ordered = years.every((year, index) => index === 0 || years[index - 1] <= year);
                if (ordered) {
                    state.solved += 1;
                    resultEl.textContent = "Nice. That order works chronologically.";
                } else {
                    resultEl.textContent = "Not yet. Try nudging the entries until the years flow from earliest to latest.";
                }
                writeState(cardId, state);
                mount.querySelector(".df-lab-statrow").innerHTML = `
                    <div class="df-lab-pill">Solved: ${state.solved}</div>
                    <div class="df-lab-pill">Attempts: ${state.attempts}</div>
                `;
            });
            mount.querySelector('[data-action="shuffle"]').addEventListener("click", renderRound);
            mount.querySelector('[data-action="next"]').addEventListener("click", function () {
                state.position = (state.position + 1) % rounds.length;
                writeState(cardId, state);
                renderRound();
            });
        }

        renderRound();
    }

    function mountCountyClues(widgetEl) {
        const mount = widgetEl.querySelector(".df-lab-mount");
        const config = parseConfig(widgetEl);
        const questions = Array.isArray(config.questions) ? config.questions : [];
        const cardId = widgetEl.dataset.labCardId || "county-clues";
        if (!mount || !questions.length) return;

        const state = readState(cardId, { position: 0, solved: 0, attempts: 0, clueStep: 1 });

        function currentQuestion() { return questions[state.position % questions.length]; }

        function renderQuestion() {
            const question = currentQuestion();
            const clueCount = Math.max(1, Math.min(state.clueStep || 1, (question.clues || []).length));
            mount.innerHTML = `
                <div class="df-lab-shell">
                    <div class="df-lab-statrow">
                        <div class="df-lab-pill">Solved: ${state.solved}</div>
                        <div class="df-lab-pill">Attempts: ${state.attempts}</div>
                        <div class="df-lab-pill">Clues shown: ${clueCount}</div>
                    </div>
                    <div class="df-lab-question">${escapeHtml(question.prompt || "Which county fits these clues?")}</div>
                    <div class="df-lab-clue-list">
                        ${(question.clues || []).map((clue, index) => `<div class="df-lab-clue-chip ${index < clueCount ? "" : "is-hidden"}">${index < clueCount ? escapeHtml(clue) : "Hidden clue"}</div>`).join("")}
                    </div>
                    <div class="df-lab-options"></div>
                    <div class="df-lab-result" aria-live="polite"></div>
                    <div class="df-lab-actions">
                        <button class="df-lab-clue-btn" type="button" data-action="reveal">Reveal one more clue</button>
                        <button class="df-lab-ghost" type="button" data-action="next">Next county</button>
                    </div>
                </div>
            `;
            const optionsWrap = mount.querySelector(".df-lab-options");
            const resultEl = mount.querySelector(".df-lab-result");
            (question.options || []).forEach((optionText, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "df-lab-option";
                button.innerHTML = escapeHtml(optionText);
                button.addEventListener("click", function () {
                    state.attempts += 1;
                    const isCorrect = index === question.answerIndex;
                    if (isCorrect) {
                        state.solved += 1;
                        resultEl.textContent = `Correct. ${question.explanation || ""}`.trim();
                        button.classList.add("is-correct");
                    } else {
                        resultEl.textContent = `Nope. ${question.explanation || ""}`.trim();
                        button.classList.add("is-wrong");
                        const correctButton = optionsWrap.querySelectorAll(".df-lab-option")[question.answerIndex];
                        if (correctButton) correctButton.classList.add("is-correct");
                    }
                    optionsWrap.querySelectorAll(".df-lab-option").forEach((optionButton) => { optionButton.disabled = true; });
                    writeState(cardId, state);
                    mount.querySelector(".df-lab-statrow").innerHTML = `
                        <div class="df-lab-pill">Solved: ${state.solved}</div>
                        <div class="df-lab-pill">Attempts: ${state.attempts}</div>
                        <div class="df-lab-pill">Clues shown: ${clueCount}</div>
                    `;
                });
                optionsWrap.appendChild(button);
            });
            mount.querySelector('[data-action="reveal"]').addEventListener("click", function () {
                state.clueStep = Math.min((question.clues || []).length, clueCount + 1);
                writeState(cardId, state);
                renderQuestion();
            });
            mount.querySelector('[data-action="next"]').addEventListener("click", function () {
                state.position = (state.position + 1) % questions.length;
                state.clueStep = 1;
                writeState(cardId, state);
                renderQuestion();
            });
        }

        renderQuestion();
    }

    function mountPhraseBuilder(widgetEl) {
        const mount = widgetEl.querySelector(".df-lab-mount");
        const config = parseConfig(widgetEl);
        const questions = Array.isArray(config.questions) ? config.questions : [];
        const cardId = widgetEl.dataset.labCardId || "phrase-builder";
        if (!mount || !questions.length) return;

        const state = readState(cardId, { position: 0, solved: 0, attempts: 0 });

        function currentQuestion() { return questions[state.position % questions.length]; }

        function renderQuestion() {
            const question = currentQuestion();
            const bank = shuffleCopy((question.answerParts || []).map((part, index) => ({ id: `${index}-${part}`, text: part, used: false })));
            let built = [];
            mount.innerHTML = `
                <div class="df-lab-shell">
                    <div class="df-lab-statrow">
                        <div class="df-lab-pill">Solved: ${state.solved}</div>
                        <div class="df-lab-pill">Attempts: ${state.attempts}</div>
                    </div>
                    <div class="df-lab-question">${escapeHtml(question.prompt || "Build the phrase.")}</div>
                    ${question.meta ? `<div class="df-lab-meta">${escapeHtml(question.meta)}</div>` : ""}
                    <div class="df-lab-answer-line" data-answer-line></div>
                    <div class="df-lab-wordbank" data-bank></div>
                    <div class="df-lab-result" aria-live="polite"></div>
                    <div class="df-lab-actions">
                        <button class="df-lab-primary" type="button" data-action="check">Check phrase</button>
                        <button class="df-lab-ghost" type="button" data-action="clear">Clear</button>
                        <button class="df-lab-ghost" type="button" data-action="next">Next phrase</button>
                    </div>
                </div>
            `;
            const answerLine = mount.querySelector("[data-answer-line]");
            const bankEl = mount.querySelector("[data-bank]");
            const resultEl = mount.querySelector(".df-lab-result");

            function draw() {
                answerLine.innerHTML = "";
                if (!built.length) {
                    const slot = document.createElement("div");
                    slot.className = "df-lab-answer-slot";
                    slot.textContent = "Build the phrase here";
                    answerLine.appendChild(slot);
                } else {
                    built.forEach((part) => {
                        const chip = document.createElement("button");
                        chip.type = "button";
                        chip.className = "df-lab-chip";
                        chip.textContent = part.text;
                        chip.addEventListener("click", function () {
                            built = built.filter((item) => item.id !== part.id);
                            const bankItem = bank.find((item) => item.id === part.id);
                            if (bankItem) bankItem.used = false;
                            draw();
                        });
                        answerLine.appendChild(chip);
                    });
                }
                bankEl.innerHTML = "";
                bank.forEach((part) => {
                    const chip = document.createElement("button");
                    chip.type = "button";
                    chip.className = "df-lab-chip";
                    if (part.used) {
                        chip.classList.add("is-used");
                        chip.disabled = true;
                    }
                    chip.textContent = part.text;
                    chip.addEventListener("click", function () {
                        if (part.used) return;
                        part.used = true;
                        built.push({ id: part.id, text: part.text });
                        draw();
                    });
                    bankEl.appendChild(chip);
                });
            }

            mount.querySelector('[data-action="check"]').addEventListener("click", function () {
                state.attempts += 1;
                const builtPhrase = built.map((part) => part.text).join(" ").trim();
                const target = (question.answerParts || []).join(" ").trim();
                const isCorrect = builtPhrase === target;
                if (isCorrect) {
                    state.solved += 1;
                    resultEl.textContent = `Correct. ${question.explanation || ""}`.trim();
                } else {
                    resultEl.textContent = `Not quite. ${question.explanation || ""}`.trim();
                }
                writeState(cardId, state);
                mount.querySelector(".df-lab-statrow").innerHTML = `
                    <div class="df-lab-pill">Solved: ${state.solved}</div>
                    <div class="df-lab-pill">Attempts: ${state.attempts}</div>
                `;
            });
            mount.querySelector('[data-action="clear"]').addEventListener("click", function () {
                built = [];
                bank.forEach((part) => { part.used = false; });
                draw();
            });
            mount.querySelector('[data-action="next"]').addEventListener("click", function () {
                state.position = (state.position + 1) % questions.length;
                writeState(cardId, state);
                renderQuestion();
            });
            draw();
        }

        renderQuestion();
    }

    function mountMemoryMatch(widgetEl) {
        const mount = widgetEl.querySelector(".df-lab-mount");
        const config = parseConfig(widgetEl);
        const pairs = Array.isArray(config.pairs) ? config.pairs : [];
        const cardId = widgetEl.dataset.labCardId || "memory-match";
        if (!mount || !pairs.length) return;

        const state = readState(cardId, { bestMoves: 0 });
        let deck = [];
        let openIndexes = [];
        let lockBoard = false;
        let moves = 0;
        let resultMessage = "";

        function setupDeck() {
            deck = shuffleCopy(pairs.flatMap((pair, pairIndex) => ([
                { key: pairIndex, text: pair.left, matched: false },
                { key: pairIndex, text: pair.right, matched: false }
            ])));
            openIndexes = [];
            lockBoard = false;
            moves = 0;
            resultMessage = "";
        }

        function drawBoard() {
            mount.innerHTML = `
                <div class="df-lab-shell">
                    <div class="df-lab-statrow">
                        <div class="df-lab-pill">Moves: ${moves}</div>
                        <div class="df-lab-pill">Best: ${state.bestMoves || "—"}</div>
                    </div>
                    <div class="df-lab-grid df-lab-grid--two"></div>
                    <div class="df-lab-result" aria-live="polite">${escapeHtml(resultMessage)}</div>
                    <div class="df-lab-actions">
                        <button class="df-lab-ghost" type="button" data-action="reset">New board</button>
                    </div>
                </div>
            `;
            const gridEl = mount.querySelector(".df-lab-grid");
            deck.forEach((card, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "df-lab-tile";
                const isOpen = openIndexes.includes(index) || card.matched;
                button.classList.add(isOpen ? (card.matched ? "is-matched" : "is-open") : "is-hidden");
                button.textContent = isOpen ? card.text : "•";
                button.addEventListener("click", function () {
                    if (lockBoard || card.matched || openIndexes.includes(index)) return;
                    openIndexes.push(index);
                    drawBoard();
                    if (openIndexes.length === 2) {
                        moves += 1;
                        const first = openIndexes[0];
                        const second = openIndexes[1];
                        const match = deck[first].key === deck[second].key;
                        if (match) {
                            deck[first].matched = true;
                            deck[second].matched = true;
                            openIndexes = [];
                            resultMessage = "Nice match.";
                            if (deck.every((item) => item.matched)) {
                                resultMessage = "Matched them all.";
                                if (!state.bestMoves || moves < state.bestMoves) {
                                    state.bestMoves = moves;
                                    writeState(cardId, state);
                                }
                            }
                            drawBoard();
                        } else {
                            resultMessage = "Not a match.";
                            lockBoard = true;
                            setTimeout(function () {
                                openIndexes = [];
                                lockBoard = false;
                                drawBoard();
                            }, 700);
                        }
                    }
                });
                gridEl.appendChild(button);
            });
            mount.querySelector('[data-action="reset"]').addEventListener("click", function () {
                setupDeck();
                drawBoard();
            });
        }

        setupDeck();
        drawBoard();
    }

    function boot() {
        document.querySelectorAll(".df-lab-widget").forEach(function (widgetEl) {
            const widgetType = widgetEl.dataset.labWidget;
            if (widgetType === "trivia") mountQuizCard(widgetEl, "trivia");
            else if (widgetType === "language_quiz") mountQuizCard(widgetEl, "language");
            else if (widgetType === "fly_swatter") mountFlySwatter(widgetEl);
            else if (widgetType === "history_sort") mountHistorySort(widgetEl);
            else if (widgetType === "county_clues") mountCountyClues(widgetEl);
            else if (widgetType === "phrase_builder") mountPhraseBuilder(widgetEl);
            else if (widgetType === "memory_match") mountMemoryMatch(widgetEl);
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
"""
