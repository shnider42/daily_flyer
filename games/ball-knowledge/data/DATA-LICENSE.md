# Ball Knowledge question data

The question bank includes adapted questions from **[Open Trivia DB](https://opentdb.com/)**, created and maintained by PIXELTAIL GAMES LLC and its contributors. Open Trivia DB supplies its API data under **[Creative Commons Attribution–ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)**.

The adapted question bank and original DFE question wording in this directory are distributed under the same CC BY-SA 4.0 license. This statement concerns question data; it does not change the application code's license. The websites linked as factual references keep their own terms. Their pages, images, and articles have not been copied into the bank.

## Changes and provenance

- Source text has HTML entities decoded and Unicode/whitespace normalized.
- The playable bank uses exactly four distinct answer options and removes duplicate canonical prompts.
- Conservative review rules exclude known ambiguities, stale or subjective claims, excessive text, and structurally invalid records. The exclusion log records each decision.
- Provider `easy`, `medium`, and `hard` map to Common, Uncommon, and Obscure. Upper tiers use explicit editorial records; rarity is never assigned randomly.
- `editorial-overrides.json` records 25 individually inspected source questions promoted to Epic. These retain provider provenance and are not represented as independently fact-checked.
- `reviewed-questions.json` contains original questions checked against linked primary or institutional references. Related questions share a `factGroup` so a run can avoid repeated subject matter and answer leakage.
- Launch rarity ratings are editorial estimates for a broad audience. They are not statistical estimates from player performance. “One of one” names the top tier; it does not assert exclusive ownership or unique knowledge.

`manifest.json` records the exact playable count, source retrieval details, file hash, per-tier counts, exclusions, and limitations. Source-community approval is useful provenance, not a guarantee that every answer is correct. Question reports should be reviewed and corrections released with a new bank version.

## Reproduction

Run `python games/ball-knowledge/scripts/build_question_bank.py` from the repository root. This uses only the committed source export and editorial records; it requires no network or API key.

For a new official source export, run `python games/ball-knowledge/scripts/import_opentdb.py`. It follows the provider's documented maximum of 50 questions per request, with a session token and more than five seconds between requests. `--pinned` retrieves the original seed export instead. Review changes and update the bank version before publishing a refreshed bank.

Suggested public credit: **Questions adapted from Open Trivia DB, CC BY-SA 4.0. Additional question wording by DFE, with factual references linked after answers.**
