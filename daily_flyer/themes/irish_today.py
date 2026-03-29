from __future__ import annotations


THEME_CONFIG = {
    "page_title": "Irish Today — Learn a little, every day",
    "header_title": "Irish Today ☘️",
    "header_subtitle": "A tiny daily page about Gaeilge, history, and sport.",
    "footer_text": "Built with Python. Add your own facts, dates, and categories—then regenerate daily.",
}


WORDS = [
    {"native_text": "Craic", "pronunciation": "crack", "english": "Fun / good times / banter"},
    {"native_text": "Sláinte", "pronunciation": "slawn-cha", "english": "Health! (Cheers)"},
    {"native_text": "Fáilte", "pronunciation": "fawl-cha", "english": "Welcome"},
    {"native_text": "Go raibh maith agat", "pronunciation": "guh rev mah ah-gut", "english": "Thank you"},
    {"native_text": "Tá sé go hálainn", "pronunciation": "taw shay guh haw-linn", "english": "It’s beautiful"},
    {"native_text": "Maidin mhaith", "pronunciation": "ma-jin wah", "english": "Good morning"},
    {"native_text": "Oíche mhaith", "pronunciation": "ee-hah wah", "english": "Good night"},
    {"native_text": "Gaeilge", "pronunciation": "gwayl-geh", "english": "Irish (language)"},
    {"native_text": "Le do thoil", "pronunciation": "leh duh hull", "english": "Please"},
    {"native_text": "Dia dhuit", "pronunciation": "dee-ah gwit", "english": "Hello"},
]


PHRASES = [
    {"native_text": "Cad é mar atá tú?", "pronunciation": "cod ay mar a-taw too?", "english": "How are you?"},
    {"native_text": "Tá ocras orm.", "pronunciation": "taw uk-rus ur-im", "english": "I’m hungry."},
    {"native_text": "An féidir leat cabhrú liom?", "pronunciation": "on fay-der lat cow-roo lum?", "english": "Can you help me?"},
    {"native_text": "Ádh mór!", "pronunciation": "aww more", "english": "Good luck!"},
    {"native_text": "Go n-éirí an bóthar leat.", "pronunciation": "guh ny-ree on boh-her lat", "english": "May the road rise to meet you."},
    {"native_text": "Seo é!", "pronunciation": "shuh ay", "english": "Here it is! / That’s it!"},
]


HISTORY_BY_DATE = {
    "01-21": "1919 — Dáil Éireann first convened in Dublin, proclaiming Irish independence.",
    "04-24": "1916 — The Easter Rising began in Dublin.",
    "12-06": "1922 — The Irish Free State officially came into existence.",
    "10-08": "2005 — Cork completed a famous All-Ireland ladies football three-in-a-row.",
}


HISTORY_GENERAL = [
    "Newgrange predates Stonehenge and the Egyptian pyramids by centuries.",
    "Ogham is an early medieval alphabet used primarily to write the early Irish language.",
    "The Book of Kells is a lavishly illuminated Gospel book created by Celtic monks around 800 AD.",
    "The Great Famine drastically reduced Ireland’s population through death and emigration.",
    "The GAA, founded in 1884, helped revive Irish sports and culture, including hurling and Gaelic football.",
]


SPORTS_SPOTLIGHT = [
    "Hurling is often called the fastest field sport in the world.",
    "Gaelic football blends kick-passing and hand-passing in a unique way.",
    "Ireland’s rugby team won multiple Six Nations titles in the 21st century, including Grand Slams.",
    "Shamrock Rovers are among the most successful clubs in Irish football.",
    "Camogie is the women’s variant of hurling and is equally skillful and fierce.",
]


TRIVIA = [
    "The Irish flag’s green, white, and orange symbolize tradition, peace, and community identity.",
    "There are Gaeltacht regions where Irish remains the community’s everyday language.",
    "Halloween has roots in the Celtic festival Samhain.",
    "The Wild Atlantic Way is one of the world’s longest defined coastal routes.",
    "Irish harps appear on Irish coinage and the state seal.",
]


BACKGROUND_CADENCE = "daily"

BACKGROUNDS = [
    {
        "path": "daily_flyer/themes/irish_celtic_knot_background.jpg",
        "label": "Irish Celtic Knot Background",
    },
    {
        "path": "daily_flyer/themes/irish_historic_map_background.jpg",
        "label": "Irish Historic Map Background",
    },
    {
        "path": "daily_flyer/themes/irish_misty_hills_background.jpg",
        "label": "Irish Misty Hills Background",
    },
]