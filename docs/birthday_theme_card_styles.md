# Birthday Theme Card Style Notes

This branch customizes the birthday theme at the theme-wrapper level in:

```text
 daily_flyer/themes/this_day_birthday_history_enhanced.py
```

The birthday theme currently uses `metadata["extra_css"]` to override the shared Daily Flyer card grid and card styling without changing the platform renderer.

## Card sizing

Card widths are controlled by CSS classes generated from the card type:

```css
.card--birthday_calendar { grid-column: span 5; }
.card--mom_daily { grid-column: span 7; }
.card--birthday_phone_helper { grid-column: span 4; }
.card--birthday_spotlight { grid-column: span 8; }
.card--this_day_history { grid-column: span 6; }
```

The page grid has 12 columns on desktop, so `span 6` is half width, `span 4` is one third, and `span 12` is full width.

The birthday theme also widens the page shell with:

```css
:root { --max-width: min(1520px, calc(100vw - 44px)); }
```

That is why the birthday page uses more desktop browser width than the original Irish Today layout.

## Card accent gradients

Each card can define two accent colors:

```css
--card-accent-a: rgba(255, 214, 116, .70);
--card-accent-b: rgba(255, 140, 176, .46);
```

Those variables feed both the top accent line and the soft border gradient:

```css
.card::after { background: linear-gradient(90deg, var(--card-accent-a), var(--card-accent-b)); }
```

## Card shapes

Cards can also define four radius variables:

```css
--card-radius-a: 34px;
--card-radius-b: 18px;
--card-radius-c: 30px;
--card-radius-d: 26px;
```

Those map to the four card corners:

```css
border-radius: var(--card-radius-a) var(--card-radius-b) var(--card-radius-c) var(--card-radius-d);
```

This gives each card family a little personality without making every card look completely different.

## Showcase card styles in this branch

The top three cards are intentionally exaggerated a bit to show what Daily Flyer cards could become:

### Birthday Calendar: date-console / dashboard

```css
.card--birthday_calendar { ... }
.card--birthday_calendar .birthday-calendar-wrap { ... }
.card--birthday_calendar .birthday-day { ... }
```

This style uses a glowing grid panel, stronger date-cell treatment, and a more dashboard-like container.

### Mom Daily Draft: warm message composer / notepad

```css
.card--mom_daily { ... }
.card--mom_daily .mom-daily-frame { ... }
.card--mom_daily .birthday-textarea--large { ... }
```

This style treats the card like a family-note composer, with a notepad texture, warm border, and a left accent rail.

### Phone List Helper: outreach control panel

```css
.card--birthday_phone_helper { ... }
.card--birthday_phone_helper .birthday-helper-panel { ... }
.card--birthday_phone_helper .birthday-textarea { ... }
```

This style feels more like a utility panel: angular corners, cool blue accents, monospaced number field, and button emphasis.

The cards below those stay closer to the common card system on purpose, so the contrast is visible without the entire page becoming visually noisy.

## Fact subcards and sources

The category cards keep stable titles such as `This Day in History`, `Famous Birthdays`, and `Fun Fact`.

Individual facts are rendered inside those cards as subcards. Each fact source is rendered as its own clickable link:

```html
<a target="_blank" rel="noopener noreferrer">Source: Example Source</a>
```

This avoids the problem where the card-level `Read more` link only points to the first/lead fact.

## Recommended next platform-wide cleanup

This theme-level CSS should eventually become a shared Daily Flyer card-style system, probably with a theme config shape like:

```python
CARD_STYLE_OVERRIDES = {
    "mom_daily": {
        "span": 7,
        "accent_a": "rgba(...)" ,
        "accent_b": "rgba(...)" ,
        "radius": "22px 38px 24px 34px",
    }
}
```

That would move layout/style intent out of long raw CSS strings and into reusable theme metadata.
