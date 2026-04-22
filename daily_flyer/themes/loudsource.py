from __future__ import annotations

from daily_flyer.models import CardItem, PageContext


THEME_NAME = "loudsource"
THEME_CONFIG = {
    "page_title": "LoudSource — Collaborative Spotify Queue",
    "header_title": "LoudSource 🎵",
    "header_subtitle": "Collaborative queueing, voting, and host-controlled Spotify playback inside Daily Flyer.",
    "footer_text": "Built on Daily Flyer. LoudSource feature-service starter.",
    "hero_kicker": "Daily Flyer • LoudSource",
    "hero_summary_pill": "Spotify room queue with votes and live playback state",
}


def _card_html() -> list[CardItem]:
    return [
        CardItem(
            "music_room",
            "Room",
            "Connect and Control",
            """
            <div class="ls-stack">
              <div class="ls-helper">Use <code>?theme=loudsource&room=main</code> or change <code>room</code> to create separate queues.</div>
              <div class="ls-row-wrap">
                <a class="ls-btn" id="ls-login-btn" href="#">Connect Spotify</a>
                <button class="ls-btn" type="button" id="ls-start-btn">Start top voted track</button>
                <button class="ls-btn ls-btn--ghost" type="button" id="ls-clear-btn">Clear votes</button>
              </div>
              <div id="ls-room-meta" class="ls-helper">Room: loading…</div>
              <div id="ls-room-status" class="ls-status"></div>
            </div>
            """,
        ),
        CardItem(
            "music_now_playing",
            "Now Playing",
            "Current Track",
            "<div id='ls-now-playing' class='ls-panel'>Loading current playback…</div>",
        ),
        CardItem(
            "music_search",
            "Search",
            "Find a Song",
            """
            <form id="ls-search-form" class="ls-stack">
              <div class="ls-row-wrap">
                <input id="ls-search-input" class="ls-input" type="text" placeholder="Search artist or song">
                <button class="ls-btn" type="submit">Search</button>
              </div>
              <div id="ls-search-results" class="ls-stack"></div>
            </form>
            """,
        ),
        CardItem(
            "music_queue",
            "Queue",
            "Top Voted Tracks",
            "<div id='ls-queue' class='ls-stack'>Loading queue…</div>",
        ),
    ]


def _extra_css() -> str:
    return r"""
    .card--music_room,
    .card--music_now_playing,
    .card--music_search,
    .card--music_queue {
        grid-column: span 6;
    }

    .ls-stack {
        display: grid;
        gap: 0.85rem;
    }

    .ls-row,
    .ls-row-wrap {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .ls-row-wrap {
        flex-wrap: wrap;
    }

    .ls-panel,
    .ls-result,
    .ls-queue-item {
        padding: 0.95rem;
        border-radius: 16px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
    }

    .ls-art {
        width: 56px;
        height: 56px;
        object-fit: cover;
        border-radius: 12px;
        background: rgba(255,255,255,0.06);
        flex: 0 0 auto;
    }

    .ls-copy {
        min-width: 0;
        flex: 1 1 auto;
    }

    .ls-title {
        font-weight: 700;
        color: var(--ink);
    }

    .ls-meta,
    .ls-helper,
    .ls-empty {
        color: var(--ink-soft);
        font-size: 0.92rem;
    }

    .ls-status {
        color: #ffd78c;
        min-height: 1.1rem;
        font-size: 0.92rem;
    }

    .ls-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--ink);
        font-size: 0.82rem;
        font-weight: 700;
    }

    .ls-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
        margin-top: 0.55rem;
    }

    .ls-btn {
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.10);
        color: var(--ink);
        border-radius: 12px;
        cursor: pointer;
        text-decoration: none;
        font: inherit;
        font-weight: 700;
        padding: 0.7rem 0.95rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .ls-btn--ghost {
        background: transparent;
    }

    .ls-btn:hover {
        text-decoration: none;
        background: rgba(255,255,255,0.14);
    }

    .ls-input {
        flex: 1 1 280px;
        min-width: 0;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        color: var(--ink);
        font: inherit;
        padding: 0.8rem 0.9rem;
    }

    .ls-input:focus {
        outline: 2px solid rgba(255,255,255,0.20);
    }

    .ls-votes {
        margin-top: 0.2rem;
        color: #ffe4b0;
        font-size: 0.9rem;
        font-weight: 700;
    }

    @media (max-width: 720px) {
        .card--music_room,
        .card--music_now_playing,
        .card--music_search,
        .card--music_queue {
            grid-column: auto;
        }
    }
    """


def _extra_js() -> str:
    return r"""
    (function () {
      const params = new URLSearchParams(window.location.search);
      const room = (params.get("room") || "main").trim().toLowerCase();
      const nextUrl = `${window.location.pathname}?theme=loudsource&room=${encodeURIComponent(room)}`;
      const apiBase = `/api/loudsource/${encodeURIComponent(room)}`;

      const loginBtn = document.getElementById("ls-login-btn");
      const startBtn = document.getElementById("ls-start-btn");
      const clearBtn = document.getElementById("ls-clear-btn");
      const roomMeta = document.getElementById("ls-room-meta");
      const roomStatus = document.getElementById("ls-room-status");
      const nowPlayingEl = document.getElementById("ls-now-playing");
      const queueEl = document.getElementById("ls-queue");
      const searchForm = document.getElementById("ls-search-form");
      const searchInput = document.getElementById("ls-search-input");
      const searchResults = document.getElementById("ls-search-results");

      function esc(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      async function postJson(url, payload) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || {}),
        });
        let data = {};
        try { data = await res.json(); } catch (e) {}
        if (!res.ok) {
          throw new Error(data.error || `Request failed (${res.status})`);
        }
        return data;
      }

      function setStatus(text) {
        roomStatus.textContent = text || "";
      }

      function rowHtml(item, actionsHtml) {
        const imageHtml = item.track?.image ? `<img class="ls-art" src="${esc(item.track.image)}" alt="">` : "";
        return `
          <div class="ls-queue-item">
            <div class="ls-row">
              ${imageHtml}
              <div class="ls-copy">
                <div class="ls-title">${esc(item.track?.name || "Unknown track")}</div>
                <div class="ls-meta">${esc(item.track?.artist || "Unknown artist")}</div>
                ${item.votes != null ? `<div class="ls-votes">${esc(item.votes)} vote(s)</div>` : ""}
                ${actionsHtml || ""}
              </div>
            </div>
          </div>
        `;
      }

      function renderNowPlaying(data) {
        if (!data.now_playing) {
          nowPlayingEl.innerHTML = `<div class="ls-empty">Nothing playing yet in room <strong>${esc(room)}</strong>.</div>`;
          return;
        }
        const np = data.now_playing;
        const art = np.image ? `<img class="ls-art" src="${esc(np.image)}" alt="">` : "";
        const device = data.active_device_name ? `<span class="ls-pill">📱 ${esc(data.active_device_name)}</span>` : "";
        const statePill = data.auto_enabled ? `<span class="ls-pill">🤖 auto queue on</span>` : `<span class="ls-pill">🖐 manual mode</span>`;
        nowPlayingEl.innerHTML = `
          <div class="ls-panel">
            <div class="ls-row">
              ${art}
              <div class="ls-copy">
                <div class="ls-title">${esc(np.name)}</div>
                <div class="ls-meta">${esc(np.artist)}</div>
                <div class="ls-meta">${esc(np.extra || "")}</div>
              </div>
            </div>
            <div class="ls-actions">${device}${statePill}</div>
          </div>
        `;
      }

      function renderQueue(data) {
        if (!data.queue || !data.queue.length) {
          queueEl.innerHTML = `<div class="ls-empty">No votes yet. Search above and start building the queue.</div>`;
          return;
        }
        queueEl.innerHTML = data.queue.map((item) => rowHtml(item, "")).join("");
      }

      function renderSearch(results) {
        const items = Object.entries(results || {});
        if (!items.length) {
          searchResults.innerHTML = `<div class="ls-empty">No results.</div>`;
          return;
        }
        searchResults.innerHTML = items.map(([trackId, meta]) => {
          const preview = meta.preview_url ? `<a href="${esc(meta.preview_url)}" target="_blank" rel="noopener noreferrer">Preview</a>` : "";
          const art = meta.image ? `<img class="ls-art" src="${esc(meta.image)}" alt="">` : "";
          return `
            <div class="ls-result">
              <div class="ls-row">
                ${art}
                <div class="ls-copy">
                  <div class="ls-title">${esc(meta.name)}</div>
                  <div class="ls-meta">${esc(meta.artist)}</div>
                  <div class="ls-actions">
                    <button class="ls-btn" type="button" data-action="vote" data-track-id="${esc(trackId)}">Upvote</button>
                    <button class="ls-btn ls-btn--ghost" type="button" data-action="downvote" data-track-id="${esc(trackId)}">Downvote</button>
                    ${preview}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("");
      }

      async function refreshStatus() {
        const res = await fetch(`${apiBase}/status`, { cache: "no-store" });
        const data = await res.json();
        roomMeta.innerHTML = `Room: <strong>${esc(room)}</strong> · ${data.authed ? "Spotify connected" : "Spotify not connected"}`;
        loginBtn.href = `${apiBase}/login?next=${encodeURIComponent(nextUrl)}`;
        renderNowPlaying(data);
        renderQueue(data);
      }

      searchForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const q = (searchInput.value || "").trim();
        if (!q) return;
        setStatus("Searching…");
        try {
          const res = await fetch(`${apiBase}/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
          const data = await res.json();
          renderSearch(data.results || {});
          setStatus("");
        } catch (err) {
          setStatus(err.message || "Search failed.");
        }
      });

      searchResults.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const trackId = target.getAttribute("data-track-id");
        const action = target.getAttribute("data-action");
        try {
          setStatus(action === "vote" ? "Adding vote…" : "Removing vote…");
          await postJson(`${apiBase}/${action === "vote" ? "vote" : "downvote"}`, { track_id: trackId });
          await refreshStatus();
          setStatus("");
        } catch (err) {
          setStatus(err.message || "Vote failed.");
        }
      });

      startBtn.addEventListener("click", async () => {
        try {
          setStatus("Starting top voted track…");
          const data = await postJson(`${apiBase}/play-first`, {});
          await refreshStatus();
          setStatus(data.message || "Playback started.");
        } catch (err) {
          setStatus(err.message || "Could not start playback.");
        }
      });

      clearBtn.addEventListener("click", async () => {
        try {
          setStatus("Clearing votes…");
          await postJson(`${apiBase}/clear`, {});
          await refreshStatus();
          setStatus("Votes cleared.");
        } catch (err) {
          setStatus(err.message || "Could not clear votes.");
        }
      });

      refreshStatus();
      setInterval(() => { refreshStatus().catch(() => {}); }, 3000);
    })();
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str="Live room",
        cards=_card_html(),
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME,
            "date_key": "live",
            "background": None,
            "header_title_image": None,
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": _extra_css(),
            "extra_js": _extra_js(),
            "extra_head_html": "",
        },
    )
