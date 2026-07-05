/* ---------- GUT ---------- */
const SEV = ["Excellent","Fine","Mild","Rough","Bad"];
let editTags = false, editGut = false, gutEdit = null, gutDate = null;
function gutKey(){ return todayKey(gutDate || new Date()); }
function openGutCal(){
  openCalendar(gutDate||new Date(), d=>{ gutDate = todayKey(d)===todayKey() ? null : d; render(); }, {max:new Date()});
}
function gutHTML(){
  const entries = [];
  Object.keys(state.days).sort().reverse().slice(0,14).forEach(k=>{
    (state.days[k].gut||[]).map((g,i)=>({...g, day:k, idx:i})).reverse().forEach(e=>entries.push(e));
  });
  return `
  <div class="top"><button style="text-align:left" onclick="openGutCal()"><h1>Health check</h1><div class="date">${gutDate ? gutDate.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}) : "Today"} ▾</div></button>${topBarHTML()}</div>
  <div class="sec"><div class="sec-h"><h2>${gutDate?"How were you feeling "+fmtDay(gutKey())+"?":"How are you feeling?"}</h2></div>
    <div class="seg">${SEV.map((s,i)=>`<button class="${gutDraft.sev===i?'on':''}" onclick="gutDraft.sev=${i};render()">${s}</button>`).join("")}</div>
    <div class="chips">${state.tags.map((s,i)=>`<button class="${gutDraft.tags.includes(s)?'on':''}"
        onpointerdown="tagDown(event)" onclick="tagTap(${i})" onpointercancel="clearTimeout(pressTimer)" onpointerleave="clearTimeout(pressTimer)" oncontextmenu="return false">
        ${editTags?`<span class="minus" onclick="removeTag(${i});event.stopPropagation()" onpointerdown="event.stopPropagation()">−</span>`:""}${esc(s)}</button>`).join("")}
      <button class="plus" onclick="openAddTag()">+</button>
    </div>
    <input class="field" id="gFood" placeholder="Reason? (optional)" value="${esc(gutDraft.food)}" oninput="gutDraft.food=this.value">
    <input class="field" id="gNote" placeholder="Note (optional)" value="${esc(gutDraft.note)}" oninput="gutDraft.note=this.value">
    <button class="primary" onclick="saveGut()">Log it</button>
  </div>
  <div class="sec"><div class="sec-h"><h2>Recent entries</h2></div>
    <div class="card">${entries.length ? entries.map(g=>`
      <div class="gut-entry" style="position:relative;${editGut?'padding-left:36px;padding-right:44px':''}"
        onpointerdown="gutDown(event,'${g.day}',${g.idx})" onclick="gutTap('${g.day}',${g.idx})" onpointercancel="clearTimeout(pressTimer)" onpointerleave="clearTimeout(pressTimer)" oncontextmenu="return false">
        ${editGut?`<span class="minus" style="top:12px;left:10px" onclick="removeGut('${g.day}',${g.idx});event.stopPropagation()" onpointerdown="event.stopPropagation()">−</span>
        <span class="pencilbtn" onclick="editGut=false;openGutEdit('${g.day}',${g.idx});event.stopPropagation()" onpointerdown="event.stopPropagation()">${ICON.pencil}</span>`:""}
        <div class="gh"><span>${fmtDay(g.day)} · ${g.time}</span><span class="sev sev${g.sev}">${SEV[g.sev]}</span></div>
        <div class="gt">${g.tags.length?esc(g.tags.join(", ")):""}${g.food?(g.tags.length?" · ":"")+esc(g.food):""}</div>
        ${g.note?`<div class="gn">${esc(g.note)}</div>`:""}
      </div>`).join("") : `<div class="empty">No entries yet. Logging takes 10 seconds — future you will thank you.</div>`}
    </div>
  </div>`;
}
function toggleTag(s){
  const i = gutDraft.tags.indexOf(s);
  i>=0 ? gutDraft.tags.splice(i,1) : gutDraft.tags.push(s);
  render();
}
/* ---------- health entry edit / bulk delete ---------- */
function gutDown(ev, day, idx){ pressBegin(ev, ()=>{ editGut = true; render(); }); }
function gutTap(day, idx){
  clearTimeout(pressTimer);
  if(longPressed){ longPressed = false; return; }
  if(editGut){ editGut = false; render(); return; }
  openGutEdit(day, idx);
}
function removeGut(day, idx){
  state.days[day].gut.splice(idx, 1);
  save(); render();   /* stay in edit mode for bulk deleting */
}
function openGutEdit(day, idx){
  const g = state.days[day].gut[idx];
  gutEdit = { day, idx, draft: {sev:g.sev, tags:[...g.tags], food:g.food||"", note:g.note||""} };
  renderGutSheet();
}
function renderGutSheet(){
  const d = gutEdit.draft;
  openSheet(`
    <h3>Edit entry</h3>
    <p class="sub">${fmtDay(gutEdit.day)} · ${state.days[gutEdit.day].gut[gutEdit.idx].time}</p>
    <div class="seg">${SEV.map((s,i)=>`<button class="${d.sev===i?'on':''}" onclick="gutEdit.draft.sev=${i};renderGutSheet()">${s}</button>`).join("")}</div>
    <div class="chips">${state.tags.map((s,i)=>`<button class="${d.tags.includes(s)?'on':''}" onclick="toggleEditTag(${i})">${esc(s)}</button>`).join("")}
      <button class="plus" onclick="openAddTag(true)">+</button></div>
    <input class="field" placeholder="Reason? (optional)" value="${esc(d.food)}" oninput="gutEdit.draft.food=this.value">
    <input class="field" placeholder="Note (optional)" value="${esc(d.note)}" oninput="gutEdit.draft.note=this.value">
    <button class="primary" onclick="saveGutEdit()">Save changes</button>
    <button class="sheet-btn danger" style="margin-top:8px" onclick="removeGut(gutEdit.day, gutEdit.idx);closeSheet()"><span>${ICON.trash}</span> Delete entry</button>
  `);
}
function toggleEditTag(tagIdx){
  const s = state.tags[tagIdx]; if(s == null) return;
  const t = gutEdit.draft.tags, i = t.indexOf(s);
  i>=0 ? t.splice(i,1) : t.push(s);
  renderGutSheet();
}
function saveGutEdit(){
  const g = state.days[gutEdit.day].gut[gutEdit.idx], d = gutEdit.draft;
  g.sev = d.sev; g.tags = [...d.tags]; g.food = d.food.trim(); g.note = d.note.trim();
  save(); closeSheet(); render();
}
function tagDown(ev){ pressBegin(ev, ()=>{ editTags = true; render(); }); }
function tagTap(tagIdx){
  clearTimeout(pressTimer);
  if(longPressed){ longPressed = false; return; }
  if(editTags){ editTags = false; render(); return; }
  toggleTag(state.tags[tagIdx]);
}
function removeTag(tagIdx){
  const s = state.tags[tagIdx]; if(s == null) return;
  state.tags = state.tags.filter(x=>x!==s);
  gutDraft.tags = gutDraft.tags.filter(x=>x!==s);
  save(); render();   /* stay in edit mode for bulk deleting */
}
function saveGut(){
  if(gutDraft.sev===null && !gutDraft.tags.length){ return; }
  materializeDay(gutDate || new Date());
  state.days[gutKey()].gut.push({
    time:new Date().toTimeString().slice(0,5),
    sev: gutDraft.sev ?? 1, tags:[...gutDraft.tags],
    note: gutDraft.note.trim(), food: gutDraft.food.trim()
  });
  gutDraft = {sev:null, tags:[], note:"", food:""};
  save(); render();
}
function fmtDay(k){
  const t = todayKey();
  if(k===t) return "Today";
  const d = new Date(k+"T12:00");
  return DAY_NAMES[d.getDay()]+" "+d.toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
