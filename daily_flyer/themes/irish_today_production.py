from daily_flyer.irish_edition.edition import edition_date, make_edition
from daily_flyer.models import CardItem, PageContext

THEME_NAME = "irish_today_production"
THEME_CONFIG = {
    "page_title": "Irish Today | The daily edition",
    "header_title": "Irish Today",
    "header_subtitle": "A daily journal of Irish life and culture",
    "footer_text": "Davy Holden History · Built by Holtsnider Tech",
}


def build_theme_page(date_str=None, seed=None):
    day = edition_date(date_str)
    edition = make_edition(day, seed)
    cards = [CardItem(card_type=role, eyebrow=role.title(), title=section["title"],
                      body=section["body"], source_url=(section.get("source") or {}).get("url"))
             for role, section in edition["sections"].items()]
    return PageContext(**THEME_CONFIG, today_str=day.isoformat(), cards=cards,
                       metadata={"theme_name": THEME_NAME, "irish_edition": edition})
