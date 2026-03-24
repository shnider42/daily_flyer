from __future__ import annotations

from bs4 import BeautifulSoup


def html_soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def first_sentence(text: str) -> str:
    if not text:
        return ""
    parts = text.split(". ")
    sentence = parts[0].strip()
    if sentence and not sentence.endswith("."):
        sentence += "."
    return sentence