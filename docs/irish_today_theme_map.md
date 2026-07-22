# Irish Today theme map

Irish Today has one public production route and one experimental visual lab.

## Canonical branch

Use `staging` as the base for new Irish Today work.

- `master` is an older production checkpoint.
- `feat/it_improve`, `exp/visual`, and `int/stage` are historical development or integration branches.
- New work should branch from `staging` and return through a pull request to `staging`.

Recommended branch format:

```text
feat/irish-today-<increment>
```

## Public production path

```text
web.py: irish_today
  -> irish_today_production
    -> irish_today_improved_layout
      -> irish_today_improved
        -> irish_today_plus
          -> irish_today
```

Responsibilities:

- `irish_today.py`: core Irish language and culture data plus the title-image configuration.
- `irish_today_plus.py`: provider-backed county, Davy Holden, visual, history, sport, and connection cards.
- `irish_today_improved.py`: the eight-card daily composition contract.
- `irish_today_improved_layout.py`: established hero, masonry, and card-specific layout behavior.
- `irish_today_production.py`: the permanent public presentation contract. It standardizes readability, card families, and motion without importing the visual-lab control stack.

The public aliases `irish_today`, `irish_today_improved`, and `irish_today_improved_layout` all resolve to `irish_today_production` at the web boundary. Internal imports can still use the lower layers directly.

## Daily content contract

Irish Today renders exactly eight cards.

Required daily anchors:

1. `word`
2. `county`
3. `did_you_know`
4. `news`
5. `visual_layer`
6. `hurling_game`

The remaining two positions rotate from the eligible culture, history, language, sport, and interactive pools. A fixed date and seed must produce stable card selection and ordering.

## Production card families

The production clarity layer groups cards by purpose instead of styling arbitrary card positions.

### Editorial / reference

Language, facts, Davy Holden features, history, sport, Irish connections, and phrases.

### Photography / feature

County of the Week and the visual-layer photo card.

### Interactive / game

Trivia, timeline sorting, Gaeilge quizzes, phrase building, county clues, memory matching, and hurling.

Production cards are fully readable before interaction. Hover adds one small lift and stronger border/shadow treatment. Card entrance uses one vertical motion pattern. Reduced-motion preferences disable both.

## Visual lab

The visual lab remains available through:

```text
?theme=irish_today_visual_lab
```

Its wrapper chain contains style presets, modular card assignments, menus, motion trials, stability overrides, and debugging controls. It is a sandbox and must not become the public route wholesale.

Promote lab ideas individually:

1. Identify one visual behavior worth keeping.
2. Reimplement it in `irish_today_production.py` using production card families.
3. Add a focused test for the behavior or contract.
4. Review desktop, mobile, keyboard, and reduced-motion behavior.
5. Merge through `staging`.

Do not create a new public Irish Today variant for each experiment.

## Increment checklist

Before opening an Irish Today pull request:

- Branch from `staging`.
- Keep the eight-card anchor contract intact.
- Confirm the title image still renders.
- Confirm the production route does not include visual-lab controls.
- Check a fixed date and seed twice for deterministic ordering.
- Verify desktop and mobile layouts.
- Verify keyboard focus and reduced-motion behavior.
- Keep the visual lab independently reachable.
