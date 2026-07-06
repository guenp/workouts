/* ---------- sheet helpers ---------- */
let sheetOpenedAt = 0;
function openSheet(html){
  document.getElementById("sheet").innerHTML = html;
  document.getElementById("sheet").classList.add("open");
  document.getElementById("backdrop").classList.add("open");
  sheetOpenedAt = Date.now();
}
/* Backdrop tap-to-close, guarded against iOS/iPadOS "ghost clicks": the tap
   that opens a sheet can dispatch a second synthetic click at the same
   coordinates ~300ms later, which lands on the freshly-shown backdrop and
   would instantly close the sheet (seen on iPad Chrome/Safari). Ignore
   backdrop clicks in the first 450ms after opening. */
function backdropTap(){
  if(Date.now() - sheetOpenedAt < 450) return;
  closeSheet();
}
function closeSheet(){
  document.getElementById("sheet").classList.remove("open");
  document.getElementById("backdrop").classList.remove("open");
}
function esc(s){ return (s||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

/* ---------- long-press helpers (shared by Health entries, tags, workout rows) ---------- */
let pressTimer = null, longPressed = false;
let pressX = 0, pressY = 0, lastMoveEv = null;
function pressBegin(ev, onLong){
  longPressed = false;
  pressX = ev.clientX; pressY = ev.clientY; lastMoveEv = ev;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(()=>{ if(!pressMoved(lastMoveEv)){ longPressed = true; onLong(); } }, 500);
}
function pressMoved(ev){ return ev && Math.hypot(ev.clientX - pressX, ev.clientY - pressY) > 8; }
document.addEventListener("pointermove", ev=>{ lastMoveEv = ev; }, {passive:true});

/* ---------- render root ---------- */
function render(){
  document.getElementById("nav").innerHTML = navHTML();
  const app = document.getElementById("app");
  if(tab==="today") app.innerHTML = todayHTML();
  if(tab==="plan")  app.innerHTML = planHTML();
  if(tab==="workouts") app.innerHTML = workoutsHTML();
  if(tab==="gut")   app.innerHTML = gutHTML();
  if(tab==="trends")app.innerHTML = trendsHTML();
}
function setTab(t){ tab=t; render(); window.scrollTo(0,0); }

let ANIMT = null;
function startAnimTicker(){
  clearInterval(ANIMT);
  ANIMT = setInterval(()=>{
    if(!document.querySelectorAll) return;
    document.querySelectorAll("img[data-frames]").forEach(el=>{
      const f = el.dataset.frames.split("|");
      el.dataset.i = ((+el.dataset.i||0)+1) % f.length;
      el.src = f[el.dataset.i];
    });
  }, state.animMs || 1000);
}
function setAnimMs(v){ state.animMs = v; save(); startAnimTicker(); openDataMenu(); }
function fedbAnimHTML(name, cls){
  const fe = FEDB[name]; if(!fe) return "";
  const urls = fe.i.map(p=>FEDB_IMG+p);
  return `<img class="${cls}" src="${urls[0]}" data-frames="${urls.join("|")}" data-i="0" alt="${esc(name)}">`;
}
function yogaImgHTML(name, cls){
  const y = YOGADB[name]; if(!y || !y.img) return "";
  return `<img class="${cls}" src="${y.img}" alt="${esc(name)}" style="object-fit:contain;background:#fff">`;
}
function exDesc(n){ return (FEDB[n]?.t || "").trim() || NYTDESC[n] || YOGADB[n]?.t || ""; }
function topBarHTML(){
  return `<div style="display:flex;gap:6px;align-items:center">
    <span class="syncpill ${DRIVE.status==='on'?'on':DRIVE.status==='error'?'err':''}">${DRIVE.label()}</span>
    <button class="gearbtn" onclick="openDataMenu()" aria-label="Settings"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z"/></svg></button>
  </div>`;
}
function navHTML(){
  const ic = {
    today:'<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    plan:'<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    workouts:'<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M7 8v8M17 8v8M3.5 10v4M20.5 10v4M7 12h10"/></svg>',
    gut:'<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 21c-4.5-3.5-8-6.6-8-10.4C4 7.5 6.2 5 9 5c1.6 0 2.6.7 3 1.5C12.4 5.7 13.4 5 15 5c2.8 0 5 2.5 5 5.6 0 3.8-3.5 6.9-8 10.4z"/></svg>',
    trends:'<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15v-4M13 15V8M18 15v-7"/></svg>'
  };
  return ["today","plan","workouts","gut","trends"].map(t=>
    `<button class="${tab===t?'on':''}" onclick="setTab('${t}')">${ic[t]}${t==="gut"?"Health":t[0].toUpperCase()+t.slice(1)}</button>`
  ).join("");
}
