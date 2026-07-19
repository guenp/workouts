/* ---------- PLAN ---------- */
let planWeek = null;   /* null = every week (template); Date = Monday of a specific week */
function planList(){
  if(planWeek===null) return state.template[planDay];
  state.weekPlans = state.weekPlans || {};
  const wk = todayKey(planWeek);
  return state.weekPlans[wk]?.[planDay] || state.template[planDay];
}
function ensureWeekCopy(){
  if(planWeek===null) return state.template;
  state.weekPlans = state.weekPlans || {};
  const wk = todayKey(planWeek);
  if(!state.weekPlans[wk]){
    state.weekPlans[wk] = {};
    for(let d=0; d<7; d++) state.weekPlans[wk][d] = JSON.parse(JSON.stringify(state.template[d]||[]));
  }
  return state.weekPlans[wk];
}
function shiftPlanWeek(n){
  const base = planWeek || (()=>{ const m=new Date(); m.setDate(m.getDate()-((m.getDay()+6)%7)); return m; })();
  if(planWeek) base.setDate(base.getDate()+n*7);
  planWeek = base;
  render();
}
function planHTML(){
  const items = planList();
  const cats = CATS();
  const groups = new Map(cats.map(c=>[c.id, []]));
  const other = [];
  items.forEach(it=> groups.has(it.type) ? groups.get(it.type).push(it) : other.push(it));
  const wkLabel = planWeek ? "Week of "+planWeek.toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "";
  const customized = planWeek && state.weekPlans?.[todayKey(planWeek)];
  return `
  <div class="top"><h1>Plan</h1>${topBarHTML()}</div>
  <div class="days" style="margin-bottom:8px">
    <button class="${planWeek===null?'on':''}" style="flex:1.6" onclick="planWeek=null;render()">Every week</button>
    <button class="${planWeek?'on':''}" style="flex:2.4" onclick="planWeek?openPlanCal():shiftPlanWeek(0)">${planWeek?wkLabel+" ▾":"Specific week"}</button>
    ${planWeek?`<button onclick="shiftPlanWeek(-1)" style="flex:.6">‹</button><button onclick="shiftPlanWeek(1)" style="flex:.6">›</button>`:""}
  </div>
  ${planWeek?`<p style="font-size:12px;color:var(--muted);margin:0 2px 10px">${customized?"This week has its own plan.":"Showing the recurring plan — edits will apply to this week only."}</p>`:""}
  <div class="days">${DAY_NAMES.map((n,i)=>`<button class="${planDay===i?'on':''}" onclick="planDay=${i};render()">${n[0]}</button>`).join("")}</div>
  ${cats.map(c=>`
    <div class="sec">
      <div class="sec-h"><h2>${esc(c.name)} · ${DAY_NAMES[planDay]}</h2><button class="addbtn" onclick="openPlanAdd('${c.id}')">+ Add</button></div>
      <div class="card">
        ${groups.get(c.id).length ? groups.get(c.id).map(planRowHTML).join("") : `<div class="empty">Nothing here.</div>`}
      </div>
    </div>`).join("")}
  ${other.length?`
    <div class="sec">
      <div class="sec-h"><h2>Other · ${DAY_NAMES[planDay]}</h2></div>
      <div class="card">${other.map(planRowHTML).join("")}</div>
    </div>`:""}`;
}
function planRowHTML(it){
  return `<button class="item" onclick="openPlanItem('${it.id}')">
    <div class="tx"><div class="t">${esc(it.title)}</div><div class="d">${esc(it.detail||"")}${it.gcalEventId?(it.detail?" · ":"")+"on calendar":""}</div></div>
    <span class="tag">edit</span>
  </button>`;
}
let activePlan = null;
function openPlanItem(id){
  activePlan = ensureWeekCopy()[planDay].find(x=>x.id===id);
  openSheet(planForm("Edit item", activePlan.title, activePlan.detail, `
    <button class="primary" onclick="savePlanEdit()">Save</button>
    <button class="sheet-btn danger" style="margin-top:8px" onclick="deletePlanItem()"><span>${ICON.trash}</span> Delete from plan</button>`));
}
function openPlanAdd(type){
  addCtx = {kind:"plan", type}; addDraft = {wos:[], t:"", d:""};
  renderAddSheet();
  if(!(type==="move" && state.workouts.length)) setTimeout(()=>document.getElementById("addT")?.focus(),250);
}
function planForm(h, t, d, btns){
  return `<h3>${h}</h3><p class="sub"></p>
  <label class="fl">Title</label><input class="field" id="pT" value="${esc(t)}">
  <label class="fl">Details</label><input class="field" id="pD" value="${esc(d)}">${btns}`;
}
function savePlanEdit(){
  activePlan.title = document.getElementById("pT").value.trim() || activePlan.title;
  activePlan.detail = document.getElementById("pD").value.trim();
  if(activePlan.gcalEventId)   /* keep the linked Google Calendar event in step */
    gcalPatchEvent(activePlan.gcalCalId, activePlan.gcalEventId, {summary:activePlan.title, description:activePlan.detail});
  save(); closeSheet(); render();
}
function deletePlanItem(){
  if(activePlan.gcalEventId) gcalDeleteEvent(activePlan.gcalCalId, activePlan.gcalEventId);
  const target = ensureWeekCopy();
  target[planDay] = target[planDay].filter(x=>x.id!==activePlan.id);
  save(); closeSheet(); render();
}
