/* ---------- settings menu (tap the pill) ---------- */
function openDataMenu(){
  const m = getMode();
  openSheet(`
    <h3>Storage & data</h3>
    <p class="sub">Choose where your data lives.</p>
    <button class="sheet-btn" onclick="setStorageMode('local')"><span>${m==="local"?ICON.check:ICON.device}</span> This device only (local)</button>
    <button class="sheet-btn" onclick="setStorageMode('drive')"><span>${m==="drive"?ICON.check:ICON.cloud}</span> Sync with Google Drive</button>
    ${m==="drive" && DRIVE.status!=="on" ? `<button class="sheet-btn" onclick="closeSheet();driveConnect()"><span>${ICON.chain}</span> Connect to Drive now</button>` : ""}
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
    <div style="margin:10px 0 4px"><label class="fl">Google Picker API key (optional)</label>
      <input class="field" type="text" placeholder="AIza…" value="${esc(VIS.API_KEY)}" onchange="setVisApiKey(this)" autocomplete="off" spellcheck="false">
      <p class="sub">Lets "Save to / Open from Drive" and the custom sync folder use the Google file browser. Stored on this device only — see the comment in js/04-drive.js for setup steps.</p>
    </div>
    <button class="sheet-btn" onclick="loadExample()"><span>${ICON.spark}</span> Load example plan</button>
    <button class="sheet-btn danger" onclick="confirmClear()"><span>${ICON.trash}</span> Clear all data</button>
  `);
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
  if(expSel.plans){ out.template = state.template; out.weekPlans = state.weekPlans; out.goal = state.goal; }
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
function importFlow(parsed){
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
  renderImportSheet();
}
function renderImportSheet(){
  openSheet(`
    <h3>Import data</h3>
    <p class="sub">This file contains the sections below — choose what to import. Workouts and tags are added to yours; plans and same-date entries are overwritten.</p>
    <div class="chips">${SECTIONS.filter(([k])=>impHas[k]).map(([k,l])=>`<button class="${impSel[k]?'on':''}" onclick="impSel['${k}']=!impSel['${k}'];renderImportSheet()">${l}</button>`).join("")}</div>
    <button class="primary" onclick="applyImport()">Import selected</button>
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
  state = { days:{}, goal:45, sevV2:true, tags:[], template:{}, weekPlans:{}, workouts:[], woFolders:[], customEx:[], exImages:{}, defRest:60, supRest:10 };
  for(let d=0; d<7; d++) state.template[d] = [];
  materializeToday();
  save(); closeSheet(); render();
}
function loadExample(){
  state.tags = ["Low energy","Headache","Poor sleep","Nausea","Stressed","Sore muscles"];
  if(!(state.workouts||[]).length){
    const exFolder = {id:uid(), name:"Examples", open:true};
    state.woFolders = [...(state.woFolders||[]), exFolder];
    const mkEx = (n,sets,val,rest)=>{ const l = EXLIB.find(x=>x.n===n);
      return {n, c:l.c, mode:l.t?"time":"reps", sets, reps:l.t?10:val, secs:l.t?val:30, rest}; };
    state.workouts = [
      {id:uid(), name:"Full body strength", exercises:[
        mkEx("Goblet Squat",3,12,60), mkEx("Lunge",3,10,60),
        mkEx("Biceps Curl",3,12,45), mkEx("Triceps Dip",3,10,45),
        mkEx("Plank",3,40,30), mkEx("Dead Bug",3,10,30),
        mkEx("Hamstring Stretch",1,45,0), mkEx("Foam Roll Quads",1,60,0), mkEx("Foam Roll Back",1,60,0)]},
      {id:uid(), name:"Yoga flow", exercises:[
        mkEx("Cat Cow",1,60,0), mkEx("Downward Dog",1,45,0), mkEx("Warrior II",2,30,0),
        mkEx("Cobra Pose",1,30,0), mkEx("Pigeon Pose",2,45,0), mkEx("Child's Pose",1,60,0)]},
      {id:uid(), name:"Pilates", exercises:[
        mkEx("Hundred",1,60,15), mkEx("Roll Up",2,8,15), mkEx("Single Leg Circle",2,8,15),
        mkEx("Scissor Kick",2,10,15), mkEx("Swimming",2,30,15), mkEx("Criss Cross",2,10,15)]},
      {id:uid(), name:"Upper body", exercises:[
        mkEx("Push Up",3,12,60), mkEx("Bent Over Row",3,12,60),
        mkEx("Overhead Press",3,10,60), mkEx("Lateral Raise",3,12,45), mkEx("Triceps Extension",3,12,45)]},
      {id:uid(), name:"HIIT cardio", exercises:[
        mkEx("Jumping Jacks",3,40,20), mkEx("High Knees",3,30,20),
        mkEx("Burpee",3,10,30), mkEx("Mountain Climber",3,30,20), mkEx("Jump Rope",3,60,30)]},
      {id:uid(), name:"Foam roll recovery", exercises:[
        mkEx("Foam Roll Quads",1,60,0), mkEx("Foam Roll Hamstrings",1,60,0),
        mkEx("Foam Roll Calves",1,60,0), mkEx("Foam Roll Back",1,60,0), mkEx("Hip Flexor Stretch",2,45,0)]}
    ];
    state.workouts.forEach(w=>w.folderId = exFolder.id);
  }
  if(!state.workouts.some(w=>w.name==="7-Minute Workout")){
    const nf = {id:uid(), name:"NYT 7-minute Workout", open:true};
    state.woFolders.push(nf);
    const t = (n,secs,rest)=>{ const l = EXLIB.find(x=>x.n===n);
      return {n, c:l.c, mode:"time", sets:1, reps:10, secs, rest}; };
    state.workouts.push(
      {id:uid(), folderId:nf.id, name:"7-Minute Workout", exercises:[
        t("Jumping Jacks",30,10), t("Wall Squat",30,10), t("Push Up",30,10), t("Crunch",30,10),
        t("Step Up",30,10), t("Squat",30,10), t("Triceps Dip",30,10), t("Plank",30,10),
        t("High Knees",30,10), t("Lunge",30,10), t("Push Up with Rotation",30,10), t("Side Plank",30,0)]},
      {id:uid(), folderId:nf.id, name:"Advanced 7-Minute Workout", exercises:[
        t("Reverse Lunge with Rotation",30,0), t("Lateral Pillar Bridge",30,0), t("Push-Up to Row to Burpee",60,0),
        t("Lateral Pillar Bridge",30,0), t("Single Leg RDL to Curl to Press",60,0), t("Single Leg RDL to Curl to Press",60,0),
        t("Plank with Arm Lift",30,0), t("Lateral Lunge to Overhead Triceps Extension",60,0), t("Bent Over Row",60,0)]}
    );
  }
  state.template = {};
  for(let d=0; d<7; d++){
    state.template[d] = [...(DEFAULT_TEMPLATE[d]||[]), ...DAILY].map(x=>({...x, id:uid()}));
  }
  const k = todayKey(), day = state.days[k];
  const keep = day ? {orange:day.orange, gut:day.gut} : {orange:0, gut:[]};
  state.days[k] = {
    items: state.template[new Date().getDay()].map(t=>({...t, tid:t.id, id:uid(), status:"planned", actual:""})),
    ...keep
  };
  save(); closeSheet(); render();
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
