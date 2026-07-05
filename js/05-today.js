/* ---------- TODAY ---------- */
function todayHTML(){
  const d = viewDate || new Date();
  materializeDay(d);
  const k = todayKey(d), day = state.days[k];
  const weekMin = weekOrange();
  const pct = Math.min(100, Math.round(weekMin/state.goal*100));
  const isToday = k === todayKey();
  const groups = {move:[], meal:[], mind:[]};
  day.items.forEach(it=>groups[it.type]?.push(it));
  return `
  <div class="top"><div style="display:flex;align-items:center;gap:6px">
    <button class="daynav" onclick="shiftDay(-1)">‹</button>
    <button style="text-align:left" onclick="openTodayCal()"><h1>${isToday?"Today":DAY_NAMES[d.getDay()]}</h1><div class="date">${d.toLocaleDateString(undefined,{month:"short",day:"numeric"})} ▾</div></button>
    <button class="daynav" ${isToday?"disabled":""} onclick="shiftDay(1)">›</button>
  </div>
  ${topBarHTML()}</div>
  <div class="zone">
    <div class="label">Orange zone this week</div>
    <div class="big">${weekMin} <span>/ ${state.goal} min goal</span></div>
    <div class="zonebar"><i style="width:${pct}%"></i></div>
    <div class="row">
      <button class="stepbtn" onclick="bumpOrange(-1)">−</button>
      <button class="stepbtn" onclick="bumpOrange(1)">+</button>
      <button class="stepbtn" style="width:auto;padding:0 14px;font-size:14px" onclick="bumpOrange(5)">+5</button>
      <div class="hint">${day.orange} min logged today</div>
    </div>
  </div>
  ${["move","meal","mind"].map(g=>`
    <div class="sec">
      <div class="sec-h"><h2>${TYPE_LABEL[g]}</h2><button class="addbtn" onclick="openAdd('${g}')">+ Add</button></div>
      <div class="card">
        ${groups[g].length ? groups[g].map(itemHTML).join("") : `<div class="empty">Nothing planned — add something if you like.</div>`}
      </div>
    </div>`).join("")}`;
}
function itemHTML(it){
  const mark = {done:"✓", swapped:"↷", skipped:"✕", planned:""}[it.status];
  const sub = it.status==="swapped" && it.actual
    ? `<div class="d swap">Instead: ${esc(it.actual)}</div>`
    : (it.detail ? `<div class="d">${esc(it.detail)}</div>` : "");
  return `<button class="item status-${it.status}" onclick="openItem('${it.id}')">
    <div class="dot ${it.status}">${mark}</div>
    <div class="tx"><div class="t">${esc(it.title)}</div>${sub}</div>
  </button>`;
}
/* ---------- calendar picker ---------- */
let cal = null;
function openCalendar(selDate, cb, opts={}){
  cal = { m: new Date(selDate.getFullYear(), selDate.getMonth(), 1), sel: todayKey(selDate), cb, max: opts.max||null };
  renderCalendar();
}
function calShift(n){ cal.m.setMonth(cal.m.getMonth()+n); renderCalendar(); }
function calPick(k){
  if(cal.multi){
    cal.multi.has(k) ? cal.multi.delete(k) : cal.multi.add(k);
    renderCalendar(); return;
  }
  const cb = cal.cb; closeSheet(); cb(new Date(k+"T12:00"));
}
function openCalendarMulti(selectedSet, onDone, opts={}){
  cal = { m: new Date(), sel: null, multi: selectedSet, cb: onDone, max: opts.max||null };
  renderCalendar();
}
function renderCalendar(){
  const y = cal.m.getFullYear(), mo = cal.m.getMonth();
  const first = new Date(y, mo, 1), pad = first.getDay();
  const nDays = new Date(y, mo+1, 0).getDate();
  const maxK = cal.max ? todayKey(cal.max) : null;
  let cells = "";
  for(let i=0;i<pad;i++) cells += `<span></span>`;
  for(let d=1; d<=nDays; d++){
    const k = todayKey(new Date(y, mo, d, 12));
    const has = state.days[k] && (state.days[k].gut.length || state.days[k].orange || state.days[k].items.some(x=>x.status!=="planned"));
    const dis = maxK && k > maxK;
    const on = cal.multi ? cal.multi.has(k) : k===cal.sel;
    cells += `<button class="cal-d ${on?'sel':''}" ${dis?"disabled":""} onclick="calPick('${k}')">${d}${has?'<i></i>':''}</button>`;
  }
  openSheet(`
    <h3 style="display:flex;justify-content:space-between;align-items:center">
      <button class="daynav" onclick="calShift(-1)">‹</button>
      ${cal.m.toLocaleDateString(undefined,{month:"long",year:"numeric"})}
      <button class="daynav" onclick="calShift(1)">›</button>
    </h3>
    <div class="cal-grid" style="margin-top:10px">
      ${["S","M","T","W","T","F","S"].map(x=>`<b class="cal-h">${x}</b>`).join("")}
      ${cells}
    </div>
    ${cal.multi ? `<button class="primary" style="margin-top:12px" onclick="const cb=cal.cb;closeSheet();cb()">Done</button>` : ""}
  `);
}
function shiftDay(n){
  const d = viewDate || new Date();
  d.setDate(d.getDate()+n);
  viewDate = todayKey(d)===todayKey() ? null : d;
  render();
}
function openTodayCal(){
  openCalendar(viewDate||new Date(), d=>{ viewDate = todayKey(d)===todayKey() ? null : d; render(); }, {max:new Date()});
}
function openPlanCal(){
  openCalendar(planWeek||new Date(), d=>{ d.setDate(d.getDate()-((d.getDay()+6)%7)); planWeek = d; render(); });
}
function openTrendCal(){
  openCalendar(trendEnd||new Date(), d=>{ trendEnd = todayKey(d)===todayKey() ? null : d; trendSel = null; render(); }, {max:new Date()});
}
function bumpOrange(n){
  const day = state.days[viewKey()];
  day.orange = Math.max(0, day.orange + n);
  save(); render();
}
function weekOrange(){
  let total = 0; const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay()+6)%7)); 
  for(let i=0;i<7;i++){
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    total += state.days[todayKey(d)]?.orange || 0;
  }
  return total;
}

/* ---------- item action sheet ---------- */
let activeItem = null;
function openItem(id){
  const day = state.days[viewKey()];
  const it = day.items.find(x=>x.id===id); if(!it) return;
  activeItem = it;
  openSheet(`
    <h3>${esc(it.title)}</h3>
    <p class="sub">${esc(it.detail||"")}</p>
    ${it.workoutId && woById(it.workoutId) ? `<button class="sheet-btn" onclick="closeSheet();woViewId='${it.workoutId}';setTab('workouts')"><span>${ICON.open}</span> Go to workout</button>` : ""}
    <button class="sheet-btn" onclick="setStatus('done')"><span>✓</span> Did it as planned</button>
    <button class="sheet-btn" onclick="showSwap()"><span>↷</span> Did / ate something else</button>
    <button class="sheet-btn" onclick="setStatus('skipped')"><span>✕</span> Skipped it</button>
    <button class="sheet-btn" onclick="setStatus('planned')"><span>○</span> Reset to planned</button>
    <button class="sheet-btn danger" onclick="removeItem()"><span>${ICON.trash}</span> Remove from today</button>
  `);
}
function showSwap(){
  const it = activeItem;
  openSheet(`
    <h3>What did you do instead?</h3>
    <p class="sub">Swaps count too — flexibility beats perfection.</p>
    <input class="field" id="swapIn" placeholder="${it.type==='meal'?'e.g. rice cakes + PB':'e.g. 20 min walk'}" value="${esc(it.actual||"")}">
    <button class="primary" onclick="saveSwap()">Save swap</button>
  `);
  setTimeout(()=>document.getElementById("swapIn").focus(),250);
}
function saveSwap(){
  activeItem.actual = document.getElementById("swapIn").value.trim();
  activeItem.status = "swapped";
  save(); afterLog(activeItem);
}
function setStatus(s){
  activeItem.status = s;
  if(s!=="swapped") activeItem.actual = "";
  save();
  if(s==="done") afterLog(activeItem); else { closeSheet(); render(); }
}
function afterLog(it){
  if(it.type==="meal"){
    openSheet(`
      <h3>How did it sit?</h3>
      <p class="sub">Optional — this feeds your health log.</p>
      <div class="sitrow">
        <button onclick="mealSit(1)">${ICON.happy} Fine</button>
        <button onclick="mealSit(2)">${ICON.neutral} Meh</button>
        <button onclick="mealSit(4)">${ICON.sick} Sick</button>
      </div>
      <button class="sheet-btn" onclick="closeSheet();render()"><span>→</span> Skip</button>
    `);
  } else { closeSheet(); render(); }
}
function mealSit(sev){
  if(sev>1){
    const it = activeItem;
    state.days[viewKey()].gut.push({
      time:new Date().toTimeString().slice(0,5), sev,
      tags:[], note:"", food: it.status==="swapped" && it.actual ? it.actual : it.title
    });
    save();
  }
  closeSheet(); render();
}
function removeItem(){
  const day = state.days[viewKey()];
  day.items = day.items.filter(x=>x.id!==activeItem.id);
  save(); closeSheet(); render();
}
let addCtx = null, addDraft = {wos:[], t:"", d:""};
function openAdd(type){
  addCtx = {kind:"today", type}; addDraft = {wos:[], t:"", d:""};
  renderAddSheet();
  if(!(type==="move" && state.workouts.length)) setTimeout(()=>document.getElementById("addT")?.focus(),250);
}
function renderAddSheet(){
  const {kind, type} = addCtx;
  const showWo = type==="move" && state.workouts.length;
  const avail = state.workouts.filter(w=>!addDraft.wos.includes(w.id));
  openSheet(`
    <h3>${kind==="today" ? "Add to today" : "Add to "+DAY_NAMES[planDay]}</h3>
    <p class="sub">${kind==="today" ? "Just for today — edit the Plan tab for every week." : ""}</p>
    ${showWo ? `
      <label class="fl">From your workouts</label>
      <select class="field" id="woSel" onchange="pickWo(this.value)">
        <option value="">Choose a workout…</option>
        ${avail.map(w=>`<option value="${w.id}">${esc(w.name)} · ≈${woMinutes(w)} min</option>`).join("")}
      </select>
      ${addDraft.wos.length ? `<div class="chips">${addDraft.wos.map(id=>{const w=woById(id); return w?`<button class="on" onclick="unpickWo('${id}')">${esc(w.name)} ✕</button>`:""}).join("")}</div>` : ""}
    ` : ""}
    <label class="fl">${showWo ? "Or something custom" : "What?"}</label>
    <input class="field" id="addT" placeholder="${type==='meal'?'e.g. Smoothie':'e.g. Evening walk'}" value="${esc(addDraft.t)}">
    <label class="fl">Details (optional)</label>
    <input class="field" id="addD" placeholder="" value="${esc(addDraft.d)}">
    <button class="primary" onclick="saveAdd()">Add</button>
  `);
}
function snapAdd(){
  addDraft.t = document.getElementById("addT")?.value ?? addDraft.t;
  addDraft.d = document.getElementById("addD")?.value ?? addDraft.d;
}
function pickWo(id){ if(!id) return; snapAdd(); addDraft.wos.push(id); renderAddSheet(); }
function unpickWo(id){ snapAdd(); addDraft.wos = addDraft.wos.filter(x=>x!==id); renderAddSheet(); }
function saveAdd(){
  snapAdd();
  const {kind, type} = addCtx;
  const t = addDraft.t.trim();
  if(!t && !addDraft.wos.length) return;
  if(kind==="today"){
    const day = state.days[viewKey()];
    addDraft.wos.forEach(id=>{
      const w = woById(id); if(!w) return;
      day.items.push({id:uid(), type:"move", title:w.name, detail:woSummary(w), workoutId:w.id, status:"planned", actual:""});
    });
    if(t) day.items.push({id:uid(), type, title:t, detail:addDraft.d.trim(), status:"done", actual:""});
  } else {
    const list = ensureWeekCopy()[planDay];
    addDraft.wos.forEach(id=>{
      const w = woById(id); if(!w) return;
      list.push({id:uid(), type:"move", title:w.name, detail:woSummary(w), workoutId:w.id});
    });
    if(t) list.push({id:uid(), type, title:t, detail:addDraft.d.trim()});
  }
  save(); closeSheet(); render();
}
