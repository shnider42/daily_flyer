from __future__ import annotations

import json

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "Scrum Daily — Personal Board",
    "header_title": "Scrum Daily",
    "header_subtitle": "A personal backlog board for career and personal work.",
    "footer_text": "Built on Daily Flyer.",
    "hero_kicker": "Daily Flyer • Scrum Daily",
    "hero_summary_pill": "Backlog, focus, and done — without Jira-sized overhead",
}

SEED_STATE = {
    "activeSprint": "Sprint 1",
    "stories": [
        {
            "id": "career-1",
            "title": "Refresh Daily Flyer repo structure understanding",
            "epic": "career",
            "status": "in_progress",
            "notes": "Get clear on master, staging, and experimental branches.",
        },
        {
            "id": "career-2",
            "title": "Prototype Scrum Daily theme",
            "epic": "career",
            "status": "backlog",
            "notes": "Keep it single-user and intentionally lightweight.",
        },
        {
            "id": "personal-1",
            "title": "Plan this week's personal admin tasks",
            "epic": "personal",
            "status": "backlog",
            "notes": "Bills, errands, and one house task.",
        },
        {
            "id": "career-3",
            "title": "Close one small Daily Flyer improvement",
            "epic": "career",
            "status": "done",
            "notes": "Bias toward finishing over collecting more WIP.",
        },
    ],
}


def _board_markup() -> str:
    return """
    <div class="scrum-shell">
      <div class="scrum-toolbar">
        <div class="scrum-toolbar-group">
          <label class="scrum-label">
            Epic
            <select data-filter-epic>
              <option value="all">All</option>
              <option value="career">Career</option>
              <option value="personal">Personal</option>
            </select>
          </label>

          <label class="scrum-label scrum-sprint-wrap">
            Active sprint
            <input type="text" value="" placeholder="Sprint 1" data-sprint-name />
          </label>
        </div>

        <div class="scrum-toolbar-group">
          <button type="button" class="scrum-btn scrum-btn--primary" data-action="add-story">Add story</button>
          <button type="button" class="scrum-btn" data-action="archive-done">Archive done</button>
          <button type="button" class="scrum-btn" data-action="reset-board">Reset seed</button>
        </div>
      </div>

      <div class="scrum-summary" data-scrum-summary></div>
      <div class="scrum-board" data-scrum-board></div>
    </div>
    """


def _agreements_markup() -> str:
    return """
    <div class="scrum-agreements">
      <p><strong>Working agreements</strong></p>
      <ul>
        <li>Keep in-progress intentionally small.</li>
        <li>Move at least one story every day.</li>
        <li>Done means actually done, not “I touched it once.”</li>
        <li>Epics are only lightweight tags here, not Jira bureaucracy.</li>
      </ul>
    </div>
    """


def _extra_css() -> str:
    return r"""
    .card--scrum_board { grid-column: 1 / -1; min-height: unset; }
    .card--scrum_agreements { grid-column: span 4; }

    .scrum-shell { display: grid; gap: 1rem; }
    .scrum-toolbar,
    .scrum-toolbar-group,
    .scrum-summary,
    .scrum-board,
    .scrum-story-actions,
    .scrum-story-meta { display: flex; flex-wrap: wrap; gap: 0.75rem; }

    .scrum-toolbar {
        align-items: end;
        justify-content: space-between;
        padding: 0.95rem;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
    }

    .scrum-label {
        display: grid;
        gap: 0.35rem;
        font-size: 0.82rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 700;
    }

    .scrum-label select,
    .scrum-label input {
        min-width: 170px;
        padding: 0.7rem 0.8rem;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(6, 17, 24, 0.8);
        color: var(--ink);
        font: inherit;
    }

    .scrum-btn {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        padding: 0.72rem 0.95rem;
        background: rgba(255,255,255,0.045);
        color: var(--ink);
        font: inherit;
        cursor: pointer;
        transition: transform 160ms ease, border-color 160ms ease;
    }

    .scrum-btn:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.2); }
    .scrum-btn--primary {
        color: #062016;
        background: linear-gradient(180deg, rgba(143,230,203,0.96), rgba(118,211,183,0.96));
        border-color: rgba(143,230,203,0.72);
        font-weight: 700;
    }

    .scrum-summary { gap: 0.6rem; }
    .scrum-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.58rem 0.8rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.055);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--ink);
        font-size: 0.9rem;
    }

    .scrum-board {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
        align-items: start;
    }

    .scrum-column {
        display: grid;
        gap: 0.8rem;
        padding: 0.95rem;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.035);
        min-height: 280px;
    }

    .scrum-column-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding-bottom: 0.2rem;
        border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .scrum-column-title {
        margin: 0;
        font-size: 1.02rem;
        letter-spacing: -0.01em;
    }

    .scrum-count {
        font-size: 0.82rem;
        color: var(--muted);
        background: rgba(255,255,255,0.045);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 999px;
        padding: 0.3rem 0.55rem;
    }

    .scrum-story-list {
        display: grid;
        gap: 0.8rem;
    }

    .scrum-empty {
        color: var(--muted);
        font-size: 0.92rem;
        line-height: 1.5;
        padding: 0.6rem 0.1rem;
    }

    .scrum-story {
        display: grid;
        gap: 0.75rem;
        padding: 0.85rem;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(7, 21, 29, 0.9);
        box-shadow: 0 10px 24px rgba(0,0,0,0.16);
    }

    .scrum-story-title {
        margin: 0;
        font-size: 1rem;
        line-height: 1.35;
    }

    .scrum-story-notes {
        color: var(--ink-soft);
        font-size: 0.93rem;
        line-height: 1.55;
    }

    .scrum-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.28rem 0.55rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.055);
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 0.78rem;
        color: var(--ink);
        text-transform: uppercase;
        letter-spacing: 0.07em;
    }

    .scrum-chip--career { background: rgba(125,183,217,0.14); }
    .scrum-chip--personal { background: rgba(215,185,107,0.14); }

    .scrum-story-actions { gap: 0.5rem; }
    .scrum-story-actions .scrum-btn {
        padding: 0.5rem 0.7rem;
        border-radius: 10px;
        font-size: 0.88rem;
    }

    .scrum-agreements ul {
        margin: 0.5rem 0 0;
        padding-left: 1.1rem;
        color: var(--ink-soft);
    }
    .scrum-agreements li + li { margin-top: 0.4rem; }

    @media (max-width: 900px) {
        .scrum-board { grid-template-columns: 1fr; }
        .card--scrum_agreements { grid-column: 1 / -1; }
    }
    """


def _extra_js() -> str:
    seed_json = json.dumps(SEED_STATE, ensure_ascii=False, separators=(",", ":"))

    return rf"""
    (function () {{
        const STORAGE_KEY = "dailyflyer:scrum-daily:v1";
        const API_URL = "/api/scrum-daily/state";
        const SEED = {seed_json};
        const STATUSES = ["backlog", "in_progress", "done"];
        const STATUS_LABELS = {{
            backlog: "Backlog",
            in_progress: "In Progress",
            done: "Done",
        }};

        let state = null;
        let storageMode = "local";

        function esc(value) {{
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }}

        function uid() {{
            return "story-" + Math.random().toString(36).slice(2, 10);
        }}

        function normalizeStory(story) {{
            const source = story && typeof story === "object" ? story : {{}};
            const epic = source.epic === "personal" ? "personal" : "career";
            const status = STATUSES.includes(source.status) ? source.status : "backlog";

            return {{
                id: String(source.id || uid()),
                title: String(source.title || "Untitled story"),
                epic,
                status,
                notes: String(source.notes || ""),
            }};
        }}

        function normalizeState(input) {{
            const source = input && typeof input === "object" ? input : {{}};
            const rawStories = Array.isArray(source.stories) ? source.stories : SEED.stories;
            return {{
                activeSprint: String(source.activeSprint || SEED.activeSprint || "Sprint 1"),
                stories: rawStories.map(normalizeStory),
            }};
        }}

        function loadLocalState() {{
            try {{
                const raw = localStorage.getItem(STORAGE_KEY);
                return normalizeState(raw ? JSON.parse(raw) : SEED);
            }} catch (error) {{
                return normalizeState(SEED);
            }}
        }}

        async function loadState() {{
            try {{
                const response = await fetch(API_URL, {{ cache: "no-store" }});
                if (!response.ok) {{
                    throw new Error("No server state endpoint");
                }}
                storageMode = "server";
                return normalizeState(await response.json());
            }} catch (error) {{
                storageMode = "local";
                return loadLocalState();
            }}
        }}

        async function persist() {{
            if (storageMode === "server") {{
                try {{
                    await fetch(API_URL, {{
                        method: "POST",
                        headers: {{ "Content-Type": "application/json" }},
                        body: JSON.stringify(state),
                    }});
                    return;
                }} catch (error) {{
                    storageMode = "local";
                }}
            }}

            try {{
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            }} catch (error) {{
                console.warn("Could not persist Scrum Daily state", error);
            }}
        }}

        function statusIndex(status) {{
            return STATUSES.indexOf(status);
        }}

        function filteredStories() {{
            const epicFilterEl = document.querySelector("[data-filter-epic]");
            const epicFilter = epicFilterEl ? epicFilterEl.value : "all";

            return state.stories.filter((story) => {{
                if (epicFilter === "all") {{
                    return true;
                }}
                return story.epic === epicFilter;
            }});
        }}

        function renderSummary(stories) {{
            const summaryEl = document.querySelector("[data-scrum-summary]");
            if (!summaryEl) {{
                return;
            }}

            const backlog = stories.filter((story) => story.status === "backlog").length;
            const inProgress = stories.filter((story) => story.status === "in_progress").length;
            const done = stories.filter((story) => story.status === "done").length;

            summaryEl.innerHTML = `
                <div class="scrum-pill">Sprint: <strong>${{esc(state.activeSprint || "Unscheduled")}}</strong></div>
                <div class="scrum-pill">Backlog: <strong>${{backlog}}</strong></div>
                <div class="scrum-pill">In Progress: <strong>${{inProgress}}</strong></div>
                <div class="scrum-pill">Done: <strong>${{done}}</strong></div>
            `;
        }}

        function renderBoard(stories) {{
            const boardEl = document.querySelector("[data-scrum-board]");
            if (!boardEl) {{
                return;
            }}

            boardEl.innerHTML = STATUSES.map((status) => {{
                const storiesForStatus = stories.filter((story) => story.status === status);

                const cards = storiesForStatus.length
                    ? storiesForStatus.map((story) => `
                        <article class="scrum-story">
                            <div class="scrum-story-meta">
                                <span class="scrum-chip scrum-chip--${{esc(story.epic)}}">${{esc(story.epic)}}</span>
                            </div>
                            <h3 class="scrum-story-title">${{esc(story.title)}}</h3>
                            <div class="scrum-story-notes">${{esc(story.notes || "No notes yet.")}}</div>
                            <div class="scrum-story-actions">
                                <button type="button" class="scrum-btn" data-action="move-left" data-story-id="${{esc(story.id)}}">←</button>
                                <button type="button" class="scrum-btn" data-action="move-right" data-story-id="${{esc(story.id)}}">→</button>
                                <button type="button" class="scrum-btn" data-action="edit-story" data-story-id="${{esc(story.id)}}">Edit</button>
                            </div>
                        </article>
                    `).join("")
                    : `<div class="scrum-empty">Nothing here right now.</div>`;

                return `
                    <section class="scrum-column">
                        <div class="scrum-column-head">
                            <h3 class="scrum-column-title">${{STATUS_LABELS[status]}}</h3>
                            <span class="scrum-count">${{storiesForStatus.length}}</span>
                        </div>
                        <div class="scrum-story-list">${{cards}}</div>
                    </section>
                `;
            }}).join("");
        }}

        function render() {{
            if (!state) {{
                return;
            }}

            const sprintInput = document.querySelector("[data-sprint-name]");
            if (sprintInput && sprintInput.value !== state.activeSprint) {{
                sprintInput.value = state.activeSprint;
            }}

            const stories = filteredStories();
            renderSummary(stories);
            renderBoard(stories);
        }}

        function moveStory(storyId, direction) {{
            const story = state.stories.find((item) => item.id === storyId);
            if (!story) {{
                return;
            }}

            const nextIndex = statusIndex(story.status) + direction;
            if (nextIndex < 0 || nextIndex >= STATUSES.length) {{
                return;
            }}

            story.status = STATUSES[nextIndex];
            void persist();
            render();
        }}

        function editStory(storyId) {{
            const story = state.stories.find((item) => item.id === storyId);
            if (!story) {{
                return;
            }}

            const title = window.prompt("Story title", story.title);
            if (title === null) {{
                return;
            }}

            const epic = window.prompt("Epic: career or personal", story.epic);
            if (epic === null) {{
                return;
            }}

            const notes = window.prompt("Notes", story.notes);
            if (notes === null) {{
                return;
            }}

            story.title = title.trim() || story.title;
            story.epic = epic.trim().toLowerCase() === "personal" ? "personal" : "career";
            story.notes = notes.trim();

            void persist();
            render();
        }}

        function addStory() {{
            const title = window.prompt("New story title");
            if (!title) {{
                return;
            }}

            const epic = window.prompt("Epic: career or personal", "career");
            if (epic === null) {{
                return;
            }}

            const notes = window.prompt("Notes", "") ?? "";

            state.stories.unshift({{
                id: uid(),
                title: title.trim(),
                epic: epic.trim().toLowerCase() === "personal" ? "personal" : "career",
                status: "backlog",
                notes: notes.trim(),
            }});

            void persist();
            render();
        }}

        function archiveDone() {{
            state.stories = state.stories.filter((story) => story.status !== "done");
            void persist();
            render();
        }}

        function resetBoard() {{
            state = normalizeState(SEED);
            storageMode = "local";
            void persist();
            render();
        }}

        document.addEventListener("click", function (event) {{
            const button = event.target.closest("[data-action]");
            if (!button || !state) {{
                return;
            }}

            const action = button.dataset.action;
            const storyId = button.dataset.storyId;

            if (action === "add-story") {{
                addStory();
            }} else if (action === "archive-done") {{
                archiveDone();
            }} else if (action === "reset-board") {{
                resetBoard();
            }} else if (action === "move-left" && storyId) {{
                moveStory(storyId, -1);
            }} else if (action === "move-right" && storyId) {{
                moveStory(storyId, 1);
            }} else if (action === "edit-story" && storyId) {{
                editStory(storyId);
            }}
        }});

        document.addEventListener("change", function (event) {{
            if (!state) {{
                return;
            }}

            if (event.target.matches("[data-filter-epic]")) {{
                render();
            }}

            if (event.target.matches("[data-sprint-name]")) {{
                state.activeSprint = event.target.value.trim() || "Sprint 1";
                void persist();
                render();
            }}
        }});

        async function boot() {{
            state = await loadState();
            render();
        }}

        if (document.readyState === "loading") {{
            document.addEventListener("DOMContentLoaded", boot);
        }} else {{
            boot();
        }}
    }})();
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)

    cards = [
        CardItem(
            card_type="scrum_agreements",
            eyebrow="Working Agreement",
            title="Keep it small and real",
            body=_agreements_markup(),
        ),
        CardItem(
            card_type="scrum_board",
            eyebrow="Board",
            title="Backlog → In Progress → Done",
            body=_board_markup(),
        ),
    ]

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "scrum_daily",
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": _extra_css(),
            "extra_js": _extra_js(),
        },
    )
