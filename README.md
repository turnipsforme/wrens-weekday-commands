# Weekday Commands

Jump to any upcoming weekday or choose a date without leaving the command palette. Weekday Commands opens the matching daily note and creates it from your Daily Notes template when it does not exist yet.

## Commands

- **Go to daily note by date** opens a focused date picker. It accepts calendar dates, natural-language dates when Natural Language Dates is installed, and shortcuts to your three most recently edited daily notes.
- **Go to next Sunday** through **Go to next Saturday** opens the next occurrence of that weekday.

Plain weekday entries such as `Friday` always mean the upcoming occurrence. Today, yesterday, and tomorrow are left out of the recent-note shortcuts.

## Settings

- **Integrate with Journal View** (off by default): sends every Weekday Commands navigation to Journal View, using its normal nearby animation or distant snap. Notes are still created when missing.
- **Daily notes folder**: optionally overrides the Daily Notes plugin folder for Weekday Commands.

## Requirements

Enable Obsidian's built-in Daily Notes plugin and configure your preferred date format. Natural Language Dates and Journal View are optional integrations.

## Privacy

Weekday Commands works locally in your vault. It does not use network services or collect telemetry.
