
from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "Arcade Classics — Playable card wall",
    "header_title": "🕹️ Arcade Classics",
    "header_subtitle": "Five playable mini-games embedded directly in the cards: Missile Command, Frogger, Asteroids, Galaga, and Pitfall.",
    "footer_text": "Built on Daily Flyer.",
    "hero_kicker": "Daily Flyer • Arcade Edition",
    "hero_summary_pill": "Playable mini-games embedded directly in the cards",
}

ARCADE_EXTRA_CSS = '''
:root {
    --bg: #090311;
    --bg-deep: #030108;
    --bg-soft: #13051f;
    --card: rgba(20, 10, 34, 0.84);
    --card-strong: rgba(28, 12, 46, 0.92);
    --border: rgba(143, 255, 250, 0.18);
    --border-strong: rgba(255, 98, 214, 0.36);
    --ink: #f8f3ff;
    --ink-soft: #d8c8ff;
    --muted: #9defff;
    --irish-green: #56f7d7;
    --gold: #ffe867;
    --teal: #67e8ff;
    --blue: #8f83ff;
}
body {
    background:
        radial-gradient(circle at 20% 10%, rgba(255, 79, 216, 0.14), transparent 24%),
        radial-gradient(circle at 80% 0%, rgba(79, 246, 255, 0.16), transparent 22%),
        radial-gradient(circle at 50% 100%, rgba(255, 238, 88, 0.10), transparent 28%),
        linear-gradient(180deg, #18051e 0%, #0b0312 45%, #040107 100%);
}
body::before {
    width: 520px;
    height: 520px;
    top: -150px;
    left: -100px;
    background: radial-gradient(circle, rgba(255, 79, 216, 0.22), transparent 70%);
}
body::after {
    width: 420px;
    height: 420px;
    right: -100px;
    top: 120px;
    background: radial-gradient(circle, rgba(79, 246, 255, 0.16), transparent 70%);
}
.page-shell::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image:
        linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0));
}
header.hero {
    border: 1px solid rgba(103, 232, 255, 0.22);
    background:
        linear-gradient(135deg, rgba(255, 79, 216, 0.14), rgba(79, 246, 255, 0.06) 42%, rgba(255, 238, 88, 0.10)),
        linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
    box-shadow:
        0 28px 80px rgba(0,0,0,0.42),
        0 0 0 1px rgba(255,255,255,0.05) inset,
        0 0 36px rgba(79, 246, 255, 0.08);
}
.hero-kicker,
.hero-pill {
    border-color: rgba(255,255,255,0.12);
    background: rgba(11, 4, 21, 0.45);
    box-shadow: 0 0 18px rgba(79, 246, 255, 0.08);
}
.hero h1,
.hero .subtitle,
.hero-pill,
.hero-kicker {
    text-shadow: 0 0 14px rgba(255, 79, 216, 0.10);
}
.card--arcade_game {
    min-height: 390px;
    border-color: rgba(103, 232, 255, 0.18);
    background:
        linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
        linear-gradient(180deg, rgba(16, 6, 29, 0.92), rgba(11, 4, 21, 0.92));
    box-shadow:
        0 18px 42px rgba(0,0,0,0.30),
        0 0 0 1px rgba(255,255,255,0.04) inset;
}
.card--arcade_game::before {
    background:
        linear-gradient(180deg, rgba(255,255,255,0.05), transparent 22%),
        repeating-linear-gradient(
            180deg,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 1px,
            transparent 2px,
            transparent 5px
        );
}
.card--arcade_game::after {
    height: 5px;
    background: linear-gradient(90deg, #ff4fd8, #4ff6ff, #ffee58);
}
.card--arcade_game .icon-badge {
    font-size: 0;
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.12);
    box-shadow: 0 0 20px rgba(255, 79, 216, 0.10);
}
.card--arcade_game .icon-badge::before {
    content: "🕹️";
    font-size: 1.15rem;
}
.card--arcade_game h2 {
    text-shadow: 0 0 14px rgba(79, 246, 255, 0.18);
}
.card--arcade_game .body {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    line-height: 1.5;
}
.arcade-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0 0 0.8rem;
}
.arcade-chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.25rem 0.55rem;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.05);
    color: #fff4b0;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}
.arcade-shell {
    display: grid;
    gap: 0.65rem;
}
.arcade-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.45rem;
    color: #baf9ff;
    font-size: 0.8rem;
}
.arcade-screen-wrap {
    position: relative;
    border-radius: 18px;
    border: 1px solid rgba(103, 232, 255, 0.18);
    background:
        linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01)),
        #06060b;
    padding: 0.65rem;
    box-shadow:
        inset 0 0 22px rgba(79, 246, 255, 0.06),
        0 0 26px rgba(255, 79, 216, 0.06);
}
.arcade-canvas {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    border-radius: 12px;
    background: #04060b;
    border: 1px solid rgba(255,255,255,0.08);
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    outline: none;
}
.arcade-screen-wrap.is-active {
    border-color: rgba(255, 238, 88, 0.45);
    box-shadow:
        inset 0 0 22px rgba(79, 246, 255, 0.08),
        0 0 28px rgba(255, 238, 88, 0.10);
}
.arcade-message {
    color: #d8c8ff;
    font-size: 0.81rem;
    min-height: 1.2rem;
}
.arcade-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
}
.arcade-btn {
    appearance: none;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.05);
    color: #f8f3ff;
    border-radius: 999px;
    padding: 0.36rem 0.72rem;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
}
.arcade-btn:hover {
    border-color: rgba(255, 238, 88, 0.45);
}
.arcade-btn:active {
    transform: translateY(1px);
}
.arcade-directions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
}
.arcade-hint {
    color: #9defff;
    font-size: 0.78rem;
}
.arcade-note-strong {
    color: #ffee58;
}
@media (max-width: 980px) {
    .card--arcade_game { grid-column: span 6; }
}
@media (max-width: 720px) {
    .card--arcade_game { grid-column: auto; min-height: unset; }
}
'''

ARCADE_GAMES = [
    {
        "slug": "missile_command",
        "title": "Missile Command",
        "eyebrow": "Arcade Hall • 1980",
        "chips": ["Atari", "Defense", "Mouse / Tap"],
        "hint": "Click or tap the screen to launch an interceptor burst at the target point.",
        "source_url": "https://en.wikipedia.org/wiki/Missile_Command",
    },
    {
        "slug": "frogger",
        "title": "Frogger",
        "eyebrow": "Arcade Hall • 1981",
        "chips": ["Konami", "Action", "Arrow Keys"],
        "hint": "Use arrow keys, or the on-card direction buttons, to cross roads and ride logs.",
        "source_url": "https://en.wikipedia.org/wiki/Frogger",
    },
    {
        "slug": "asteroids",
        "title": "Asteroids",
        "eyebrow": "Arcade Hall • 1979",
        "chips": ["Atari", "Shooter", "Arrows + Space"],
        "hint": "Left and right rotate, up thrusts, and space fires.",
        "source_url": "https://en.wikipedia.org/wiki/Asteroids_(video_game)",
    },
    {
        "slug": "galaga",
        "title": "Galaga",
        "eyebrow": "Arcade Hall • 1981",
        "chips": ["Namco", "Shooter", "Arrows + Space"],
        "hint": "Move with left and right, then fire upward to clear waves before they dive too low.",
        "source_url": "https://en.wikipedia.org/wiki/Galaga",
    },
    {
        "slug": "pitfall",
        "title": "Pitfall!",
        "eyebrow": "Arcade Spirit • 1982",
        "chips": ["Activision", "Platforming", "Arrows + Space"],
        "hint": "Run, jump pits and logs, and collect treasure while the jungle speeds up.",
        "source_url": "https://en.wikipedia.org/wiki/Pitfall!",
    },
]

ARCADE_EXTRA_JS = '''
(function () {
    const SCALE = window.devicePixelRatio || 1;
    const keyState = Object.create(null);
    let activeGame = null;

    function rand(min, max) {
        return Math.random() * (max - min) + min;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function rectsOverlap(a, b) {
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }

    function drawCentered(ctx, text, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.font = `${size}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y);
        ctx.textAlign = 'left';
    }

    document.addEventListener('keydown', (event) => {
        keyState[event.key] = true;
        if (activeGame && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
            event.preventDefault();
        }
    });

    document.addEventListener('keyup', (event) => {
        keyState[event.key] = false;
    });

    function setActive(game) {
        activeGame = game;
        document.querySelectorAll('.arcade-screen-wrap').forEach((node) => node.classList.remove('is-active'));
        if (game && game.wrap) {
            game.wrap.classList.add('is-active');
            game.canvas.focus({ preventScroll: true });
        }
    }

    function makeBaseGame(root) {
        const canvas = root.querySelector('.arcade-canvas');
        const wrap = root.querySelector('.arcade-screen-wrap');
        const scoreEl = root.querySelector('[data-role="score"]');
        const livesEl = root.querySelector('[data-role="lives"]');
        const statusEl = root.querySelector('[data-role="status"]');
        const messageEl = root.querySelector('[data-role="message"]');
        const ctx = canvas.getContext('2d');

        const width = 320;
        const height = 200;
        canvas.width = width * SCALE;
        canvas.height = height * SCALE;
        ctx.scale(SCALE, SCALE);

        const game = {
            root,
            canvas,
            wrap,
            ctx,
            width,
            height,
            scoreEl,
            livesEl,
            statusEl,
            messageEl,
            score: 0,
            lives: 3,
            status: 'READY',
            lastTime: 0,
            running: false,
            started: false,
            over: false,
            setScore(value) {
                this.score = value;
                if (this.scoreEl) this.scoreEl.textContent = String(value);
            },
            setLives(value) {
                this.lives = value;
                if (this.livesEl) this.livesEl.textContent = String(value);
            },
            setStatus(value) {
                this.status = value;
                if (this.statusEl) this.statusEl.textContent = value;
            },
            setMessage(value) {
                if (this.messageEl) this.messageEl.textContent = value;
            },
            focus() {
                setActive(this);
            },
            start() {
                this.started = true;
                this.running = true;
                this.over = false;
                this.setMessage('Live');
                this.focus();
            },
            stop(message) {
                this.running = false;
                this.over = true;
                this.setMessage(message);
            },
            tick(now) {
                const dt = Math.min(0.033, (now - this.lastTime) / 1000 || 0.016);
                this.lastTime = now;
                if (this.running) this.update(dt);
                this.render();
            },
        };

        wrap.addEventListener('pointerdown', () => game.focus());
        canvas.addEventListener('focus', () => game.focus());

        root.querySelectorAll('[data-action="start"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                game.reset();
                game.start();
            });
        });

        return game;
    }

    function initMissile(root) {
        const game = makeBaseGame(root);
        let cities = [];
        let missiles = [];
        let bursts = [];
        let launchCooldown = 0;

        function spawnMissile() {
            const aliveCities = cities.filter((c) => c.alive);
            const target = aliveCities[Math.floor(Math.random() * aliveCities.length)];
            if (!target) return;
            missiles.push({
                x: rand(10, game.width - 10),
                y: -8,
                tx: target.x + target.w / 2,
                ty: target.y + 3,
                speed: rand(18, 34) + game.score * 0.15,
            });
        }

        game.reset = function () {
            cities = [];
            missiles = [];
            bursts = [];
            launchCooldown = 0;
            for (let i = 0; i < 6; i += 1) {
                cities.push({
                    x: 24 + i * 48,
                    y: game.height - 20,
                    w: 28,
                    h: 10,
                    alive: true,
                });
            }
            this.setScore(0);
            this.setLives(6);
            this.setStatus('DEFCON');
            this.setMessage('Click to intercept.');
        };

        game.canvas.addEventListener('pointerdown', (event) => {
            if (!game.started || game.over) return;
            const rect = game.canvas.getBoundingClientRect();
            const scaleX = game.width / rect.width;
            const scaleY = game.height / rect.height;
            const x = (event.clientX - rect.left) * scaleX;
            const y = (event.clientY - rect.top) * scaleY;
            if (launchCooldown <= 0) {
                bursts.push({ x, y, r: 2, max: 22 });
                launchCooldown = 0.18;
                game.focus();
            }
        });

        game.update = function (dt) {
            launchCooldown = Math.max(0, launchCooldown - dt);

            if (Math.random() < 0.04 + game.score / 1600) {
                spawnMissile();
            }

            missiles.forEach((m) => {
                const dx = m.tx - m.x;
                const dy = m.ty - m.y;
                const len = Math.max(1, Math.hypot(dx, dy));
                m.x += (dx / len) * m.speed * dt;
                m.y += (dy / len) * m.speed * dt;
            });

            bursts.forEach((b) => {
                b.r += 70 * dt;
                if (b.r > b.max) b.dead = true;
            });

            missiles.forEach((m) => {
                bursts.forEach((b) => {
                    if (!m.dead && Math.hypot(m.x - b.x, m.y - b.y) <= b.r) {
                        m.dead = true;
                        game.setScore(game.score + 25);
                    }
                });
            });

            missiles.forEach((m) => {
                cities.forEach((c) => {
                    if (c.alive && Math.hypot(m.x - (c.x + c.w / 2), m.y - c.y) < 12) {
                        c.alive = false;
                        m.dead = true;
                        game.setLives(cities.filter((city) => city.alive).length);
                    }
                });
                if (m.y > game.height + 10) m.dead = true;
            });

            missiles = missiles.filter((m) => !m.dead);
            bursts = bursts.filter((b) => !b.dead);

            if (cities.every((c) => !c.alive)) {
                game.stop('All cities lost. Press Start.');
            }
        };

        game.render = function () {
            const ctx = game.ctx;
            ctx.clearRect(0, 0, game.width, game.height);
            ctx.fillStyle = '#05070d';
            ctx.fillRect(0, 0, game.width, game.height);

            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            for (let y = 0; y < game.height; y += 16) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(game.width, y);
                ctx.stroke();
            }

            ctx.fillStyle = '#2f8cff';
            cities.forEach((c) => {
                if (!c.alive) return;
                ctx.fillRect(c.x, c.y, c.w, c.h);
                ctx.fillRect(c.x + 6, c.y - 6, 6, 6);
                ctx.fillRect(c.x + 16, c.y - 8, 7, 8);
            });

            missiles.forEach((m) => {
                ctx.strokeStyle = '#ff8b7a';
                ctx.beginPath();
                ctx.moveTo(m.x, m.y);
                ctx.lineTo(m.tx, m.ty);
                ctx.stroke();

                ctx.fillStyle = '#ffee58';
                ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
            });

            bursts.forEach((b) => {
                ctx.strokeStyle = '#7ffcff';
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.stroke();
            });

            if (!game.started) {
                drawCentered(ctx, 'MISSILE COMMAND', game.width / 2, 84, 18, '#ffee58');
                drawCentered(ctx, 'Press Start, then click to defend the skyline', game.width / 2, 112, 10, '#baf9ff');
            }

            if (game.over) {
                drawCentered(ctx, 'GAME OVER', game.width / 2, 98, 20, '#ff7de9');
            }
        };

        game.reset();
        return game;
    }

    function initFrogger(root) {
        const game = makeBaseGame(root);
        let frog;
        let cars = [];
        let logs = [];
        let homes = [];
        let moveCooldown = 0;

        function resetFrog() {
            frog = { x: 152, y: 176, w: 14, h: 14 };
        }

        function laneObject(y, speed, width, direction) {
            return { x: direction > 0 ? -width : game.width + width, y, w: width, h: 14, speed, direction };
        }

        function populate() {
            cars = [];
            logs = [];
            homes = [24, 88, 152, 216, 280].map((x) => ({ x, y: 10, w: 24, h: 10, filled: false }));

            [136, 152, 168].forEach((y, idx) => {
                for (let i = 0; i < 3; i += 1) {
                    const car = laneObject(y, 40 + idx * 12, 26 + idx * 6, idx % 2 === 0 ? 1 : -1);
                    car.x = i * 110 + idx * 25;
                    cars.push(car);
                }
            });

            [72, 88, 104].forEach((y, idx) => {
                for (let i = 0; i < 2; i += 1) {
                    const log = laneObject(y, 24 + idx * 10, 64 - idx * 8, idx % 2 === 0 ? -1 : 1);
                    log.x = i * 150 + idx * 18;
                    logs.push(log);
                }
            });
        }

        function loseLife(reason) {
            game.setLives(game.lives - 1);
            game.setMessage(reason);
            if (game.lives <= 0) {
                game.stop('Frog flattened. Press Start.');
                return;
            }
            resetFrog();
        }

        function moveFrog(dx, dy) {
            frog.x = clamp(frog.x + dx, 0, game.width - frog.w);
            frog.y = clamp(frog.y + dy, 0, game.height - frog.h);
        }

        root.querySelectorAll('[data-dir]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (!game.running) return;
                const dir = btn.getAttribute('data-dir');
                if (dir === 'up') moveFrog(0, -16);
                if (dir === 'down') moveFrog(0, 16);
                if (dir === 'left') moveFrog(-16, 0);
                if (dir === 'right') moveFrog(16, 0);
                game.focus();
            });
        });

        game.reset = function () {
            resetFrog();
            populate();
            this.setScore(0);
            this.setLives(3);
            this.setStatus('HOP');
            this.setMessage('Reach all five homes.');
            moveCooldown = 0;
        };

        game.update = function (dt) {
            moveCooldown = Math.max(0, moveCooldown - dt);
            if (moveCooldown <= 0) {
                if (keyState['ArrowUp']) { moveFrog(0, -16); moveCooldown = 0.12; }
                else if (keyState['ArrowDown']) { moveFrog(0, 16); moveCooldown = 0.12; }
                else if (keyState['ArrowLeft']) { moveFrog(-16, 0); moveCooldown = 0.12; }
                else if (keyState['ArrowRight']) { moveFrog(16, 0); moveCooldown = 0.12; }
            }

            cars.forEach((car) => {
                car.x += car.speed * car.direction * dt;
                if (car.direction > 0 && car.x > game.width + 12) car.x = -car.w - 8;
                if (car.direction < 0 && car.x + car.w < -12) car.x = game.width + 8;
                if (rectsOverlap(frog, car)) loseLife('Traffic got you.');
            });

            let onLog = false;
            logs.forEach((log) => {
                log.x += log.speed * log.direction * dt;
                if (log.direction > 0 && log.x > game.width + 12) log.x = -log.w - 8;
                if (log.direction < 0 && log.x + log.w < -12) log.x = game.width + 8;

                if (frog.y >= log.y - 2 && frog.y <= log.y + 4 && frog.x + frog.w > log.x && frog.x < log.x + log.w) {
                    onLog = true;
                    frog.x += log.speed * log.direction * dt;
                }
            });

            if (frog.y >= 64 && frog.y <= 118 && !onLog) {
                loseLife('Splash.');
            }

            if (frog.x < -frog.w || frog.x > game.width) loseLife('You drifted away.');

            homes.forEach((home) => {
                if (!home.filled && frog.y <= 18 && frog.x + frog.w / 2 >= home.x && frog.x + frog.w / 2 <= home.x + home.w) {
                    home.filled = true;
                    game.setScore(game.score + 100);
                    resetFrog();
                }
            });

            if (homes.every((home) => home.filled)) {
                game.stop('All homes reached. Press Start for another round.');
            }
        };

        game.render = function () {
            const ctx = game.ctx;
            ctx.clearRect(0, 0, game.width, game.height);
            ctx.fillStyle = '#071011';
            ctx.fillRect(0, 0, game.width, game.height);

            ctx.fillStyle = '#0d3147';
            ctx.fillRect(0, 48, game.width, 80);

            ctx.fillStyle = '#253b14';
            ctx.fillRect(0, 128, game.width, 72);

            ctx.fillStyle = '#16310d';
            ctx.fillRect(0, 0, game.width, 32);

            homes.forEach((home) => {
                ctx.fillStyle = home.filled ? '#ffee58' : '#1f4f14';
                ctx.fillRect(home.x, home.y, home.w, home.h);
            });

            ctx.fillStyle = '#8b4d1f';
            logs.forEach((log) => ctx.fillRect(log.x, log.y, log.w, log.h));

            cars.forEach((car, idx) => {
                ctx.fillStyle = idx % 2 === 0 ? '#ff7de9' : '#7ffcff';
                ctx.fillRect(car.x, car.y, car.w, car.h);
            });

            ctx.fillStyle = '#63ff8f';
            ctx.fillRect(frog.x, frog.y, frog.w, frog.h);

            if (!game.started) {
                drawCentered(ctx, 'FROGGER', game.width / 2, 90, 18, '#ffee58');
                drawCentered(ctx, 'Use arrows or the on-card buttons', game.width / 2, 114, 10, '#baf9ff');
            }

            if (game.over) {
                drawCentered(ctx, 'ROUND OVER', game.width / 2, 94, 18, '#ff7de9');
            }
        };

        game.reset();
        return game;
    }

    function initAsteroids(root) {
        const game = makeBaseGame(root);
        let ship;
        let bullets = [];
        let asteroids = [];
        let fireCooldown = 0;

        function resetShip() {
            ship = { x: game.width / 2, y: game.height / 2, a: -Math.PI / 2, vx: 0, vy: 0, r: 9 };
        }

        function spawnAsteroids(count) {
            asteroids = [];
            for (let i = 0; i < count; i += 1) {
                asteroids.push({
                    x: rand(0, game.width),
                    y: rand(0, game.height),
                    r: rand(12, 22),
                    vx: rand(-30, 30),
                    vy: rand(-30, 30),
                });
            }
        }

        function wrap(obj) {
            if (obj.x < -30) obj.x = game.width + 30;
            if (obj.x > game.width + 30) obj.x = -30;
            if (obj.y < -30) obj.y = game.height + 30;
            if (obj.y > game.height + 30) obj.y = -30;
        }

        function hitShip() {
            game.setLives(game.lives - 1);
            if (game.lives <= 0) {
                game.stop('Asteroids win. Press Start.');
                return;
            }
            resetShip();
            bullets = [];
        }

        game.reset = function () {
            resetShip();
            bullets = [];
            spawnAsteroids(5);
            fireCooldown = 0;
            this.setScore(0);
            this.setLives(3);
            this.setStatus('VECTOR');
            this.setMessage('Rotate, thrust, and fire.');
        };

        game.update = function (dt) {
            if (keyState['ArrowLeft']) ship.a -= 3.4 * dt;
            if (keyState['ArrowRight']) ship.a += 3.4 * dt;
            if (keyState['ArrowUp']) {
                ship.vx += Math.cos(ship.a) * 70 * dt;
                ship.vy += Math.sin(ship.a) * 70 * dt;
            }

            fireCooldown = Math.max(0, fireCooldown - dt);
            if (keyState[' '] && fireCooldown <= 0) {
                bullets.push({
                    x: ship.x + Math.cos(ship.a) * 12,
                    y: ship.y + Math.sin(ship.a) * 12,
                    vx: Math.cos(ship.a) * 150,
                    vy: Math.sin(ship.a) * 150,
                    life: 1.0,
                });
                fireCooldown = 0.2;
            }

            ship.x += ship.vx * dt;
            ship.y += ship.vy * dt;
            ship.vx *= 0.992;
            ship.vy *= 0.992;
            wrap(ship);

            bullets.forEach((b) => {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.life -= dt;
                wrap(b);
            });
            bullets = bullets.filter((b) => b.life > 0);

            asteroids.forEach((a) => {
                a.x += a.vx * dt;
                a.y += a.vy * dt;
                wrap(a);
                if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.r + ship.r) {
                    hitShip();
                }
            });

            bullets.forEach((b) => {
                asteroids.forEach((a) => {
                    if (!a.dead && Math.hypot(a.x - b.x, a.y - b.y) < a.r) {
                        a.dead = true;
                        b.life = 0;
                        game.setScore(game.score + 20);
                    }
                });
            });

            asteroids = asteroids.filter((a) => !a.dead);

            if (asteroids.length === 0) {
                spawnAsteroids(5 + Math.floor(game.score / 100));
                game.setScore(game.score + 50);
            }
        };

        game.render = function () {
            const ctx = game.ctx;
            ctx.clearRect(0, 0, game.width, game.height);
            ctx.fillStyle = '#05070b';
            ctx.fillRect(0, 0, game.width, game.height);

            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 45; i += 1) {
                ctx.fillRect((i * 53) % game.width, (i * 29) % game.height, 1, 1);
            }

            ctx.strokeStyle = '#baf9ff';
            ctx.beginPath();
            ctx.moveTo(ship.x + Math.cos(ship.a) * 12, ship.y + Math.sin(ship.a) * 12);
            ctx.lineTo(ship.x + Math.cos(ship.a + 2.45) * 10, ship.y + Math.sin(ship.a + 2.45) * 10);
            ctx.lineTo(ship.x + Math.cos(ship.a - 2.45) * 10, ship.y + Math.sin(ship.a - 2.45) * 10);
            ctx.closePath();
            ctx.stroke();

            bullets.forEach((b) => {
                ctx.fillStyle = '#ffee58';
                ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
            });

            asteroids.forEach((a) => {
                ctx.strokeStyle = '#ff7de9';
                ctx.beginPath();
                ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
                ctx.stroke();
            });

            if (!game.started) {
                drawCentered(ctx, 'ASTEROIDS', game.width / 2, 90, 18, '#ffee58');
                drawCentered(ctx, 'Focus this card to use arrows and space', game.width / 2, 114, 10, '#baf9ff');
            }

            if (game.over) {
                drawCentered(ctx, 'SHIP DESTROYED', game.width / 2, 94, 18, '#ff7de9');
            }
        };

        game.reset();
        return game;
    }

    function initGalaga(root) {
        const game = makeBaseGame(root);
        let ship;
        let bullets = [];
        let enemies = [];
        let enemyShots = [];
        let direction = 1;
        let stepTimer = 0;
        let fireCooldown = 0;

        function resetWave() {
            enemies = [];
            for (let row = 0; row < 3; row += 1) {
                for (let col = 0; col < 7; col += 1) {
                    enemies.push({
                        x: 34 + col * 36,
                        y: 28 + row * 22,
                        w: 18,
                        h: 12,
                    });
                }
            }
            direction = 1;
            stepTimer = 0;
        }

        game.reset = function () {
            ship = { x: game.width / 2 - 10, y: 176, w: 20, h: 10 };
            bullets = [];
            enemyShots = [];
            resetWave();
            fireCooldown = 0;
            this.setScore(0);
            this.setLives(3);
            this.setStatus('WAVE');
            this.setMessage('Clear the formation.');
        };

        function loseLife() {
            game.setLives(game.lives - 1);
            if (game.lives <= 0) {
                game.stop('Fleet overwhelmed you. Press Start.');
                return;
            }
            ship.x = game.width / 2 - 10;
            enemyShots = [];
        }

        game.update = function (dt) {
            if (keyState['ArrowLeft']) ship.x -= 130 * dt;
            if (keyState['ArrowRight']) ship.x += 130 * dt;
            ship.x = clamp(ship.x, 4, game.width - ship.w - 4);

            fireCooldown = Math.max(0, fireCooldown - dt);
            if (keyState[' '] && fireCooldown <= 0) {
                bullets.push({ x: ship.x + ship.w / 2 - 1, y: ship.y - 4, w: 2, h: 7, vy: -180 });
                fireCooldown = 0.18;
            }

            bullets.forEach((b) => b.y += b.vy * dt);
            bullets = bullets.filter((b) => b.y > -10);

            stepTimer += dt;
            if (stepTimer >= 0.6) {
                stepTimer = 0;
                let bounce = false;
                enemies.forEach((e) => {
                    e.x += 12 * direction;
                    if (e.x < 8 || e.x + e.w > game.width - 8) bounce = true;
                });
                if (bounce) {
                    direction *= -1;
                    enemies.forEach((e) => e.y += 10);
                }
            }

            if (Math.random() < 0.03 && enemies.length) {
                const shooter = enemies[Math.floor(Math.random() * enemies.length)];
                enemyShots.push({ x: shooter.x + shooter.w / 2 - 1, y: shooter.y + shooter.h + 2, w: 2, h: 6, vy: 110 });
            }

            enemyShots.forEach((s) => s.y += s.vy * dt);
            enemyShots = enemyShots.filter((s) => s.y < game.height + 10);

            bullets.forEach((b) => {
                enemies.forEach((e) => {
                    if (!e.dead && rectsOverlap(b, e)) {
                        e.dead = true;
                        b.dead = true;
                        game.setScore(game.score + 15);
                    }
                });
            });
            bullets = bullets.filter((b) => !b.dead);
            enemies = enemies.filter((e) => !e.dead);

            enemyShots.forEach((s) => {
                if (rectsOverlap(s, ship)) {
                    s.dead = true;
                    loseLife();
                }
            });
            enemyShots = enemyShots.filter((s) => !s.dead);

            if (enemies.some((e) => e.y + e.h >= ship.y)) {
                game.stop('The wave landed. Press Start.');
            }

            if (enemies.length === 0) {
                game.setScore(game.score + 60);
                resetWave();
            }
        };

        game.render = function () {
            const ctx = game.ctx;
            ctx.clearRect(0, 0, game.width, game.height);
            ctx.fillStyle = '#05070b';
            ctx.fillRect(0, 0, game.width, game.height);

            ctx.fillStyle = '#7ffcff';
            ctx.fillRect(ship.x, ship.y, ship.w, ship.h);

            bullets.forEach((b) => {
                ctx.fillStyle = '#ffee58';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            });

            enemyShots.forEach((s) => {
                ctx.fillStyle = '#ff7de9';
                ctx.fillRect(s.x, s.y, s.w, s.h);
            });

            enemies.forEach((e, idx) => {
                ctx.fillStyle = idx % 2 === 0 ? '#ff7de9' : '#9cfb84';
                ctx.fillRect(e.x, e.y, e.w, e.h);
                ctx.clearRect(e.x + 4, e.y + 3, 2, 2);
                ctx.clearRect(e.x + 12, e.y + 3, 2, 2);
            });

            if (!game.started) {
                drawCentered(ctx, 'GALAGA', game.width / 2, 90, 18, '#ffee58');
                drawCentered(ctx, 'Left / Right / Space', game.width / 2, 114, 10, '#baf9ff');
            }

            if (game.over) {
                drawCentered(ctx, 'FORMATION LOST', game.width / 2, 94, 18, '#ff7de9');
            }
        };

        game.reset();
        return game;
    }

    function initPitfall(root) {
        const game = makeBaseGame(root);
        let runner;
        let treasure;
        let hazards;
        let jumpLock = false;

        function spawnHazards() {
            hazards = [
                { type: 'pit', x: rand(140, 260), y: 168, w: 28, h: 18, vx: -78 },
                { type: 'log', x: rand(200, 300), y: 172, w: 18, h: 10, vx: -130 },
            ];
            treasure = { x: rand(170, 280), y: 150, w: 10, h: 14 };
        }

        game.reset = function () {
            runner = { x: 34, y: 164, w: 12, h: 20, vy: 0, grounded: true };
            spawnHazards();
            this.setScore(0);
            this.setLives(3);
            this.setStatus('JUNGLE');
            this.setMessage('Run and jump the hazards.');
            jumpLock = false;
        };

        function loseLife(reason) {
            game.setLives(game.lives - 1);
            if (game.lives <= 0) {
                game.stop('Jungle wins. Press Start.');
                return;
            }
            runner.x = 34;
            runner.y = 164;
            runner.vy = 0;
            runner.grounded = true;
            game.setMessage(reason);
        }

        game.update = function (dt) {
            if (keyState['ArrowLeft']) runner.x -= 110 * dt;
            if (keyState['ArrowRight']) runner.x += 110 * dt;
            runner.x = clamp(runner.x, 6, game.width - runner.w - 6);

            const jumpPressed = keyState['ArrowUp'] || keyState[' '];
            if (jumpPressed && runner.grounded && !jumpLock) {
                runner.vy = -175;
                runner.grounded = false;
                jumpLock = true;
            }
            if (!jumpPressed) jumpLock = false;

            runner.vy += 420 * dt;
            runner.y += runner.vy * dt;
            if (runner.y >= 164) {
                runner.y = 164;
                runner.vy = 0;
                runner.grounded = true;
            }

            hazards.forEach((h) => {
                h.x += h.vx * dt;
                if (h.x + h.w < -6) {
                    h.x = game.width + rand(40, 140);
                    if (h.type === 'pit') h.w = 28 + Math.floor(rand(0, 12));
                }
            });

            hazards.forEach((h) => {
                if (h.type === 'pit') {
                    const foot = { x: runner.x + 2, y: runner.y + runner.h - 2, w: runner.w - 4, h: 2 };
                    const topBand = { x: h.x, y: h.y, w: h.w, h: 5 };
                    if (rectsOverlap(foot, topBand) && runner.grounded) loseLife('You fell in the pit.');
                } else if (rectsOverlap(runner, h)) {
                    loseLife('Rolling log.');
                }
            });

            if (treasure && rectsOverlap(runner, treasure)) {
                game.setScore(game.score + 100);
                treasure = { x: game.width + rand(20, 120), y: 150, w: 10, h: 14 };
            }
            if (treasure.x > game.width) treasure.x -= 90 * dt;

            game.setScore(game.score + Math.floor(dt * 6));
        };

        game.render = function () {
            const ctx = game.ctx;
            ctx.clearRect(0, 0, game.width, game.height);

            ctx.fillStyle = '#0a1011';
            ctx.fillRect(0, 0, game.width, game.height);

            ctx.fillStyle = '#113018';
            ctx.fillRect(0, 0, game.width, 38);

            ctx.fillStyle = '#4c2e0e';
            ctx.fillRect(0, 184, game.width, 16);

            ctx.fillStyle = '#2a7c39';
            ctx.fillRect(0, 182, game.width, 4);

            ctx.fillStyle = '#6ecf72';
            ctx.fillRect(runner.x, runner.y, runner.w, runner.h);

            hazards.forEach((h) => {
                if (h.type === 'pit') {
                    ctx.fillStyle = '#05070b';
                    ctx.fillRect(h.x, h.y, h.w, h.h);
                } else {
                    ctx.fillStyle = '#8b4d1f';
                    ctx.fillRect(h.x, h.y, h.w, h.h);
                }
            });

            if (treasure) {
                ctx.fillStyle = '#ffee58';
                ctx.fillRect(treasure.x, treasure.y, treasure.w, treasure.h);
            }

            if (!game.started) {
                drawCentered(ctx, 'PITFALL!', game.width / 2, 90, 18, '#ffee58');
                drawCentered(ctx, 'Run with arrows and jump with up or space', game.width / 2, 114, 10, '#baf9ff');
            }

            if (game.over) {
                drawCentered(ctx, 'ADVENTURE OVER', game.width / 2, 94, 18, '#ff7de9');
            }
        };

        game.reset();
        return game;
    }

    function initCard(root) {
        const slug = root.getAttribute('data-game-slug');
        if (slug === 'missile_command') return initMissile(root);
        if (slug === 'frogger') return initFrogger(root);
        if (slug === 'asteroids') return initAsteroids(root);
        if (slug === 'galaga') return initGalaga(root);
        if (slug === 'pitfall') return initPitfall(root);
        return null;
    }

    const games = Array.from(document.querySelectorAll('[data-arcade-game]'))
        .map(initCard)
        .filter(Boolean);

    function frame(now) {
        games.forEach((game) => game.tick(now));
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
'''

def _game_body(entry: dict[str, object]) -> str:
    chips = ''.join(f'<span class="arcade-chip">{chip}</span>' for chip in entry["chips"])
    directions = ""
    if entry["slug"] == "frogger":
        directions = (
            '<div class="arcade-directions">'
            '<button class="arcade-btn" type="button" data-dir="up">↑</button>'
            '<button class="arcade-btn" type="button" data-dir="left">←</button>'
            '<button class="arcade-btn" type="button" data-dir="down">↓</button>'
            '<button class="arcade-btn" type="button" data-dir="right">→</button>'
            '</div>'
        )
    return (
        f'<div class="arcade-shell" data-arcade-game data-game-slug="{entry["slug"]}">'
        f'<div class="arcade-chip-row">{chips}</div>'
        '<div class="arcade-stats">'
        '  <span>Score: <span data-role="score">0</span></span>'
        '  <span>Lives: <span data-role="lives">3</span></span>'
        '  <span>Status: <span data-role="status">READY</span></span>'
        '</div>'
        '<div class="arcade-screen-wrap">'
        '  <canvas class="arcade-canvas" width="320" height="200"></canvas>'
        '</div>'
        '<div class="arcade-message" data-role="message">Press Start.</div>'
        '<div class="arcade-controls">'
        '  <button class="arcade-btn" type="button" data-action="start">Start / Reset</button>'
        f'  {directions}'
        '</div>'
        f'<div class="arcade-hint"><span class="arcade-note-strong">How to play:</span> {entry["hint"]}</div>'
        '</div>'
    )

def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)

    cards = [
        CardItem(
            card_type="arcade_game",
            eyebrow=entry["eyebrow"],
            title=entry["title"],
            body=_game_body(entry),
            source_url=entry["source_url"],
        )
        for entry in ARCADE_GAMES
    ]

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "arcade_classics",
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": ARCADE_EXTRA_CSS,
            "extra_js": ARCADE_EXTRA_JS,
        },
    )
