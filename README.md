# Workouts

A mobile-first health tracker: daily plan (move / meals / mind), orange-zone minute goal, health check logging with tags, trends, and a workout builder with a guided player and Garmin `.fit` export. Optional Google Drive sync. No framework, no dependencies, no build step required for development.

## Running it

Static hosting is all you need — open `index.html` locally or serve the folder (e.g. GitHub Pages). Data is stored in `localStorage` by default; Drive sync setup steps are in the comment at the top of `js/04-drive.js`.

For a single self-contained file (Claude artifacts, emailing the app, paste-data environments), run `./build.sh` — it inlines everything into `dist/health-companion-drive.html`.

## Layout

`index.html` is the shell, `css/app.css` the styles, and `js/` contains 14 numbered modules split by feature (core/state, Drive sync, one file per tab, workout player, FIT encoder). They're classic scripts sharing one global scope, loaded in order.

## Maintaining

Read `CLAUDE.md` first — it documents the architecture rules, state schema, escaping pitfalls, intentional quirks, and how to test. Edit the modular source, never `dist/`, and re-run `./build.sh` after changes.
