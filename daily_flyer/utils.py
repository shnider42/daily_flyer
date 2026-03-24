from __future__ import annotations

import argparse
import datetime as dt
from typing import Optional

import requests

from daily_flyer import config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a modular Daily Flyer HTML page.")
    parser.add_argument(
        "--theme",
        default=config.DEFAULT_THEME,
        help=f"Theme name (default: {config.DEFAULT_THEME})",
    )
    parser.add_argument(
        "--outfile",
        default=config.DEFAULT_OUTFILE,
        help=f"Output HTML file (default: {config.DEFAULT_OUTFILE})",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional random seed for repeatable output",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="Optional date override in YYYY-MM-DD format",
    )
    return parser.parse_args()


def resolve_date(date_str: Optional[str]) -> dt.date:
    if date_str:
        return dt.date.fromisoformat(date_str)
    return dt.date.today()


def safe_get(url: str, *, timeout: int = config.DEFAULT_TIMEOUT_SECONDS, headers: Optional[dict] = None) -> requests.Response:
    merged_headers = {
        "User-Agent": config.USER_AGENT,
        "Accept": "application/json, text/html;q=0.9,*/*;q=0.8",
    }
    if headers:
        merged_headers.update(headers)

    response = requests.get(url, timeout=timeout, headers=merged_headers)
    response.raise_for_status()
    return response