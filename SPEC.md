# Workouts — functional specification

This document describes *what the app does*: its features, behavior, and data semantics. For architecture, coding rules, and testing, read `CLAUDE.md`. Importable sample data lives in [`examples/`](examples/).

## Overview

Workouts is a mobile-first personal health companion built around three daily pillars — **Move**, **Meals**, and **Mind**. It combines a recurring weekly plan, a daily log with an orange-zone minute goal, symptom/health-check logging with tags, a 7-day trends view, and a full workout builder with a guided player and Garmin `.fit` export. Data lives locally by default and can optionally sync to Google Drive. There are five tabs: Today, Plan, Health check, Trends, and Workouts.

## Core concepts

**Plan items.** Everything you plan or log in a day is an item with a `type` of `move` (exercise), `meal` (food), or `mind` (breathing, meditation, mental health), plus a `title` and optional `detail`. Move items can additionally reference a built workout via `workoutId`, which links the Today tab to the workout player.

**Template vs. week overrides.** The recurring weekly plan (`template`) is keyed by weekday (0=Sun…6=Sat) and applies every week. Any specific week can be customized: editing a specific week deep-copies the template into `weekPlans` keyed by that week's Monday, and further edits apply only to that week. The Plan tab switches between "Every week" and "Specific week" modes.

**Materialization.** The first time a date is viewed or logged, its items are copied from the plan (week override if present, else template) into `days[YYYY-MM-DD]`. From then on the day is an independent snapshot — later plan edits don't rewrite history. Each day also stores `orange` (orange-zone minutes) and `gut` (health-check entries).

**Statuses.** A day item is `planned`, `done`, `swapped` (did something else — the replacement text is stored in `actual`), or `skipped`. Custom items added directly on Today start as `done` (quick retro-logging), except workouts, which start `planned`.

**Orange minutes.** Each day accumulates "orange-zone" minutes (moderate-to-hard effort time) logged manually in increments. A weekly goal (`goal`, default 45) is tracked against the *current* calendar week (Mon–Sun).

## Today tab

Shows the selected date's items grouped by Move / Meals / Mind, the orange-minute counter, and a calendar picker (dots mark days with any activity). Tapping an item opens an action sheet: mark done, log a swap ("did something else" with free text), skip, or reset to planned. A "+" flow adds a custom one-off item to today, a picked date, or the plan. Move items linked to a workout offer "Start workout" (opens the player) and FIT export.

## Meal planning (detailed)

Meals are first-class plan items, not an afterthought:

**Planning.** Meals are added like any plan item with type `meal` — typically one item per eating occasion (Breakfast, Lunch, Snack, Dinner), with the menu in `detail` (e.g. "Quinoa bowl · firm tofu · carrots · zucchini · tahini"). Because meals usually repeat daily, they belong in the weekly template on all seven days; week overrides let you plan a specific week's menu differently without touching the recurring one. The Plan tab groups meals in their own "Meals" section per day.

**Logging.** On Today, each meal is checked off like any item. "Did something else" records what was actually eaten in `actual` and marks the meal `swapped` — the planned title stays visible with the substitution beneath it.

**Health-check integration.** Marking a meal done (or swapped) triggers an optional "How did it sit?" prompt — Fine / Meh / Sick. Answering Meh or Sick immediately creates a health-check entry timestamped now, with severity 2 (Mild) or 4 (Bad) and the `food` field pre-filled from what was actually eaten (the `actual` text if swapped, else the planned title). This is the primary pipeline for correlating food with symptoms; entries can then be enriched with tags and notes on the Health check tab.

**Trends.** Meal completion counts toward the "plan completed" percentage, and food logged via meals appears in per-day trend detail alongside symptoms, supporting food–symptom pattern spotting over the 7-day window.

## Health check tab

Log how you feel at any time of day: a severity on a five-point scale (Excellent, Fine, Mild, Rough, Bad), optional free-form tags (user-defined, e.g. "Headache", "Poor sleep"), a note, and a food field. Entries are timestamped and editable; long-press enters bulk-edit for deleting entries or tags. A calendar picker allows logging against past dates.

## Trends tab

A 7-day window (ending today, or a picked date) with three headline stats — orange minutes this week, percent of planned items completed, and "good days" (days whose average health rating stayed below Rough). Below, a bar per day shows orange minutes with a colored dot for the day's average health rating (green→red). Tapping a bar reveals that day's logged items, orange minutes, and health entries, with a shortcut to the Health check tab for that date.

## Workouts (detailed)

**Library.** Exercises come from a built-in library (`EXLIB`) organized by category (squats, lunges, hinge, push, pull, shoulders, arms, core, cardio, yoga, pilates, mobility). Each library entry may map to an official Garmin Connect exercise (media — photos/video — is fetched live from Garmin) and to a numeric FIT id pair for export. Public-domain photos and step-by-step descriptions come from free-exercise-db, with NYT 7-minute-workout moves carrying custom descriptions. Users can define custom exercises (name + category); these work everywhere but export as text-only FIT steps and show no Garmin media.

**Builder.** Workouts are ordered lists of exercises, optionally organized into collapsible folders. Each exercise has a mode — `reps` (sets × reps) or `time` (sets × seconds) — plus per-exercise rest seconds and an optional weight. Rows are drag-reorderable. Default rest and superset rest are configurable in Settings.

**Supersets.** Adjacent exercises can be linked into a superset (shared `grp` id). Linked exercises alternate set-by-set (A1 B1 A2 B2 …) with the shorter superset rest between them. One expansion function flattens a workout into its step sequence, so the player and FIT export always agree.

**Player.** A guided, full-screen player runs the expanded step sequence with a countdown timer per timed step, rest steps, exercise media/description, and next-up preview. Keyboard shortcuts (Space pause/resume, arrows to skip) work on desktop but never hijack typing in inputs. The player keeps running if you switch tabs and reappears when you return.

**FIT export.** Any workout exports as a binary Garmin `.fit` file mirroring real Garmin Connect exports, so a watch shows the built-in exercise animations and step targets. Exercises without a Garmin id fall back to text-only steps. Workouts can also be attached to plan items so "Start workout" appears on Today.

**Estimated duration.** Listed per workout, computed from sets × (seconds, or reps × ~3 s) + rests.

## Data, import/export, Drive sync

**Export.** Settings → Download produces a single JSON file; the user picks which sections to include: workouts (with folders and custom exercises), exercise photos, plans & goal, health checks, daily logs, tags.

**Import.** Via file upload or paste. The file is validated, its sections detected, and the user picks what to import. Merge semantics: workouts, folders, custom exercises, and tags are *added* (deduplicated by id/name); the template, goal, and same-date day entries are *overwritten*; week overrides and photos merge by key. The files in `examples/` use this format.

**Drive sync.** Two independent mechanisms: automatic whole-state sync (to hidden app data or a visible Drive folder, last-write-wins by timestamp) and a manual "Save to / Open from Drive" for a visible, shareable file. Settings shows the connected Google account with switch/sign-out. Everything works fully offline/local if Drive is never connected.

## Examples

The [`examples/`](examples/) folder contains importable JSON files: the NYT 7-Minute and Advanced 7-Minute workouts, strength routines (including supersets), vinyasa yoga flows, and a sample weekly plan with daily meals. See its README for how to import.
