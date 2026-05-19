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


def interactive_lab_css() -> str:
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
.df-lab-options {
    display: grid;
    gap: 0.65rem;
}
.df-lab-option,
.df-lab-ghost,
.df-lab-primary {
    appearance: none;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    font: inherit;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
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
.df-lab-primary:hover {
    transform: translateY(-1px);
    border-color: rgba(255,255,255,0.22);
}
.df-lab-option[disabled] {
    cursor: default;
    opacity: 0.95;
}
.df-lab-option.is-correct {
    background: rgba(41,179,106,0.18);
    border-color: rgba(41,179,106,0.65);
}
.df-lab-option.is-wrong {
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
.df-lab-primary {
    padding: 0.7rem 0.95rem;
}
.df-lab-ghost {
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
.df-lab-citybar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}
.df-lab-city {
    padding: 0.35rem 0.6rem;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.045);
    font-size: 0.8rem;
}
.df-lab-city.is-lost {
    opacity: 0.45;
    text-decoration: line-through;
}
@media (max-width: 720px) {
    .df-lab-shell { padding: 0.8rem; }
    .df-lab-question { font-size: 0.98rem; }
}
"""


def interactive_lab_js() -> str:
    return r"""
(function () {
    const STORAGE_PREFIX = "dailyflyer:interactive-lab:";

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

        const state = readState(cardId, {
            position: 0,
            asked: 0,
            correct: 0,
            streak: 0,
            bestStreak: 0
        });

        let locked = false;

        function currentQuestion() {
            return questions[state.position % questions.length];
        }

        function renderQuestion() {
            const question = currentQuestion();
            locked = false;

            mount.innerHTML = `
                <div class="df-lab-shell">
                    <div class="df-lab-statrow">
                        <div class="df-lab-pill">Asked: ${state.asked}</div>
                        <div class="df-lab-pill">Correct: ${state.correct}</div>
                        <div class="df-lab-pill">Streak: ${state.streak}</div>
                        <div class="df-lab-pill">Best: ${state.bestStreak}</div>
                    </div>
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

            const optionsWrap = mount.querySelector(".df-lab-options");
            const resultEl = mount.querySelector(".df-lab-result");

            (question.options || []).forEach((optionText, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "df-lab-option";
                button.innerHTML = escapeHtml(optionText);
                button.addEventListener("click", function () {
                    if (locked) {
                        return;
                    }
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

                    mount.querySelector(".df-lab-statrow").innerHTML = `
                        <div class="df-lab-pill">Asked: ${state.asked}</div>
                        <div class="df-lab-pill">Correct: ${state.correct}</div>
                        <div class="df-lab-pill">Streak: ${state.streak}</div>
                        <div class="df-lab-pill">Best: ${state.bestStreak}</div>
                    `;
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

    function mountSkyDefender(widgetEl) {
        const mount = widgetEl.querySelector(".df-lab-mount");
        const config = parseConfig(widgetEl);
        const cardId = widgetEl.dataset.labCardId || "sky-defender";

        if (!mount) {
            return;
        }

        const stored = readState(cardId, { bestScore: 0 });

        mount.innerHTML = `
            <div class="df-lab-shell">
                <div class="df-lab-statrow">
                    <div class="df-lab-pill" data-stat="score">Score: 0</div>
                    <div class="df-lab-pill" data-stat="time">Time: 45s</div>
                    <div class="df-lab-pill" data-stat="best">Best: ${stored.bestScore}</div>
                </div>
                <div class="df-lab-canvas-wrap">
                    <canvas class="df-lab-canvas" width="340" height="220"></canvas>
                    <div class="df-lab-citybar" data-citybar></div>
                    <div class="df-lab-help">Click or tap inside the radar screen to trigger a defensive blast. Keep at least one city standing until the timer expires.</div>
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
        const cityBar = mount.querySelector("[data-citybar]");
        const startButton = mount.querySelector('[data-action="start"]');
        const resetButton = mount.querySelector('[data-action="reset"]');

        const game = {
            running: false,
            lastFrame: 0,
            spawnClock: 0,
            score: 0,
            timeLeft: Number(config.roundSeconds || 45),
            bestScore: stored.bestScore || 0,
            missiles: [],
            explosions: [],
            cities: [],
            animationId: 0,
        };

        function freshCities() {
            return [
                { name: "West", x: 55, alive: true },
                { name: "Mid", x: 170, alive: true },
                { name: "East", x: 285, alive: true }
            ];
        }

        function renderCityBar() {
            cityBar.innerHTML = game.cities.map((city) => `
                <div class="df-lab-city ${city.alive ? "" : "is-lost"}">${city.name}</div>
            `).join("");
        }

        function updateHud() {
            scoreEl.textContent = `Score: ${game.score}`;
            timeEl.textContent = `Time: ${Math.max(0, Math.ceil(game.timeLeft))}s`;
            bestEl.textContent = `Best: ${game.bestScore}`;
            renderCityBar();
        }

        function startGame() {
            game.running = true;
            game.lastFrame = 0;
            game.spawnClock = 0;
            game.score = 0;
            game.timeLeft = Number(config.roundSeconds || 45);
            game.missiles = [];
            game.explosions = [];
            game.cities = freshCities();
            startButton.textContent = "Restart round";
            updateHud();
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

        function addExplosion(x, y) {
            game.explosions.push({ x, y, r: 6, max: 34, alive: true });
        }

        function spawnMissile() {
            const livingCities = game.cities.filter((city) => city.alive);
            if (!livingCities.length) {
                return;
            }
            const target = livingCities[Math.floor(Math.random() * livingCities.length)];
            const startX = 18 + Math.random() * (canvas.width - 36);
            const speed = 28 + Math.random() * 28;
            const angle = Math.atan2(canvas.height - 26, target.x - startX);
            game.missiles.push({
                x: startX,
                y: -8,
                vx: Math.cos(angle) * (speed * 0.2),
                vy: Math.max(18, Math.sin(angle) * speed),
                targetX: target.x
            });
        }

        function loseCity(nearX) {
            let closest = null;
            let bestDistance = Infinity;
            game.cities.forEach((city) => {
                if (!city.alive) {
                    return;
                }
                const distance = Math.abs(city.x - nearX);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    closest = city;
                }
            });
            if (closest) {
                closest.alive = false;
            }
        }

        function update(dt) {
            if (!game.running) {
                return;
            }

            game.timeLeft -= dt;
            if (game.timeLeft <= 0) {
                game.timeLeft = 0;
                finishGame();
                return;
            }

            game.spawnClock += dt;
            const spawnEvery = Number(config.spawnEverySeconds || 0.8);
            while (game.spawnClock >= spawnEvery) {
                game.spawnClock -= spawnEvery;
                spawnMissile();
            }

            game.missiles.forEach((missile) => {
                missile.x += missile.vx * dt;
                missile.y += missile.vy * dt;
            });

            game.explosions.forEach((explosion) => {
                explosion.r += 52 * dt;
                if (explosion.r >= explosion.max) {
                    explosion.alive = false;
                }
            });

            game.missiles = game.missiles.filter((missile) => {
                let destroyed = false;

                game.explosions.forEach((explosion) => {
                    if (!explosion.alive || destroyed) {
                        return;
                    }
                    const dx = missile.x - explosion.x;
                    const dy = missile.y - explosion.y;
                    if ((dx * dx) + (dy * dy) <= explosion.r * explosion.r) {
                        destroyed = true;
                        game.score += 1;
                    }
                });

                if (destroyed) {
                    return false;
                }

                if (missile.y >= canvas.height - 24) {
                    loseCity(missile.x);
                    if (!game.cities.some((city) => city.alive)) {
                        finishGame();
                    }
                    return false;
                }

                return true;
            });

            game.explosions = game.explosions.filter((explosion) => explosion.alive);
            updateHud();
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "rgba(6, 18, 28, 0.88)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = "rgba(143, 230, 203, 0.12)";
            ctx.lineWidth = 1;
            for (let y = 22; y < canvas.height; y += 22) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }

            ctx.fillStyle = "rgba(92, 201, 161, 0.88)";
            game.cities.forEach((city) => {
                ctx.globalAlpha = city.alive ? 1 : 0.28;
                ctx.fillRect(city.x - 16, canvas.height - 18, 32, 10);
            });
            ctx.globalAlpha = 1;

            ctx.fillStyle = "rgba(255, 214, 102, 0.96)";
            game.missiles.forEach((missile) => {
                ctx.beginPath();
                ctx.arc(missile.x, missile.y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "rgba(255, 214, 102, 0.25)";
                ctx.beginPath();
                ctx.moveTo(missile.x, missile.y);
                ctx.lineTo(missile.x - missile.vx * 0.22, missile.y - missile.vy * 0.22);
                ctx.stroke();
            });

            game.explosions.forEach((explosion) => {
                ctx.strokeStyle = "rgba(143, 230, 203, 0.90)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(explosion.x, explosion.y, explosion.r, 0, Math.PI * 2);
                ctx.stroke();
            });

            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.font = "12px system-ui, sans-serif";
            ctx.fillText("SKY DEFENDER // experimental microgame", 12, 18);
        }

        function loop(timestamp) {
            if (!game.running) {
                draw();
                return;
            }

            if (!game.lastFrame) {
                game.lastFrame = timestamp;
            }
            const dt = Math.min(0.033, (timestamp - game.lastFrame) / 1000);
            game.lastFrame = timestamp;

            update(dt);
            draw();

            if (game.running) {
                game.animationId = requestAnimationFrame(loop);
            }
        }

        canvas.addEventListener("pointerdown", function (event) {
            if (!game.running) {
                return;
            }
            const bounds = canvas.getBoundingClientRect();
            const scaleX = canvas.width / bounds.width;
            const scaleY = canvas.height / bounds.height;
            const x = (event.clientX - bounds.left) * scaleX;
            const y = (event.clientY - bounds.top) * scaleY;
            addExplosion(x, y);
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

        game.cities = freshCities();
        updateHud();
        draw();
    }

    function boot() {
        document.querySelectorAll(".df-lab-widget").forEach(function (widgetEl) {
            const widgetType = widgetEl.dataset.labWidget;
            if (widgetType === "trivia") {
                mountQuizCard(widgetEl, "trivia");
            } else if (widgetType === "language_quiz") {
                mountQuizCard(widgetEl, "language");
            } else if (widgetType === "sky_defender") {
                mountSkyDefender(widgetEl);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
"""
