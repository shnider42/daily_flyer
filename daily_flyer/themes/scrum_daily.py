from __future__ import annotations

import json

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "SRE Scrum Daily — 60-Day Board",
    "header_title": "SRE Scrum Daily",
    "header_subtitle": "A lightweight operating board for the SRE transition plan.",
    "footer_text": "Built on Daily Flyer. Source-of-truth workflow starts from staging.",
    "hero_kicker": "Daily Flyer • SRE Transition Board",
    "hero_summary_pill": "Positioning, lab proof, applications, and interview reps",
}

EPICS = [
    {"key": "positioning", "label": "Positioning"},
    {"key": "sre_lab", "label": "SRE Lab"},
    {"key": "observability", "label": "Observability"},
    {"key": "applications", "label": "Applications"},
    {"key": "interview_prep", "label": "Interview Prep"},
    {"key": "board_improvements", "label": "Board Improvements"},
]

SEED_STATE = {
    "activeSprint": "SRE Sprint 1 — Positioning + Lab Foundation",
    "wipLimit": 3,
    "epics": EPICS,
    "stories": [
        {
            "id": "pos-001",
            "title": "Rewrite LinkedIn headline for SRE",
            "epic": "positioning",
            "status": "in_progress",
            "priority": "P0",
            "due": "Week 1",
            "acceptanceCriteria": "Headline explicitly says Infrastructure / Platform Reliability Engineer and mentions Dell/EMC, automation, Linux, Kubernetes, and observability.",
            "notes": "Make the market identity obvious. No 'open to anything technical' energy.",
        },
        {
            "id": "pos-002",
            "title": "Create SRE-specific resume",
            "epic": "positioning",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 1",
            "acceptanceCriteria": "A separate SRE resume exists and the top third emphasizes reliability, incident response, automation, infrastructure, and production troubleshooting.",
            "notes": "Every bullet should pass the test: would an SRE manager care?",
        },
        {
            "id": "pos-003",
            "title": "Write and rehearse 30-second SRE intro",
            "epic": "positioning",
            "status": "backlog",
            "priority": "P1",
            "due": "Week 1",
            "acceptanceCriteria": "Intro can be said out loud without hedging and frames the lane as reliability engineering where software meets systems.",
            "notes": "Use Dell/EMC as the credibility anchor and recent Kubernetes/observability work as the bridge.",
        },
        {
            "id": "lab-001",
            "title": "Create sre-reliability-lab repo",
            "epic": "sre_lab",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 2",
            "acceptanceCriteria": "Repo exists with a README explaining purpose, architecture, local run instructions, and planned failure scenarios.",
            "notes": "One polished proof project beats five half-finished labs.",
        },
        {
            "id": "lab-002",
            "title": "Build app health/readiness/metrics endpoints",
            "epic": "sre_lab",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 2",
            "acceptanceCriteria": "App exposes /health, /ready, /metrics, /slow, /error, and /dependency-check with documented behavior.",
            "notes": "Keep the app simple. The reliability workflow is the artifact.",
        },
        {
            "id": "lab-003",
            "title": "Deploy app to Minikube",
            "epic": "sre_lab",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 2",
            "acceptanceCriteria": "Kubernetes manifests or Helm chart deploy the app with Service, Ingress, requests, and limits.",
            "notes": "This should be boring, reproducible, and documented.",
        },
        {
            "id": "obs-001",
            "title": "Add Prometheus metrics and scrape config",
            "epic": "observability",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 3",
            "acceptanceCriteria": "Prometheus can scrape request count, error count, and latency metrics from the app.",
            "notes": "Do not overbuild. Make it readable and screenshot-worthy.",
        },
        {
            "id": "obs-002",
            "title": "Create Grafana dashboard",
            "epic": "observability",
            "status": "backlog",
            "priority": "P1",
            "due": "Week 3",
            "acceptanceCriteria": "Dashboard shows request rate, error rate, latency, and pod health/status.",
            "notes": "Dashboard should support the incident stories, not exist for decoration.",
        },
        {
            "id": "lab-004",
            "title": "Write CrashLoopBackOff runbook",
            "epic": "sre_lab",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 4",
            "acceptanceCriteria": "Runbook includes symptom, customer impact, detection, kubectl commands, remediation, and prevention.",
            "notes": "This is one of the clearest SRE interview proof points.",
        },
        {
            "id": "lab-005",
            "title": "Write bad config incident postmortem",
            "epic": "sre_lab",
            "status": "backlog",
            "priority": "P1",
            "due": "Week 4",
            "acceptanceCriteria": "Postmortem includes timeline, impact, root cause, detection gap, remediation, and follow-up action items.",
            "notes": "No blame. Show systems thinking.",
        },
        {
            "id": "apps-001",
            "title": "Build SRE target-role filter",
            "epic": "applications",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 5",
            "acceptanceCriteria": "Green/yellow/red job criteria are written down and used before applying.",
            "notes": "This prevents shotgun applications and protects the SRE positioning.",
        },
        {
            "id": "apps-002",
            "title": "Apply to 8–12 SRE-adjacent roles",
            "epic": "applications",
            "status": "backlog",
            "priority": "P0",
            "due": "Weekly starting Week 5",
            "acceptanceCriteria": "Tracker has 8–12 entries with company, role, fit reason, resume version, contact, follow-up date, and status.",
            "notes": "No tracker equals vibes. Vibes have not been working.",
        },
        {
            "id": "apps-003",
            "title": "Send 5 targeted networking messages",
            "epic": "applications",
            "status": "backlog",
            "priority": "P1",
            "due": "Weekly starting Week 5",
            "acceptanceCriteria": "Five messages sent to SRE/platform/reliability people with a concrete reason for outreach.",
            "notes": "Avoid generic recruiter spam. Specific beats broad.",
        },
        {
            "id": "prep-001",
            "title": "Prepare 6 SRE interview stories",
            "epic": "interview_prep",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 6",
            "acceptanceCriteria": "Six stories exist in Situation → Failure mode → Investigation → Fix → Prevention → Lesson format.",
            "notes": "Must include Dell escalation, lab build, cross-layer debugging, automation, Quantum/API work, and the new SRE lab.",
        },
        {
            "id": "prep-002",
            "title": "Drill Kubernetes troubleshooting",
            "epic": "interview_prep",
            "status": "backlog",
            "priority": "P0",
            "due": "Week 6",
            "acceptanceCriteria": "Can explain pods, deployments, services, ingress, events, logs, describe, rollout undo, requests/limits, and CrashLoopBackOff debugging.",
            "notes": "Fluency matters more than pretending to be a principal Kubernetes platform owner.",
        },
        {
            "id": "prep-003",
            "title": "Practice SLO/error-budget explanation",
            "epic": "interview_prep",
            "status": "backlog",
            "priority": "P1",
            "due": "Week 6",
            "acceptanceCriteria": "Can explain SLI, SLO, error budget, alert relevance, and toil reduction in plain English.",
            "notes": "Make it sound operational, not memorized.",
        },
        {
            "id": "board-001",
            "title": "Support custom epics instead of career/personal only",
            "epic": "board_improvements",
            "status": "done",
            "priority": "P0",
            "due": "Now",
            "acceptanceCriteria": "Board normalizes and renders configurable epics from state and does not collapse everything into career/personal.",
            "notes": "This keeps the board aligned to the actual SRE plan.",
        },
        {
            "id": "board-002",
            "title": "Add priority, due, and acceptance criteria fields",
            "epic": "board_improvements",
            "status": "done",
            "priority": "P0",
            "due": "Now",
            "acceptanceCriteria": "Cards display priority, due target, and done criteria so work cannot hide behind vague titles.",
            "notes": "Done means evidence exists.",
        },
        {
            "id": "board-003",
            "title": "Add WIP limit warning",
            "epic": "board_improvements",
            "status": "done",
            "priority": "P1",
            "due": "Now",
            "acceptanceCriteria": "Summary warns when In Progress exceeds the configured WIP limit.",
            "notes": "The board should gently shame excess multitasking.",
        },
        {
            "id": "board-004",
            "title": "Add JSON export/import",
            "epic": "board_improvements",
            "status": "done",
            "priority": "P1",
            "due": "Now",
            "acceptanceCriteria": "Board state can be exported and imported as JSON for backup, sharing, or migration.",
            "notes": "Lightweight portability without building a Jira clone.",
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
            </select>
          </label>

          <label class="scrum-label scrum-sprint-wrap">
            Active sprint
            <input type="text" value="" placeholder="SRE Sprint 1" data-sprint-name />
          </label>
        </div>

        <div class="scrum-toolbar-group">
          <button type="button" class="scrum-btn scrum-btn--primary" data-action="add-story">Add story</button>
          <button type="button" class="scrum-btn" data-action="export-board">Export JSON</button>
          <button type="button" class="scrum-btn" data-action="import-board">Import JSON</button>
          <button type="button" class="scrum-btn" data-action="archive-done">Archive done</button>
          <button type="button" class="scrum-btn" data-action="reset-board">Reset SRE seed</button>
        </div>
      </div>

      <div class="scrum-summary" data-scrum-summary></div>
      <div class="scrum-alert" data-wip-warning hidden></div>
      <div class="scrum-board" data-scrum-board></div>
    </div>
    """


def _agreements_markup() -> str:
    return """
    <div class="scrum-agreements">
      <p><strong>Working agreements</strong></p>
      <ul>
        <li><strong>Staging is the source of truth.</strong> New Daily Flyer work branches from staging, not master.</li>
        <li>Keep in-progress intentionally small. Default WIP limit: 3.</li>
        <li>Board improvements are allowed only when they directly help the SRE plan.</li>
        <li>Done means evidence exists: committed code, a real application entry, a resume file, or a written runbook/postmortem.</li>
        <li>Move at least one story every day, even if it is small.</li>
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

    .scrum-alert {
        padding: 0.85rem 1rem;
        border-radius: 16px;
        border: 1px solid rgba(255, 205, 117, 0.32);
        background: rgba(255, 205, 117, 0.10);
        color: var(--ink);
        line-height: 1.5;
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

    .scrum-story-notes,
    .scrum-story-acceptance {
        color: var(--ink-soft);
        font-size: 0.93rem;
        line-height: 1.55;
    }

    .scrum-story-acceptance {
        padding-top: 0.55rem;
        border-top: 1px solid rgba(255,255,255,0.06);
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

    .scrum-chip--priority { background: rgba(255, 117, 117, 0.12); }
    .scrum-chip--due { background: rgba(143, 230, 203, 0.12); }

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

    return r"""
    (function () {
        const STORAGE_KEY = "dailyflyer:scrum-daily:sre:v2";
        const API_URL = "/api/scrum-daily/state";
        const SEED = __SEED_JSON__;
        const STATUSES = ["backlog", "in_progress", "done"];
        const STATUS_LABELS = {
            backlog: "Backlog",
            in_progress: "In Progress",
            done: "Done",
        };
        const PRIORITIES = ["P0", "P1", "P2"];
        const DEFAULT_EPICS = [
            { key: "positioning", label: "Positioning" },
            { key: "sre_lab", label: "SRE Lab" },
            { key: "observability", label: "Observability" },
            { key: "applications", label: "Applications" },
            { key: "interview_prep", label: "Interview Prep" },
            { key: "board_improvements", label: "Board Improvements" },
        ];

        let state = null;
        let storageMode = "local";

        function esc(value) {
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        function uid() {
            return "story-" + Math.random().toString(36).slice(2, 10);
        }

        function slug(value) {
            return String(value || "general")
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "") || "general";
        }

        function titleCase(value) {
            return String(value || "General")
                .replace(/[_-]+/g, " ")
                .replace(/\b\w/g, (match) => match.toUpperCase());
        }

        function normalizeEpic(epic) {
            if (typeof epic === "string") {
                const key = slug(epic);
                return { key, label: titleCase(key) };
            }

            const source = epic && typeof epic === "object" ? epic : {};
            const key = slug(source.key || source.label || "general");
            return {
                key,
                label: String(source.label || titleCase(key)),
            };
        }

        function normalizeEpics(input, stories) {
            const configured = Array.isArray(input) && input.length ? input.map(normalizeEpic) : DEFAULT_EPICS;
            const byKey = new Map(configured.map((epic) => [epic.key, epic]));

            for (const story of stories || []) {
                const epicKey = slug(story.epic || "general");
                if (!byKey.has(epicKey)) {
                    byKey.set(epicKey, { key: epicKey, label: titleCase(epicKey) });
                }
            }

            return Array.from(byKey.values());
        }

        function epicLabel(epicKey) {
            const match = state.epics.find((epic) => epic.key === epicKey);
            return match ? match.label : titleCase(epicKey);
        }

        function normalizeStory(story) {
            const source = story && typeof story === "object" ? story : {};
            const status = STATUSES.includes(source.status) ? source.status : "backlog";
            const priority = PRIORITIES.includes(String(source.priority || "").toUpperCase())
                ? String(source.priority).toUpperCase()
                : "P2";

            return {
                id: String(source.id || uid()),
                title: String(source.title || "Untitled story"),
                epic: slug(source.epic || "general"),
                status,
                priority,
                due: String(source.due || ""),
                acceptanceCriteria: String(source.acceptanceCriteria || source.acceptance || ""),
                notes: String(source.notes || ""),
            };
        }

        function normalizeState(input) {
            const source = input && typeof input === "object" ? input : {};
            const rawStories = Array.isArray(source.stories) ? source.stories : SEED.stories;
            const stories = rawStories.map(normalizeStory);
            const epics = normalizeEpics(source.epics || SEED.epics, stories);
            const wipLimit = Number.isFinite(Number(source.wipLimit)) ? Math.max(1, Number(source.wipLimit)) : 3;

            return {
                activeSprint: String(source.activeSprint || SEED.activeSprint || "SRE Sprint 1"),
                wipLimit,
                epics,
                stories,
            };
        }

        function loadLocalState() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                return normalizeState(raw ? JSON.parse(raw) : SEED);
            } catch (error) {
                return normalizeState(SEED);
            }
        }

        async function loadState() {
            try {
                const response = await fetch(API_URL, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error("No server state endpoint");
                }
                storageMode = "server";
                return normalizeState(await response.json());
            } catch (error) {
                storageMode = "local";
                return loadLocalState();
            }
        }

        async function persist() {
            if (storageMode === "server") {
                try {
                    const response = await fetch(API_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(state),
                    });
                    if (!response.ok) {
                        throw new Error("Server rejected board state");
                    }
                    return;
                } catch (error) {
                    storageMode = "local";
                }
            }

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (error) {
                console.warn("Could not persist Scrum Daily state", error);
            }
        }

        function statusIndex(status) {
            return STATUSES.indexOf(status);
        }

        function renderEpicFilter() {
            const epicFilterEl = document.querySelector("[data-filter-epic]");
            if (!epicFilterEl || !state) {
                return;
            }

            const selected = epicFilterEl.value || "all";
            epicFilterEl.innerHTML = [
                `<option value="all">All</option>`,
                ...state.epics.map((epic) => `<option value="${esc(epic.key)}">${esc(epic.label)}</option>`),
            ].join("");

            epicFilterEl.value = state.epics.some((epic) => epic.key === selected) ? selected : "all";
        }

        function filteredStories() {
            const epicFilterEl = document.querySelector("[data-filter-epic]");
            const epicFilter = epicFilterEl ? epicFilterEl.value : "all";

            return state.stories.filter((story) => {
                if (epicFilter === "all") {
                    return true;
                }
                return story.epic === epicFilter;
            });
        }

        function renderSummary(stories) {
            const summaryEl = document.querySelector("[data-scrum-summary]");
            const warningEl = document.querySelector("[data-wip-warning]");
            if (!summaryEl) {
                return;
            }

            const backlog = stories.filter((story) => story.status === "backlog").length;
            const inProgress = stories.filter((story) => story.status === "in_progress").length;
            const done = stories.filter((story) => story.status === "done").length;
            const p0Open = stories.filter((story) => story.priority === "P0" && story.status !== "done").length;

            summaryEl.innerHTML = `
                <div class="scrum-pill">Sprint: <strong>${esc(state.activeSprint || "Unscheduled")}</strong></div>
                <div class="scrum-pill">Backlog: <strong>${backlog}</strong></div>
                <div class="scrum-pill">In Progress: <strong>${inProgress}/${esc(state.wipLimit)}</strong></div>
                <div class="scrum-pill">Done: <strong>${done}</strong></div>
                <div class="scrum-pill">Open P0: <strong>${p0Open}</strong></div>
                <div class="scrum-pill">Storage: <strong>${esc(storageMode)}</strong></div>
            `;

            if (warningEl) {
                if (inProgress > state.wipLimit) {
                    warningEl.hidden = false;
                    warningEl.innerHTML = `<strong>WIP limit exceeded.</strong> ${inProgress} items are in progress, but the configured limit is ${esc(state.wipLimit)}. Finish or move something back before starting more.`;
                } else {
                    warningEl.hidden = true;
                    warningEl.innerHTML = "";
                }
            }
        }

        function renderBoard(stories) {
            const boardEl = document.querySelector("[data-scrum-board]");
            if (!boardEl) {
                return;
            }

            boardEl.innerHTML = STATUSES.map((status) => {
                const storiesForStatus = stories.filter((story) => story.status === status);

                const cards = storiesForStatus.length
                    ? storiesForStatus.map((story) => `
                        <article class="scrum-story">
                            <div class="scrum-story-meta">
                                <span class="scrum-chip scrum-chip--${esc(story.epic)}">${esc(epicLabel(story.epic))}</span>
                                <span class="scrum-chip scrum-chip--priority">${esc(story.priority)}</span>
                                ${story.due ? `<span class="scrum-chip scrum-chip--due">${esc(story.due)}</span>` : ""}
                            </div>
                            <h3 class="scrum-story-title">${esc(story.title)}</h3>
                            <div class="scrum-story-notes">${esc(story.notes || "No notes yet.")}</div>
                            ${story.acceptanceCriteria ? `<div class="scrum-story-acceptance"><strong>Done when:</strong> ${esc(story.acceptanceCriteria)}</div>` : ""}
                            <div class="scrum-story-actions">
                                <button type="button" class="scrum-btn" data-action="move-left" data-story-id="${esc(story.id)}">←</button>
                                <button type="button" class="scrum-btn" data-action="move-right" data-story-id="${esc(story.id)}">→</button>
                                <button type="button" class="scrum-btn" data-action="edit-story" data-story-id="${esc(story.id)}">Edit</button>
                            </div>
                        </article>
                    `).join("")
                    : `<div class="scrum-empty">Nothing here right now.</div>`;

                return `
                    <section class="scrum-column">
                        <div class="scrum-column-head">
                            <h3 class="scrum-column-title">${STATUS_LABELS[status]}</h3>
                            <span class="scrum-count">${storiesForStatus.length}</span>
                        </div>
                        <div class="scrum-story-list">${cards}</div>
                    </section>
                `;
            }).join("");
        }

        function render() {
            if (!state) {
                return;
            }

            renderEpicFilter();

            const sprintInput = document.querySelector("[data-sprint-name]");
            if (sprintInput && sprintInput.value !== state.activeSprint) {
                sprintInput.value = state.activeSprint;
            }

            const stories = filteredStories();
            renderSummary(stories);
            renderBoard(stories);
        }

        function moveStory(storyId, direction) {
            const story = state.stories.find((item) => item.id === storyId);
            if (!story) {
                return;
            }

            const nextIndex = statusIndex(story.status) + direction;
            if (nextIndex < 0 || nextIndex >= STATUSES.length) {
                return;
            }

            story.status = STATUSES[nextIndex];
            void persist();
            render();
        }

        function editStory(storyId) {
            const story = state.stories.find((item) => item.id === storyId);
            if (!story) {
                return;
            }

            const title = window.prompt("Story title", story.title);
            if (title === null) {
                return;
            }

            const epic = window.prompt("Epic key", story.epic);
            if (epic === null) {
                return;
            }

            const priority = window.prompt("Priority: P0, P1, or P2", story.priority);
            if (priority === null) {
                return;
            }

            const due = window.prompt("Due / target week", story.due);
            if (due === null) {
                return;
            }

            const acceptanceCriteria = window.prompt("Acceptance criteria / done means", story.acceptanceCriteria);
            if (acceptanceCriteria === null) {
                return;
            }

            const notes = window.prompt("Notes", story.notes);
            if (notes === null) {
                return;
            }

            story.title = title.trim() || story.title;
            story.epic = slug(epic);
            story.priority = PRIORITIES.includes(priority.trim().toUpperCase()) ? priority.trim().toUpperCase() : "P2";
            story.due = due.trim();
            story.acceptanceCriteria = acceptanceCriteria.trim();
            story.notes = notes.trim();

            state.epics = normalizeEpics(state.epics, state.stories);
            void persist();
            render();
        }

        function addStory() {
            const title = window.prompt("New story title");
            if (!title) {
                return;
            }

            const epic = window.prompt("Epic key", "sre_lab");
            if (epic === null) {
                return;
            }

            const priority = window.prompt("Priority: P0, P1, or P2", "P1");
            if (priority === null) {
                return;
            }

            const due = window.prompt("Due / target week", "") ?? "";
            const acceptanceCriteria = window.prompt("Acceptance criteria / done means", "") ?? "";
            const notes = window.prompt("Notes", "") ?? "";

            state.stories.unshift({
                id: uid(),
                title: title.trim(),
                epic: slug(epic),
                status: "backlog",
                priority: PRIORITIES.includes(priority.trim().toUpperCase()) ? priority.trim().toUpperCase() : "P1",
                due: due.trim(),
                acceptanceCriteria: acceptanceCriteria.trim(),
                notes: notes.trim(),
            });

            state.epics = normalizeEpics(state.epics, state.stories);
            void persist();
            render();
        }

        function archiveDone() {
            state.stories = state.stories.filter((story) => story.status !== "done");
            void persist();
            render();
        }

        function resetBoard() {
            state = normalizeState(SEED);
            storageMode = "local";
            void persist();
            render();
        }

        function exportBoard() {
            const payload = JSON.stringify(state, null, 2);
            try {
                navigator.clipboard.writeText(payload);
                window.alert("Board JSON copied to clipboard.");
            } catch (error) {
                window.prompt("Copy board JSON", payload);
            }
        }

        function importBoard() {
            const raw = window.prompt("Paste board JSON");
            if (!raw) {
                return;
            }

            try {
                state = normalizeState(JSON.parse(raw));
                void persist();
                render();
            } catch (error) {
                window.alert("That JSON could not be imported.");
            }
        }

        document.addEventListener("click", function (event) {
            const button = event.target.closest("[data-action]");
            if (!button || !state) {
                return;
            }

            const action = button.dataset.action;
            const storyId = button.dataset.storyId;

            if (action === "add-story") {
                addStory();
            } else if (action === "archive-done") {
                archiveDone();
            } else if (action === "reset-board") {
                resetBoard();
            } else if (action === "export-board") {
                exportBoard();
            } else if (action === "import-board") {
                importBoard();
            } else if (action === "move-left" && storyId) {
                moveStory(storyId, -1);
            } else if (action === "move-right" && storyId) {
                moveStory(storyId, 1);
            } else if (action === "edit-story" && storyId) {
                editStory(storyId);
            }
        });

        document.addEventListener("change", function (event) {
            if (!state) {
                return;
            }

            if (event.target.matches("[data-filter-epic]")) {
                render();
            }

            if (event.target.matches("[data-sprint-name]")) {
                state.activeSprint = event.target.value.trim() || "SRE Sprint 1";
                void persist();
                render();
            }
        });

        async function boot() {
            state = await loadState();
            render();
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", boot);
        } else {
            boot();
        }
    })();
    """.replace("__SEED_JSON__", seed_json)


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)

    cards = [
        CardItem(
            card_type="scrum_agreements",
            eyebrow="Working Agreement",
            title="Use the board without hiding in the board",
            body=_agreements_markup(),
        ),
        CardItem(
            card_type="scrum_board",
            eyebrow="SRE Transition Board",
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
