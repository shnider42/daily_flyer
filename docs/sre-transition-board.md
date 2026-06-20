# SRE Transition Board

`staging` is the source of truth for Daily Flyer work related to this board. New feature branches should start from `staging`, not `master`.

Current implementation branch: `feat/sre-scrum-board`.

## Purpose

This board turns the 60-day SRE transition plan into a concrete Daily Flyer workflow. It tracks positioning, one polished SRE lab, observability proof, targeted applications, interview prep, and only the board improvements needed to support that work.

## Epics

- Positioning
- SRE Lab
- Observability
- Applications
- Interview Prep
- Board Improvements

## Done rule

A card is only done when evidence exists: committed code, a real application tracker entry, a resume/profile update, or a written runbook/postmortem.

## WIP rule

Default WIP limit is 3. If more than three cards are in progress, the board warns the user to finish or move something back before starting more.

## Improvements included

- configurable epics instead of hardcoded career/personal
- SRE-specific seeded stories
- priority, due target, and acceptance criteria fields
- WIP limit warning
- JSON export/import
- server-side state normalization/validation
