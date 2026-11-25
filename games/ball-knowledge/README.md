# Ball Knowledge

A Daily Flyer general-trivia game: twelve questions, fifteen seconds per question, and six rarity tiers. The name is a joke; the subjects include history, science, geography, literature, music, film, games, sports, art, and more.

## Play

**Quick play** draws a ranked round across the whole bank. Enter a public nickname, answer one of four choices, and read the answer before moving on. The timer stops during feedback. A correct answer earns the tier's base points plus a speed bonus of up to 25%; an incorrect or late answer earns zero. Points are never deducted.

| Rarity | Base points | Questions per ranked round |
| --- | ---: | ---: |
| Common | 100 | 3 |
| Uncommon | 200 | 3 |
| Obscure | 400 | 2 |
| Epic | 700 | 2 |
| Legendary | 1,200 | 1 |
| One of one | 2,000 | 1 |

The base maximum is 6,300 points and the theoretical maximum with instant answers is 7,875. Every ranked round uses this recipe, so a different draw cannot contain more high-value slots. Individual questions still vary in difficulty. The rounds progress through the tiers, with randomly selected questions and shuffled answer positions. No question repeats in a round; related fact groups and the browser's recent questions are avoided when alternatives remain. Recent-history avoidance is held in server memory.

**Practice** supports any single category or a mixed round. The timer can be turned off. Practice does not post to the shared leaderboard or replace the ranked personal best. Categories with fewer than twelve questions use the available unique questions.

**Leaderboard** shows the top 50 personal bests for the last seven days or all time, within the current question-bank version. Each browser identity has one entry in each view. Ties use correct answers, active answering time, then completion order. Nicknames are not reserved accounts. Clearing storage or using another device creates another identity; this is a casual competition, not an identity-verified tournament.

Touch or click an answer. On a keyboard, **1–4** select answers and **Enter** advances after feedback. Sound is optional and uses small synthesized effects. Switching tabs does not pause a timed question. A refresh can restore the active round while its server session still exists. Server restarts and deployments end unfinished sessions; completed scores remain in the database.

## Question quality and attribution

`data/manifest.json` is the exact inventory and provenance record for the released bank. The main corpus comes from the current official [Open Trivia Database API](https://opentdb.com/api_config.php), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The adapted question data, editorial metadata, and original supplemental questions use that license. Source institutions retain their own rights to referenced pages; the supplemental prompts are original, concise factual questions rather than copied passages.

The reproducible build decodes and normalizes text, excludes true/false questions, removes duplicate prompts and duplicate choices, filters stale or subjective wording, and excludes additional known errors. The manifest records exclusions, hashes, retrieval time, and the exact rarity counts. The raw provider export and exclusion ledger are retained for review.

Provider easy/medium/hard map to Common/Uncommon/Obscure. Epic promotions are explicit editorial overrides with reasons. Legendary and One of One start with a smaller pool of original questions researched against direct institutional references. Rarity describes estimated difficulty; it is not a measured global success rate, nor does One of One literally mean that only one person knows an answer.

The community corpus has not been independently fact-checked item by item. Each answer links to its provider entry or direct reference, and **Something off?** submits a private report attached to the precise question and bank version. Reports do not automatically remove questions. Review reports, verify the fact, update the source/override/exclusion file, rebuild the bank, and rerun the focused checks before publishing. Broadening the high-rarity pool should follow that same evidence-based process.

```sh
python games/ball-knowledge/scripts/build_question_bank.py
npm test --prefix games/ball-knowledge
```

## Run locally

Node.js 22 or later is required. There are no npm dependencies and no build step for the app.

```sh
npm start --prefix games/ball-knowledge
```

The server listens on `0.0.0.0`, using `PORT` or `3000`. The development command accepts `--host` and `--port` for the managed preview service. Local scores and reports are saved under `.local/records.json`, which is ignored by Git. Production never silently falls back to this ephemeral file.

```sh
npm test --prefix games/ball-knowledge
npm run check --prefix games/ball-knowledge
node --check games/ball-knowledge/public/app.js
```

The tests exercise scoring boundaries, late answers, answer redaction, ownership, repeat submissions, retrying a failed save, category practice, duplicate facts, recent-question avoidance, a complete HTTP round, and both storage adapters. Browser checks cover the real play/feedback/result flow, leaderboard, practice, reports, refresh recovery, and narrow layouts. A physical iPhone/Safari test remains separate from desktop responsive checks.

## Hosting and persistent scores

This theme belongs to `shnider42/daily_flyer` on `feat/ball-knowledge`, with its own Render web service. The DFE directory entry is maintained separately on `feat/dfe-directory`.

| Render setting | Value |
| --- | --- |
| Name | `dfe-ball-knowledge` |
| Runtime | Node |
| Branch | `feat/ball-knowledge` |
| Build | `npm test --prefix games/ball-knowledge` |
| Start | `node games/ball-knowledge/server.mjs` |
| Region | Virginia |
| Compute plan | Free |
| Instances | One |
| Health endpoint | `/health` |

Required production environment variables:

- `NODE_ENV=production`
- `BK_STORAGE=supabase`
- `BK_SUPABASE_URL` — the project API URL.
- `BK_SUPABASE_ANON_KEY` — the project's publishable key; this is only used by the server.
- `BK_WRITE_TOKEN` — an independently generated, server-only 256-bit key encoded as 64 hexadecimal characters.
- `BK_TRUST_PROXY=1` — use Render's appended client address for in-memory rate limits.

`database/schema.sql` is the deployed additive baseline. It creates only the `bk_private` schema and three namespaced public RPC wrappers. Store the SHA-256 hash of `BK_WRITE_TOKEN` in `bk_private.server_keys`, under `game-server`; never put the raw value in source, logs, or public assets. Supply the matching raw key through Render's environment settings.

All tables have row-level security and no anonymous table privileges. The public RPC wrappers are security invoker functions. Bounded private functions expose a sanitized leaderboard or authorize score/report writes using the server-only key. The browser cannot supply an authoritative score; the Node server calculates the result from its active questions and clocks. Database checks bound scores to the recipe's maximum, enforce twelve-question ranked runs, and make repeated writes idempotent.

No account, email, raw network address, or tracking pixel is needed. Public records contain the nickname, score, correct-answer count, and completion date. The database's browser identifier is HMAC hashed with the game key. Rate-limit addresses exist only temporarily in server memory. Reports are private and are not posted to the leaderboard.

If the database is unavailable, the app displays that condition. A completed round offers **Retry save** while its server session remains active. The app never claims a failed write was saved. Free hosting may need to wake after inactivity.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Version, bank count, and actual storage health |
| `GET /api/meta` | Categories, rarities, counts, and round rules |
| `POST /api/runs` | Start ranked or practice play |
| `GET /api/runs/:id` | Restore an owned session using a bearer token |
| `POST /api/runs/:id/answer` | Score one answer using the server clock |
| `POST /api/runs/:id/next` | Advance from feedback without resetting an active clock |
| `POST /api/runs/:id/save` | Retry an unsaved completed ranked result |
| `GET /api/leaderboard?period=week` | Last-seven-days personal bests; `all` selects all time |
| `POST /api/reports` | Report an answered question |

The server serves only the `public/` directory. It sends one active question at a time and reveals the answer after submission. Full adapted data is available in the source repository to meet the data license and support review; it is not exposed through a game API. This reduces trivial client-side score manipulation but cannot prevent outside assistance.
