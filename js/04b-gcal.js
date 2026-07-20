/* ---------- Google Calendar integration ----------
   Shows events from selected calendars on the Today tab, and (optionally)
   pushes newly-added plan items to a calendar as recurring events.

   Setup (same Google Cloud project as Drive sync, see 04-drive.js):
   1. APIs & Services -> Library -> enable "Google Calendar API".
   2. Nothing else — the existing OAuth client works; users just grant the
      calendar scope when they connect from Settings -> Google Calendar.

   Token lifecycle mirrors DRIVE's: cached in localStorage ("gcalTok") with a
   55-min expiry + scope, resumed by resumeGcal() from init(), exactly one
   expiry timer (scheduleGcalExpiry). It is a SEPARATE token from Drive's so
   the two features never invalidate each other's scope. iOS full-page OAuth
   returns are routed here from handleAuthReturn() (purpose "gcal").

   Events the app creates carry extendedProperties.private:
     woApp:"1"  — created by this app (hidden on Today: the plan item already
                  shows there; hiding avoids duplicates)
     woCat      — category id (see state.categories)
     woCatName  — category name at creation time (readable in other tools)
   Event titles/descriptions/calendar names are external data: render via
   esc() only, and pass INDICES into GCAL caches to inline handlers, never the
   strings themselves. */
const GCAL = {
  SCOPE: "https://www.googleapis.com/auth/calendar",
  token: null, expTimer: null,
  list: null,        // calendarList cache: [{id,summary,primary,accessRole}]
  ev: {},            // dateKey -> merged, sorted events for that day
  evLoading: {},     // dateKey -> true while a fetch is in flight
  evGen: {},         // dateKey -> generation the data was fetched under
  evOk: {},          // dateKey -> Set of calendar ids whose fetch SUCCEEDED (reconcile trusts only these)
  evAt: {},          // dateKey -> ms timestamp of the last successful fetch (TTL)
  mut: {},           // eventId -> ms timestamp of our last mutation (reconcile grace period)
  gen: 0,            // bumped by gcalInvalidate(); stale days refetch silently
  dayList: null      // events array backing the currently rendered Today tab
};
/* Stale-while-revalidate: after a mutation (event created/deleted/moved) the
   cached day data is marked stale, NOT wiped — the Today tab keeps rendering
   the old data while a background refetch runs, then re-renders. Wiping the
   cache made a "Calendar" loading section flash in and out on every push. */
function gcalInvalidate(){ GCAL.gen++; }
const GCAL_TTL = 60000;   /* day data older than this refetches silently — changes made
                             directly in Google Calendar have no other way in */
/* Events we just created/patched/moved can be missing from Google's LIST
   endpoint for a short while (eventual consistency) — reconcile must not
   mistake that for a deletion. */
function gcalMarkMut(evId){ if(evId) GCAL.mut[evId] = Date.now(); }
function gcalRecentlyMut(evId){ return Date.now() - (GCAL.mut[evId]||0) < 120000; }
const GCAL_BYDAY = ["SU","MO","TU","WE","TH","FR","SA"];

/* ---- per-device prefs (localStorage, like Drive's) ---- */
function gcalCals(){ try{ return JSON.parse(localStorage.getItem("gcalCals")) || []; }catch(e){ return []; } }        // [{id,summary}]
function setGcalCals(v){ try{ localStorage.setItem("gcalCals", JSON.stringify(v)); }catch(e){} GCAL.ev = {}; GCAL.evGen = {}; gcalInvalidate(); }
function gcalPushPref(){ try{ return localStorage.getItem("gcalPush")==="1"; }catch(e){ return false; } }
function gcalDefTime(){ try{ return localStorage.getItem("gcalDefTime") || "09:00"; }catch(e){ return "09:00"; } }
function setGcalDefTime(v){ if(/^\d\d:\d\d$/.test(v)) try{ localStorage.setItem("gcalDefTime", v); }catch(e){} }
function gcalTargetCal(){
  try{ const t = JSON.parse(localStorage.getItem("gcalTarget")); if(t?.id) return t; }catch(e){}
  return {id:"primary", summary:"Primary calendar"};
}
function gcalPushEnabled(){ return !!GCAL.token && gcalPushPref(); }

/* ---- token ---- */
function gcalStoreToken(t, ms){
  GCAL.token = t;
  try{ localStorage.setItem("gcalTok", JSON.stringify({t, exp:Date.now()+ms, scope:GCAL.SCOPE})); }catch(e){}
  scheduleGcalExpiry(ms);
}
/* One expiry timer at a time (same rationale as scheduleTokenExpiry). */
function scheduleGcalExpiry(ms){
  clearTimeout(GCAL.expTimer);
  GCAL.expTimer = setTimeout(()=>{ GCAL.token = null; }, ms);
}
function gcalDropToken(){
  GCAL.token = null; clearTimeout(GCAL.expTimer);
  try{ localStorage.removeItem("gcalTok"); }catch(e){}
}
/* Called from init() after local state loads (order matters only in that it
   must run after handleAuthReturn had its chance inside resumeDrive()). */
function resumeGcal(){
  let s = null;
  try{ s = JSON.parse(localStorage.getItem("gcalTok")); }catch(e){}
  if(s && s.scope === GCAL.SCOPE && s.exp > Date.now()){
    GCAL.token = s.t;
    scheduleGcalExpiry(s.exp - Date.now());
  }
}
/* iOS full-page OAuth return (purpose "gcal"), routed from handleAuthReturn. */
function gcalAuthReturn(a){
  if(a.error){ return; }
  gcalStoreToken(a.token, a.expMs);
  gcalLoadList();
  openGcalMenu();
}
function gcalConnect(){
  if(needsRedirectAuth()) return redirectAuth(GCAL.SCOPE, "gcal");
  if(!window.google?.accounts){
    openSheet(`<h3>Google sign-in not loaded yet</h3><p class="sub">Check your connection and try again in a moment.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
    return;
  }
  const tc = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE.CLIENT_ID, scope: GCAL.SCOPE,
    callback: (r)=>{
      if(r.error){ console.error("Calendar auth error:", r); return; }
      gcalStoreToken(r.access_token, 55*60*1000);
      gcalLoadList();
      openGcalMenu();
    },
    error_callback: (e)=>console.error("Calendar popup error:", e)
  });
  tc.requestAccessToken();
}
async function cfetch(url, opts={}){
  const r = await fetch(url, {...opts, headers:{...(opts.headers||{}), Authorization:"Bearer "+GCAL.token}});
  if(r.status===401){ gcalDropToken(); throw new Error("calendar token expired"); }
  return r;
}
function gcalDisconnect(){
  const tok = GCAL.token;
  gcalDropToken();
  GCAL.list = null; GCAL.ev = {}; GCAL.evGen = {}; GCAL.dayList = null;
  if(tok && window.google?.accounts) try{ google.accounts.oauth2.revoke(tok, ()=>{}); }catch(e){}
  openGcalMenu(); render();
}

/* ---- calendar list / settings sheet ---- */
async function gcalLoadList(){
  try{
    const r = await (await cfetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250")).json();
    GCAL.list = (r.items||[]).map(c=>({id:c.id, summary:c.summaryOverride||c.summary||c.id, primary:!!c.primary, accessRole:c.accessRole||""}))
      .sort((a,b)=>(b.primary?1:0)-(a.primary?1:0));
  }catch(e){ console.error(e); GCAL.list = GCAL.list || []; }
  if(document.getElementById("gcalSheet")) openGcalMenu();   // refresh if the sheet is open
}
function gcalWritable(){ return (GCAL.list||[]).filter(c=>c.accessRole==="owner"||c.accessRole==="writer"); }
function openGcalMenu(){
  if(!GCAL.token){
    openSheet(`<div id="gcalSheet"></div><h3>Google Calendar</h3>
      <p class="sub">Show events from your calendars on the Today tab, and add plan items to a calendar as recurring events.</p>
      <button class="primary" onclick="gcalConnect()">Connect Google Calendar</button>
      <button class="sheet-btn" style="margin-top:8px" onclick="openDataMenu()"><span>${ICON.back}</span> Back</button>`);
    return;
  }
  if(!GCAL.list){
    gcalLoadList();
    openSheet(`<div id="gcalSheet"></div><h3>Google Calendar</h3><p class="sub">Loading your calendars…</p>`);
    return;
  }
  const selIds = new Set(gcalCals().map(c=>c.id));
  const wr = gcalWritable(), target = gcalTargetCal();
  openSheet(`<div id="gcalSheet"></div>
    <h3>Google Calendar</h3>
    <p class="sub">Checked calendars show their events on the Today tab.</p>
    ${GCAL.list.length ? GCAL.list.map((c,i)=>`
      <label class="checkrow"><input type="checkbox" ${selIds.has(c.id)?"checked":""} onchange="toggleGcalCal(${i})">
        <span>${esc(c.summary)}${c.primary?" <small style='color:var(--muted)'>· primary</small>":""}${/reader/i.test(c.accessRole)?" <small style='color:var(--muted)'>· read-only</small>":""}</span></label>`).join("")
      : `<p class="sub">No calendars found.</p>`}
    <button class="sheet-btn" onclick="openGcalNew()"><span>${ICON.spark}</span> Create a new calendar…</button>
    ${GCAL.dayStats && GCAL.dayStats.k===todayKey() ? `<p class="sub" style="margin-top:6px">Today: ${GCAL.dayStats.total} event${GCAL.dayStats.total===1?"":"s"} fetched${GCAL.dayStats.calsOk!=null?` from ${GCAL.dayStats.calsOk}/${GCAL.dayStats.calsSel} calendar${GCAL.dayStats.calsSel===1?"":"s"}`:""} · ${GCAL.dayStats.total-GCAL.dayStats.hidden} shown · ${GCAL.dayStats.hidden} linked to items${GCAL.dayStats.calsOk!=null && GCAL.dayStats.calsOk<GCAL.dayStats.calsSel?` — some calendars failed to load, try Disconnect + reconnect`:""}</p>`:""}
    <p class="sub" style="margin-top:14px">Plans → calendar</p>
    <label class="checkrow"><input type="checkbox" ${gcalPushPref()?"checked":""} onchange="toggleGcalPush(this)">
      <span>Add new plan items to a calendar too — weekly-plan items become recurring events, specific-week items one-off events. Categories are stored on the events.</span></label>
    ${gcalPushPref()?`
      <label class="fl">Create events on</label>
      <select class="field" onchange="setGcalTarget(this.value)">
        ${wr.length ? wr.map((c,i)=>`<option value="${i}" ${target.id===c.id?"selected":""}>${esc(c.summary)}</option>`).join("") : `<option value="">Primary calendar</option>`}
      </select>
      <label class="fl">Default event time</label>
      <input class="field" type="time" value="${gcalDefTime()}" onchange="setGcalDefTime(this.value)">`:""}
    <button class="sheet-btn danger" onclick="gcalDisconnect()"><span>${ICON.logout}</span> Disconnect Google Calendar</button>
    <button class="sheet-btn" onclick="openDataMenu()"><span>${ICON.back}</span> Back</button>`);
}
function toggleGcalCal(i){
  const c = (GCAL.list||[])[i]; if(!c) return;
  const sel = gcalCals();
  const has = sel.some(x=>x.id===c.id);
  setGcalCals(has ? sel.filter(x=>x.id!==c.id) : [...sel, {id:c.id, summary:c.summary}]);
  openGcalMenu(); render();
}
function toggleGcalPush(el){
  try{ localStorage.setItem("gcalPush", el.checked?"1":"0"); }catch(e){}
  openGcalMenu();
}
function setGcalTarget(iStr){
  const c = gcalWritable()[+iStr]; if(!c) return;
  try{ localStorage.setItem("gcalTarget", JSON.stringify({id:c.id, summary:c.summary})); }catch(e){}
}
function openGcalNew(){
  openSheet(`
    <h3>New calendar</h3>
    <p class="sub">Creates a calendar in your Google account (e.g. one just for workouts) and starts showing it on the Today tab.</p>
    <input class="field" id="calNewIn" placeholder="e.g. Workouts">
    <button class="primary" onclick="createGcalCal()">Create calendar</button>
    <button class="sheet-btn" style="margin-top:8px" onclick="openGcalMenu()"><span>${ICON.back}</span> Back</button>`);
  setTimeout(()=>document.getElementById("calNewIn")?.focus(),250);
}
async function createGcalCal(){
  const n = document.getElementById("calNewIn").value.trim(); if(!n) return;
  openSheet(`<h3>New calendar</h3><p class="sub">Creating…</p>`);
  try{
    const r = await (await cfetch("https://www.googleapis.com/calendar/v3/calendars",
      {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({summary:n})})).json();
    if(!r.id) throw new Error("create failed");
    setGcalCals([...gcalCals(), {id:r.id, summary:r.summary||n}]);
    GCAL.list = null;                 // reload so the new calendar appears
  }catch(e){ console.error(e); }
  openGcalMenu(); render();
}

/* ---- events on the Today tab ---- */
function gcalEvStartHM(e){
  if(!e.start?.dateTime) return null;
  const d = new Date(e.start.dateTime), p = n=>String(n).padStart(2,"0");
  return p(d.getHours())+":"+p(d.getMinutes());
}
function gcalEvTime(e){
  if(e.start?.date) return "All day";
  const f = d => { d=new Date(d); const p=n=>String(n).padStart(2,"0"); return p(d.getHours())+":"+p(d.getMinutes()); };
  return f(e.start?.dateTime) + (e.end?.dateTime ? "–"+f(e.end.dateTime) : "");
}
/* Returns null when the feature is off; otherwise {loading, byCat, other}
   where byCat/other hold {e,i} refs (i indexes GCAL.dayList — safe for inline
   handlers). Dedupe: an event is hidden ONLY if an item shown on this day
   actually links to it (gcalEventId from a push, gcalEvId from a copy, or a
   recurring instance whose series an item links to). App-created events with
   NO matching item still render — e.g. a plan item pushed after today was
   already materialized, or an item that was later removed: hiding those made
   events silently invisible in the app while visible in Google Calendar. */
function gcalDayData(k){
  if(!GCAL.token || !gcalCals().length) return null;
  const evs = GCAL.ev[k];
  const fresh = evs && GCAL.evGen[k] === GCAL.gen && (Date.now() - (GCAL.evAt[k]||0)) < GCAL_TTL;
  if(!fresh && !GCAL.evLoading[k]){ GCAL.evLoading[k] = true; gcalFetchDay(k); }
  if(!evs) return {loading:true, byCat:{}, other:[]};   // stale data keeps rendering while the refetch runs
  GCAL.dayList = evs;
  /* Ids linked from the items this day displays. Preview (future) days show
     plan items, so derive from the plan there. */
  const items = state.days[k]?.items || planItemsFor(new Date(k+"T12:00"));
  const linked = new Set(), seriesTime = new Map();
  items.forEach(it=>{
    if(it.gcalEventId){ linked.add(it.gcalEventId); if(it.gcalTime) seriesTime.set(it.gcalEventId, it.gcalTime); }
    if(it.gcalEvId) linked.add(it.gcalEvId);
  });
  /* An item hides at most ONE event: its exact id, or — for a linked
     recurring series — the single instance closest to the item's time.
     Extra same-day instances (a moved occurrence, duplicates) stay visible;
     hiding the whole series once made real events invisible in the app. */
  const hide = new Set(), bySeries = new Map();
  evs.forEach((e,i)=>{
    if(linked.has(e.id)){ hide.add(i); return; }
    if(e.recurringEventId && linked.has(e.recurringEventId)){
      if(!bySeries.has(e.recurringEventId)) bySeries.set(e.recurringEventId, []);
      bySeries.get(e.recurringEventId).push(i);
    }
  });
  for(const [sid, idxs] of bySeries){
    let best = idxs[0], bestD = Infinity;
    const t = seriesTime.get(sid);
    if(t && idxs.length > 1){
      const tm = (+t.slice(0,2))*60 + (+t.slice(3,5));
      for(const i of idxs){
        const e = evs[i]; if(!e.start?.dateTime) continue;
        const d0 = new Date(e.start.dateTime);
        const diff = Math.abs(d0.getHours()*60 + d0.getMinutes() - tm);
        if(diff < bestD){ bestD = diff; best = i; }
      }
    }
    hide.add(best);
  }
  const byCat = {}, other = [];
  evs.forEach((e,i)=>{
    if(hide.has(i)) return;
    const x = {e, i};
    const cid = gcalEvCat(e);
    if(cid) (byCat[cid] = byCat[cid]||[]).push(x);
    else other.push(x);
  });
  GCAL.dayStats = {k, total: evs.length, hidden: hide.size,
    calsOk: GCAL.evOk[k] ? GCAL.evOk[k].size : null, calsSel: gcalCals().length};
  return {loading:false, byCat, other};
}
async function gcalFetchDay(k){
  const gen = GCAL.gen;   // if invalidated mid-fetch, the result is already stale and will refetch
  try{
    const start = new Date(k+"T00:00"), end = new Date(k+"T00:00");
    end.setDate(end.getDate()+1);
    const q = new URLSearchParams({timeMin:start.toISOString(), timeMax:end.toISOString(),
      singleEvents:"true", orderBy:"startTime", maxResults:"50"});
    const all = [], okCals = new Set();
    for(const c of gcalCals()){
      try{
        const resp = await cfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?`+q);
        if(!resp.ok) throw new Error("events list "+resp.status);
        const r = await resp.json();
        (r.items||[]).forEach(e=>{ if(e.status!=="cancelled") all.push({...e, calName:c.summary, calId:c.id}); });
        okCals.add(c.id);   // only successfully fetched calendars may be reconciled
      }catch(e){ console.error(e); }
    }
    all.sort((a,b)=>(a.start?.dateTime||a.start?.date||"").localeCompare(b.start?.dateTime||b.start?.date||""));
    GCAL.ev[k] = all; GCAL.evGen[k] = gen; GCAL.evOk[k] = okCals; GCAL.evAt[k] = Date.now();
    try{ await gcalReconcileDay(k); }catch(e){ console.error(e); }   // mirror deletions made in Google Calendar
  }catch(e){ GCAL.ev[k] = GCAL.ev[k] || []; GCAL.evGen[k] = gen; }
  delete GCAL.evLoading[k];
  if(tab==="today" && viewKey()===k) render();
}
function gcalEvRow(x){
  const e = x.e, w = gcalEvWorkout(e);
  return `<button class="item" onclick="openGcalEvent(${x.i})">
    <div class="dot gcal">▤</div>
    <div class="tx"><div class="t">${esc(e.summary||"(no title)")}</div>
    ${w?`<div class="d">${esc(woSummary(w))}</div>`:""}
    <div class="d">${esc(gcalEvTime(e))} · ${esc(e.calName||"")}</div></div>
  </button>`;
}
function openGcalEvent(i){
  const e = GCAL.dayList?.[i]; if(!e) return;
  const desc = gcalMetaStrip(e.description).slice(0,300);
  openSheet(`
    <h3>${esc(e.summary||"(no title)")}</h3>
    <p class="sub">${esc(gcalEvTime(e))} · ${esc(e.calName||"")}${e.location?" · "+esc(e.location):""}</p>
    ${desc?`<p class="sub">${esc(desc)}</p>`:""}
    ${e.htmlLink?`<a class="sheet-btn" style="text-decoration:none" href="${esc(e.htmlLink)}" target="_blank" rel="noopener"><span>${ICON.open}</span> Open in Google Calendar</a>`:""}
    ${gcalEvWorkout(e)?`<button class="primary" style="margin-top:12px" onclick="gcalEvToDayWo(${i})">Log as workout: ${esc(gcalEvWorkout(e).name)}</button>`:""}
    <p class="sub" style="margin-top:12px">${gcalEvWorkout(e)?"Or log it as a plain item:":"Log it in the app as:"}</p>
    <div class="chips">${CATS().map((c,ci)=>`<button onclick="gcalEvToDay(${i},${ci})">${esc(c.name)}</button>`).join("")}</div>
    <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
}
/* Copies the event into the viewed day as a normal loggable item (planned).
   The calendar row disappears (matched by gcalEvId) — the item replaces it. */
function gcalEvToDay(i, ci){
  const e = GCAL.dayList?.[i], c = CATS()[ci]; if(!e || !c) return;
  materializeDay(viewDate || new Date());
  state.days[viewKey()].items.push({id:uid(), type:c.id, title:e.summary||"Calendar event",
    detail:"", status:"planned", actual:"", gcalEvId:e.id, gcalEvCalId:e.calId||null,
    gcalTime:gcalEvStartHM(e), gcalCalName:e.calName||null});   // shown via the ▤ cue
  if(e.calId) gcalSetEventCat(e.calId, e.id, c);   // write the category back to the event (best effort)
  save(); closeSheet(); render();
}
/* Logs a recognized event as a full workout item — carries workoutId, so the
   player, exercise details, and "Go to workout" all work. Writes the meta
   block back to the event so recognition is durable and editable in Google
   Calendar. */
function gcalEvToDayWo(i){
  const e = GCAL.dayList?.[i]; if(!e) return;
  const w = gcalEvWorkout(e); if(!w) return;
  materializeDay(viewDate || new Date());
  const it = woAsItem(w, true);
  const cid = gcalEvCat(e);
  if(cid) it.type = cid;
  it.gcalEvId = e.id; it.gcalEvCalId = e.calId || null;
  it.gcalTime = gcalEvStartHM(e); it.gcalCalName = e.calName || null;   // keep the calendar time visible (▤ cue)
  state.days[viewKey()].items.push(it);
  if(e.calId) gcalWriteEventMeta(e.calId, e.id, {cat: CATS().find(c=>c.id===it.type), workout: w});
  save(); closeSheet(); render();
}
/* Write the category onto the event: description meta block (source of
   truth, user-editable in Google Calendar) + woCat extendedProperty.
   GET-then-PATCH so the user's own description text and other private
   extendedProperty keys are preserved. Fails silently on read-only
   calendars — the local item keeps its category regardless. */
function gcalSetEventCat(calId, evId, cat){ return gcalWriteEventMeta(calId, evId, {cat}); }
async function gcalWriteEventMeta(calId, evId, {cat, workout}){
  if(!GCAL.token || !calId || !evId) return;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(evId)}`;
  try{
    gcalMarkMut(evId);
    const r = await (await cfetch(url)).json();
    if(!r.id) return;
    const keepWo = workout ? workout.name : gcalMetaWorkout(r.description);   // don't drop an existing Workout line
    await cfetch(url, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({
      description: gcalMetaWrite(r.description, {cat: cat?.name, workout: keepWo}),
      extendedProperties: {private: {...(r.extendedProperties?.private||{}),
        ...(cat ? {woCat:cat.id, woCatName:cat.name} : {}),
        ...(workout ? {woWo:String(workout.id)} : {})}}
    })});
    gcalInvalidate();
  }catch(e){ console.error("event meta write failed", e); }
}
/* Category sheet for a day/plan item (caller sets activeItem). Changing it
   also updates the linked event when there is one. */
function openItemCat(){
  const it = activeItem; if(!it) return;
  const hasEv = !!(it.gcalEventId || it.gcalEvId);
  openSheet(`
    <h3>Category</h3>
    <p class="sub">${esc(it.title)}${hasEv?" — also updates the calendar event (in the Workouts app section of its description, which you can edit from Google Calendar too)":""}</p>
    <div class="chips">${CATS().map((c,ci)=>`<button class="${c.id===it.type?'on':''}" onclick="setItemCat(${ci})">${esc(c.name)}</button>`).join("")}</div>
    <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
}
function setItemCat(ci){
  const it = activeItem, c = CATS()[ci]; if(!it || !c) return;
  it.type = c.id;
  const evId = it.gcalEventId || it.gcalEvId;
  const calId = it.gcalCalId || it.gcalEvCalId;
  if(evId && calId) gcalSetEventCat(calId, evId, c);
  save(); closeSheet(); render();
}

/* ---- pushing items to the calendar ----
   Linked items carry gcalEventId/gcalCalId (so edits/deletes propagate) plus
   display-only gcalCalName/gcalTime for the Today/Plan cue — the cue is a
   snapshot; openItemCal() re-reads the live event before editing. */
/* ---- category metadata in the event DESCRIPTION (source of truth) ----
   Users can't edit extendedProperties from the Google Calendar UI, so the
   category also lives in a human-editable block at the end of the
   description:

     --- Workouts app ---
     Category: Move

   Reading is priority description > woCat extendedProperty (the description
   is what the user can change in Google Calendar). Parsing is tolerant of
   the HTML Google wraps descriptions in after UI edits (<br>, <p>, entities
   are normalized first). Writing appends/replaces the block on the RAW
   description to preserve the user's own text. */
const GCAL_META_HDR = "--- Workouts app ---";
function gcalDescText(desc){
  return String(desc||"").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(p|div|li)>/gi,"\n")
    .replace(/<[^>]*>/g,"").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&");
}
function gcalMetaStrip(desc){
  const txt = gcalDescText(desc);
  const i = txt.indexOf(GCAL_META_HDR);
  return (i < 0 ? txt : txt.slice(0, i)).trimEnd();
}
function gcalMetaCat(desc){
  const txt = gcalDescText(desc);
  const i = txt.indexOf(GCAL_META_HDR);
  if(i < 0) return null;
  const m = txt.slice(i).match(/Category:\s*(.+)/i);
  return m ? m[1].trim() : null;
}
/* f: {cat:<category name>, workout:<workout name>|null} — or a plain string
   meaning just the category (legacy callers). */
function gcalMetaWrite(desc, f){
  if(typeof f === "string") f = {cat:f};
  let base = String(desc||"");
  const i = base.indexOf(GCAL_META_HDR);
  if(i >= 0) base = base.slice(0, i);   // replace our previous block (best effort on HTML-wrapped text)
  base = base.replace(/(\s|<br\s*\/?>)+$/i, "");
  let block = GCAL_META_HDR;
  if(f.cat) block += "\nCategory: " + f.cat;
  if(f.workout) block += "\nWorkout: " + f.workout;
  return (base ? base + "\n\n" : "") + block;
}
function gcalMetaWorkout(desc){
  const txt = gcalDescText(desc);
  const i = txt.indexOf(GCAL_META_HDR);
  if(i < 0) return null;
  const m = txt.slice(i).match(/Workout:\s*(.+)/i);
  return m ? m[1].trim() : null;
}
function woByName(n){
  if(!n) return null;
  n = n.trim().toLowerCase();
  return state.workouts.find(w=>w.name.trim().toLowerCase()===n) || null;
}
/* Resolve an event to an app workout. Priority: description meta "Workout:"
   (name, source of truth, user-editable in Google Calendar) > woWo
   extendedProperty (app-local workout id) > the event TITLE matching a
   workout name — the fallback that makes hand-made calendar events work
   with zero setup. */
function gcalEvWorkout(e){
  const byMeta = woByName(gcalMetaWorkout(e.description));
  if(byMeta) return byMeta;
  const p = e.extendedProperties?.private;
  if(p?.woWo){ const w = woById(p.woWo); if(w) return w; }
  return woByName(e.summary);
}
function catIdByName(n){
  if(!n) return null;
  n = n.trim().toLowerCase();
  return CATS().find(c=>c.name.trim().toLowerCase()===n)?.id || null;
}
/* Resolved category id for an event, or null. */
function gcalEvCat(e){
  const metaId = catIdByName(gcalMetaCat(e.description));
  if(metaId) return metaId;
  const p = e.extendedProperties?.private;
  return (p?.woCat && CATS().some(c=>c.id===p.woCat)) ? p.woCat : null;
}
function gcalFmtLocal(d){ const p=n=>String(n).padStart(2,"0"); return `${todayKey(d)}T${p(d.getHours())}:${p(d.getMinutes())}:00`; }
function gcalLinkItem(it, evId, cal, time){
  it.gcalEventId = evId; it.gcalCalId = cal.id;
  it.gcalCalName = cal.summary; it.gcalTime = time;
}
async function gcalCreateEvent(it, sd, ed, recurrence){
  const cal = gcalTargetCal();
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try{
    const wo = it.workoutId ? woById(it.workoutId) : null;
    const body = {
      summary: it.title,
      description: gcalMetaWrite(it.detail || "", {cat:catName(it.type), workout:wo?.name}),
      start: {dateTime: gcalFmtLocal(sd), timeZone: TZ},
      end:   {dateTime: gcalFmtLocal(ed), timeZone: TZ},
      extendedProperties: {private: {woApp:"1", woCat:String(it.type), woCatName:catName(it.type),
        ...(wo ? {woWo:String(wo.id)} : {})}}
    };
    if(recurrence) body.recurrence = recurrence;
    const r = await (await cfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`,
      {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)})).json();
    if(r.id) gcalMarkMut(r.id);
    return r.id ? r : null;
  }catch(e){ console.error("calendar push failed", e); return null; }
}
/* Plan items. opts: {dow:0-6, weekMonday:Date|null (null = weekly template →
   recurring event), time:"HH:MM", dur:minutes}. */
async function gcalPushPlanItems(items, o){
  if(!gcalPushEnabled() || !items.length) return;
  const cal = gcalTargetCal();
  const time = /^\d\d:\d\d$/.test(o.time||"") ? o.time : gcalDefTime();
  const dur = Math.max(5, +o.dur || 45);
  let base;
  if(o.weekMonday){ base = new Date(o.weekMonday); base.setDate(base.getDate() + ((o.dow+6)%7)); }
  else { base = new Date(); base.setDate(base.getDate() + ((o.dow - base.getDay()) + 7) % 7); }   // next occurrence of that weekday
  const sd = new Date(todayKey(base)+"T"+time);
  const ed = new Date(sd.getTime() + dur*60000);
  let linked = false;
  for(const it of items){
    const r = await gcalCreateEvent(it, sd, ed, o.weekMonday ? null : ["RRULE:FREQ=WEEKLY;BYDAY="+GCAL_BYDAY[o.dow]]);
    if(r){ gcalLinkItem(it, r.id, cal, time); linked = true; }
  }
  gcalInvalidate();         // day caches are stale now (refetched silently)
  if(linked) save();        // persist the event links (authoring change)
}
/* Day items (e.g. a workout added to today / a picked date) → one-off events.
   opts: {dateKey:"YYYY-MM-DD", time:"HH:MM", dur:minutes}. */
async function gcalPushDayItems(items, o){
  if(!gcalPushEnabled() || !items.length) return;
  const cal = gcalTargetCal();
  const time = /^\d\d:\d\d$/.test(o.time||"") ? o.time : gcalDefTime();
  const dur = Math.max(5, +o.dur || 45);
  const sd = new Date(o.dateKey+"T"+time);
  const ed = new Date(sd.getTime() + dur*60000);
  let linked = false;
  for(const it of items){
    const r = await gcalCreateEvent(it, sd, ed, null);
    if(r){ gcalLinkItem(it, r.id, cal, time); linked = true; }
  }
  gcalInvalidate();
  if(linked){ save(); render(); }   // re-render so the "on calendar" cue appears
}
/* Update/remove the link fields on every item (template, week overrides,
   days) that references this event — plan items and their materialized
   copies share the same event id. patch=null removes the link. */
function gcalSyncLinks(evId, patch){
  const apply = it => {
    if(it.gcalEventId !== evId) return;
    if(patch) Object.assign(it, patch);
    else { delete it.gcalEventId; delete it.gcalCalId; delete it.gcalCalName; delete it.gcalTime; }
  };
  for(let d=0; d<7; d++) (state.template[d]||[]).forEach(apply);
  Object.values(state.weekPlans||{}).forEach(wk => { for(let d=0; d<7; d++) (wk[d]||[]).forEach(apply); });
  Object.values(state.days||{}).forEach(day => (day.items||[]).forEach(apply));
}
/* Is this event id owned by a plan item (weekly template or a week
   override)? Those are recurring-series events: a single day's materialized
   copy must NOT delete them. */
function gcalEventInPlans(evId){
  for(let d=0; d<7; d++) if((state.template[d]||[]).some(x=>x.gcalEventId===evId)) return true;
  for(const wk of Object.values(state.weekPlans||{}))
    for(let d=0; d<7; d++) if((wk[d]||[]).some(x=>x.gcalEventId===evId)) return true;
  return false;
}
function removePlanItemsByEvent(evId){
  for(let d=0; d<7; d++) state.template[d] = (state.template[d]||[]).filter(x=>x.gcalEventId!==evId);
  Object.values(state.weekPlans||{}).forEach(wk=>{ for(let d=0; d<7; d++) if(wk[d]) wk[d] = wk[d].filter(x=>x.gcalEventId!==evId); });
}
/* ---- calendar → app deletion sync ----
   Runs after each day fetch and mirrors deletions made in Google Calendar.
   Absence from the LIST response is only a HINT, never proof: the list can
   transiently miss a just-patched event (eventual consistency) and a failed
   per-calendar fetch looks identical to deletion. So removal requires ALL of:
   1. the event's calendar is selected for display AND its list fetch
      SUCCEEDED this round (GCAL.evOk[k]);
   2. we didn't mutate the event ourselves in the last 2 min (gcalMarkMut);
   3. a direct GET by id — strongly consistent — confirms 404/410/cancelled.
   Then: planned day items are removed; logged ones (done/swapped/skipped)
   are history and only lose their link; owning plan items (recurring
   series) are removed too. */
async function gcalReconcileDay(k){
  const evs = GCAL.ev[k];
  if(!evs || !GCAL.token) return false;
  const okCals = GCAL.evOk[k];
  if(!okCals || !okCals.size) return false;
  const present = new Set(), remoteTime = new Map(), remoteCat = new Map();   // evId -> "HH:MM" / category id
  evs.forEach(e=>{
    present.add(e.id);
    let t = null;
    if(e.start?.dateTime){ const d=new Date(e.start.dateTime), p=n=>String(n).padStart(2,"0"); t = p(d.getHours())+":"+p(d.getMinutes()); }
    const cid = gcalEvCat(e);
    if(t) remoteTime.set(e.id, t);
    if(cid) remoteCat.set(e.id, cid);
    if(e.recurringEventId){ present.add(e.recurringEventId); if(t) remoteTime.set(e.recurringEventId, t); if(cid) remoteCat.set(e.recurringEventId, cid); }
  });
  const day = state.days[k];
  let changed = false;
  /* Remote time edits → refresh the "▤ time" cue on every linked copy.
     Skip events we mutated ourselves recently: the list may still be stale. */
  const seen = new Set();
  (day?.items||[]).forEach(it=>{
    const evId = it.gcalEventId;
    if(evId && !seen.has(evId) && !gcalRecentlyMut(evId)){
      const patch = {};
      const t = remoteTime.get(evId), cid = remoteCat.get(evId);
      if(t && t!==it.gcalTime) patch.gcalTime = t;
      if(cid && cid!==it.type) patch.type = cid;   // description is the source of truth for the category
      if(Object.keys(patch).length){ seen.add(evId); gcalSyncLinks(evId, patch); changed = true; }
    }
    /* items logged FROM an external event (gcalEvId): local copy only */
    if(it.gcalEvId && !gcalRecentlyMut(it.gcalEvId)){
      const cid = remoteCat.get(it.gcalEvId), t2 = remoteTime.get(it.gcalEvId);
      if(cid && cid!==it.type){ it.type = cid; changed = true; }
      if(t2 && t2!==it.gcalTime){ it.gcalTime = t2; changed = true; }
    }
  });
  const gone = new Map();   // evId -> calId (candidates only — verified below)
  (day?.items||[]).forEach(it=>{
    if(it.gcalEventId && okCals.has(it.gcalCalId) && !present.has(it.gcalEventId) && !gcalRecentlyMut(it.gcalEventId))
      gone.set(it.gcalEventId, it.gcalCalId);
  });
  if(!gone.size){ if(changed) save(); return changed; }
  for(const [evId, calId] of gone){
    let deleted = false;
    try{
      const r = await cfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(evId)}`);
      if(r.status===404 || r.status===410) deleted = true;
      else if(r.ok){ const j = await r.json(); deleted = !j.id || j.status==="cancelled"; }
      /* any other status (401 throws in cfetch, 5xx, network): unknown — keep the item */
    }catch(e){}
    if(!deleted) continue;
    const before = day.items.length;
    day.items = day.items.filter(it => !(it.gcalEventId===evId && it.status==="planned"));
    if(day.items.length !== before) changed = true;
    if(gcalEventInPlans(evId)){ removePlanItemsByEvent(evId); changed = true; }
    gcalSyncLinks(evId, null);   // unlink surviving (logged) copies
    changed = true;
  }
  if(changed) save();
  return changed;
}
/* ---- edit sheet for a linked event (opened from an item's action sheet;
   the caller sets activeItem first — plan items reuse it too) ---- */
async function openItemCal(){
  const it = activeItem; if(!it?.gcalEventId) return;
  openSheet(`<h3>Calendar event</h3><p class="sub">Loading…</p>`);
  if(!GCAL.token){
    return openSheet(`<h3>Calendar event</h3><p class="sub">Google Calendar is disconnected — reconnect in Settings → Google Calendar.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
  }
  if(!GCAL.list) await gcalLoadList();
  let ev = null;
  try{ ev = await (await cfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(it.gcalCalId)}/events/${encodeURIComponent(it.gcalEventId)}`)).json(); }catch(e){}
  if(!ev?.id || ev.status==="cancelled"){
    return openSheet(`<h3>Calendar event</h3><p class="sub">Couldn't load the event — it may have been deleted in Google Calendar.</p>
      <button class="sheet-btn danger" onclick="gcalSyncLinks(activeItem.gcalEventId, null);save();closeSheet();render()"><span>${ICON.trash}</span> Forget the link</button>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
  }
  const sd = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
  const edt = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
  const p = n=>String(n).padStart(2,"0");
  const time = sd ? p(sd.getHours())+":"+p(sd.getMinutes()) : gcalDefTime();
  const dur = sd && edt ? Math.max(5, Math.round((edt-sd)/60000)) : 45;
  const recurring = !!(ev.recurrence && ev.recurrence.length);
  GCAL.editEv = {calId: it.gcalCalId, evId: it.gcalEventId, dateK: sd ? todayKey(sd) : (ev.start?.date || todayKey())};
  const wr = gcalWritable();
  openSheet(`
    <h3>Calendar event</h3>
    <p class="sub">${esc(it.title)} on <b>${esc(it.gcalCalName||"your calendar")}</b>${recurring?" · repeats weekly — changes apply to the whole series":""}</p>
    <div class="numrow">
      <div><label class="fl">Time</label><input class="field" type="time" id="evTimeIn" value="${time}"></div>
      <div><label class="fl">Duration (min)</label><input class="field" type="number" min="5" id="evDurIn" value="${dur}"></div>
    </div>
    ${wr.length>1?`<label class="fl">Calendar</label>
      <select class="field" id="evCalSel">${wr.map((c,i)=>`<option value="${i}" ${c.id===it.gcalCalId?"selected":""}>${esc(c.summary)}</option>`).join("")}</select>`:""}
    <button class="primary" onclick="saveItemCal()">Save</button>
    <button class="sheet-btn danger" style="margin-top:8px" onclick="removeItemCal()"><span>${ICON.trash}</span> Remove from calendar</button>
    <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
}
async function saveItemCal(){
  const e = GCAL.editEv; if(!e) return;
  const time = document.getElementById("evTimeIn")?.value || gcalDefTime();
  const dur = Math.max(5, parseInt(document.getElementById("evDurIn")?.value)||45);
  const selEl = document.getElementById("evCalSel");
  closeSheet();
  try{
    let calId = e.calId, calName = null;
    if(selEl){
      const dest = gcalWritable()[+selEl.value];
      if(dest && dest.id !== calId){
        await cfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(e.evId)}/move?destination=${encodeURIComponent(dest.id)}`, {method:"POST"});
        calId = dest.id; calName = dest.summary;
      } else if(dest) calName = dest.summary;
    }
    const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const sd = new Date(e.dateK+"T"+time), ed = new Date(sd.getTime()+dur*60000);
    await cfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(e.evId)}`,
      {method:"PATCH", headers:{"Content-Type":"application/json"},
       body:JSON.stringify({start:{dateTime:gcalFmtLocal(sd), timeZone:TZ}, end:{dateTime:gcalFmtLocal(ed), timeZone:TZ}})});
    gcalMarkMut(e.evId);
    gcalSyncLinks(e.evId, {gcalCalId:calId, gcalTime:time, ...(calName?{gcalCalName:calName}:{})});
    gcalInvalidate();
    save();
  }catch(err){ console.error(err); }
  render();
}
function removeItemCal(){
  const e = GCAL.editEv; if(!e) return;
  gcalDeleteEvent(e.calId, e.evId);
  gcalSyncLinks(e.evId, null);
  save(); closeSheet(); render();
}
/* Mobile keeps the page alive for days — when the app returns to the
   foreground, mark day data stale so edits made in Google Calendar while we
   were backgrounded show up. (Top-level statement: fine here, 03-ui.js has
   already defined `tab` by the time this file loads.) */
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState !== "visible" || !GCAL.token) return;
  gcalInvalidate();
  if(tab === "today") render();   // kicks the silent refetch
});
function gcalDeleteEvent(calId, evId){
  if(!GCAL.token || !calId || !evId) return;
  cfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(evId)}`,
    {method:"DELETE"}).then(()=>{ gcalInvalidate(); }).catch(e=>console.error(e));
}
function gcalPatchEvent(calId, evId, patch){
  if(!GCAL.token || !calId || !evId) return;
  gcalMarkMut(evId);
  cfetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(evId)}`,
    {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(patch)})
    .then(()=>{ gcalInvalidate(); }).catch(e=>console.error(e));
}
