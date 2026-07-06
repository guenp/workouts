# CLAUDE.md — Workouts maintenance guide

Mobile-first, dependency-free health tracker (daily plan, health/gut logging, workout builder with Garmin FIT export, trends) with optional Google Drive sync. No framework, no build step required for development — plain HTML/CSS/JS served statically (live at https://guen.pw/workouts/) or bundled into one file for Claude artifacts.

## Repository layout

```
index.html          Shell: fonts, Google API script tags, DOM scaffolding, script load order
css/app.css         All styles (CSS variables in :root define the palette)
js/01-core.js       storage abstraction, state object, init(), date keys, materialization, save()
js/02-icons.js      IC() helper + ICON map (inline SVG strings)
js/03-ui.js         openSheet/closeSheet, esc(), long-press helpers, render() root, nav, anim ticker
js/04-drive.js      storage mode, appDataFolder sync (DRIVE), visible-file save/open (VIS), token lifecycle
js/05-today.js      Today tab, calendar picker, item action sheet, "Add to today/plan" sheet
js/06-plan.js       Plan tab: weekly template + per-week overrides
js/07-gut.js        Health check tab: severity, tags, entry edit/bulk-delete
js/08-data-tools.js Settings sheet, export/import (selective), clear-all, example data, tag creation
js/09-trends.js     Trends tab: 7-day bars + per-day detail
js/10-exercise-data.js  EXCAT, EXLIB, GC (Garmin keys), FEDB (descriptions+images), NYTDESC, media loader
js/11-workouts.js   Workout list/folders, drag-reorder, superset linking, exercise picker/editor
js/12-player.js     Guided workout player (timer, media, keyboard shortcuts)
js/13-fit.js        Binary Garmin .fit encoder (FITX id map, CRC, message defs)
js/14-main.js       init() call — the only place the app starts
build.sh            Inlines css+js into dist/health-companion-drive.html (single file, gitignored)
.github/workflows/pages.yml  Deploys repo root to GitHub Pages on every push to main
```

## Architecture rules (read before editing)

**Classic scripts, one shared global scope.** These are NOT ES modules. Every top-level `function`, `let`, `const` is visible to every later script (top-level `let`/`const` live in the global lexical environment, not on `window` — relevant if you write tests). Load order in index.html only matters for the few top-level *statements* (event listeners in 03/11/12, `init()` in 14). Function definitions can reference each other across files freely because resolution happens at call time. If you add a file, add its `<script>` tag to index.html **and** it will be picked up by build.sh automatically (`js/*.js` sorted — keep the numeric prefixes).

**Rendering model: innerHTML + inline handlers.** There is no vDOM. `render()` rebuilds the active tab's HTML from `state` and swaps `#app.innerHTML`; sheets do the same via `openSheet(html)`. Handlers are inline `onclick="fn(...)"` attribute strings, so every handler must be a **global function**. Consequences:

- Any state change must be followed by `render()` (or a targeted DOM update like `renderSyncOnly()` / `playerTick()` where full re-render would cause flicker or lose input focus).
- Re-rendering destroys input focus and values. Sheets that re-render mid-edit snapshot inputs first (see `snapAdd()`, `newEx.nm` juggling in `openNewExerciseRe`). Follow that pattern.
- **Escaping: `esc()` is HTML-context only.** It is NOT safe for user strings inside inline `onclick="fn('...')"` JS strings — the HTML parser decodes `&#39;` back to `'` before the JS runs, so a value like `');evil(` breaks out. **Never interpolate user-entered text into inline handler arguments. Pass array indices or `uid()` ids instead** and look the value up in the handler (this is why tag handlers take `tagIdx`, not the tag string). uid()s and date keys are alphanumeric-safe to interpolate.

**State is a single object, persisted whole.** `state` (01-core.js) is serialized as one JSON blob under key `"steady"`. Schema:

```
state = {
  template: {0..6: [item]},        // recurring weekly plan, keyed by getDay() (0=Sun)
  weekPlans: {"<monday-key>": {0..6: [item]}},  // per-week overrides (deep copies of template)
  days: {"YYYY-MM-DD": {items:[item+status], orange:min, gut:[entry]}},
  goal: 45, tags: [string],
  workouts: [{id,name,folderId?,exercises:[{n,c,mode,sets,reps,secs,rest,grp?}]}],
  woFolders: [{id,name,open}], customEx: [{n,c,t?}], exImages: {name: dataURL},
  defRest, supRest, animMs, sevV2: true, savedAt: ms
}
plan item: {id, type:"move"|"meal"|"mind", title, detail, workoutId?}
day item:  plan item + {tid: source plan id, status:"planned"|"done"|"swapped"|"skipped", actual}
gut entry: {time:"HH:MM", sev:0-4 (index into SEV), tags:[string], note, food}
```

`init()` performs additive migrations (fills missing keys; `sevV2` bumped severities once). Add new state fields the same way — never assume they exist on loaded data, and never remove a migration.

**Date keys are LOCAL time.** `todayKey()` formats `YYYY-MM-DD` from local getters. It previously used `toISOString()` (UTC) which shifted dates for users far from UTC — do not reintroduce that. Calendar cells construct dates at noon (`new Date(y,mo,d,12)`) to dodge DST edges. `weekKeyOf()` returns the Monday of a date's week and keys `weekPlans`.

**Materialization.** A day's items are copied from the plan (`planItemsFor`: week override → template) the first time the day is viewed/logged (`materializeDay`). After that the day is independent — plan edits don't retroactively change materialized days. Viewing an old date materializes it from the *current* plan; known behavior, accept it.

**persist() vs save().** `persist()` writes locally without touching `savedAt`; `save()` stamps `savedAt` and schedules a debounced Drive upload. Use `save()` for user actions, `persist()` only when writing without claiming the data is newer than Drive (e.g. materialization, adopting a remote copy).

## Storage & Drive sync

Three-layer local storage (01-core.js): `window.storage` (Claude artifacts) → `localStorage` (static hosting) → in-memory. Failures fall through silently by design.

Drive sync (04-drive.js) has two independent mechanisms:
- **DRIVE** — automatic sync of the whole state to `health-tracker.json`. Location is configurable (Settings → "App-data sync location", persisted as `driveSyncLoc`): `"appdata"` (default) uses the hidden `appDataFolder` with scope `drive.appdata`; `"folder"` uses a visible folder with scope `drive.file` — the default `workouts` folder (`ensureDefaultFolder`, created on demand) or a custom folder picked via the Picker (`driveSyncFolder` = `{id,name}`). `driveScope()` returns the scope for the current mode; **switching modes must call `dropDriveToken()`** (the cached token's scope no longer matches — `resumeDrive` also rejects tokens whose stored `scope` differs). Last-write-wins by `savedAt`. Uploads are debounced 1.5 s (`driveUploadSoon`). A 401 drops the token and shows Reconnect.
  - **Lifecycle sync (2026-07, multi-device staleness fix).** `DRIVE.pending` marks local changes Drive hasn't confirmed; `driveUploadSoon` sets it even when the token is gone (reconnect then pushes via `driveInit`'s `savedAt` compare). On `visibilitychange→hidden`/`pagehide`, `driveFlushNow()` fires the pending upload immediately (keepalive when < 60 KB) — without this, mobile app-switching killed the debounce timer and the newest edits never uploaded. On return to foreground (and bfcache `pageshow`), `driveOnShow()` re-checks the stored token expiry (the expiry `setTimeout` is throttled while hidden) and then `drivePullLatest()` adopts a newer remote via `persist()` (never `save()` — adopting isn't authoring). The pull is skipped while a sheet is open, the player is running, or `pending` is set. Don't remove these guards, and don't add a second upload path that bypasses `DRIVE.pending`.
- **VIS** — manual "Save to / Open from Drive" of a visible, shareable file (scope `drive.file`). Both sheets have a persisted "use default Drive folder" checkbox (`visUseDefault`, default on): checked, saves go to (and opens list from) the `workouts` folder with no Picker needed; unchecked, the Picker is used if `VIS.API_KEY` is set, else My Drive root. Saving moves an existing file into the chosen folder (`visMoveTo`). Note `drive.file` only sees files/folders this app created or the user picked — `ensureDefaultFolder` therefore never collides with an unrelated pre-existing "workouts" folder; it creates its own.

**iOS/iPadOS auth is a full-page redirect, not the GIS popup.** GIS's popup token flow ends by navigating its popup to a `storagerelay://` URL, which iOS Safari (and Home Screen web apps) refuse with "can't open this page". `needsRedirectAuth()` detects iOS (including iPad-as-Mac via `maxTouchPoints`) and standalone mode; `driveConnect` and `visToken` then use `redirectAuth()` — a full-page hop to Google's implicit-grant endpoint with a `state` nonce and purpose stashed in sessionStorage. The returning hash is captured at parse time (`AUTH_RETURN`) and acted on by `handleAuthReturn()`, called first thing in `resumeDrive()` (i.e. after local state loads); vis flows resume via `visOpenGo`/`visSaveGo`. **This requires the exact app URL `https://guen.pw/workouts/` under "Authorized redirect URIs" in Google Cloud Console** — Authorized JavaScript origins alone only cover the popup flow.

**Workout sharing** (Share button on the workout overview, 11-workouts.js + 04-drive.js):
- **Share link** — the workout + any custom exercises it uses are deflate-compressed (`CompressionStream("deflate-raw")`, plain-base64 `"j"` fallback; first char of the code tags which) into `#share=<base64url>`. `handleShareLink()` runs at the end of `init()` (after local state loads, after `resumeDrive()` consumes any OAuth hash — the two hash formats can't collide) and offers "Add to my workouts". Decoded payloads are untrusted: `sanitizeSharedEx` clamps numbers, validates categories against `EXCAT`, caps string lengths, strips `grp` to alphanumerics; names are only ever rendered via `esc()`. `exImages` are excluded from links (URL size). The link base falls back to https://guen.pw/workouts/ when `location.protocol` isn't http(s) (artifacts/paste environments).
- **Share via Drive** — `shareWoDrive(id)` uploads an importFlow-compatible `{workouts:[w], customEx, exImages}` file (photos included) named `workout-<slug>.json` to the default `workouts` folder, then sets an anyone-with-link reader permission and offers the drive.google.com link. Recipients import via Settings → Import file / Paste data. The pending workout id sits in sessionStorage (`woSharePending`) so the flow survives the iOS full-page OAuth redirect (purpose `"wo-share"` in `handleAuthReturn`).

Token lifecycle: access tokens last ~1 h; we cache them in localStorage with a 55-min expiry and resume on startup. **`resumeDrive()` must only run from the end of `init()`**, after local state has loaded — running it earlier makes `driveInit()` compare remote `savedAt` against the empty default state and can clobber newer data. Exactly one expiry timer exists (`scheduleTokenExpiry`); don't add raw `setTimeout`s for token expiry, a stale timer will null a fresh token.

**Connected-account row (Settings).** When Drive is the storage mode, Settings shows who's signed in (avatar + email, standard Google-widget style) via `acctRowHTML()`; tapping opens `openDriveAccount()` with Switch account (re-prompts with `select_account`, keeps the grant) and Sign out (revokes the token and falls back to local). Account info comes from Drive's `about` endpoint (`fetchDriveUser()`, called from `driveInit`) — works with both sync scopes, no extra OAuth scope. It's cached in localStorage (`driveUser`) so the row still shows after the ~1h token expires; cleared only by Sign out/Switch. Name/email/photo are user-controlled Google data: render via `esc()` only, never interpolate into inline handlers (handlers here take no args).

`DRIVE.CLIENT_ID` is public by design (OAuth web client for the GitHub Pages origin). Setup steps are in the comment at the top of 04-drive.js.

## Workouts, player, FIT export

Exercises reference the library by name (`n`); `EXLIB` gives category, `GC` maps to Garmin Connect keys (media fetched live from Garmin, cached in `EXMEDIA`), `FEDB` provides public-domain photos/descriptions, `FITX` gives the numeric (category, exercise) FIT ids. An exercise missing from `GC`/`FITX` still works — it exports as a text-only step. **If you add an exercise to EXLIB, also add it to GC and FITX when Garmin equivalents exist**, or it will show "not on Garmin".

Supersets: exercises sharing a `grp` id alternate set-by-set; `expandWorkout()` flattens a workout into the step sequence used by both the player and the FIT encoder — change it in one place and both stay consistent.

FIT encoding (13-fit.js) mirrors real Garmin Connect exports, including undocumented fields; the "no per-step names" comment is load-bearing (a custom step name suppresses the watch's built-in animation). Don't "clean up" the magic numbers without a watch to test on.

## Behavioral quirks (intentional — don't "fix" without asking)

- Adding a **custom** item on the Today tab creates it with `status:"done"` (quick retro-logging); workouts added the same way start `"planned"`.
- `weekOrange()` always sums the *current* calendar week (Mon–Sun) even while viewing a past date.
- Long-press enters bulk-edit mode on tags, health entries, and workout rows; `removeGut`/`removeTag` deliberately stay in edit mode after deleting.
- The player keeps ticking if you leave the Workouts tab; returning shows it again.
- Deleting a workout keeps copies already materialized into days (they're snapshots by design).

## Bugs fixed in the 2026-07 refactor (regression watch-list)

1. `todayKey()` used UTC → wrong day keys off-UTC (worst in NZ/US evenings). Now local-time.
2. `resumeDrive` ran as an IIFE at parse time, racing `init()`'s local load → possible data loss on startup. Now called from `init()`.
3. Duplicate `link` key in `ICON` — the Drive-connect chain icon was silently overridden by the superset icon. First renamed to `chain`.
4. Reconnecting Drive left the old token's expiry `setTimeout` alive, which nulled the fresh token mid-session. Centralized in `scheduleTokenExpiry`.
5. Tag names containing quotes could break out of inline handler strings (self-XSS / broken UI). Tag handlers now take indices.
6. An import file containing only exercise photos was rejected as invalid.
7. Player hotkeys (Space/arrows) hijacked typing in inputs while a workout ran.
8. `openWoAdd` (the workout "+ Add to plan" buttons) was referenced but never implemented — the buttons threw a ReferenceError. Implemented in 11-workouts.js: add to today, a picked date, or the weekly template.

## GitHub setup

**Commit identity: never commit as Claude.** All commits (author *and* committer) must be `guenp <4041805+guenp@users.noreply.github.com>`. Set this via `git config user.name guenp && git config user.email 4041805+guenp@users.noreply.github.com` before committing, and do not add `Co-Authored-By: Claude` trailers.

The project is named **Workouts** and lives at github.com/guenp/workouts, deployed to GitHub Pages at https://guen.pw/workouts/ (custom domain on the user's Pages site). Deployment is via GitHub Actions: `.github/workflows/pages.yml` uploads the repo root as the Pages artifact on every push to main — no build step, the modular source is served directly. `dist/` is gitignored (it's a local build output for artifacts/paste-data use only). **Every push to main goes straight to production** — run the verification steps below before pushing. If the Pages URL ever changes, update the OAuth "Authorized JavaScript origins" in Google Cloud Console or Drive sync will stop connecting.

## Building & testing

`./build.sh` → `dist/health-companion-drive.html`, a self-contained single file (for artifacts, "Paste data" environments, or emailing). The modular `css/`+`js/` tree is canonical; never edit `dist/` directly.

Quick verification after changes: `for f in js/*.js; do node --check "$f"; done` for syntax (`node --check` takes one file at a time), then a jsdom smoke test — run `./build.sh` first and load the fresh dist file with `runScripts:"dangerously"`, stub `fetch`, wait ~50 ms for `init()`, then drive globals via `window.eval(...)` (top-level `let`/`const` aren't `window` properties). Exercise every tab via `setTab`, one add/log flow per tab, `encodeWorkoutFIT`, and assert `todayKey()` matches the local date under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`. Remember `process.exit()` — the animation ticker keeps node alive.

Manual test areas that jsdom can't cover: Drive OAuth popup, Google Picker, `navigator.share` download paths, pointer drag (reorder + superset linking), long-press timing on real touch devices.
