#!/usr/bin/env node
/* Generate app #share= URLs from an import-format JSON file.
   Usage: node scripts/share-link.mjs <import-file.json> [workout-id]
   Matches shareEncode()/shareWoPayload() in js/11-workouts.js:
   payload = {v:1, w:{name, ex:[...]}, cx?} -> deflate-raw -> base64url, "z" prefix. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const [file, onlyId] = process.argv.slice(2);
if (!file) { console.error("Usage: node scripts/share-link.mjs <import-file.json> [workout-id]"); process.exit(1); }

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exSrc = fs.readFileSync(path.join(repo, "js/10-exercise-data.js"), "utf8");
(0, eval)('var IC=x=>x;' + exSrc.split("const GC =")[0] + ";globalThis.__EXLIB=EXLIB;globalThis.__EXCAT=EXCAT;");
const EXLIB = globalThis.__EXLIB, EXCAT = globalThis.__EXCAT;

const d = JSON.parse(fs.readFileSync(file, "utf8"));
const lib = Object.fromEntries([...EXLIB, ...(d.customEx || [])].map(x => [x.n, x]));
const b64url = b => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let fail = false;
for (const w of d.workouts || []) {
  if (onlyId && w.id !== onlyId) continue;
  for (const e of w.exercises) {
    if (!lib[e.n]) { console.error(`✗ ${w.name}: unknown exercise "${e.n}" (not in EXLIB or customEx)`); fail = true; }
    else if (lib[e.n].c !== e.c) { console.error(`✗ ${w.name}: "${e.n}" category ${e.c} ≠ library ${lib[e.n].c}`); fail = true; }
    if (!EXCAT[e.c]) { console.error(`✗ ${w.name}: "${e.n}" invalid category "${e.c}"`); fail = true; }
    if (e.grp && !/^[A-Za-z0-9]+$/.test(e.grp)) { console.error(`✗ ${w.name}: grp "${e.grp}" must be alphanumeric`); fail = true; }
  }
  if (fail) continue;
  const names = new Set(w.exercises.map(e => e.n));
  const cx = (d.customEx || []).filter(x => names.has(x.n));
  const payload = { v: 1,
    w: { name: w.name, ex: w.exercises.map(e => ({ n: e.n, c: e.c, mode: e.mode, sets: e.sets, reps: e.reps, secs: e.secs, rest: e.rest, ...(e.wt > 0 ? { wt: e.wt, wu: e.wu } : {}), ...(e.grp ? { grp: e.grp } : {}) })) },
    ...(cx.length ? { cx } : {}) };
  console.log(w.name + "\nhttps://guen.pw/workouts/#share=z" + b64url(zlib.deflateRawSync(Buffer.from(JSON.stringify(payload)))) + "\n");
}
process.exit(fail ? 1 : 0);
