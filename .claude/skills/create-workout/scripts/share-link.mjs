#!/usr/bin/env node
/* Generate app share URLs from an import-format JSON file.
   Usage: node .claude/skills/create-workout/scripts/share-link.mjs <file.json> [workout-id]
   Validates names/categories against the real EXLIB, mirrors shareEncode()
   in js/11-workouts.js (deflate-raw + base64url, "z" prefix). Run from repo root. */
import fs from "node:fs";
import zlib from "node:zlib";

const [file, onlyId] = process.argv.slice(2);
if (!file) { console.error("usage: share-link.mjs <import-file.json> [workout-id]"); process.exit(1); }

/* Load EXLIB/EXCAT from the app source (classic script — eval its top section). */
const src = fs.readFileSync("js/10-exercise-data.js", "utf8").split("const GC =")[0];
(0, eval)("var IC = x => x;" + src + "; globalThis.EXLIB = EXLIB; globalThis.EXCAT = EXCAT;");

const d = JSON.parse(fs.readFileSync(file, "utf8"));
const customEx = d.customEx || [];
const lib = Object.fromEntries([...globalThis.EXLIB, ...customEx].map(x => [x.n, x]));

const b64url = b => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encode = obj => "z" + b64url(zlib.deflateRawSync(Buffer.from(JSON.stringify(obj))));

let fail = false;
for (const w of d.workouts || []) {
  if (onlyId && w.id !== onlyId) continue;
  for (const e of w.exercises) {
    const l = lib[e.n];
    if (!l) { console.error(`✗ ${w.name}: "${e.n}" not in EXLIB or customEx`); fail = true; continue; }
    if (l.c !== e.c) { console.error(`✗ ${w.name}: "${e.n}" category ${e.c} ≠ ${l.c}`); fail = true; }
    if (!globalThis.EXCAT[e.c]) { console.error(`✗ ${w.name}: invalid category ${e.c}`); fail = true; }
    for (const k of ["mode", "sets", "reps", "secs", "rest"])
      if (e[k] == null) { console.error(`✗ ${w.name}: "${e.n}" missing ${k}`); fail = true; }
    if (e.grp && !/^[A-Za-z0-9]+$/.test(e.grp)) { console.error(`✗ ${w.name}: grp "${e.grp}" not alphanumeric`); fail = true; }
  }
  if (fail) continue;
  const names = new Set(w.exercises.map(e => e.n));
  const cx = customEx.filter(x => names.has(x.n));
  const payload = { v: 1,
    w: { name: w.name, ex: w.exercises.map(e => ({ n: e.n, c: e.c, mode: e.mode, sets: e.sets,
      reps: e.reps, secs: e.secs, rest: e.rest, ...(e.wt > 0 ? { wt: e.wt, wu: e.wu } : {}),
      ...(e.grp ? { grp: e.grp } : {}) })) },
    ...(cx.length ? { cx } : {}) };
  const s = encode(payload);
  /* self-verify: round-trip through the app's decode logic */
  const back = JSON.parse(zlib.inflateRawSync(Buffer.from(s.slice(1).replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString());
  if (back.v !== 1 || typeof back.w?.name !== "string" || !Array.isArray(back.w?.ex) || !back.w.ex.length)
    { console.error(`✗ ${w.name}: round-trip verification failed`); process.exit(1); }
  console.log(w.name + "\nhttps://guen.pw/workouts/#share=" + s + "\n");
}
if (fail) process.exit(1);
