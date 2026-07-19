let woViewId = null, PLAYER = null;
let woEditId = null, exQ = "", exCat = "all", exIdx = null, editWoList = false, editExList = false, delWoId = null;
function woRowDown(ev){ pressBegin(ev, ()=>{ editWoList=!editWoList; render(); }); }
function woRowTap(id){ clearTimeout(pressTimer); if(longPressed){ longPressed=false; return; } woViewId=id; render(); }
function exRowDown(ev){ pressBegin(ev, ()=>{ editExList=!editExList; render(); }); }
function exRowTap(i){ clearTimeout(pressTimer); if(longPressed){ longPressed=false; return; } openExEdit(i); }
let drag = null;
function dragStart(ev, kind, ref){
  ev.stopPropagation(); ev.preventDefault();
  clearTimeout(pressTimer);
  const row = ev.target.closest(".item");
  const rows = [...row.parentElement.querySelectorAll(".item")];
  drag = {kind, ref, row, startY: ev.clientY, to: rows.indexOf(row), idx: rows.indexOf(row), h: row.offsetHeight,
    others: rows.filter(r=>r!==row).map(r=>{
      const b = r.getBoundingClientRect();
      return {el:r, mid: b.top + b.height/2, before: rows.indexOf(r) < rows.indexOf(row)};
    })};
  row.style.transition = "none"; row.style.zIndex = "5";
  row.style.boxShadow = "0 6px 18px rgba(40,50,43,.18)";
  drag.others.forEach(o=>{ o.el.style.transition = "transform .15s ease"; });
  const mid = row.getBoundingClientRect(); drag.center = mid.top + mid.height/2;
  document.addEventListener("pointermove", dragMove);
  document.addEventListener("pointerup", dragEnd, {once:true});
}
function dragMove(ev){
  if(!drag) return;
  const dy = ev.clientY - drag.startY;
  drag.row.style.transform = `translateY(${dy}px)`;
  const c = drag.center + dy;
  let up = 0, down = 0;
  drag.others.forEach(o=>{
    if(!o.before && c > o.mid){ o.el.style.transform = `translateY(${-drag.h}px)`; up++; }
    else if(o.before && c < o.mid){ o.el.style.transform = `translateY(${drag.h}px)`; down++; }
    else o.el.style.transform = "";
  });
  drag.to = drag.idx + up - down;
}
function dragEnd(){
  document.removeEventListener("pointermove", dragMove);
  if(!drag) return;
  if(drag.kind === "ex"){
    const list = curWo().exercises;
    const [it] = list.splice(drag.ref, 1); list.splice(drag.to, 0, it);
  } else if(drag.kind === "folder"){
    /* position among folder headers only */
    const seq = drag.others.map(o=>o.el).filter(el=>el.dataset.kind==="folder");
    const c = drag.row.getBoundingClientRect().top + drag.h/2;
    let to = 0; seq.forEach(el=>{ if(c > el.getBoundingClientRect().top + el.offsetHeight/2) to++; });
    const from = state.woFolders.findIndex(f=>f.id===drag.ref);
    const [f] = state.woFolders.splice(from, 1); state.woFolders.splice(to, 0, f);
  } else {
    /* workout: rebuild order + folder assignment from the visible sequence */
    const seq = drag.others.map(o=>({kind:o.el.dataset.kind, fid:o.el.dataset.fid, wid:o.el.dataset.wid}));
    seq.splice(Math.max(0, Math.min(drag.to, seq.length)), 0, {kind:"dragged"});
    const wo = woById(drag.ref);
    const buckets = {"":[]}; (state.woFolders||[]).forEach(f=>buckets[f.id]=[]);
    let cur = "";
    seq.forEach(e=>{
      if(e.kind==="folder") cur = e.fid;
      else if(e.kind==="dragged"){ buckets[cur].push(wo.id); wo.folderId = cur || null; }
      else if(e.kind==="wo") buckets[cur].push(e.wid);
    });
    const ordered = [];
    buckets[""].forEach(id=>ordered.push(id));
    (state.woFolders||[]).forEach(f=>{
      const hidden = f.open ? [] : state.workouts.filter(w=>w.folderId===f.id && w.id!==wo.id).map(w=>w.id);
      [...buckets[f.id], ...hidden].forEach(id=>ordered.push(id));
    });
    state.workouts = ordered.map(id=>woById(id) || state.workouts.find(w=>w.id===id)).filter(Boolean);
  }
  drag = null; longPressed = true; save(); render();
}
let linkDrag = null;
function linkDown(ev, i){
  ev.stopPropagation(); ev.preventDefault();
  clearTimeout(pressTimer);
  linkDrag = {from:i, x:ev.clientX, y:ev.clientY, moved:false, over:null};
  /* anchor at the centre of the source link icon, not the finger */
  const src = ev.target?.closest ? ev.target.closest(".pencilbtn") : null;
  if(src && src.getBoundingClientRect){
    const r = src.getBoundingClientRect();
    linkDrag.ax = r.left + r.width/2; linkDrag.ay = r.top + r.height/2;
  } else { linkDrag.ax = ev.clientX; linkDrag.ay = ev.clientY; }
  if(document.body && document.createElementNS){
    /* connector line overlay */
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.id = "linkline";
    svg.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60";
    svg.innerHTML = `<line x1="${linkDrag.ax}" y1="${linkDrag.ay}" x2="${linkDrag.ax}" y2="${linkDrag.ay}" stroke="var(--sage)" stroke-width="2.5" stroke-dasharray="5 5" stroke-linecap="round"/>`;
    document.body.appendChild(svg);
    /* ghost link icon following the finger */
    const g = document.createElement("div");
    g.id = "linkghost";
    g.style.cssText = "position:fixed;z-index:61;width:34px;height:34px;border-radius:50%;background:var(--sage);color:#fff;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:.9;box-shadow:0 4px 14px rgba(117,128,111,.45);transform:translate(-50%,-50%)";
    g.innerHTML = ICON.link;
    g.style.left = ev.clientX+"px"; g.style.top = ev.clientY+"px";
    document.body.appendChild(g);
  }
  try{ ev.target.setPointerCapture?.(ev.pointerId); }catch(e){}
  document.addEventListener("pointermove", linkMove);
  document.addEventListener("pointerup", linkUp, {once:true});
  document.addEventListener("pointercancel", linkCancel, {once:true});
}
function linkCancel(){
  /* iOS often ends a touch drag with pointercancel — treat it as a drop */
  linkUp();
}
function linkMove(ev){
  if(!linkDrag) return;
  if(Math.hypot(ev.clientX - linkDrag.x, ev.clientY - linkDrag.y) > 8) linkDrag.moved = true;
  const line = document.getElementById("linkline")?.firstElementChild;
  if(line){ line.setAttribute("x2", ev.clientX); line.setAttribute("y2", ev.clientY); }
  if(!document.elementFromPoint) return;
  const gh = document.getElementById("linkghost");
  const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-exi]");
  if(linkDrag.over && linkDrag.over !== row){
    linkDrag.over.style.outline = ""; linkDrag.over.style.background = "";
  }
  linkDrag.over = (row && +row.dataset.exi !== linkDrag.from) ? row : null;
  if(linkDrag.over){
    linkDrag.over.style.outline = "2px solid var(--sage)";
    linkDrag.over.style.background = "#EEF3EA";
    /* snap the ghost onto the hovered row's own link icon (same column as the source) */
    const icon = linkDrag.over.querySelector?.(".pencilbtn[title*='superset'], .pencilbtn[title*='unlink']");
    const r = (icon || linkDrag.over).getBoundingClientRect();
    const sx = icon ? r.left + r.width/2 : linkDrag.ax;
    const sy = r.top + r.height/2;
    if(gh){ gh.style.left = sx+"px"; gh.style.top = sy+"px"; gh.style.transform = "translate(-50%,-50%) scale(1.15)"; }
    if(line){ line.setAttribute("x2", sx); line.setAttribute("y2", sy); }
  } else if(gh){
    gh.style.left = ev.clientX+"px"; gh.style.top = ev.clientY+"px";
    gh.style.transform = "translate(-50%,-50%)";
  }
}
function linkUp(){
  document.removeEventListener("pointermove", linkMove);
  document.removeEventListener("pointercancel", linkCancel);
  document.removeEventListener("pointercancel", linkUp);
  document.getElementById("linkline")?.remove?.();
  document.getElementById("linkghost")?.remove?.();
  if(!linkDrag) return;
  const {from, moved, over} = linkDrag;
  linkDrag = null; longPressed = true;
  if(!moved){ unlinkEx(from); return; }
  if(over && over.dataset && +over.dataset.exi !== from){ linkEx(from, +over.dataset.exi); return; }
  render();
}
function linkEx(a, b){
  const w = curWo(), ea = w.exercises[a], eb = w.exercises[b];
  if(!ea || !eb) return;
  const g = ea.grp || eb.grp || uid();
  const old = [ea.grp, eb.grp].filter(x=>x && x !== g);
  w.exercises.forEach(x=>{ if(old.includes(x.grp)) x.grp = g; });
  ea.grp = g; eb.grp = g;
  w.exercises.forEach(x=>{ if(x.grp === g) x.rest = state.supRest ?? 10; });
  save(); render();
}
function unlinkEx(i){
  const w = curWo(), e = w.exercises[i];
  if(!e || !e.grp){ render(); return; }
  const g = e.grp; delete e.grp;
  e.rest = state.defRest ?? 60;
  const rest = w.exercises.filter(x=>x.grp === g);
  if(rest.length === 1){ delete rest[0].grp; rest[0].rest = state.defRest ?? 60; }
  save(); render();
}
function openRestEdit(i){
  const e = curWo()?.exercises[i]; if(!e) return;
  openSheet(`
    <h3>Rest after ${esc(e.n)}</h3>
    <p class="sub">Applied after every set${e.grp ? " — this exercise is in a superset" : ""}.</p>
    <div class="chips">${[0,10,30,60,90,120].map(v=>`<button class="${e.rest===v?'on':''}" onclick="setRest(${i},${v})">${v ? v+"s" : "None"}</button>`).join("")}</div>
    <label class="fl">Custom (s)</label>
    <input class="field" type="number" min="0" value="${e.rest}" onchange="setRest(${i}, parseInt(this.value)||0, true)">
    <button class="primary" onclick="closeSheet();render()">Done</button>
  `);
}
function setRest(i, v, keepOpen){
  const e = curWo()?.exercises[i]; if(!e) return;
  e.rest = Math.max(0, v);
  save();
  if(keepOpen) return;
  openRestEdit(i);
}
function removeExAt(i){ curWo().exercises.splice(i,1); save(); render(); /* stay in edit mode for bulk removing */ }
const woById = id => (state.workouts||[]).find(w=>w.id===id);
const curWo = () => woById(woEditId || woViewId);
function exShort(e){ return e.mode==="time" ? `${e.sets}×${e.secs}s` : `${e.sets}×${e.reps}`; }
/* optional weight: e.wt (number) + e.wu ("lb"|"kg") */
function wtLabel(e){ return e.wt > 0 ? `${e.wt} ${e.wu==="kg"?"kg":"lb"}` : ""; }
function exSummary(e){ return exShort(e) + (e.wt > 0 ? ` @ ${wtLabel(e)}` : "") + (e.rest ? ` · rest ${e.rest}s` : ""); }
function woSummary(w){ return w.exercises.map(e=>`${e.n} ${exShort(e)}${e.wt > 0 ? " @ "+wtLabel(e) : ""}`).join(" · "); }
function woMinutes(w){
  let s = 0;
  w.exercises.forEach(e=>{ s += e.sets * ((e.mode==="time" ? e.secs : e.reps*3) + (e.rest||0)); });
  return Math.max(1, Math.round(s/60));
}
function woRowHTML(w, indent){
  const pl = (editWoList?42:14) + (indent?16:0);
  const pr = editWoList ? 82 : 46;
  return `<button class="item" data-kind="wo" data-wid="${w.id}" style="position:relative;padding-left:${pl}px;padding-right:${pr}px"
    onpointerdown="woRowDown(event)" onclick="woRowTap('${w.id}')" onpointercancel="clearTimeout(pressTimer)" onpointerleave="clearTimeout(pressTimer)" oncontextmenu="return false">
    ${editWoList?`<span class="minus" style="top:50%;left:11px;transform:translateY(-50%)" onclick="delWoId='${w.id}';confirmDeleteWo();event.stopPropagation()" onpointerdown="event.stopPropagation()">−</span>
    <span class="pencilbtn" style="right:46px" onclick="woViewId='${w.id}';render();event.stopPropagation()" onpointerdown="event.stopPropagation()">${ICON.pencil}</span>
    <span class="draghandle" onpointerdown="dragStart(event,'wo','${w.id}')" oncontextmenu="return false">${ICON.grip}</span>`
    :`<span class="pencilbtn" style="font-size:19px;line-height:1;color:var(--sage)" onclick="openWoAdd('${w.id}');event.stopPropagation()" onpointerdown="event.stopPropagation()">+</span>`}
    <div class="exicon">${EXCAT[w.exercises[0]?.c]?.icon || EXCAT.arms.icon}</div>
    <div class="tx"><div class="t">${esc(w.name)}</div><div class="d">${w.exercises.length} exercise${w.exercises.length===1?"":"s"} · ≈${woMinutes(w)} min</div></div>
  </button>`;
}
function folderRowHTML(f){
  const n = state.workouts.filter(w=>w.folderId===f.id).length;
  return `<button class="item" data-kind="folder" data-fid="${f.id}" style="position:relative;background:#F7F9F5;padding-left:${editWoList?42:14}px;${editWoList?'padding-right:82px':''}"
    onpointerdown="woRowDown(event)" onclick="folderTap('${f.id}')" onpointercancel="clearTimeout(pressTimer)" onpointerleave="clearTimeout(pressTimer)" oncontextmenu="return false">
    ${editWoList?`<span class="minus" style="top:50%;left:11px;transform:translateY(-50%)" onclick="delFolderId='${f.id}';confirmDeleteFolder();event.stopPropagation()" onpointerdown="event.stopPropagation()">−</span>
    <span class="pencilbtn" style="right:46px" onclick="renameFolder('${f.id}');event.stopPropagation()" onpointerdown="event.stopPropagation()">${ICON.pencil}</span>
    <span class="draghandle" onpointerdown="dragStart(event,'folder','${f.id}')" oncontextmenu="return false">${ICON.grip}</span>`:""}
    <div class="exicon" style="background:transparent"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="transform:rotate(${f.open?90:0}deg);transition:transform .15s"><path d="M9 6l6 6-6 6"/></svg></div>
    <div class="tx"><div class="t">${esc(f.name)}</div></div>
    <span class="tag">${n}</span>
  </button>`;
}
function workoutsHTML(){
  if(PLAYER) return playerHTML();
  if(woViewId) return woOverviewHTML();
  const rows = [];
  state.workouts.filter(w=>!w.folderId).forEach(w=>rows.push(woRowHTML(w)));
  (state.woFolders||[]).forEach(f=>{
    rows.push(folderRowHTML(f));
    if(f.open) state.workouts.filter(w=>w.folderId===f.id).forEach(w=>rows.push(woRowHTML(w, true)));
  });
  return `
  <div class="top"><h1>Workouts</h1>${topBarHTML()}</div>
  <div class="sec">
    <div class="sec-h"><h2>My workouts</h2><button class="addbtn" onclick="openNewMenu()">+ New</button></div>
    <div class="card">
      ${rows.length ? rows.join("") : `<div class="empty">No workouts yet. Build one here, then pick it when adding to Today or Plan.</div>`}
    </div>
  </div>
  <p style="font-size:12px;color:var(--muted);margin:0 2px">Exercises use standard Garmin Connect names, so they map cleanly if you move a workout to your watch later. Long-press to edit, drag to reorder or move between folders.</p>`;
}
function openNewMenu(){
  openSheet(`
    <h3>Create new</h3><p class="sub"></p>
    <button class="sheet-btn" onclick="closeSheet();newWorkout()"><span>+</span> New workout</button>
    <button class="sheet-btn" onclick="newFolder()"><span>${ICON.folder}</span> New folder</button>
  `);
}
let delFolderId = null;
function folderById(id){ return (state.woFolders||[]).find(f=>f.id===id); }
function folderTap(id){
  clearTimeout(pressTimer);
  if(longPressed){ longPressed=false; return; }
  const f = folderById(id); f.open = !f.open;
  save(); render();
}
function newFolder(){
  openSheet(`
    <h3>New folder</h3><p class="sub"></p>
    <label class="fl">Name</label><input class="field" id="folderIn" placeholder="e.g. Strength">
    <button class="primary" onclick="saveNewFolder()">Create folder</button>
  `);
  setTimeout(()=>document.getElementById("folderIn").focus(),250);
}
function saveNewFolder(){
  const t = document.getElementById("folderIn").value.trim(); if(!t) return;
  state.woFolders.push({id:uid(), name:t, open:true});
  save(); closeSheet(); render();
}
function renameFolder(id){
  const f = folderById(id);
  openSheet(`
    <h3>Rename folder</h3><p class="sub"></p>
    <label class="fl">Name</label><input class="field" id="folderIn" value="${esc(f.name)}">
    <button class="primary" onclick="folderById('${id}').name=document.getElementById('folderIn').value.trim()||folderById('${id}').name;save();closeSheet();render()">Save</button>
  `);
}
function confirmDeleteFolder(){
  const f = folderById(delFolderId);
  const n = state.workouts.filter(w=>w.folderId===delFolderId).length;
  openSheet(`
    <h3>Delete "${esc(f.name)}"?</h3>
    <p class="sub">${n ? `This folder has ${n} workout${n===1?"":"s"} inside.` : "Workouts inside are kept and move out of the folder."}</p>
    ${n ? `<button class="primary" style="background:var(--bad)" onclick="deleteFolder(true)">Delete folder and ${n} workout${n===1?"":"s"}</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="deleteFolder(false)">Delete folder, keep workouts</button>`
    : `<button class="primary" style="background:var(--bad)" onclick="deleteFolder(false)">Delete folder</button>`}
    <button class="sheet-btn" style="margin-top:8px" onclick="closeSheet()"><span>${ICON.back}</span> Cancel</button>
  `);
}
function deleteFolder(withWorkouts){
  if(withWorkouts) state.workouts = state.workouts.filter(w=>w.folderId!==delFolderId);
  else state.workouts.forEach(w=>{ if(w.folderId===delFolderId) w.folderId = null; });
  state.woFolders = state.woFolders.filter(f=>f.id!==delFolderId);
  delFolderId = null;
  save(); closeSheet(); render();
}
function newWorkout(){
  const w = {id:uid(), name:"New workout", exercises:[]};
  state.workouts.push(w); woViewId = w.id;
  save(); render(); openRenameWo();
}
function fmtSecs(x){ const m = Math.floor(x/60); return m ? m+":"+String(x%60).padStart(2,"0") : String(x); }
function woOverviewHTML(){
  const w = woById(woViewId);
  if(!w){ woViewId = null; return workoutsHTML(); }
  const L = grpLetters(w);
  return `
  <div class="top"><div style="display:flex;align-items:center;gap:6px;min-width:0">
    <button class="daynav" onclick="woViewId=null;editExList=false;render()">‹</button><h1 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.name)}</h1>
  </div>${topBarHTML()}</div>
  <p class="sub" style="margin:-4px 0 10px 2px">${w.exercises.length} exercise${w.exercises.length===1?"":"s"} · ≈${woMinutes(w)} min</p>
  <button class="primary" style="font-size:16px" onclick="beginWorkout()" ${w.exercises.length?"":"disabled"}>▶︎ Begin workout</button>
  <div style="display:flex;gap:8px;margin:10px 0 4px">
    <button class="iconbtn" onclick="openRenameWo()" title="Rename" data-tip="Rename workout" aria-label="Rename">${ICON.pencil}</button>
    <button class="iconbtn" onclick="openWoAdd(woViewId)" title="Add to plan" data-tip="Add to plan (today, a date, or weekly)" aria-label="Add to plan" style="font-size:18px;color:var(--sage)">+</button>
    <button class="iconbtn" onclick="openShareWo()" title="Share" data-tip="Share this workout (link or Drive file)" aria-label="Share" ${w.exercises.length?"":"disabled"}>${ICON.share}</button>
    <button class="iconbtn" onclick="downloadFit()" title="Download .fit" data-tip="Download Garmin workout (.fit) for your watch" aria-label="Download FIT">${ICON.down}</button>
    <button class="iconbtn" onclick="delWoId=woViewId;confirmDeleteWo()" title="Delete" data-tip="Delete workout" aria-label="Delete">${ICON.trash}</button>
  </div>
  <div class="sec">
    <div class="sec-h"><h2>Exercises</h2><button class="addbtn" onclick="openExPicker()">+ Add</button></div>
    <div class="card">
      ${w.exercises.length ? w.exercises.map((e,i)=>`
        <button class="item" data-exi="${i}" style="position:relative;overflow:visible;${editExList?'padding-left:42px;padding-right:118px;':''}${e.grp?'box-shadow:inset 3px 0 0 var(--sage);':''}"
          onpointerdown="exRowDown(event)" onclick="exRowTap(${i})" onpointercancel="clearTimeout(pressTimer)" onpointerleave="clearTimeout(pressTimer)" oncontextmenu="return false">
          ${editExList?`<span class="minus" style="top:50%;left:11px;transform:translateY(-50%)" onclick="removeExAt(${i});event.stopPropagation()" onpointerdown="event.stopPropagation()">−</span>
          <span class="pencilbtn" style="right:82px;touch-action:none;${e.grp?'color:var(--sage)':''}" title="${e.grp?'Tap to unlink':'Drag onto another exercise to superset'}" onpointerdown="linkDown(event,${i})" oncontextmenu="return false">${ICON.link}</span>
          <span class="pencilbtn" style="right:46px" onclick="openExEdit(${i});exEditMode=true;renderExEdit();event.stopPropagation()" onpointerdown="event.stopPropagation()">${ICON.pencil}</span>
          <span class="draghandle" onpointerdown="dragStart(event,'ex',${i})" oncontextmenu="return false">${ICON.grip}</span>`:""}
          <div class="exicon" style="overflow:hidden">${state.exImages[e.n] ? `<img src="${state.exImages[e.n]}" style="width:100%;height:100%;object-fit:cover">` : FEDB[e.n] ? fedbAnimHTML(e.n,"exanim") : YOGADB[e.n]?.img ? yogaImgHTML(e.n,"exanim") : EXCAT[e.c].icon}</div>
          <div class="tx"><div class="t">${esc(e.n)}</div><div class="d">${exSummary(e)}${e.grp?` · superset ${L[e.grp]}`:""}</div></div>
          ${e.grp?`<span class="tag" style="background:var(--sage);color:#fff">${L[e.grp]}</span>`:""}
          ${i < w.exercises.length-1 ? `<span class="restpill ${e.grp?'sup':''}" onclick="openRestEdit(${i});event.stopPropagation()" onpointerdown="event.stopPropagation()">Rest ${e.rest}s</span>` : ""}
        </button>`).join("") : `<div class="empty">Add your first exercise — long-press rows to reorder, remove, or superset.</div>`}
    </div>
  </div>`;
}
/* "Add to plan" for a workout: today, a picked date, or the weekly template.
   Was referenced by two + buttons but never implemented (pre-refactor bug). */
function woAsItem(w, forDay){
  const it = {id:uid(), type:"move", title:w.name, detail:woSummary(w), workoutId:w.id};
  return forDay ? {...it, status:"planned", actual:""} : it;
}
function openWoAdd(id){
  const w = woById(id); if(!w) return;
  openSheet(`
    <h3>Add "${esc(w.name)}"</h3><p class="sub">To today, a specific date, or your recurring weekly plan.</p>
    <button class="sheet-btn" onclick="woAddToDate('${id}', null)"><span>${ICON.check}</span> Today</button>
    <button class="sheet-btn" onclick="woAddPickDate('${id}')"><span>${ICON.open}</span> Pick a date…</button>
    <p class="sub" style="margin-top:12px">Every week on:</p>
    <div class="chips">${DAY_NAMES.map((n,i)=>`<button onclick="woAddToTemplate('${id}',${i})">${n}</button>`).join("")}</div>
  `);
}
function woAddPickDate(id){
  /* When calendar push is on, a time input appears under the date grid. */
  openCalendar(new Date(), (d, tm)=>woAddToDate(id, d, tm),
    gcalPushEnabled() ? {time: gcalDefTime()} : {});
}
function woAddToDate(id, date, tm){
  const w = woById(id); if(!w) return;
  const d = date || new Date();
  materializeDay(d);
  const it = woAsItem(w, true);
  state.days[todayKey(d)].items.push(it);
  /* Push as a one-off event: picked time, or the current time for "Today". */
  const p = n=>String(n).padStart(2,"0");
  const now = new Date();
  gcalPushDayItems([it], {dateKey: todayKey(d),
    time: tm || (date ? gcalDefTime() : `${p(now.getHours())}:${p(now.getMinutes())}`),
    dur: woMinutes(w)});
  save(); closeSheet(); render();
}
function woAddToTemplate(id, dow){
  const w = woById(id); if(!w) return;
  state.template[dow] = state.template[dow] || [];
  const it = woAsItem(w, false);
  state.template[dow].push(it);
  gcalPushPlanItems([it], {dow, weekMonday:null, dur:woMinutes(w)});   /* optional calendar push */
  save(); closeSheet();
  openSheet(`<h3>Added</h3><p class="sub">"${esc(w.name)}" is now in every ${DAY_NAMES[dow]}'s plan. Edit it on the Plan tab.</p>
    <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.check}</span> Done</button>`);
  render();
}
function openRenameWo(){
  const w = woById(woViewId); if(!w) return;
  openSheet(`
    <h3>Rename workout</h3><p class="sub"></p>
    <label class="fl">Name</label><input class="field" id="woNameIn" value="${esc(w.name)}">
    <button class="primary" onclick="const v=document.getElementById('woNameIn').value.trim(); if(v){ woById(woViewId).name=v; save(); } closeSheet(); render()">Save</button>
  `);
  setTimeout(()=>document.getElementById("woNameIn")?.focus(), 250);
}
function grpLetters(w){
  const map = {}; let n = 0;
  w.exercises.forEach(e=>{ if(e.grp && !(e.grp in map)) map[e.grp] = String.fromCharCode(65+n++); });
  return map;
}
function expandWorkout(w){
  const out = [], done = new Set();
  w.exercises.forEach((e,i)=>{
    if(done.has(i)) return;
    let members = [i];
    if(e.grp) members = w.exercises.map((x,j)=>x.grp===e.grp ? j : -1).filter(j=>j>=0);
    members.forEach(j=>done.add(j));
    const maxSets = Math.max(...members.map(j=>w.exercises[j].sets));
    for(let s2=1; s2<=maxSets; s2++)
      members.forEach(j=>{
        const x = w.exercises[j];
        if(s2 <= x.sets){
          out.push({e:x, set:s2, sets:x.sets});
          if(x.rest > 0) out.push({restSecs:x.rest});
        }
      });
  });
  return out;
}
function confirmDeleteWo(){
  openSheet(`
    <h3>Delete this workout?</h3>
    <p class="sub">Days that already reference it keep their copy.</p>
    <button class="primary" style="background:var(--bad)" onclick="deleteWo()">Delete workout</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="closeSheet()"><span>${ICON.back}</span> Cancel</button>`);
}
function deleteWo(){
  state.workouts = state.workouts.filter(w=>w.id!==delWoId);
  if(woEditId===delWoId) woEditId = null;
  if(woViewId===delWoId) woViewId = null;
  delWoId = null;
  save(); closeSheet(); render();
}
/* exercise picker */
function openExPicker(){ exSwapMode=false; exQ=""; exCat="all"; renderExPicker(); }
function pickerList(){
  return [...EXLIB, ...(state.customEx||[]).map(x=>({...x, custom:true}))];
}
function exListHTML(){
  const w = curWo(), all = pickerList();
  const list = all.filter(e=>(exCat==="all"||e.c===exCat) && e.n.toLowerCase().includes(exQ.toLowerCase()));
  return list.map(e=>{
    const count = w.exercises.filter(x=>x.n===e.n).length;
    const act = exSwapMode ? `swapEx(${all.indexOf(e)})` : `addEx(${all.indexOf(e)})`;
    return `<button class="item" onclick="${act}">
      <div class="exicon">${state.exImages[e.n] ? `<img src="${state.exImages[e.n]}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : EXCAT[e.c].icon}</div>
      <div class="tx"><div class="t">${esc(e.n)}</div><div class="d">${EXCAT[e.c].label}${e.custom ? " · custom" : (GC[e.n] ? "" : " · not on Garmin")}</div></div>
      ${e.custom?`<span class="tag">custom</span><span class="minus" style="position:static;transform:none;margin-left:6px" onclick="removeCustomEx(${(state.customEx||[]).findIndex(x=>x.n===e.n)});event.stopPropagation()" onpointerdown="event.stopPropagation()">−</span>`:""}
      ${count?`<span class="tag" style="background:var(--orange-soft);color:#9A4A1B">×${count}</span>`:""}
    </button>`;
  }).join("") || `<div class="empty">No match.</div>`;
}
let newEx = null;
function openNewExercise(){
  newEx = {c:"core", t:0};
  openSheet(`
    <h3>New custom exercise</h3>
    <p class="sub">Yours only — exports to Garmin as a text step, no animation.</p>
    <label class="fl">Name</label>
    <input class="field" id="cexName" placeholder="e.g. Farmer's Carry">
    <label class="fl">Category</label>
    <div class="chips">${Object.keys(EXCAT).map(c=>`<button class="${newEx.c===c?'on':''}" onclick="newEx.c='${c}';newEx.nm=document.getElementById('cexName').value;openNewExerciseRe()">${EXCAT[c].label}</button>`).join("")}</div>
    <label class="fl">Photo (optional)</label>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
      ${newEx.img ? `<img src="${newEx.img}" style="width:52px;height:52px;border-radius:10px;object-fit:cover">` : ""}
      <label for="exImgIn" style="color:var(--sage);font-size:13px;cursor:pointer" onclick="exImgTarget='__newEx';newEx.nm=document.getElementById('cexName').value">${newEx.img ? "Replace" : "Add photo"}</label>
      ${newEx.img ? `<button style="border:none;background:none;color:var(--bad);font-size:13px;cursor:pointer;padding:0" onclick="newEx.img=null;newEx.nm=document.getElementById('cexName').value;openNewExerciseRe()">Remove</button>` : ""}
    </div>
    <label class="fl">Measured by</label>
    <div class="seg">
      <button class="${!newEx.t?'on':''}" onclick="newEx.t=0;newEx.nm=document.getElementById('cexName').value;openNewExerciseRe()">Reps</button>
      <button class="${newEx.t?'on':''}" onclick="newEx.t=1;newEx.nm=document.getElementById('cexName').value;openNewExerciseRe()">Time</button>
    </div>
    <button class="primary" onclick="saveNewExercise()">Create exercise</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="renderExPicker()"><span>${ICON.back}</span> Back to list</button>
  `);
  setTimeout(()=>{ const i=document.getElementById("cexName"); if(i){ i.value = newEx.nm||""; i.focus(); } },50);
}
function openNewExerciseRe(){ const nm = newEx.nm; openNewExercise.call(null); newEx.nm = nm; const i=document.getElementById("cexName"); if(i) i.value = nm||""; }
function saveNewExercise(){
  const n = document.getElementById("cexName").value.trim();
  if(!n) return;
  if(pickerList().some(e=>e.n.toLowerCase()===n.toLowerCase())) return;
  state.customEx.push({n, c:newEx.c, t:newEx.t?1:undefined});
  if(newEx.img) state.exImages[n] = newEx.img;
  save(); renderExPicker();
}
function removeCustomEx(i){
  if(i<0) return;
  state.customEx.splice(i,1);
  save(); renderExPicker();
}
function renderExPicker(){
  const swap = exSwapMode;
  openSheet(`
    <h3>${swap ? "Swap exercise" : "Add exercises"}</h3>
    <p class="sub">${swap ? "Tap an exercise to replace this one — sets, reps and rest are kept." : "Standard Garmin Connect exercises — tap to add, as many as you like."}</p>
    <input class="field" id="exQin" placeholder="Search exercises" value="${esc(exQ)}"
      oninput="exQ=this.value;document.getElementById('exList').innerHTML=exListHTML()">
    <div class="chips">${["all",...Object.keys(EXCAT)].map(c=>
      `<button class="${exCat===c?'on':''}" onclick="exCat='${c}';renderExPicker()">${c==="all"?"All":EXCAT[c].label}</button>`).join("")}</div>
    <button class="sheet-btn" style="margin:2px 0 8px" onclick="openNewExercise()"><span style="color:var(--sage)">+</span> Create custom exercise</button>
    <div class="card exlist" id="exList">${exListHTML()}</div>
    <button class="primary" style="margin-top:12px" onclick="${swap ? "exSwapMode=false;renderExEdit()" : "closeSheet();render()"}">${swap ? "Cancel" : "Done"}</button>
  `);
}
function addEx(libIdx){
  const l = pickerList()[libIdx], w = curWo(); if(!l || !w) return;
  w.exercises.push({n:l.n, c:l.c, mode:l.t?"time":"reps", sets:3, reps:10, secs:30, rest:state.defRest??60});
  save();
  document.getElementById("exList").innerHTML = exListHTML();
}
/* exercise config */
function openExEdit(i){
  const n = curWo()?.exercises.length || 0;
  if(i < 0 || i >= n) return;
  exIdx = i; exEditMode = false; exMediaView = null; exRenaming = false; renderExEdit();
}
let exEditMode = false, exMediaView = null, exRenaming = false, exSwapMode = false;
/* Swap the exercise at exIdx for another from the library, keeping its
   sets/reps/rest/weight/superset config. */
function swapEx(libIdx){
  const l = pickerList()[libIdx], w = curWo(), e = w?.exercises[exIdx];
  if(!l || !e) return;
  e.n = l.n; e.c = l.c; e.mode = l.t ? "time" : "reps";
  save(); exSwapMode = false; renderExEdit();
}
function openSwapPicker(){ exSwapMode = true; exQ = ""; exCat = "all"; renderExPicker(); }
/* Rename a custom exercise everywhere it's referenced: the customEx entry,
   every workout that uses it, and its photo key. Returns false on empty name
   or a collision with an existing exercise. */
function renameCustomEx(oldN, newN){
  newN = (newN||"").trim();
  if(!newN) return false;
  if(pickerList().some(x=>x.n.toLowerCase()===newN.toLowerCase() && x.n!==oldN)) return false;
  const cx = (state.customEx||[]).find(x=>x.n===oldN);
  if(!cx) return false;
  cx.n = newN;
  (state.workouts||[]).forEach(w=>(w.exercises||[]).forEach(ex=>{ if(ex.n===oldN) ex.n = newN; }));
  if(state.exImages[oldN]){ state.exImages[newN] = state.exImages[oldN]; delete state.exImages[oldN]; }
  save();
  return true;
}
function commitRenameEx(){
  const inp = document.getElementById("exRenameIn"), e = curWo()?.exercises[exIdx];
  if(!inp || !e) return;
  if(!renameCustomEx(e.n, inp.value)){ inp.style.borderColor = "var(--bad)"; return; }
  exRenaming = false; renderExEdit(); render();
}
let exImgTarget = null;
function setExImgTarget(){ exImgTarget = curWo()?.exercises[exIdx]?.n || null; }
function uploadExImage(input){
  const f = input.files[0], name = exImgTarget;
  input.value = "";
  if(!f || !name) return;
  const r = new FileReader();
  r.onload = ()=>{
    const img = new Image();
    img.onload = ()=>{
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.75);
      if(name === "__newEx"){ if(newEx){ newEx.img = url; newEx.nm = document.getElementById("cexName")?.value ?? newEx.nm; openNewExerciseRe(); } return; }
      state.exImages[name] = url;
      save();
      if(curWo()?.exercises[exIdx]?.n === name) renderExEdit();
    };
    img.src = r.result;
  };
  r.readAsDataURL(f);
}
function removeExImage(){
  const n = curWo()?.exercises[exIdx]?.n;
  if(n){ delete state.exImages[n]; save(); renderExEdit(); }
}
function exViewHTML(e){
  const m = EXMEDIA[e.n], fe = FEDB[e.n], desc = exDesc(e.n);
  const hasG = m && m !== "none" && m !== "err";
  const yoga = YOGADB[e.n]?.img ? YOGADB[e.n] : null;
  const custom = state.exImages[e.n];
  let left = "";
  if(custom) left = `<img class="exanim" src="${custom}">`;
  else if(fe) left = fedbAnimHTML(e.n, "exanim");
  else if(yoga) left = yogaImgHTML(e.n, "exanim");
  else if(hasG) left = `<img class="exanim" src="${m.img}" onclick="exMediaView=exMediaView==='garmin'?null:'garmin';renderExEdit()">`;
  else if(!m && GC[e.n]) left = `<div class="exanim" style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;min-height:88px">Loading\u2026</div>`;
  else left = `<div class="exanim" style="display:flex;align-items:center;justify-content:center;min-height:88px"><span class="exicon" style="width:44px;height:44px">${EXCAT[e.c].icon}</span></div>`;
  if(!custom && (fe || yoga) && hasG)
    left += `<img class="exgthumb ${exMediaView==='garmin'?'on':''}" src="${m.img}" title="Garmin animation" onclick="exMediaView=exMediaView==='garmin'?null:'garmin';renderExEdit()">`;
  left += `<div style="margin-top:8px;display:flex;gap:10px;font-size:12px">
    <label for="exImgIn" style="color:var(--sage);cursor:pointer" onclick="setExImgTarget()">${custom ? "Replace photo" : "Add photo"}</label>
    ${custom ? `<button style="border:none;background:none;color:var(--bad);font-size:12px;cursor:pointer;padding:0" onclick="removeExImage()">Remove</button>` : ""}
  </div>`;
  const big = (exMediaView === "garmin" && hasG && m.vid)
    ? `<div class="exmedia"><video src="${m.vid}" poster="${m.img}" autoplay loop muted playsinline onclick="this.paused?this.play():this.pause()"></video></div>` : "";
  const notes = [];
  if(custom) notes.push("your photo");
  if(hasG) notes.push(`animation \u00a9 Garmin Ltd. (<a href="${m.page}" target="_blank" style="color:var(--sage)">Garmin Connect</a>, personal use)`);
  if(m === "err" && GC[e.n] && !custom && !fe && !yoga) notes.push(`<a href="${GC_PAGE + GC[e.n]}" target="_blank" style="color:var(--sage)">View on Garmin Connect \u2192</a>`);
  if(!custom && fe) notes.push(`photos: free-exercise-db (public domain)`);
  if(!custom && !fe && yoga){ const _cr = YOGADB[e.n].credit || (yoga.img && yoga.img.includes("res.cloudinary.com") ? `pose art: <a href="https://github.com/alexcumplido/yoga-api" target="_blank" style="color:var(--sage)">Yoga API</a> · CC0 / Flaticon (monkik, dDara)` : ""); if(_cr) notes.push(_cr); }
  if(!GC[e.n]) notes.push(`custom / non-Garmin exercise \u2014 exports as a text-only step`);
  return `
    <div class="exsplit">
      <div class="l">${left}</div>
      <div class="r">${desc ? `<p class="exinstr">${esc(desc)}</p>` : `<p class="exinstr" style="color:var(--muted)">No description available.</p>`}</div>
    </div>
    ${big}
    ${notes.length?`<div class="exnote">${notes.join(" \u00b7 ")}</div>`:""}`;
}
function renderExEdit(){
  const w = curWo(), e = w.exercises[exIdx];
  if(!e){ closeSheet(); return; }
  const time = e.mode==="time";
  const isCustom = (state.customEx||[]).some(x=>x.n===e.n);
  openSheet(`
    <div style="display:flex;align-items:flex-start;gap:10px">
      <div style="flex:1">
        <h3 style="display:flex;align-items:center;gap:10px"><span class="exicon">${EXCAT[e.c].icon}</span>${esc(e.n)}</h3>
        <p class="sub">${EXCAT[e.c].label} · ${exSummary(e)}${GC[e.n] ? "" : ` · <span style="color:#9A4A1B">custom</span>`}</p>
      </div>
      <button class="iconbtn" onclick="openExEdit(exIdx-1)" data-tip="Previous exercise" ${exIdx===0?"disabled style='opacity:.35'":""}>‹</button>
      <button class="iconbtn" onclick="openExEdit(exIdx+1)" data-tip="Next exercise" ${exIdx>=w.exercises.length-1?"disabled style='opacity:.35'":""}>›</button>
      <button class="iconbtn" style="${exEditMode?'background:var(--sage);color:#fff':''}" onclick="exEditMode=!exEditMode;renderExEdit()" data-tip="Edit sets & reps" aria-label="Edit">${ICON.pencil}</button>
      <button class="iconbtn" onclick="removeEx()" data-tip="Remove from workout" aria-label="Remove">${ICON.trash}</button>
    </div>
    ${exEditMode ? `
    ${exRenaming ? `
    <div style="margin-top:10px">
      <label class="fl">Exercise name</label>
      <input class="field" id="exRenameIn" value="${esc(e.n)}" placeholder="Exercise name">
      <div class="sitrow" style="margin-top:8px">
        <button onclick="commitRenameEx()">Save name</button>
        <button onclick="exRenaming=false;renderExEdit()">Cancel</button>
      </div>
    </div>` : `
    <div class="sitrow" style="margin-top:10px">
      <button onclick="openSwapPicker()">⇄ Swap exercise</button>
      ${isCustom ? `<button onclick="exRenaming=true;renderExEdit()">Rename</button>` : ""}
    </div>`}
    <div class="seg" style="margin-top:10px">
      <button class="${!time?'on':''}" onclick="exMode('reps')">Reps</button>
      <button class="${time?'on':''}" onclick="exMode('time')">Time</button>
    </div>
    <div class="numrow">
      <div><label class="fl">Sets</label><input class="field" type="number" min="1" value="${e.sets}" oninput="exSet('sets',this.value)"></div>
      <div><label class="fl">${time?"Seconds":"Reps"}</label><input class="field" type="number" min="1" value="${time?e.secs:e.reps}" oninput="exSet('${time?"secs":"reps"}',this.value)"></div>
      <div><label class="fl">Rest (s)</label><input class="field" type="number" min="0" value="${e.rest}" oninput="exSet('rest',this.value)"></div>
    </div>
    <div class="numrow" style="margin-top:8px;align-items:end">
      <div><label class="fl">Weight (optional)</label><input class="field" type="number" min="0" step="0.5" inputmode="decimal" placeholder="—" value="${e.wt > 0 ? e.wt : ""}" oninput="exSetWt(this.value)"></div>
      <div><label class="fl">Unit</label><div class="seg">
        <button class="${(e.wu||state.wtUnit)!=="kg"?'on':''}" onclick="exSetWtUnit('lb')">lb</button>
        <button class="${(e.wu||state.wtUnit)==="kg"?'on':''}" onclick="exSetWtUnit('kg')">kg</button>
      </div></div>
    </div>
    <div class="sitrow" style="margin:8px 0">
      <button onclick="moveEx(-1)" ${exIdx===0?"disabled":""}>↑ Move up</button>
      <button onclick="moveEx(1)" ${exIdx===w.exercises.length-1?"disabled":""}>↓ Move down</button>
    </div>
    <button class="primary" onclick="exEditMode=false;renderExEdit();render()">Done</button>
    ` : `
    ${(PLAYER && !PLAYER.done && PLAYER.w === w) ? `<button class="primary" style="margin:10px 0 4px" onclick="playerJumpToEx(exIdx)">▶︎ Skip to this exercise</button>` : ""}
    <div id="exMedia">${exViewHTML(e)}</div>
    `}
  `);
  if(exRenaming) setTimeout(()=>{ const i=document.getElementById("exRenameIn"); if(i){ i.focus(); i.select(); } },50);
  const name = e.n;
  if(!EXMEDIA[name] && GC[name]) loadExMedia(name).then(()=>{
    if(!exEditMode && curWo()?.exercises[exIdx]?.n === name && document.getElementById("exMedia")) renderExEdit();
  });
}
function exMode(m){ curWo().exercises[exIdx].mode = m; save(); renderExEdit(); }
function exSet(k,v){ curWo().exercises[exIdx][k] = Math.max(k==="rest"?0:1, parseInt(v)||0); save(); }
/* Weight is optional: empty/0 clears it. setExWeight is shared with the player. */
function setExWeight(e, v){
  const n = Math.min(6500, Math.round(parseFloat(v)*10)/10);
  if(isFinite(n) && n > 0){ e.wt = n; if(!e.wu) e.wu = state.wtUnit; }
  else { delete e.wt; }
  save();
}
function exSetWt(v){ setExWeight(curWo().exercises[exIdx], v); }
function exSetWtUnit(u){
  const e = curWo().exercises[exIdx];
  e.wu = u; state.wtUnit = u;   /* remembered as the default for new weights */
  save(); renderExEdit();
}
function moveEx(n){
  const ex = curWo().exercises, j = exIdx+n;
  if(j<0 || j>=ex.length) return;
  [ex[exIdx], ex[j]] = [ex[j], ex[exIdx]];
  exIdx = j; save(); renderExEdit();
}
function removeEx(){
  curWo().exercises.splice(exIdx,1);
  save(); closeSheet(); render();
}


/* ---------- sharing a workout ----------
   Two paths, both reachable from the Share button on the workout overview:

   1. Share link (no account needed): the workout — plus any custom exercises
      it references — is JSON-serialized, deflate-compressed (CompressionStream
      when available, plain base64 otherwise; the first character tags which),
      base64url-encoded, and put in the URL hash as #share=... . init() calls
      handleShareLink() which decodes it and offers "Add to my workouts".
      exImages (data URLs) are deliberately excluded: they'd blow past sane
      URL lengths. The hash never collides with the OAuth redirect hash
      (that one matches access_token=/error=).

   2. Drive file: shareWoDrive() (04-drive.js) uploads a single-workout,
      importFlow-compatible JSON — photos included — and makes it
      anyone-with-link readable.

   Decoded payloads are attacker-controllable: every field is sanitized in
   importSharedWo() (names length-capped and only ever rendered via esc(),
   numbers clamped, categories validated, grp reduced to alphanumerics). */
function appShareBase(){
  /* In artifacts / file:// previews location.origin is useless — point the
     link at the live site instead so it still opens for the recipient. */
  return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : "https://guen.pw/workouts/";
}
function shareUsedCustomEx(w){
  const names = new Set(w.exercises.map(e=>e.n));
  return (state.customEx||[]).filter(x=>names.has(x.n));
}
function shareWoPayload(w){
  const cx = shareUsedCustomEx(w);
  return {v:1,
    w:{name:w.name, ex:w.exercises.map(e=>({n:e.n, c:e.c, mode:e.mode, sets:e.sets, reps:e.reps, secs:e.secs, rest:e.rest, ...(e.wt>0?{wt:e.wt, wu:e.wu}:{}), ...(e.grp?{grp:e.grp}:{})}))},
    ...(cx.length?{cx}:{})};
}
function b64urlEncode(bytes){
  let bin = ""; bytes.forEach(b=>bin+=String.fromCharCode(b));
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlDecode(s){
  const bin = atob(s.replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(bin, c=>c.charCodeAt(0));
}
async function shareEncode(obj){
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if(window.CompressionStream){
    const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
    return "z" + b64urlEncode(new Uint8Array(buf));
  }
  return "j" + b64urlEncode(raw);
}
async function shareDecode(s){
  const tag = s[0], bytes = b64urlDecode(s.slice(1));
  let raw;
  if(tag === "z"){
    if(!window.DecompressionStream) throw new Error("no DecompressionStream");
    raw = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
  } else if(tag === "j"){ raw = bytes; }
  else throw new Error("bad tag");
  return JSON.parse(new TextDecoder().decode(raw));
}
let shareUrl = null;
async function openShareWo(){
  const w = woById(woViewId); if(!w || !w.exercises.length) return;
  shareUrl = appShareBase() + "#share=" + await shareEncode(shareWoPayload(w));
  openSheet(`
    <h3>Share "${esc(w.name)}"</h3>
    <p class="sub">Anyone opening this link gets an "Add to my workouts" prompt — no account needed. Exercise photos aren't included in the link (the Drive file has them).</p>
    <input class="field" readonly value="${esc(shareUrl)}" onclick="this.select()">
    <button class="primary" onclick="shareWoLinkGo()">${navigator.share ? "Share link" : "Copy link"}</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="shareWoDrive('${w.id}')"><span>${ICON.cloud}</span> Share via Drive file…</button>`);
}
async function shareWoLinkGo(){
  if(!shareUrl) return closeSheet();
  try{
    if(navigator.share){ await navigator.share({title:"Workout", url:shareUrl}); closeSheet(); return; }
  }catch(e){ if(e.name === "AbortError") return; }
  let copied = false;
  try{ await navigator.clipboard.writeText(shareUrl); copied = true; }catch(e){}
  openSheet(`<h3>${copied ? "Link copied" : "Copy the link"}</h3>
    <p class="sub">${copied ? "Paste it anywhere — chat, email, a note." : "Clipboard access was blocked — long-press the link below to copy it."}</p>
    <input class="field" readonly value="${esc(shareUrl)}" onclick="this.select()">
    <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.check}</span> Done</button>`);
}
/* ---- receiving a shared link (called from init()) ---- */
async function handleShareLink(){
  const m = /^#share=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if(!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  let p = null;
  try{ p = await shareDecode(m[1]); }catch(e){ console.error(e); }
  if(!p || p.v !== 1 || !p.w || typeof p.w.name !== "string" || !Array.isArray(p.w.ex) || !p.w.ex.length){
    return openSheet(`<h3>Couldn't open that link</h3>
      <p class="sub">The shared-workout link is incomplete or from a newer version of the app.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
  }
  /* Sanitize up front so the preview shows exactly what would be imported. */
  const w = {name: String(p.w.name).slice(0, 120), exercises: p.w.ex.map(sanitizeSharedEx)};
  window._pendingShare = {w, cx: Array.isArray(p.cx) ? p.cx : []};
  openSharedPreview();
}
function openSharedPreview(){
  const p = window._pendingShare; if(!p) return;
  const w = p.w, L = grpLetters(w);
  openSheet(`<h3>Workout shared with you</h3>
    <p class="sub"><b>${esc(w.name)}</b> · ${w.exercises.length} exercise${w.exercises.length===1?"":"s"} · ≈${woMinutes(w)} min — goes into your "Shared with me" folder.</p>
    <div class="card" style="max-height:45vh;overflow-y:auto">
      ${w.exercises.map(e=>`<div class="item">
        <div class="exicon" style="overflow:hidden">${FEDB[e.n] ? fedbAnimHTML(e.n,"exanim") : YOGADB[e.n]?.img ? yogaImgHTML(e.n,"exanim") : EXCAT[e.c].icon}</div>
        <div class="tx"><div class="t">${esc(e.n)}</div><div class="d">${exSummary(e)}${e.grp?` · superset ${L[e.grp]}`:""}</div></div>
      </div>`).join("")}
    </div>
    <button class="primary" style="margin-top:10px" onclick="importSharedWo()">Add to my workouts</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="window._pendingShare=null;closeSheet()"><span>${ICON.back}</span> No thanks</button>`);
}
function sharedFolderId(){
  state.woFolders = state.woFolders || [];
  let f = state.woFolders.find(f=>f.name === "Shared with me");
  if(!f){ f = {id: uid(), name: "Shared with me", open: true}; state.woFolders.push(f); }
  return f.id;
}
function sanitizeSharedEx(e){
  e = e || {};
  const num = (v, lo, hi, d) => { v = Math.round(+v); return isFinite(v) && v >= lo && v <= hi ? v : d; };
  const out = {
    n: String(e.n || "Exercise").slice(0, 80),
    c: EXCAT[e.c] ? e.c : "core",
    mode: e.mode === "time" ? "time" : "reps",
    sets: num(e.sets, 1, 50, 3),
    reps: num(e.reps, 1, 500, 10),
    secs: num(e.secs, 1, 7200, 30),
    rest: num(e.rest, 0, 3600, state.defRest ?? 60)
  };
  const wt = Math.round(+e.wt*10)/10;
  if(isFinite(wt) && wt > 0 && wt <= 6500){ out.wt = wt; out.wu = e.wu === "kg" ? "kg" : "lb"; }
  if(e.grp){
    const g = String(e.grp).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
    if(g) out.grp = g;
  }
  return out;
}
function importSharedWo(){
  const p = window._pendingShare; window._pendingShare = null;
  if(!p) return closeSheet();
  /* p.w was sanitized in handleShareLink (the preview shows the same data). */
  const w = {id: uid(), name: p.w.name, folderId: sharedFolderId(), exercises: p.w.exercises};
  const have = new Set((state.customEx||[]).map(x=>x.n));
  (Array.isArray(p.cx) ? p.cx : []).forEach(x=>{
    if(x && typeof x.n === "string"){
      const n = x.n.slice(0, 80);
      if(n && !have.has(n)){ state.customEx.push({n, c: EXCAT[x.c] ? x.c : "core", ...(x.t?{t:1}:{})}); have.add(n); }
    }
  });
  state.workouts.push(w);
  save(); closeSheet();
  tab = "workouts"; woViewId = w.id; render();
}
