---
name: create-workout
description: Create a workout for the Workouts app as JSON and share it as a #share= query URL. Use this skill whenever the user asks to create, build, or generate a workout, routine, flow, or training plan for this app, wants a workout JSON or example file, or asks for a shareable/preview/query link for a workout — even if they don't say "skill" or "JSON".
---

# Create a workout & share it via query URL

Two output formats exist. Pick based on what the user wants:

1. **Import file** — a JSON file (for `examples/`, or Settings → Upload/Paste data). Holds many workouts, folders, and custom exercises.
2. **Share URL** — `https://guen.pw/workouts/#share=<encoded>`. Holds exactly one workout (plus any custom exercises it uses). Opening it shows a preview with an "Add to my workouts" button. This is what "query link" / "preview link" means.

## Exercise rules (both formats)

Every exercise is `{"n", "c", "mode", "sets", "reps", "secs", "rest", "grp"?}` — always include the first seven fields; `grp` only for supersets.

- `n` and `c` must match an entry in `EXLIB` (`js/10-exercise-data.js`) **exactly**, or be declared in the same payload's `customEx` array as `{"n", "c", "t"?}` (`t:1` = time-based by default). Library exercises get Garmin media and animated FIT export; custom ones are text-only. Always verify names against `EXLIB` — never guess.
- `c` must be an `EXCAT` key: squat, lunge, hinge, push, pull, press, arms, core, cardio, yoga, pilates, mobility.
- `mode` is `"reps"` (uses `sets`×`reps`) or `"time"` (uses `sets`×`secs`); fill the unused field with a sane default (reps 10 / secs 30).
- Supersets: exercises sharing a `grp` id alternate set-by-set (A1 B1 C1 A2 B2 C2…). Use this for circuits, per-side sequences (sets=2 → right side, left side), and yoga vinyasa transitions. `grp` and all ids must be **alphanumeric only**.
- Rest in seconds per exercise; 0 for flows.

## Import-file format

```json
{"app": "health-tracker", "sevV2": true,
 "woFolders": [{"id": "fold01", "name": "My Folder", "open": true}],
 "customEx": [{"n": "Chaturanga", "c": "yoga", "t": 1}],
 "workouts": [{"id": "wo01", "folderId": "fold01", "name": "…", "exercises": [ … ]}]}
```

Workout ids must be unique and stable (import dedupes by id). `folderId` must reference a folder in the same file. See `examples/` for complete files.

## Share-URL format

Payload: `{"v": 1, "w": {"name", "ex": [ …exercises… ]}, "cx": [ …custom exercises used… ]}` — note the workout has no `id`/`folderId`, and `cx` is only present if custom exercises are used. Encoding: JSON → deflate-raw → base64url, prefixed `"z"` (must match `shareEncode` in `js/11-workouts.js`; the hash must satisfy `^#share=[A-Za-z0-9_-]+$`).

Don't hand-roll the encoding — run the bundled script:

```bash
node .claude/skills/create-workout/scripts/share-link.mjs <import-file.json> [workout-id]
```

It validates exercise names/categories against the real `EXLIB`, builds the payload (including `cx`), and prints one share URL per workout (or just the one matching `workout-id`).

## Checklist before delivering

Validate every `n`/`c` against `EXLIB` + `customEx`; confirm ids and `grp` values are alphanumeric and unique; for flows, mentally expand supersets (or read `expandWorkout` in `js/11-workouts.js`) to confirm the step order plays as intended; generate share URLs only via the script.
