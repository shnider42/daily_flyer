from datetime import date, datetime, timedelta, timezone
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

from daily_flyer.irish_edition.edition import DUBLIN, ROOT, ROLES, content, county_atlas, make_edition, render_edition
from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import build_html
from daily_flyer.themes.irish_today import THEME_CONFIG as ORIGINAL_THEME
from web import app


class IrishTodayProductionTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.day = date(2026, 11, 6)

    def test_aliases_deliver_same_eight_sections_as_engine_and_api(self):
        context = build_daily_page("irish_today_production", self.day.isoformat(), 7)
        self.assertEqual(tuple(card.card_type for card in context.cards), ROLES)
        html = build_html(context)
        for alias in ("irish_today", "irish-today-improved", "irish_today_improved_layout", "irish_today_production"):
            with self.subTest(alias=alias):
                r = self.client.get("/", query_string=dict(theme=alias, date=self.day.isoformat(), seed=7))
                self.assertEqual(r.status_code, 200)
                self.assertEqual(r.get_data(as_text=True), html)
        response = self.client.get("/api/irish-today/edition?date=2026-11-06&seed=7")
        self.assertEqual(response.json, context.metadata["irish_edition"])
        page = BeautifulSoup(html, "html.parser")
        self.assertEqual(tuple(el["data-role"] for el in page.select("[data-role]")), ROLES)
        self.assertIsNotNone(page.select_one('img[alt="Irish Today"]'))
        self.assertIsNone(page.select_one(".it-visual-lab-controls"))
        self.assertIsNotNone(page.select_one("#quiz-fallback summary"))
        self.assertIsNotNone(page.select_one("#archive form input[name=date]"))

    def test_night_first_paint_and_original_masthead(self):
        page = BeautifulSoup(self.client.get("/?theme=irish_today").data, "html.parser")
        self.assertEqual(page.html["data-theme"], "night")
        self.assertEqual(page.select_one("header h1 img")["src"], ORIGINAL_THEME["header_title_image"])
        self.assertLess(str(page).index("<h1>"), str(page).index("<nav "))
        self.assertEqual(page.select_one("#appearance")["aria-pressed"], "true")
        with self.client.get("/" + ORIGINAL_THEME["header_title_image"]) as response:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.mimetype, "image/png")

    def test_optional_sections_mount_navigation_and_interactions_independently(self):
        for role, active, absent in (("county", "#atlas-data", "#challenge-data"),
                                     ("challenge", "#challenge-data", "#atlas-data")):
            with self.subTest(role=role):
                edition = make_edition(self.day)
                edition["sections"] = {key: edition["sections"][key] for key in ("feature", role)}
                page = BeautifulSoup(render_edition(edition), "html.parser")
                self.assertEqual([el["data-role"] for el in page.select("[data-role]")], ["feature", role])
                self.assertIsNotNone(page.select_one(active))
                self.assertIsNone(page.select_one(absent))
                self.assertIsNotNone(page.select_one("#appearance"))
                links = page.select("nav a")
                self.assertEqual(len(links), 2)
                for link in links:
                    self.assertIsNotNone(page.select_one(link["href"]))

    def test_determinism_and_full_county_cycle(self):
        monday = date(2026, 12, 28)
        counties = set()
        for week in range(32):
            first_day = monday + timedelta(weeks=week)
            first = make_edition(first_day, 12)
            last = make_edition(first_day + timedelta(days=6), 12)
            self.assertEqual(first, make_edition(first_day, 12))
            self.assertEqual(first["sections"]["county"], last["sections"]["county"])
            self.assertEqual(first["sections"]["sport"], last["sections"]["sport"])
            counties.add(first["sections"]["county"]["slug"])
        self.assertEqual(len(counties), 32)

    def test_independent_role_selection(self):
        before = make_edition(self.day, 10)["sections"]
        library = {**content(), "curiosity": [dict(content()["curiosity"][0], title="Test replacement")]}
        with patch("daily_flyer.irish_edition.edition.content", return_value=library):
            after = make_edition(self.day, 10)["sections"]
        self.assertEqual([key for key in before if before[key] != after[key]], ["curiosity"])

    def test_edited_features_and_anniversaries(self):
        self.assertEqual(make_edition(self.day)["sections"]["feature"]["photo"]["id"], "kilkenny")
        for year in (2024, 2026):
            april = make_edition(date(year, 4, 24))["sections"]
            self.assertEqual(april["feature"]["photo"]["id"], "rising")
            self.assertTrue(april["discovery"]["anniversary"])
        self.assertFalse(make_edition(self.day)["sections"]["discovery"]["anniversary"])

    def test_saturday_and_weekday_challenges_have_an_untimed_answer(self):
        for index in range(7):
            day = self.day + timedelta(days=index)
            c = make_edition(day)["sections"]["challenge"]
            self.assertEqual(c["mode"] == "hurling", day.weekday() == 5)
            self.assertEqual(len(set(c["choices"])), 4)
            self.assertIn(c["answer"], range(4))
            self.assertIn(day.isoformat(), c["key"])

    def test_assets_exist_and_photos_have_sources(self):
        assets = ROOT / "assets"
        for photo in content()["photos"]:
            self.assertTrue(photo["source"].startswith("https://"))
            for size in (640, 1200):
                self.assertTrue((assets / f"{photo['id']}-{size}.webp").is_file())
        for county in county_atlas():
            self.assertTrue((assets / "counties" / (county["slug"] + ".webp")).is_file())
        for name in ("edition.css", "edition.js", "cormorant.woff2"):
            with self.client.get("/daily_flyer/irish_edition/assets/" + name) as response:
                self.assertEqual(response.status_code, 200)

    def test_etag_and_invalid_requests(self):
        for path in ("/", "/api/irish-today/edition"):
            url = path + "?date=2026-11-06"
            response = self.client.get(url)
            etag = response.headers["ETag"]
            self.assertTrue(response.cache_control.public)
            self.assertEqual(self.client.get(url, headers={"If-None-Match": etag}).status_code, 304)
            for query in ("?date=not-a-date", "?date=2025-02-29", "?seed=bad"):
                error = self.client.get(path + query)
                self.assertEqual(error.status_code, 400)
                if path.startswith("/api/"):
                    self.assertIn("error", error.json)

    def test_default_rollover_in_dublin_and_cache_expiry(self):
        # In July the edition changes an hour before midnight UTC.
        for utc, expected, ttl in ((datetime(2026, 7, 1, 22, 59, 58, tzinfo=timezone.utc), "2026-07-01", 2),
                                   (datetime(2026, 7, 1, 23, 0, 1, tzinfo=timezone.utc), "2026-07-02", 300)):
            with patch("daily_flyer.irish_edition.http.datetime", wraps=datetime) as clock:
                clock.now.return_value = utc.astimezone(DUBLIN)
                r = self.client.get("/api/irish-today/edition")
                self.assertEqual(r.json["date"], expected)
                self.assertEqual(r.cache_control.max_age, ttl)

    def test_leap_day_year_boundary_and_seeded_archive_links(self):
        for value in ("0001-01-01", "2024-02-29", "2026-12-31", "9999-12-31"):
            r = self.client.get("/?theme=irish_today&date=" + value + "&seed=0")
            self.assertEqual(r.status_code, 200)
            soup = BeautifulSoup(r.data, "html.parser")
            self.assertEqual(soup.select_one("input[name=seed]")["value"], "0")
            for a in soup.select(".daylinks a"):
                self.assertIn("seed=0", a["href"])
