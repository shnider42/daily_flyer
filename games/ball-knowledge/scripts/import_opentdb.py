#!/usr/bin/env python3
"""Refresh the saved Open Trivia DB source export, then run build_question_bank.py.

By default this retrieves a fresh official export with the documented session token
and >5-second request interval. --pinned retrieves the exact original seed snapshot.
Neither path changes the editorial overrides or reviewed original questions.
Release maintainers must bump VERSION in build_question_bank.py for an update after
publication, so ranked scores from different banks stay separate.
"""
import argparse
import base64
import datetime
import hashlib
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

DATA = Path(__file__).resolve().parents[1] / "data"
BASE = "https://opentdb.com/"
PINNED = "https://raw.githubusercontent.com/leakyhose/open-trivia-script-data/38418f1cb28717abcfec59808687d568c0999606/data/all_questions.json"

def get(url):
    with urllib.request.urlopen(url, timeout=35) as response:
        return json.load(response)

def download(pinned=False):
    if pinned:
        questions = get(PINNED)
        details = {"snapshot_url": PINNED, "snapshot_date": "2025-12-25"}
    else:
        expected = get(BASE + "api_count_global.php")["overall"]["total_num_of_verified_questions"]
        time.sleep(5.5)
        token = get(BASE + "api_token.php?command=request")["token"]
        questions, retries = [], 0
        while len(questions) < expected:
            time.sleep(5.5)
            amount = min(50, expected - len(questions))
            params = urllib.parse.urlencode({"amount": amount, "token": token, "encode": "base64"})
            try:
                packet = get(BASE + "api.php?" + params)
                if packet["response_code"] == 5:
                    retries += 1
                    if retries > 5:
                        raise RuntimeError("Repeated provider rate limits; no saved source was replaced.")
                    continue
                if packet["response_code"] != 0:
                    raise RuntimeError(f"Provider code {packet['response_code']}; source export left unchanged.")
                for row in packet["results"]:
                    questions.append({key: [base64.b64decode(x).decode() for x in value] if isinstance(value, list) else base64.b64decode(value).decode() for key, value in row.items()})
                retries = 0
                print(f"Retrieved {len(questions)}/{expected}", flush=True)
            except (OSError, ValueError) as error:
                retries += 1
                if retries > 5:
                    raise RuntimeError("Download incomplete; saved source was not replaced.") from error
        details = {"expected": expected, "complete": len(questions) == expected, "api_encoding": "base64 decoded to UTF-8"}
    assert questions and all("question" in q for q in questions)
    payload = json.dumps(questions, ensure_ascii=False, indent=2) + "\n"
    meta = {
        "source": "Open Trivia DB", "source_url": BASE,
        "api_documentation": BASE + "api_config.php",
        "license": "CC BY-SA 4.0", "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "count": len(questions), "sha256": hashlib.sha256(payload.encode()).hexdigest(),
        **details,
    }
    temporary = DATA / "source-opentdb.new.json"
    temporary.write_text(payload)
    temporary.replace(DATA / "source-opentdb.json")
    (DATA / "source-opentdb.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"Saved {len(questions)} source questions. Run scripts/build_question_bank.py to rebuild.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pinned", action="store_true", help="Use the original pinned 2025-12-25 community export.")
    download(parser.parse_args().pinned)
