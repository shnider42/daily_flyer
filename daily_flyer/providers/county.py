from __future__ import annotations

import random
from typing import Optional


COUNTIES = [
    # Leinster (12)
    {"name": "County Carlow", "summary": "A small inland county known for agriculture, the River Barrow, and a quiet rural character."},
    {"name": "County Dublin", "summary": "Home to Ireland’s capital city, Dublin, and the economic and cultural hub of the country."},
    {"name": "County Kildare", "summary": "Known for horse racing, the Curragh plains, and strong ties to Ireland’s equestrian heritage."},
    {
        "name": "County Kilkenny",
        "summary": "Famous for its medieval city, Kilkenny Castle, and dominance in hurling.",
        "image_url": "daily_flyer/themes/counties/kilkenny.jpg",
    },
    {"name": "County Laois", "summary": "A central county with rich farmland and the Slieve Bloom Mountains."},
    {"name": "County Longford", "summary": "A quiet county known for lakes, waterways, and a strong rural identity."},
    {"name": "County Louth", "summary": "Ireland’s smallest county, rich in early Christian history and close to the border."},
    {
        "name": "County Meath",
        "summary": "The historic seat of the High Kings of Ireland, home to Newgrange and the Boyne Valley.",
        "image_url": "daily_flyer/themes/counties/meath.jpg",
    },
    {"name": "County Offaly", "summary": "Known for peat bogs, Birr Castle, and Ireland’s geographic center."},
    {"name": "County Westmeath", "summary": "A lakeside county known for Athlone and access to the River Shannon."},
    {"name": "County Wexford", "summary": "A coastal county with strong ties to the 1798 Rebellion and maritime history."},
    {"name": "County Wicklow", "summary": "Known as the “Garden of Ireland,” famous for mountains, valleys, and scenic landscapes."},

    # Munster (6)
    {"name": "County Clare", "summary": "Home to the Cliffs of Moher and a global center for traditional Irish music."},
    {"name": "County Cork", "summary": "Ireland’s largest county, known for food culture, coastline, and strong local identity."},
    {"name": "County Kerry", "summary": "Famous for the Ring of Kerry, Killarney National Park, and dramatic scenery."},
    {"name": "County Limerick", "summary": "A mix of city and countryside, with a strong sporting and medieval heritage."},
    {"name": "County Tipperary", "summary": "An inland county known for hurling, farmland, and the Rock of Cashel."},
    {"name": "County Waterford", "summary": "Ireland’s oldest city, known for Viking history and Waterford Crystal."},

    # Connacht (5)
    {"name": "County Galway", "summary": "Known for Galway City, Connemara, and strong Irish-language traditions."},
    {"name": "County Leitrim", "summary": "Ireland’s least populated county, known for lakes, rivers, and quiet landscapes."},
    {"name": "County Mayo", "summary": "Known for Croagh Patrick, Achill Island, and a deep sporting culture."},
    {"name": "County Roscommon", "summary": "A rural county known for farmland, lakes, and historic sites."},
    {"name": "County Sligo", "summary": "Known for Benbulben, coastal scenery, and connections to poet W.B. Yeats."},

    # Ulster (9)
    {"name": "County Cavan", "summary": "Known for its many lakes and borderland geography."},
    {"name": "County Donegal", "summary": "A rugged coastal county with strong Gaeltacht regions and distinct identity."},
    {"name": "County Monaghan", "summary": "A border county known for rolling hills and agricultural traditions."},
    {"name": "County Antrim", "summary": "Home to Belfast and the Giant’s Causeway, a UNESCO World Heritage site."},
    {"name": "County Armagh", "summary": "Known as the ecclesiastical capital of Ireland and famous for apples."},
    {"name": "County Down", "summary": "Known for the Mourne Mountains and coastal scenery."},
    {"name": "County Fermanagh", "summary": "Famous for its lakes, especially Lough Erne."},
    {"name": "County Londonderry", "summary": "Home to the historic walled city of Derry."},
    {"name": "County Tyrone", "summary": "A large inland county with strong cultural and sporting traditions."},
]


def fetch_county_of_the_day(today) -> dict[str, Optional[str]]:
    index = today.toordinal() % len(COUNTIES)
    county = COUNTIES[index]
    return {
        "title": county["name"],
        "body": county["summary"],
        "source_url": None,
        "image_url": county.get("image_url"),
    }