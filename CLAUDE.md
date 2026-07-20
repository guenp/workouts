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
js/04b-gcal.js      Google Calendar: show events on Today, push plan items as (recurring) events, calendar management
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
  categories: [{id,name}],         // Today/Plan sections (default move/meal/mind); ids handler-safe (uid or legacy), names user text

  workouts: [{id,name,folderId?,exercises:[{n,c,mode,sets,reps,secs,rest,wt?,wu?,grp?}]}],  // wt: optional weight, wu: "lb"|"kg"; wtUnit (top-level) = default unit for new weights
  woFolders: [{id,name,open}], customEx: [{n,c,t?}], exImages: {name: dataURL},
  defRest, supRest, animMs, sevV2: true, savedAt: ms
}
plan item: {id, type:<category id>, title, detail, workoutId?, gcalEventId?, gcalCalId?}  // gcal* = linked Google Calendar event
day item:  plan item + {tid: source plan id, status:"planned"|"done"|"swapped"|"skipped", actual, gcalEvId?}  // gcalEvId = copied from a calendar event
gut entry: {time:"HH:MM", sev:0-4 (index into SEV), tags:[string], note, food}
```

Additive migrations live in `migrateState()` (fills missing keys; `sevV2` bumped severities once). It runs in `init()` **and after every whole-state adoption of a remote copy** (`driveInit` / `drivePullLatest` do `state = remote`, and the remote blob may predate newer fields — `state.categories` went missing exactly that way once). Add new state fields inside `migrateState()`, keep it idempotent, never remove a step, and if you add another `state = <whole object>` code path, call `migrateState()` right after it.

**Date keys are LOCAL time.** `todayKey()` formats `YYYY-MM-DD` from local getters. It previously used `toISOString()` (UTC) which shifted dates for users far from UTC — do not reintroduce that. Calendar cells construct dates at noon (`new Date(y,mo,d,12)`) to dodge DST edges. `weekKeyOf()` returns the Monday of a date's week and keys `weekPlans`.

**Materialization.** A day's items are copied from the plan (`planItemsFor`: week override → template) the first time the day is viewed/logged (`materializeDay`). After that the day is independent — plan edits don't retroactively change materialized days. Viewing an old date materializes it from the *current* plan; known behavior, accept it. **Future dates are the exception:** the Today tab (reachable via the week strip / day arrows / date picker) renders future days as a live, NON-materialized plan preview (`previewDay`, item ids `"pv"+planItemId`) so plan edits keep showing; the day materializes on first interaction (tapping an item, adding, bumping orange). Don't add code paths that materialize future days on mere viewing.

**Categories are data, not constants.** The Today/Plan sections come from `state.categories` (managed in Settings → Categories). Iterate `CATS()` and label with `catName(id)`; items whose `type` matches no category render in an "Other" section. `TYPE_LABEL` and the literal `"move"/"meal"/"mind"` survive only as legacy defaults (workouts always log as type `"move"`, which is guaranteed to exist as a default but can be renamed). Category names are user text: `esc()` only, pass indices/ids to handlers.

**persist() vs save().** `persist()` writes locally without touching `savedAt`; `save()` stamps `savedAt` and schedules a debounced Drive upload. Use `save()` for user actions, `persist()` only when writing without claiming the data is newer than Drive (e.g. materialization, adopting a remote copy).

## Storage & Drive sync

Three-layer local storage (01-core.js): `window.storage` (Claude artifacts) → `localStorage` (static hosting) → in-memory. Failures fall through silently by design.

Drive sync (04-drive.js) has two independent mechanisms:
- **DRIVE** — automatic sync of the whole state to `health-tracker.json`. Location is configurable (Settings → "App-data sync location", persisted as `driveSyncLoc`): `"appdata"` (default) uses the hidden `appDataFolder` with scope `drive.appdata`; `"folder"` uses a visible folder with scope `drive.file` — the default `workouts` folder (`ensureDefaultFolder`, created on demand) or a custom folder picked via the Picker (`driveSyncFolder` = `{id,name}`). `driveScope()` returns the scope for the current mode; **switching modes must call `dropDriveToken()`** (the cached token's scope no longer matches — `resumeDrive` also rejects tokens whose stored `scope` differs). Last-write-wins by `savedAt`. Uploads are debounced 1.5 s (`driveUploadSoon`). A 401 drops the token and shows Reconnect.
  - **Lifecycle sync (2026-07, multi-device staleness fix).** `DRIVE.pending` marks local changes Drive hasn't confirmed; `driveUploadSoon` sets it even when the token is gone (reconnect then pushes via `driveInit`'s `savedAt` compare). On `visibilitychange→hidden`/`pagehide`, `driveFlushNow()` fires the pending upload immediately (keepalive when < 60 KB) — without this, mobile app-switching killed the debounce timer and the newest edits never uploaded. On return to foreground (and bfcache `pageshow`), `driveOnShow()` re-checks the stored token expiry (the expiry `setTimeout` is throttled while hidden) and then `drivePullLatest()` adopts a newer remote via `persist()` (never `save()` — adopting isn't authoring). The pull is skipped while a sheet is open, the player is running, or `pending` is set. Don't remove these guards, and don't add a second upload path that bypasses `DRIVE.pending`.
- **VIS** — manual "Save to / Open from Drive" of a visible, shareable file (scope `drive.file`). Both sheets have a persisted "use default Drive folder" checkbox (`visUseDefault`, default on): checked, saves go to (and opens list from) the `workouts` folder with no Picker needed; unchecked, the Picker is used if `VIS.API_KEY` is set, else My Drive root. Saving moves an existing file into the chosen folder (`visMoveTo`). Note `drive.file` only sees files/folders this app created or the user picked — `ensureDefaultFolder` therefore never collides with an unrelated pre-existing "workouts" folder; it creates its own.

**iOS/iPadOS auth is a full-page redirect, not the GIS popup.** GIS's popup token flow ends by navigating its popup to a `storagerelay://` URL, which iOS Safari (and Home Screen web apps) refuse with "can't open this page". `needsRedirectAuth()` detects iOS (including iPad-as-Mac via `maxTouchPoints`) and standalone mode; `driveConnect` and `visToken` then use `redirectAuth()` — a full-page hop to Google's implicit-grant endpoint with a `state` nonce and purpose stashed in sessionStorage. The returning hash is captured at parse time (`AUTH_RETURN`) and acted on by `handleAuthReturn()`, called first thing in `resumeDrive()` (i.e. after local state loads); vis flows resume via `visOpenGo`/`visSaveGo`. **This requires the exact app URL `https://guen.pw/workouts/` under "Authorized redirect URIs" in Google Cloud Console** — Authorized JavaScript origins alone only cover the popup flow.

**Workout sharing** (Share button on the workout overview, 11-workouts.js + 04-drive.js):
- **Share link** — the workout + any custom exercises it uses are deflate-compressed (`CompressionStream("deflate-raw")`, plain-base64 `"j"` fallback; first char of the code tags which) into `#share=<base64url>`. `handleShareLink()` runs at the end of `init()` (after local state loads, after `resumeDrive()` consumes any OAuth hash — the two hash formats can't collide), sanitizes the payload, and shows a full preview sheet (exercise rows with summaries) before "Add to my workouts"; accepted workouts land in a "Shared with me" folder (`sharedFolderId()`, found by name / created on demand). Decoded payloads are untrusted: `sanitizeSharedEx` clamps numbers, validates categories against `EXCAT`, caps string lengths, strips `grp` to alphanumerics; names are only ever rendered via `esc()`. `exImages` are excluded from links (URL size). The link base falls back to https://guen.pw/workouts/ when `location.protocol` isn't http(s) (artifacts/paste environments).
- **Share via Drive** — `shareWoDrive(id)` uploads an importFlow-compatible `{workouts:[w], customEx, exImages}` file (photos included) named `workout-<slug>.json` to the default `workouts` folder, then sets an anyone-with-link reader permission and offers the drive.google.com link. Recipients import via Settings → Import file / Paste data. The pending workout id sits in sessionStorage (`woSharePending`) so the flow survives the iOS full-page OAuth redirect (purpose `"wo-share"` in `handleAuthReturn`).

Token lifecycle: access tokens last ~1 h; we cache them in localStorage with a 55-min expiry and resume on startup. **`resumeDrive()` must only run from the end of `init()`**, after local state has loaded — running it earlier makes `driveInit()` compare remote `savedAt` against the empty default state and can clobber newer data. Exactly one expiry timer exists (`scheduleTokenExpiry`); don't add raw `setTimeout`s for token expiry, a stale timer will null a fresh token.

**Connected-account row (Settings).** When Drive is the storage mode, Settings shows who's signed in (avatar + email, standard Google-widget style) via `acctRowHTML()`; tapping opens `openDriveAccount()` with Switch account (re-prompts with `select_account`, keeps the grant) and Sign out (revokes the token and falls back to local). Account info comes from Drive's `about` endpoint (`fetchDriveUser()`, called from `driveInit`) — works with both sync scopes, no extra OAuth scope. It's cached in localStorage (`driveUser`) so the row still shows after the ~1h token expires; cleared only by Sign out/Switch. Name/email/photo are user-controlled Google data: render via `esc()` only, never interpolate into inline handlers (handlers here take no args).

**Google Calendar (04b-gcal.js).** Separate feature from Drive sync with its OWN token (`gcalTok` in localStorage, scope `https://www.googleapis.com/auth/calendar`, resumed by `resumeGcal()` from the end of `init()`, single expiry timer `scheduleGcalExpiry`) — never merge it with Drive's token; the scopes differ and each would invalidate the other. iOS full-page OAuth returns route through `handleAuthReturn` purpose `"gcal"`. Requires the Google Calendar API to be enabled on the same Cloud project as the OAuth client. Per-device prefs (localStorage): `gcalCals` (selected calendars `[{id,summary}]`), `gcalPush` ("1" = push new plan items to a calendar), `gcalTarget` ({id,summary}, default primary), `gcalDefTime`. Behavior:
- Today tab calls `gcalDayData(k)`: fetches the viewed day's events per selected calendar (cached in `GCAL.ev[k]`, re-render when the fetch lands). The cache is stale-while-revalidate: mutations call `gcalInvalidate()` (generation bump, `GCAL.gen` vs `GCAL.evGen[k]`) and stale days keep rendering old data while a silent background refetch runs — never wipe `GCAL.ev` on mutation (wiping made a "Calendar" loading section flash on every push; a full wipe is only correct when the selected calendars change or on disconnect). There is deliberately NO visible loading state for calendar events. Freshness also has a 60 s TTL (`GCAL_TTL`/`GCAL.evAt`) and a `visibilitychange` listener in 04b-gcal.js marks everything stale on app foreground — changes made directly in Google Calendar have no other way in, and mobile keeps the page alive for days. Events with private extendedProperty `woCat` matching a category render inside that category's section; others in a "Calendar" section; tapping one can copy it into the day (`gcalEvId` links them, which also hides the calendar row — dedupe).
- Dedupe hides an event ONLY when an item displayed on that day links to it (`gcalEventId`, `gcalEvId`; preview days derive from the plan), and an item hides AT MOST ONE event: its exact id, or for a linked recurring series the single instance closest to the item's `gcalTime`. Extra same-day instances (a moved occurrence, duplicates) stay visible. `GCAL.dayStats` (shown in the Settings sheet) reports fetched/shown/hidden counts and per-calendar fetch success for self-diagnosis. App-created events (`woApp`) with no matching item MUST still render (in their `woCat` category) — hiding them unconditionally once made events invisible in the app while visible in Google Calendar (plan pushed after the day was materialized, or the item later removed). `woApp` marks provenance, not visibility.
- Events the app creates carry `extendedProperties.private = {woApp:"1", woCat, woCatName}` (provenance + category; see the dedupe rule above for when they're hidden).
- **Category source of truth is the event DESCRIPTION**: a human-editable block appended by `gcalMetaWrite` ("--- Workouts app ---" / "Category: <name>"). Users can't edit extendedProperties in the Google Calendar UI, so `gcalEvCat` resolves description-meta first (matched to a category by NAME, case-insensitive) and falls back to `woCat`. Parsing (`gcalDescText`) tolerates the HTML Google wraps descriptions in after UI edits. Anything that PATCHes an event description must go through `gcalMetaWrite` or it wipes the block (savePlanEdit does). `gcalSetEventCat` (used when logging an external event under a category and by the item "Category…" sheet, `openItemCat`/`setItemCat`) GET-then-PATCHes to preserve the user's own description text and other private keys. Remote category edits flow back in `gcalReconcileDay` (description meta → linked item's `type`, incl. items logged from external events via `gcalEvId`/`gcalEvCalId`).
- The meta block can also carry `Workout: <name>`. `gcalEvWorkout(e)` resolves an event to an app workout: meta name > `woWo` extendedProperty (app-local workout id, written on push) > the event TITLE matching a workout name (case-insensitive) — the title fallback is what makes hand-made calendar events work with zero setup, keep it. Recognized events render their exercise summary in the Today rows and the event sheet offers "Log as workout", which creates a full `woAsItem` day item (workoutId → player/details work) linked via `gcalEvId` and writes the meta back (`gcalWriteEventMeta`, which GET-then-PATCHes and must never drop an existing `Workout:` line when only the category changes).
- Adding plan items (add sheet or a workout's "every week on…") pushes them via `gcalPushPlanItems`: weekly-template adds become weekly recurring events (RRULE BYDAY), specific-week adds one-off events. Adding a workout via "Today" / "Pick a date" pushes a one-off event through `gcalPushDayItems` (current time for Today; "Pick a date" adds a time input under the date grid — `openCalendar` opts.time, time arrives as the callback's 2nd arg). Linked items store `gcalEventId`/`gcalCalId` plus display-only `gcalCalName`/`gcalTime` (the "▤ time · calendar" cue on Today/Plan rows — a snapshot, refreshed on edits through the app only). `savePlanEdit` patches the event, `deletePlanItem` deletes it. `openItemCal()` (item/plan action sheets; reads `activeItem`, plan sheet sets `activeItem = activePlan` first) re-fetches the live event and lets the user change time/duration/calendar (Google's events.move endpoint) or remove it; `gcalSyncLinks(evId, patch|null)` keeps every item referencing that event id (template, week overrides, materialized day copies) in step — use it for any future link mutations. Only NEWLY added items are pushed — enabling push does not backfill existing plans.
- Deletion syncs BOTH ways. App → calendar: `deletePlanItem` deletes the linked event (and unlinks materialized day copies); `removeItem` on a day item deletes its one-off event but NEVER a recurring series (`gcalEventInPlans` guards — a day's copy of a weekly plan doesn't own the series; delete the series from the Plan tab). Calendar → app: `gcalReconcileDay` runs after every day fetch. **Absence from the LIST response is only a hint, never proof** — Google's list endpoint can transiently miss a just-patched event (eventual consistency; this once made a workout vanish right after editing its time), and a failed per-calendar fetch looks identical to deletion. Removal therefore requires all of: the calendar's list fetch succeeded this round (`GCAL.evOk[k]`), we didn't mutate the event ourselves in the last 2 min (`gcalMarkMut` — call it from any new code path that writes an event), and a direct GET by id (strongly consistent) returns 404/410/cancelled. Only then: planned day items removed, logged ones unlinked (history kept), owning plan items removed. Reconcile also refreshes the `gcalTime` cue on linked items from the fetched instances when an event's time was changed in Google Calendar (skipping recently-mutated events — the list may lag our own patch). Reconciliation only covers calendars selected for display; events on an unselected push-target calendar are never fetched, so their absence proves nothing and they're left alone. Never relax these guards back to list-absence-only.
- Event titles/descriptions/calendar names are external data: `esc()` only, inline handlers take indices into `GCAL.list`/`GCAL.dayList`, never strings.

`DRIVE.CLIENT_ID` is public by design (OAuth web client for the GitHub Pages origin). Setup steps are in the comment at the top of 04-drive.js.

## Workouts, player, FIT export

Exercises reference the library by name (`n`); `EXLIB` gives category, `GC` maps to Garmin Connect keys (media fetched live from Garmin, cached in `EXMEDIA`), `FEDB` provides public-domain photos/descriptions, `FITX` gives the numeric (category, exercise) FIT ids. An exercise missing from `GC`/`FITX` still works — it exports as a text-only step. **If you add an exercise to EXLIB, also add it to GC and FITX when Garmin equivalents exist**, or it will show "not on Garmin".

Supersets: exercises sharing a `grp` id alternate set-by-set; `expandWorkout()` flattens a workout into the step sequence used by both the player and the FIT encoder — change it in one place and both stay consistent.

Weights: `e.wt` (optional) + `e.wu` ("lb"|"kg") show in summaries as `@ 20 lb`, are editable in the exercise sheet and the player (edits write back to the workout = last weights used; "Log to today" snapshots `woSummary(w)` into the day item's `detail`, so past logs keep that day's weights). They export as `workout_step.exercise_weight` (field 12, uint16, kg×100 on the wire) with `weight_display_unit` (field 13, 1=kg, 2=lb).

FIT encoding (13-fit.js) mirrors real Garmin Connect exports, including undocumented fields; the "no per-step names" comment is load-bearing (a custom step name suppresses the watch's built-in animation). Don't "clean up" the magic numbers without a watch to test on.

## Behavioral quirks (intentional — don't "fix" without asking)

- Adding a **custom** item on the Today tab creates it with `status:"done"` (quick retro-logging); workouts added the same way start `"planned"`.
- `weekOrange()` always sums the *current* calendar week (Mon–Sun) even while viewing a past date.
- Long-press enters bulk-edit mode on tags, health entries, and workout rows; `removeGut`/`removeTag` deliberately stay in edit mode after deleting.
- The player keeps ticking if you leave the Workouts tab; returning shows it again.
- Deleting a workout keeps copies already materialized into days (they're snapshots by design).
- The Today week strip and date picker allow future dates (plan preview, see Materialization); the trends/health pickers still cap at today.
- Deleting a category keeps its items — they move to an "Other" section (no reassignment prompt by design).

## Bugs fixed in the 2026-07 refactor (regression watch-list)

0. (2026-07 calendar feature) `js/*.js` glob order is load order in the single-file build — a module named 15-* would load AFTER 14-main.js and `init()` would throw on its functions. That's why the calendar module is `04b-gcal.js`. Keep 14-main.js last in glob order.
1. `todayKey()` used UTC → wrong day keys off-UTC (worst in NZ/US evenings). Now local-time.
2. `resumeDrive` ran as an IIFE at parse time, racing `init()`'s local load → possible data loss on startup. Now called from `init()`.
3. Duplicate `link` key in `ICON` — the Drive-connect chain icon was silently overridden by the superset icon. First renamed to `chain`.
4. Reconnecting Drive left the old token's expiry `setTimeout` alive, which nulled the fresh token mid-session. Centralized in `scheduleTokenExpiry`.
5. Tag names containing quotes could break out of inline handler strings (self-XSS / broken UI). Tag handlers now take indices.
6. An import file containing only exercise photos was rejected as invalid.
7. Player hotkeys (Space/arrows) hijacked typing in inputs while a workout ran.
8a. Drive sync adopting a remote state (`state = remote`) skipped migrations, so fields added after the remote blob was written (e.g. `state.categories`) vanished → `addCat` crashed and Today lost its sections. Migrations centralized in `migrateState()`, called after every remote adoption.
8. `openWoAdd` (the workout "+ Add to plan" buttons) was referenced but never implemented — the buttons threw a ReferenceError. Implemented in 11-workouts.js: add to today, a picked date, or the weekly template.

## GitHub setup

**Commit identity: never commit as Claude.** All commits (author *and* committer) must be `guenp <4041805+guenp@users.noreply.github.com>`. Set this via `git config user.name guenp && git config user.email 4041805+guenp@users.noreply.github.com` before committing, and do not add `Co-Authored-By: Claude` trailers.

The project is named **Workouts** and lives at github.com/guenp/workouts, deployed to GitHub Pages at https://guen.pw/workouts/ (custom domain on the user's Pages site). Deployment is via GitHub Actions: `.github/workflows/pages.yml` uploads the repo root as the Pages artifact on every push to main — no build step, the modular source is served directly. `dist/` is gitignored (it's a local build output for artifacts/paste-data use only). **Every push to main goes straight to production** — run the verification steps below before pushing. If the Pages URL ever changes, update the OAuth "Authorized JavaScript origins" in Google Cloud Console or Drive sync will stop connecting.

## Building & testing

`./build.sh` → `dist/health-companion-drive.html`, a self-contained single file (for artifacts, "Paste data" environments, or emailing). The modular `css/`+`js/` tree is canonical; never edit `dist/` directly.

Quick verification after changes: `for f in js/*.js; do node --check "$f"; done` for syntax (`node --check` takes one file at a time), then a jsdom smoke test — run `./build.sh` first and load the fresh dist file with `runScripts:"dangerously"`, stub `fetch`, wait ~50 ms for `init()`, then drive globals via `window.eval(...)` (top-level `let`/`const` aren't `window` properties). Exercise every tab via `setTab`, one add/log flow per tab, `encodeWorkoutFIT`, and assert `todayKey()` matches the local date under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`. Remember `process.exit()` — the animation ticker keeps node alive.

Manual test areas that jsdom can't cover: Drive OAuth popup, Google Picker, `navigator.share` download paths, pointer drag (reorder + superset linking), long-press timing on real touch devices.
