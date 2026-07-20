/* ---------- deployed version stamp ---------- */
/* version.json is written by .github/workflows/pages.yml at deploy time.
   Missing locally / in single-file builds — the catch keeps that silent. */
let APPVER = null, verFetched = false;
function loadVer(){
  if(verFetched || typeof fetch === "undefined") return;
  verFetched = true;
  fetch("version.json", {cache:"no-store"})
    .then(r => r.ok ? r.json() : null)
    .then(v => {
      APPVER = v;
      const el = document.getElementById("verFoot"); // targeted update — no full re-render
      if(el) el.innerHTML = verFooterHTML();
    })
    .catch(() => {});
}
function verFooterHTML(){
  if(!APPVER || !APPVER.commit) return "";
  const d = APPVER.builtAt ? new Date(APPVER.builtAt) : null;
  const when = d && !isNaN(d) ? d.toLocaleString(undefined, {dateStyle:"medium", timeStyle:"short"}) : "";
  return `<p class="sub" style="margin-top:16px;text-align:center;opacity:.7">Deployed ${esc(String(APPVER.commit))}${when ? ` · ${esc(when)}` : ""}</p>`;
}

/* ---------- settings menu (tap the pill) ---------- */
function openDataMenu(){
  loadVer();
  const m = getMode();
  openSheet(`
    <h3>Storage & data</h3>
    <p class="sub">Choose where your data lives.</p>
    <button class="sheet-btn" onclick="setStorageMode('local')"><span>${m==="local"?ICON.check:ICON.device}</span> This device only (local)</button>
    <button class="sheet-btn" onclick="setStorageMode('drive')"><span>${m==="drive"?ICON.check:ICON.cloud}</span> Sync with Google Drive</button>
    ${acctRowHTML()}
    ${m==="drive" && DRIVE.status!=="on" && !driveUserInfo() ? `<button class="sheet-btn" onclick="closeSheet();driveConnect()"><span>${ICON.chain}</span> Connect to Drive now</button>` : ""}
    <p class="sub" style="margin-top:14px">Data tools</p>
    <div class="numrow" style="margin-bottom:4px">
      <div><label class="fl">Default rest (s)</label><input class="field" type="number" min="0" value="${state.defRest??60}" onchange="state.defRest=Math.max(0,parseInt(this.value)||0);save()"></div>
      <div><label class="fl">Superset rest (s)</label><input class="field" type="number" min="0" value="${state.supRest??10}" onchange="state.supRest=Math.max(0,parseInt(this.value)||0);save()"></div>
    </div>
    <label class="fl">Exercise animation speed</label>
    <div class="seg" style="margin-bottom:12px">
      <button class="${(state.animMs||1000)===1600?'on':''}" onclick="setAnimMs(1600)">Slow</button>
      <button class="${(state.animMs||1000)===1000?'on':''}" onclick="setAnimMs(1000)">Normal</button>
      <button class="${(state.animMs||1000)===550?'on':''}" onclick="setAnimMs(550)">Fast</button>
    </div>
    <button class="sheet-btn" onclick="openDownloadMenu()"><span>${ICON.down}</span> Download app data…</button>
    <label class="sheet-btn" for="upIn" style="cursor:pointer"><span>${ICON.up}</span> Upload data</label>
    <button class="sheet-btn" onclick="openPasteData()"><span>${ICON.pencil}</span> Paste data</button>
    <p class="sub" style="margin-top:14px">Planning</p>
    <button class="sheet-btn" onclick="openCatMenu()"><span>${ICON.pencil}</span> Categories… <small style="margin-left:auto;color:var(--sage)">${CATS().length}</small></button>
    <button class="sheet-btn" onclick="openGcalMenu()"><span>${ICON.cal}</span> Google Calendar… ${GCAL.token && gcalCals().length ? `<small style="margin-left:auto;color:var(--sage)">${gcalCals().length} on</small>` : ""}</button>
    <p class="sub" style="margin-top:14px">Google Drive settings</p>
    <button class="sheet-btn" onclick="saveVis()"><span>${ICON.folder}</span> Save to Drive file…</button>
    <button class="sheet-btn" onclick="openVis()"><span>${ICON.open}</span> Open from Drive…</button>
    <label class="fl">App-data sync location</label>
    <div class="seg">
      <button class="${syncLoc()==='appdata'?'on':''}" onclick="setSyncLoc('appdata')">Hidden app data</button>
      <button class="${syncLoc()==='folder'?'on':''}" onclick="setSyncLoc('folder')">Drive folder</button>
    </div>
    ${syncLoc()==="folder" ? `
      <p class="sub">Syncing to: <b>${esc(syncFolderPref()?.name || "workouts")}</b>${syncFolderPref()?"":" (default, created automatically)"}</p>
      <button class="sheet-btn" onclick="chooseSyncFolder()"><span>${ICON.folder}</span> Choose a custom folder…</button>
      ${syncFolderPref() ? `<button class="sheet-btn" onclick="resetSyncFolder()"><span>${ICON.back}</span> Use default folder (workouts)</button>` : ""}
    ` : `<p class="sub">Hidden app data is invisible in Drive and private to this app. Choose "Drive folder" to sync to a visible health-tracker.json instead${getMode()==="drive"?" (you'll be asked to reconnect)":""}.</p>`}
    <button class="sheet-btn" onclick="loadExamples()"><span>${ICON.spark}</span> Load examples</button>
    <button class="sheet-btn danger" onclick="confirmClear()"><span>${ICON.trash}</span> Clear all data</button>
    <p class="sub" style="margin-top:10px">App version: ${typeof APP_VER==="string" && APP_VER.indexOf("__")<0 ? esc(APP_VER) : "dev"}</p>
    <div id="verFoot">${verFooterHTML()}</div>
  `);
}
/* ---------- category manager (Today/Plan sections, stored in state) ---------- */
function openCatMenu(){
  openSheet(`
    <h3>Categories</h3>
    <p class="sub">The sections on the Today and Plan tabs — add any you like. When plan items are pushed to Google Calendar, the category is stored on the event.</p>
    ${CATS().map((c,i)=>`<button class="sheet-btn" onclick="openCatEdit(${i})"><span>${ICON.pencil}</span> ${esc(c.name)}</button>`).join("")}
    <label class="fl">New category</label>
    <input class="field" id="catIn" placeholder="e.g. Stretch">
    <button class="primary" onclick="addCat()">Add category</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="openDataMenu()"><span>${ICON.back}</span> Back</button>`);
}
function addCat(){
  const n = document.getElementById("catIn").value.trim(); if(!n) return;
  state.categories.push({id:uid(), name:n});   /* uid → safe in inline handlers */
  save(); openCatMenu(); render();
}
function openCatEdit(i){
  const c = CATS()[i]; if(!c) return;
  openSheet(`
    <h3>Edit category</h3><p class="sub"></p>
    <label class="fl">Name</label><input class="field" id="catN" value="${esc(c.name)}">
    <button class="primary" onclick="saveCatEdit(${i})">Save</button>
    ${CATS().length>1?`<button class="sheet-btn danger" style="margin-top:8px" onclick="delCat(${i})"><span>${ICON.trash}</span> Delete category</button>`:""}
    <p class="sub">Deleting a category keeps its items — they move to an "Other" section.</p>
    <button class="sheet-btn" onclick="openCatMenu()"><span>${ICON.back}</span> Back</button>`);
  setTimeout(()=>document.getElementById("catN")?.focus(),250);
}
function saveCatEdit(i){
  const c = CATS()[i]; if(!c) return;
  const n = document.getElementById("catN").value.trim();
  if(n) c.name = n;
  save(); openCatMenu(); render();
}
function delCat(i){
  if(CATS().length<=1) return;
  state.categories.splice(i,1);
  save(); openCatMenu(); render();
}
const SECTIONS = [["workouts","Workouts"],["photos","Exercise photos"],["plans","Plans & goal"],["checks","Health checks"],["logs","Daily logs (move · meals · mind)"],["tags","Tags"]];
let expSel = {workouts:true, photos:true, plans:true, checks:true, logs:true, tags:true}, impSel = null, impHas = null;
function openDownloadMenu(){
  openSheet(`
    <h3>Download data</h3>
    <p class="sub">Choose what to include in the file.</p>
    <div class="chips">${SECTIONS.map(([k,l])=>`<button class="${expSel[k]?'on':''}" onclick="expSel['${k}']=!expSel['${k}'];openDownloadMenu()">${l}</button>`).join("")}</div>
    <button class="primary" onclick="doDownload()">Download</button>
  `);
}
function buildExport(){
  const out = {app:"health-tracker", savedAt:Date.now(), sevV2:true};
  if(expSel.workouts){ out.workouts = state.workouts; out.woFolders = state.woFolders; out.customEx = state.customEx; }
  if(expSel.photos) out.exImages = state.exImages;
  if(expSel.plans){ out.template = state.template; out.weekPlans = state.weekPlans; out.goal = state.goal; out.categories = state.categories; }
  if(expSel.checks || expSel.logs){
    out.days = {};
    for(const [k,d] of Object.entries(state.days)){
      const day = {};
      if(expSel.checks && d.gut?.length) day.gut = d.gut;
      if(expSel.logs){ day.items = d.items; day.orange = d.orange; }
      if(Object.keys(day).length) out.days[k] = day;
    }
  }
  if(expSel.tags) out.tags = state.tags;
  return out;
}
async function doDownload(){
  const json = JSON.stringify(buildExport(), null, 2);
  try{
    const file = new File([json], "health-tracker-data.json", {type:"application/json"});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:"Health Tracker data"});
      closeSheet(); return;
    }
  }catch(e){ if(e.name==="AbortError"){ closeSheet(); return; } }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], {type:"application/json"}));
  a.download = "health-tracker-data.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  closeSheet();
}
function badImport(){
  openSheet(`<h3>Invalid data</h3><p class="sub">That doesn't look like Health Tracker data.</p>
    <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
}
function importText(text){
  let parsed; try{ parsed = JSON.parse(text); }catch(e){ return badImport(); }
  importFlow(parsed);
}
let impCtx = null;   /* optional {title, sub, btn} to reword the picker (e.g. for examples) */
function importFlow(parsed, ctx){
  if(!parsed || typeof parsed !== "object") return badImport();
  impHas = {
    workouts: Array.isArray(parsed.workouts),
    plans: !!(parsed.template || parsed.weekPlans || parsed.goal),
    checks: !!parsed.days && Object.values(parsed.days).some(d=>d?.gut?.length),
    logs: !!parsed.days && Object.values(parsed.days).some(d=>d?.items || d?.orange != null),
    photos: !!parsed.exImages && Object.keys(parsed.exImages).length > 0,
    tags: Array.isArray(parsed.tags) && parsed.tags.length > 0
  };
  if(!Object.values(impHas).some(Boolean)) return badImport();
  window._pendingUpload = parsed;
  impSel = {...impHas};
  impCtx = ctx || null;
  renderImportSheet();
}
function renderImportSheet(){
  const c = impCtx || {
    title:"Import data",
    sub:"This file contains the sections below — choose what to import. Workouts and tags are added to yours; plans and same-date entries are overwritten.",
    btn:"Import selected"
  };
  openSheet(`
    <h3>${esc(c.title)}</h3>
    <p class="sub">${esc(c.sub)}</p>
    <div class="chips">${SECTIONS.filter(([k])=>impHas[k]).map(([k,l])=>`<button class="${impSel[k]?'on':''}" onclick="impSel['${k}']=!impSel['${k}'];renderImportSheet()">${l}</button>`).join("")}</div>
    <button class="primary" onclick="applyImport()">${esc(c.btn)}</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="window._pendingUpload=null;closeSheet()"><span>${ICON.back}</span> Cancel</button>
  `);
}
function applyImport(){
  const up = window._pendingUpload; window._pendingUpload = null;
  if(!up) return closeSheet();
  if(impSel.workouts && Array.isArray(up.workouts)){
    const have = new Set(state.workouts.map(w=>w.id));
    state.workouts = [...state.workouts, ...up.workouts.filter(w=>w && w.id && !have.has(w.id))];
    if(Array.isArray(up.woFolders)){
      const hf = new Set((state.woFolders||[]).map(f=>f.id));
      state.woFolders = [...(state.woFolders||[]), ...up.woFolders.filter(f=>f && f.id && !hf.has(f.id))];
    }
    if(Array.isArray(up.customEx)){
      const hn = new Set((state.customEx||[]).map(x=>x.n));
      state.customEx = [...(state.customEx||[]), ...up.customEx.filter(x=>x && x.n && !hn.has(x.n))];
    }

  }
  if(impSel.photos && up.exImages) state.exImages = {...(state.exImages||{}), ...up.exImages};
  if(impSel.plans){
    if(up.template) state.template = up.template;
    state.weekPlans = {...(state.weekPlans||{}), ...(up.weekPlans||{})};
    if(up.goal) state.goal = up.goal;
    if(Array.isArray(up.categories) && up.categories.length){   /* merge by id */
      const have = new Set(state.categories.map(c=>c.id));
      state.categories = [...state.categories, ...up.categories.filter(c=>c && c.id && c.name && !have.has(c.id))];
    }
  }
  if((impSel.checks || impSel.logs) && up.days){
    for(const [k,d] of Object.entries(up.days)){
      const cur = state.days[k] || (state.days[k] = {items:[], orange:0, gut:[]});
      if(impSel.checks && d.gut) cur.gut = d.gut;
      if(impSel.logs){ if(d.items) cur.items = d.items; if(d.orange != null) cur.orange = d.orange; }
    }
  }
  if(impSel.tags && Array.isArray(up.tags)) state.tags = [...new Set([...(state.tags||[]), ...up.tags])];
  save(); closeSheet(); render();
}
function uploadData(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>importText(r.result);
  r.readAsText(f);
  input.value = "";
}
function openPasteData(){
  openSheet(`
    <h3>Paste data</h3>
    <p class="sub">Paste the contents of a health-tracker-data.json file. Useful where the file picker is blocked (e.g. app previews).</p>
    <textarea class="field" id="pasteIn" rows="6" placeholder='{"days":{...},"template":{...}}'></textarea>
    <button class="primary" onclick="importText(document.getElementById('pasteIn').value)">Import</button>
  `);
  setTimeout(()=>document.getElementById("pasteIn").focus(),250);
}
function confirmClear(){
  openSheet(`
    <h3>Are you sure?</h3>
    <p class="sub">This permanently deletes all plans, logs, and health entries. Consider downloading a backup first.</p>
    <button class="primary" style="background:var(--bad)" onclick="clearAll()">Yes, delete everything</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="closeSheet()"><span>${ICON.back}</span> Cancel</button>
  `);
}
function clearAll(){
  state = { days:{}, goal:45, sevV2:true, tags:[], template:{}, weekPlans:{}, workouts:[], woFolders:[], customEx:[], exImages:{}, defRest:60, supRest:10,
    categories:[{id:"move",name:"Move"},{id:"meal",name:"Meals"},{id:"mind",name:"Mind"}] };
  for(let d=0; d<7; d++) state.template[d] = [];
  materializeToday();
  save(); closeSheet(); render();
}
/* Sample data lives as importable JSON in the repo's examples/ folder (served
   statically alongside the app). We fetch them, merge into one import payload,
   and route through the normal selective-import picker so the user chooses
   exactly what to load. All example workouts are collected into one "Examples"
   folder (the per-file folders in the JSON are ignored). Stable ids mean
   loading twice won't create duplicates. */
const EXAMPLE_FILES = [
  "examples/seven-minute-workouts.json",
  "examples/strength-routines.json",
  "examples/vinyasa-yoga.json",
  "examples/weekly-plan.json"
];
const EXAMPLES_FOLDER = {id:"exfolder", name:"Examples", open:true};
async function loadExamples(){
  openSheet(`<h3>Load examples</h3><p class="sub">Fetching sample data…</p>`);
  let files;
  try{
    files = await Promise.all(EXAMPLE_FILES.map(u =>
      /* Single-file builds embed the JSON (see build.sh); the hosted modular
         app has no EXAMPLE_DATA and fetches from the examples/ folder. */
      (typeof EXAMPLE_DATA !== "undefined" && EXAMPLE_DATA[u])
        ? Promise.resolve(EXAMPLE_DATA[u])
        : fetch(u, {cache:"no-store"}).then(r => { if(!r.ok) throw new Error(r.status); return r.json(); })
    ));
  }catch(e){ return exampleLoadError(); }

  const merged = {app:"health-tracker", sevV2:true, workouts:[], woFolders:[EXAMPLES_FOLDER], customEx:[], tags:[]};
  const seenEx = new Set();
  for(const f of files){
    if(!f || typeof f !== "object") continue;
    if(Array.isArray(f.workouts))
      for(const w of f.workouts) merged.workouts.push({...w, folderId:EXAMPLES_FOLDER.id});
    if(Array.isArray(f.customEx))
      for(const x of f.customEx){ if(x && x.n && !seenEx.has(x.n)){ seenEx.add(x.n); merged.customEx.push(x); } }
    if(f.template) merged.template = f.template;           // last one wins; only weekly-plan has it
    if(Array.isArray(f.tags)) merged.tags.push(...f.tags);
    if(f.goal != null) merged.goal = f.goal;
  }
  merged.tags = [...new Set(merged.tags)];

  importFlow(merged, {
    title:"Load examples",
    sub:'Choose exactly what to load. Sample workouts go into an "Examples" folder and are added to yours; loading the daily plan replaces your weekly template.',
    btn:"Load selected"
  });
}
function exampleLoadError(){
  openSheet(`
    <h3>Couldn't load examples</h3>
    <p class="sub">The sample files couldn't be loaded. On the hosted site they're fetched from the app's <b>examples/</b> folder — check your connection and try again.</p>
    <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>
  `);
}
let tagReturnToEdit = false;
function openAddTag(fromEdit){
  tagReturnToEdit = !!fromEdit;
  openSheet(`
    <h3>Add a tag</h3>
    <p class="sub">Anything you want to track — a symptom, mood, sleep, headaches.</p>
    <input class="field" id="tagIn" placeholder="e.g. Headache">
    <button class="primary" onclick="saveTag()">Add tag</button>
  `);
  setTimeout(()=>document.getElementById("tagIn").focus(),250);
}
function saveTag(){
  const t = document.getElementById("tagIn").value.trim();
  if(t && !state.tags.includes(t)) state.tags.push(t);
  save();
  if(tagReturnToEdit && gutEdit){ tagReturnToEdit=false; if(t) gutEdit.draft.tags.push(t); renderGutSheet(); }
  else { closeSheet(); render(); }
}
