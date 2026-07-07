/* ---------- storage: window.storage (Claude) -> localStorage (self-hosted) -> memory ---------- */
const mem = {};
const store = {
  async get(k){
    try{ const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }catch(e){}
    try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){}
    return mem[k] ?? null;
  },
  async set(k,v){
    const s = JSON.stringify(v);
    try{ await window.storage.set(k,s); return; }catch(e){}
    try{ localStorage.setItem(k,s); return; }catch(e){}
    mem[k]=v;
  }
};

let uid = () => Math.random().toString(36).slice(2,9);

/* ---------- state ---------- */
let state = { template:null, days:{}, goal:45 };
let tab = "today";
let planDay = new Date().getDay();
let gutDraft = { sev:null, tags:[], note:"", food:"" };

/* Local-time date key (YYYY-MM-DD). Do NOT use toISOString() here — it is UTC
   and shifts the date for users far from UTC (e.g. evenings in the Americas,
   most of the day in NZ). Keys created by older versions keep working: the
   format is identical. */
const todayKey = (d=new Date()) => {
  const p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const TYPE_LABEL = {move:"Move", meal:"Meals", mind:"Mind"};

async function init(){
  const saved = await store.get("steady");
  if(saved){ state = saved; }
  if(!state.sevV2){
    Object.values(state.days||{}).forEach(d=>(d.gut||[]).forEach(g=>g.sev++));
    state.sevV2 = true;
  }
  if(!state.tags) state.tags = [];
  if(!state.weekPlans) state.weekPlans = {};
  if(!state.workouts) state.workouts = [];
  if(!state.woFolders) state.woFolders = [];
  if(!state.animMs) state.animMs = 1000;
  if(!state.customEx) state.customEx = [];
  if(!state.exImages) state.exImages = {};
  if(state.defRest == null) state.defRest = 60;
  if(!state.wtUnit) state.wtUnit = "lb";   /* default unit for newly-entered weights */
  if(state.supRest == null) state.supRest = 10;
  startAnimTicker();
  if(!state.template){
    state.template = {};
    for(let d=0; d<7; d++) state.template[d] = [];
  }
  materializeToday();
  render();
  /* Only resume Drive AFTER local state is loaded, otherwise driveInit()
     compares remote savedAt against the empty default state and can lose
     the newer local copy (or local load can overwrite the remote one). */
  resumeDrive();
  /* After local state is loaded (a share import mutates state) and after
     resumeDrive() has consumed any OAuth-redirect hash. */
  handleShareLink();
}
function weekKeyOf(date){
  const m = new Date(date); m.setDate(m.getDate() - ((m.getDay()+6)%7));
  return todayKey(m);   /* Monday of that week */
}
function planItemsFor(date){
  const wk = weekKeyOf(date), dow = date.getDay();
  return state.weekPlans?.[wk]?.[dow] || state.template[dow] || [];
}
let viewDate = null;   /* null = today */
function viewKey(){ return todayKey(viewDate || new Date()); }
function materializeDay(date){
  const k = todayKey(date);
  if(!state.days[k]){
    state.days[k] = {
      items: planItemsFor(date).map(t=>({...t, tid:t.id, id:uid(), status:"planned", actual:""})),
      orange:0, gut:[]
    };
    persist();
  }
}
function materializeToday(){ materializeDay(new Date()); }
function persist(){ store.set("steady", state); }   /* write without claiming "newer than Drive" */
function save(){ state.savedAt = Date.now(); persist(); driveUploadSoon(); }

