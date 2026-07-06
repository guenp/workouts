function beginWorkout(){
  const w = curWo(); if(!w || !w.exercises.length) return;
  const steps = expandWorkout(w).map(st=> st.restSecs
    ? {name:"Rest", secs:st.restSecs, rest:true}
    : {e:st.e, name:st.e.n, secs: st.e.mode==="time" ? st.e.secs : Math.max(10, st.e.reps*3),
       reps: st.e.mode==="time" ? null : st.e.reps, set:st.set, sets:st.sets, rest:false});
  while(steps.length && steps[steps.length-1].rest) steps.pop();
  PLAYER = {w, steps, i:0, remain:steps[0].secs, paused:false, done:false,
            total: steps.reduce((t,st)=>t+st.secs,0)};
  PLAYER.timer = setInterval(playerTick, 1000);
  render();
}
function playerElapsed(){
  return PLAYER.steps.slice(0, PLAYER.i).reduce((t,st)=>t+st.secs,0) + (PLAYER.steps[PLAYER.i].secs - PLAYER.remain);
}
function playerPct(){ return Math.min(100, playerElapsed() / PLAYER.total * 100); }
function fmtClock(x){ x = Math.max(0, x); return Math.floor(x/60)+":"+String(x%60).padStart(2,"0"); }
function playerTick(){
  if(!PLAYER || PLAYER.paused || PLAYER.done) return;
  PLAYER.remain--;
  if(PLAYER.remain <= 0){ playerStep(1); return; }
  const el = playerElapsed(), set = (id,v)=>{ const n=document.getElementById(id); if(n) n.textContent=v; };
  set("plTime", fmtSecs(PLAYER.remain));
  set("plEl", fmtClock(el)); set("plLeft", "-"+fmtClock(PLAYER.total-el));
  const b = document.getElementById("plBar"); if(b) b.style.width = playerPct()+"%";
}
function playerStep(n){
  const j = PLAYER.i + n;
  if(j < 0) return;
  if(j >= PLAYER.steps.length){ PLAYER.done = true; clearInterval(PLAYER.timer); render(); return; }
  PLAYER.i = j; PLAYER.remain = PLAYER.steps[j].secs;
  render();
}
function playerToggle(){ if(PLAYER && !PLAYER.done){ PLAYER.paused = !PLAYER.paused; render(); } }
function playerBgTap(ev){
  if(PLSW_USED){ PLSW_USED = false; return; }           // a swipe just happened — don't also toggle
  if(ev.target.closest && ev.target.closest("button, a, input, label, .pl-wt")) return;
  playerToggle();
}
/* Swipe / drag anywhere on the player: left = next, right = previous.
   Pointer events cover touch, mouse and pen. Vertical scrolling stays
   native via touch-action:pan-y on .pl-swipe. PLSW_USED suppresses the
   click that follows a mouse drag so it isn't read as a pause tap. */
let PLSW = null, PLSW_USED = false;
function plSwipeDown(ev){
  if(!PLAYER || PLAYER.done) return;
  if(ev.target.closest && ev.target.closest("button, a, input, .restpill")) return;
  PLSW = {id:ev.pointerId, x:ev.clientX, y:ev.clientY, t:Date.now(), dx:0, dy:0};
}
function plSwipeMove(ev){
  if(!PLSW || ev.pointerId !== PLSW.id) return;
  PLSW.dx = ev.clientX - PLSW.x; PLSW.dy = ev.clientY - PLSW.y;
  if(Math.abs(PLSW.dx) > 10 && Math.abs(PLSW.dx) > Math.abs(PLSW.dy)){
    const m = document.getElementById("plMain");
    if(m){ m.style.transition = "none"; m.style.transform = "translateX("+(PLSW.dx*0.35)+"px)";
           m.style.opacity = Math.max(.55, 1 - Math.abs(PLSW.dx)/600); }
  }
}
function plSwipeEnd(ev){
  if(!PLSW || ev.pointerId !== PLSW.id) return;
  const {dx, dy, t} = PLSW; PLSW = null;
  let swipe = Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)*1.5 && Date.now()-t < 700;
  if(swipe && dx > 0 && PLAYER.i === 0) swipe = false;  // nothing before the first step — snap back
  const m = document.getElementById("plMain");
  if(swipe){
    PLSW_USED = true;
    playerStep(dx < 0 ? 1 : -1);                        // render() rebuilds plMain, resets styles
  } else if(m){
    m.style.transition = "transform .18s ease, opacity .18s ease";
    m.style.transform = ""; m.style.opacity = "";
  }
}
document.addEventListener("keydown", ev=>{
  if(!PLAYER || PLAYER.done || tab!=="workouts") return;
  if(ev.target.closest && ev.target.closest("input, textarea, select")) return;
  if(ev.code === "Space"){ ev.preventDefault(); playerToggle(); }
  else if(ev.key === "ArrowLeft") playerStep(-1);
  else if(ev.key === "ArrowRight") playerStep(1);
});
function endPlayer(){ if(PLAYER) clearInterval(PLAYER.timer); PLAYER = null; render(); }
/* Weights edited mid-workout write straight to the workout (so it remembers the
   last weights used); "Log to today" snapshots woSummary(w) into the day item's
   detail, so past days keep the weights that were actually used that day. */
function playerSetWt(i, v){
  const e = PLAYER?.w.exercises[i]; if(!e) return;
  setExWeight(e, v);
}
function playerWtUnit(i){
  const e = PLAYER?.w.exercises[i]; if(!e) return;
  const inp = document.getElementById("plWt");
  if(inp) setExWeight(e, inp.value);            /* commit a value typed but not yet blurred */
  e.wu = (e.wu||state.wtUnit) === "kg" ? "lb" : "kg";
  state.wtUnit = e.wu; save(); render();
}
function playerWtHTML(st){
  const e = st.e, i = PLAYER.w.exercises.indexOf(e);
  if(i < 0) return "";
  return `<div class="pl-wt">
    <input id="plWt" class="field" type="number" min="0" step="0.5" inputmode="decimal" placeholder="Weight"
      value="${e.wt > 0 ? e.wt : ""}" onchange="playerSetWt(${i},this.value)">
    <button onclick="playerWtUnit(${i})">${(e.wu||state.wtUnit)==="kg"?"kg":"lb"}</button>
  </div>`;
}
function playerLogToday(){
  const w = PLAYER.w;
  materializeDay(new Date());
  const day = state.days[todayKey()];
  const it = day.items.find(x=>x.workoutId===w.id && x.status==="planned");
  if(it){ it.status = "done"; it.detail = woSummary(w); }   /* snapshot today's weights */
  else day.items.push({id:uid(), type:"move", title:w.name, detail:woSummary(w), workoutId:w.id, status:"done", actual:""});
  save(); endPlayer(); setTab("today");
}
function playerMediaHTML(st){
  const paused = PLAYER.paused ? `<div class="pl-paused">Paused</div>` : "";
  if(st.rest) return `<div class="pl-media"><span style="font-family:'Bricolage Grotesque';font-size:26px;color:var(--muted)">Rest</span>${paused}</div>`;
  const e = st.e;
  if(state.exImages[e.n]) return `<div class="pl-media"><img src="${state.exImages[e.n]}">${paused}</div>`;
  if(FEDB[e.n]) return `<div class="pl-media">${fedbAnimHTML(e.n,"")}${paused}</div>`;
  const m = EXMEDIA[e.n];
  if(m && m !== "none" && m !== "err" && m.vid)
    return `<div class="pl-media"><video src="${m.vid}" poster="${m.img}" autoplay loop muted playsinline></video>${paused}</div>`;
  if(!m && GC[e.n]){
    loadExMedia(e.n).then(()=>{ if(PLAYER && !PLAYER.done && PLAYER.steps[PLAYER.i] === st) render(); });
    return `<div class="pl-media">${paused}</div>`;
  }
  return `<div class="pl-media"><span class="exicon" style="width:64px;height:64px">${EXCAT[e.c].icon}</span>${paused}</div>`;
}
/* Full exercise list, identical markup to the workout page (view mode).
   The exercise/superset currently playing is highlighted; tapping a row
   opens the same exercise sheet (which offers "Skip to this exercise"). */
function playerCurEx(){
  const p = PLAYER;
  let st = p.steps[p.i];
  if(st.rest) st = p.steps.slice(p.i+1).find(s=>!s.rest) || [...p.steps.slice(0,p.i)].reverse().find(s=>!s.rest);
  return st ? st.e : null;
}
function plExDone(e){
  for(let j = PLAYER.steps.length-1; j >= PLAYER.i; j--){
    const s = PLAYER.steps[j];
    if(!s.rest && (s.e === e || (e.grp && s.e.grp === e.grp))) return false; // still has steps ahead
  }
  return true;
}
function plTogglePrev(){ PLAYER.showPrev = !PLAYER.showPrev; render(); }
function playerExListHTML(){
  const w = PLAYER.w, L = grpLetters(w), cur = playerCurEx();
  const on = e => cur && (e === cur || (e.grp && e.grp === cur.grp));
  const doneN = w.exercises.filter(plExDone).length;
  const rows = w.exercises.map((e,i)=>({e,i})).filter(x => PLAYER.showPrev || !plExDone(x.e));
  return `<div class="sec" style="margin-top:18px">
    <div class="sec-h"><h2>Exercises</h2></div>
    ${doneN ? `<button class="pl-prevlink" onclick="plTogglePrev()">${PLAYER.showPrev ? "Hide" : "Show"} previous exercises (${doneN})</button>` : ""}
    <div class="card">
      ${rows.map(({e,i})=>`
        <button class="item ${on(e)?'playing':''}" style="position:relative;overflow:visible;${e.grp?'box-shadow:inset 3px 0 0 var(--sage);':''}"
          onclick="openExEdit(${i});event.stopPropagation()">
          <div class="exicon" style="overflow:hidden">${state.exImages[e.n] ? `<img src="${state.exImages[e.n]}" style="width:100%;height:100%;object-fit:cover">` : FEDB[e.n] ? fedbAnimHTML(e.n,"exanim") : EXCAT[e.c].icon}</div>
          <div class="tx"><div class="t">${esc(e.n)}</div><div class="d">${exSummary(e)}${e.grp?` · superset ${L[e.grp]}`:""}</div></div>
          ${e.grp?`<span class="tag" style="background:var(--sage);color:#fff">${L[e.grp]}</span>`:""}
          ${i < w.exercises.length-1 ? `<span class="restpill ${e.grp?'sup':''}" onclick="openRestEdit(${i});event.stopPropagation()" onpointerdown="event.stopPropagation()">Rest ${e.rest}s</span>` : ""}
        </button>`).join("")}
    </div>
  </div>`;
}
function playerJumpToEx(i){
  if(!PLAYER || PLAYER.done) return;
  const e = PLAYER.w.exercises[i];
  const j = PLAYER.steps.findIndex(s=>!s.rest && s.e === e);
  if(j < 0) return;
  PLAYER.i = j; PLAYER.remain = PLAYER.steps[j].secs;
  closeSheet(); render();
}
function playerHTML(){
  const p = PLAYER, st = p.steps[p.i];
  if(p.done) return `
    <div class="top"><h1>Nice work!</h1></div>
    <div class="card" style="padding:22px;text-align:center">
      <div style="font-size:40px">🎉</div>
      <h3 style="font-family:'Bricolage Grotesque';margin:8px 0 2px">${esc(p.w.name)} complete</h3>
      <p class="sub">≈${Math.round(p.total/60)} min · ${p.steps.filter(x=>!x.rest).length} sets</p>
      <button class="primary" style="margin-top:10px" onclick="playerLogToday()">Log to today</button>
      <button class="sheet-btn" style="margin-top:8px" onclick="endPlayer()"><span>${ICON.back}</span> Back to workout</button>
    </div>`;
  const next = p.steps[p.i+1];
  const el = playerElapsed();
  const svgPrev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg>';
  const svgNext = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg>';
  return `
  <div class="pl-swipe" onclick="playerBgTap(event)"
    onpointerdown="plSwipeDown(event)" onpointermove="plSwipeMove(event)"
    onpointerup="plSwipeEnd(event)" onpointercancel="plSwipeEnd(event)" style="min-height:75vh">
  <div class="top"><div style="display:flex;align-items:center;gap:6px;min-width:0">
    <button class="daynav" onclick="endPlayer()">✕</button>
    <h1 style="font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.w.name)}</h1>
  </div><span class="tag">${p.i+1}/${p.steps.length}</span></div>
  <div class="pl-bar"><i id="plBar" style="width:${playerPct()}%"></i></div>
  <div class="pl-meta"><span id="plEl">${fmtClock(el)}</span><span id="plLeft">-${fmtClock(p.total-el)}</span></div>
  <div class="pl-main" id="plMain">
    <div class="pl-head">
      <h2>${esc(st.name)}</h2>
      <p class="sub">${st.rest ? (next ? "Next: "+esc(next.name) : "") : (st.sets>1 ? `Set ${st.set} of ${st.sets} · ` : "") + (st.reps ? st.reps+" reps" : fmtSecs(st.secs)+"s")}</p>
    </div>
    <div class="pl-stage">
      <button class="pl-arrow" onclick="playerStep(-1)" aria-label="Previous">${svgPrev}</button>
      ${playerMediaHTML(st)}
      <button class="pl-arrow" onclick="playerStep(1)" aria-label="Next">${svgNext}</button>
    </div>
    <div class="pl-time" id="plTime">${fmtSecs(p.remain)}</div>
    ${st.rest ? "" : playerWtHTML(st)}
    <p class="exnote" style="text-align:center;margin:0">${p.paused ? "Tap anywhere to resume" : "Tap to pause · swipe for next"}</p>
  </div>
  ${playerExListHTML()}
  </div>`;
}
