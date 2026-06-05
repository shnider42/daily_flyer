from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_visual_lab_stability as base_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


DEBUG_SAFE_HEAD = r"""
<script>
(function () {
    // Debug safety shim: selecting custom_cards previously risked a MutationObserver
    // feedback loop because the debug layer repeatedly wrote the same
    // data-visual-lab-style value it was observing. No-op same-value writes for this
    // one attribute before the heavier footer scripts run.
    if (window.__dailyFlyerVisualLabSafeSetAttribute) return;
    window.__dailyFlyerVisualLabSafeSetAttribute = true;
    var originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
        if (name === "data-visual-lab-style" && this.getAttribute && this.getAttribute(name) === String(value)) {
            return;
        }
        return originalSetAttribute.call(this, name, value);
    };
})();
</script>
"""


DEBUG_SAFE_JS = r"""
(function () {
    function isCustomCards() {
        var params = new URLSearchParams(window.location.search || "");
        return (params.get("style") || "").toLowerCase() === "custom_cards";
    }

    function requestCustomCardsPanel() {
        if (!isCustomCards()) return;
        document.documentElement.setAttribute("data-visual-lab-style", "custom_cards");
        if (document.body) document.body.setAttribute("data-visual-lab-style", "custom_cards");
        window.dispatchEvent(new Event("popstate"));
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            window.setTimeout(requestCustomCardsPanel, 0);
            window.setTimeout(requestCustomCardsPanel, 160);
        });
    } else {
        window.setTimeout(requestCustomCardsPanel, 0);
        window.setTimeout(requestCustomCardsPanel, 160);
    }
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)

    previous_head = context.metadata.get("extra_head_html", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""
    context.metadata.update(
        {
            "theme_name": "irish_today_visual_lab_debug_safe",
            "extra_head_html": previous_head + DEBUG_SAFE_HEAD,
            "extra_js": previous_js + DEBUG_SAFE_JS,
        }
    )
    return context
