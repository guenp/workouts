/* ---------- Google Drive sync (works on GitHub Pages, no backend) ----------
   Setup once:
   1. console.cloud.google.com → create project → enable "Google Drive API"
   2. OAuth consent screen → External → add yourself as test user
   3. Credentials → OAuth client ID → Web app → add your GitHub Pages URL
      (e.g. https://yourname.github.io) to "Authorized JavaScript origins"
   4. Paste the client ID below. It is public by design — safe in a static site.
   Data lives in Drive's hidden appDataFolder: invisible to you in Drive UI,
   sandboxed to this app only. */
function getMode(){ try{ return localStorage.getItem("storageMode") || "local"; }catch(e){ return "local"; } }
function setStorageMode(m){
  try{ localStorage.setItem("storageMode", m); }catch(e){}
  if(m === "local"){ DRIVE.token = null; DRIVE.status = "off"; clearTimeout(DRIVE.expTimer); try{ localStorage.removeItem("driveTok"); }catch(e){} closeSheet(); render(); }
  else { closeSheet(); driveConnect(); }
}
const DRIVE = {
  CLIENT_ID: "917051838146-5klrr8khk1dub831kje93vogho5hhq70.apps.googleusercontent.com",
  token:null, fileId:null, status:"off", timer:null, expTimer:null,
  pending:false,   // true = local changes Drive hasn't confirmed yet
  label(){ if(getMode()==="local") return "Local"; return {off:"Drive: off", connecting:"Connecting…", on:"Drive ✓", saving:"Saving…", error:"Sync error"}[this.status]; }
};
function pillTap(){
  if(getMode()==="drive" && DRIVE.status!=="on" && DRIVE.status!=="connecting"){ driveConnect(); }
  else { openDataMenu(); }
}
/* ---------- iOS full-page OAuth fallback ----------
   GIS's popup token flow finishes by navigating its popup to an internal
   storagerelay:// URL. iOS/iPadOS Safari — and Home Screen web apps in
   particular — refuse that scheme with "Safari cannot open the page", so the
   token never reaches the app. On those devices we use the classic
   implicit-grant *redirect* flow: full-page hop to Google, token returned in
   the URL hash. REQUIRES the app URL (https://guen.pw/workouts/) to be listed
   under "Authorized redirect URIs" on the OAuth client in Google Cloud
   Console — "Authorized JavaScript origins" alone is not enough. */
function needsRedirectAuth(){
  const ipadOS = navigator.platform==="MacIntel" && navigator.maxTouchPoints>1; // iPad Safari masquerades as a Mac
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || ipadOS || navigator.standalone===true;
}
function appRedirectUri(){ return location.origin + location.pathname.replace(/index\.html$/,""); }
function redirectAuth(scope, purpose, promptMode){
  const st = uid();
  try{ sessionStorage.setItem("oauthPending", JSON.stringify({state:st, purpose, scope})); }catch(e){}
  const q = new URLSearchParams({client_id:DRIVE.CLIENT_ID, redirect_uri:appRedirectUri(),
    response_type:"token", scope, state:st, ...(promptMode?{prompt:promptMode}:{})});
  location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + q.toString();
}
/* Parse-time: capture a token returning in the hash and clean the URL.
   Acting on it (driveInit, resuming the save/open flow) waits until
   resumeDrive() runs at the end of init(), after local state has loaded. */
const AUTH_RETURN = (()=>{
  if(!/access_token=|error=/.test(location.hash)) return null;
  const h = new URLSearchParams(location.hash.slice(1));
  let pend = null;
  try{ pend = JSON.parse(sessionStorage.getItem("oauthPending")); sessionStorage.removeItem("oauthPending"); }catch(e){}
  if(!pend || pend.state !== h.get("state")) return null;   // not our redirect / stale
  history.replaceState(null, "", location.pathname + location.search);
  if(h.get("error")) return {purpose:pend.purpose, error:h.get("error")};
  return {purpose:pend.purpose, scope:pend.scope, token:h.get("access_token"),
          expMs: Math.max((+h.get("expires_in")||3600)-300, 60)*1000};
})();
function handleAuthReturn(){
  const a = AUTH_RETURN;
  if(!a) return false;
  if(a.error){
    if(a.purpose==="drive"){ DRIVE.status="error"; render(); }
    return true;
  }
  if(a.purpose==="drive"){
    DRIVE.token = a.token;
    try{ localStorage.setItem("driveTok", JSON.stringify({t:a.token, exp:Date.now()+a.expMs, scope:a.scope})); }catch(e){}
    driveInit();
    scheduleTokenExpiry(a.expMs);
    return true;
  }
  VIS.token = a.token; setTimeout(()=>VIS.token=null, a.expMs);
  if(a.purpose==="vis-open") visOpenGo();
  else if(a.purpose==="vis-save") visSaveGo();
  else if(a.purpose==="wo-share") woShareDriveGo();
  return true;
}
/* ---------- sync location (Settings → Google Drive settings) ----------
   "appdata" (default): hidden appDataFolder, scope drive.appdata.
   "folder": a visible Drive folder, scope drive.file — either the default
   "workouts" folder (created on demand) or a custom folder picked with the
   Google Picker. Switching drops the cached token because the scope differs. */
const SCOPES = {appdata:"https://www.googleapis.com/auth/drive.appdata", file:"https://www.googleapis.com/auth/drive.file"};
function syncLoc(){ try{ return localStorage.getItem("driveSyncLoc")==="folder" ? "folder" : "appdata"; }catch(e){ return "appdata"; } }
function driveScope(){ return syncLoc()==="folder" ? SCOPES.file : SCOPES.appdata; }
function syncFolderPref(){ try{ return JSON.parse(localStorage.getItem("driveSyncFolder")); }catch(e){ return null; } } // {id,name} or null = default "workouts"
/* ---------- connected Google account (avatar + email in Settings) ----------
   Fetched from Drive's `about` endpoint, which works with both sync scopes —
   no extra OAuth scopes or consent needed. Cached in localStorage so the row
   still shows who's signed in after the ~1h token expires; cleared only by
   Sign out / Switch account. Never interpolate these values into inline
   handlers — they're rendered as HTML/attribute text via esc() only. */
function driveUserInfo(){ try{ return JSON.parse(localStorage.getItem("driveUser")); }catch(e){ return null; } }
function clearDriveUser(){ try{ localStorage.removeItem("driveUser"); }catch(e){} }
async function fetchDriveUser(){
  try{
    const r = await (await dfetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)")).json();
    if(!r.user) return;
    const u = {name:r.user.displayName||"", email:r.user.emailAddress||"", photo:r.user.photoLink||""};
    try{ localStorage.setItem("driveUser", JSON.stringify(u)); }catch(e){}
    if(document.getElementById("acctRow")) openDataMenu();   // settings sheet is open — refresh the row
  }catch(e){}
}
function acctAvatar(u, size){
  const initial = esc((u.name||u.email||"?").trim().charAt(0).toUpperCase());
  const img = u.photo ? `<img class="acct-img" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  return `<span class="acct-ava" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.45)}px">${initial}${img}</span>`;
}
/* Row shown in Settings when Drive sync is the storage mode. */
function acctRowHTML(){
  if(getMode()!=="drive") return "";
  const u = driveUserInfo();
  if(!u){
    if(DRIVE.token){ fetchDriveUser(); return `<div class="acct" id="acctRow">${acctAvatar({name:"…"},36)}<div class="acct-t"><b>Loading account…</b></div></div>`; }
    return "";
  }
  const connected = DRIVE.status==="on" || DRIVE.status==="saving";
  return `<button class="acct" id="acctRow" onclick="openDriveAccount()">${acctAvatar(u,36)}
    <div class="acct-t"><b>${esc(u.name||u.email)}</b><small>${esc(u.email)}</small></div>
    <small class="acct-st ${connected?"":"off"}">${connected?"Connected":"Signed out"}</small></button>`;
}
function openDriveAccount(){
  const u = driveUserInfo();
  if(!u) return openDataMenu();
  const connected = !!DRIVE.token;
  openSheet(`
    <div class="acct-big">${acctAvatar(u,64)}
      <h3>${esc(u.name||u.email)}</h3>
      <p class="sub">${esc(u.email)}${connected?"":" · signed out"}</p>
    </div>
    ${connected?"":`<button class="sheet-btn" onclick="closeSheet();driveConnect()"><span>${ICON.chain}</span> Reconnect</button>`}
    <button class="sheet-btn" onclick="switchDriveAccount()"><span>${ICON.swap}</span> Switch account…</button>
    <button class="sheet-btn danger" onclick="signOutDrive()"><span>${ICON.logout}</span> Sign out</button>
    <button class="sheet-btn" onclick="openDataMenu()"><span>${ICON.back}</span> Back</button>`);
}
/* Switch: keep the grant (fast re-consent) but force Google's account chooser. */
function switchDriveAccount(){
  closeSheet();
  dropDriveToken(); clearDriveUser();
  driveConnect("select_account");
}
/* Sign out: revoke the grant, forget the account, fall back to local storage. */
function signOutDrive(){
  const tok = DRIVE.token;
  dropDriveToken(); clearDriveUser();
  if(tok && window.google?.accounts) try{ google.accounts.oauth2.revoke(tok, ()=>{}); }catch(e){}
  try{ localStorage.setItem("storageMode", "local"); }catch(e){}
  render(); openDataMenu();
}
function dropDriveToken(){
  DRIVE.token = null; DRIVE.fileId = null; DRIVE.status = "off";
  clearTimeout(DRIVE.expTimer);
  try{ localStorage.removeItem("driveTok"); }catch(e){}
}
function setSyncLoc(v){
  if(v === syncLoc()) return;
  try{ localStorage.setItem("driveSyncLoc", v); }catch(e){}
  dropDriveToken();                       // scope changed — old token is invalid for the new mode
  openDataMenu();
  if(getMode()==="drive") driveConnect(); // re-consent with the new scope
  else render();
}
/* Find (or create) the default "workouts" folder. Works with either token's
   fetch wrapper; drive.file only sees app-created files, so this finds the
   folder this app made and never someone's unrelated "workouts" folder. */
async function ensureDefaultFolder(f){
  const q = await (await f("https://www.googleapis.com/drive/v3/files?fields=files(id)&q=" +
    encodeURIComponent("name='workouts' and mimeType='application/vnd.google-apps.folder' and trashed=false"))).json();
  if(q.files?.length) return q.files[0].id;
  const m = await (await f("https://www.googleapis.com/drive/v3/files",
    {method:"POST", headers:{"Content-Type":"application/json"},
     body:JSON.stringify({name:"workouts", mimeType:"application/vnd.google-apps.folder"})})).json();
  if(!m.id) throw new Error("couldn't create workouts folder");
  return m.id;
}
function driveConnect(promptMode){   // promptMode "select_account" → force Google's account chooser
  if(DRIVE.status==="on"){ return; }
  if(needsRedirectAuth()){ DRIVE.status="connecting"; render(); return redirectAuth(driveScope(), "drive", promptMode); }
  if(!window.google?.accounts){ DRIVE.status="error"; render(); return; }
  DRIVE.status="connecting"; render();
  const tc = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE.CLIENT_ID,
    scope: driveScope(),
    callback: async (resp)=>{
      if(resp.error){ console.error("Drive auth error:", resp); DRIVE.status="error"; render(); return; }
      DRIVE.token = resp.access_token;
      try{ localStorage.setItem("driveTok", JSON.stringify({t:resp.access_token, exp:Date.now()+55*60*1000, scope:driveScope()})); }catch(e){}
      await driveInit();
      scheduleTokenExpiry(55*60*1000);
    },
    error_callback: (err)=>{ console.error("Drive popup error:", err); DRIVE.status="error"; render(); }
  });
  tc.requestAccessToken(promptMode ? {prompt: promptMode} : undefined);
}
/* One expiry timer at a time — a stale timer from an old token must not
   invalidate a freshly acquired one. */
function scheduleTokenExpiry(ms){
  clearTimeout(DRIVE.expTimer);
  DRIVE.expTimer = setTimeout(()=>{ DRIVE.token=null; DRIVE.status="off"; render(); }, ms);
}
/* On startup: reuse the saved token if it hasn't expired (~1h), else show
   Reconnect. Called from init() AFTER local state has loaded. */
function resumeDrive(){
  if(handleAuthReturn()) return;   // just came back from a full-page OAuth redirect (iOS)
  if(getMode()!=="drive") return;
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem("driveTok")); }catch(e){}
  if(!saved) return;
  if((saved.scope || SCOPES.appdata) !== driveScope()) return; // token from the other sync mode
  if(saved.exp > Date.now()){
    DRIVE.token = saved.t;
    driveInit();
    scheduleTokenExpiry(saved.exp - Date.now());
  }
}
/* ---------- visible Drive file (shareable, custom location) ----------
   Uses the drive.file scope: the app only sees files it created or that you
   picked. Choosing a custom folder or opening shared files uses the Google
   Picker (Google's file-browser dialog), which requires an API key — a plain
   Google Cloud API key, separate from the OAuth client ID above.

   To set one up (docs: https://developers.google.com/workspace/drive/picker):
   1. Go to https://console.cloud.google.com/ and select the same project as
      the OAuth client.
   2. APIs & Services -> Library -> enable "Google Picker API".
   3. APIs & Services -> Credentials -> Create credentials -> API key.
   4. (Recommended) Restrict the key: HTTP referrer = your Pages origin,
      API restriction = Google Picker API only. Fine to ship publicly once
      restricted.
   5. Store it as the PICKER_API_KEY Actions secret (repo Settings ->
      Secrets and variables -> Actions); the Pages workflow injects it at
      deploy.

   Without a key the Picker is skipped: saves go to My Drive root (you can
   move the file afterwards; the app tracks it by ID) and shared files can't
   be browsed. */
/* Injected at deploy time from the PICKER_API_KEY repo secret (see
   .github/workflows/pages.yml). Stays "__PICKER_API_KEY__" in git and local dev. */
const VIS_BUILD_KEY = "__PICKER_API_KEY__";
try{ localStorage.removeItem("visApiKey"); }catch(e){} // clean up removed per-device override
const VIS = {
  // key is safe to expose client-side once referrer-restricted
  get API_KEY(){ return VIS_BUILD_KEY.indexOf("__")===0 ? "" : VIS_BUILD_KEY; },
  SCOPE: "https://www.googleapis.com/auth/drive.file",
  token: null,
  get fileId(){ try{ return localStorage.getItem("visFileId"); }catch(e){ return null; } },
  set fileId(v){ try{ v ? localStorage.setItem("visFileId", v) : localStorage.removeItem("visFileId"); }catch(e){} }
};
function visToken(cb, purpose){
  if(VIS.token) return cb();
  if(needsRedirectAuth()) return redirectAuth(VIS.SCOPE, purpose);  // resumes via handleAuthReturn()
  if(!window.google?.accounts){
    openSheet(`<h3>Google sign-in not loaded yet</h3><p class="sub">Check your connection and try again in a moment.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
    return;
  }
  const tc = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE.CLIENT_ID, scope: VIS.SCOPE,
    callback: (r)=>{ if(r.error){ console.error(r); return; } VIS.token = r.access_token; setTimeout(()=>VIS.token=null, 55*60*1000); cb(); },
    error_callback: (e)=>console.error(e)
  });
  tc.requestAccessToken();
}
function vfetch(url, opts={}){
  return fetch(url, {...opts, headers:{...(opts.headers||{}), Authorization:"Bearer "+VIS.token}});
}
function pickerReady(cb){
  if(!VIS.API_KEY || !window.gapi) return cb(false);
  gapi.load("picker", ()=>cb(true));
}
/* Save/Open location: "use default folder" checkbox, persisted per device. */
function visUseDefault(){ try{ return localStorage.getItem("visUseDefault")!=="0"; }catch(e){ return true; } }
function toggleVisDefault(el){ try{ localStorage.setItem("visUseDefault", el.checked?"1":"0"); }catch(e){} }
function visLocRow(){
  return `<label class="checkrow"><input type="checkbox" ${visUseDefault()?"checked":""} onchange="toggleVisDefault(this)">
    Use the default Drive folder <b>workouts</b> (created if it doesn't exist)</label>
    <p class="sub">Unchecked: pick a folder or file yourself with the Google file browser${VIS.API_KEY?"":" — needs the PICKER_API_KEY secret set; without it, saves go to My Drive root"}.</p>`;
}
function saveVis(){
  openSheet(`<h3>Save to Drive</h3>
    <p class="sub">Saves a visible, shareable, timestamped workouts-data file to your Drive.</p>
    ${visLocRow()}
    <button class="primary" onclick="doSaveVis()">Save</button>`);
}
function doSaveVis(){
  closeSheet();
  visToken(visSaveGo, "vis-save");
}
async function visSaveGo(){
    if(visUseDefault()){
      try{ visUpload(await ensureDefaultFolder(vfetch)); }
      catch(e){ console.error(e); visUpload(null); }
    } else pickerReady(hasPicker=>{
      if(hasPicker){
        const p = new google.picker.PickerBuilder()
          .setOAuthToken(VIS.token).setDeveloperKey(VIS.API_KEY)
          .addView(new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true))
          .setTitle("Choose a folder")
          .setCallback(d=>{ if(d.action==="picked") visUpload(d.docs[0].id); })
          .build();
        p.setVisible(true);
      } else visUpload(null);
    });
}
/* Each manual save gets its own timestamped file so old saves stay
   distinguishable in the open-file list (local time, like todayKey). */
function visFileName(){
  const d = new Date(), p = n => String(n).padStart(2,"0");
  return `workouts-data-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
}
async function visUpload(folderId){
  try{
    const name = visFileName();
    const meta = {name, ...(folderId?{parents:[folderId]}:{})};
    const m = await (await vfetch("https://www.googleapis.com/drive/v3/files",
      {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(meta)})).json();
    VIS.fileId = m.id; // remembered so "Open" without the Picker can grab the latest save
    await vfetch(`https://www.googleapis.com/upload/drive/v3/files/${m.id}?uploadType=media`,
      {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(state)});
    openSheet(`<h3>Saved to Drive</h3><p class="sub">${esc(name)} is in ${folderId?(visUseDefault()?"the <b>workouts</b> folder":"the folder you picked"):"your Drive"} — share it like any file. Each save creates a new timestamped file.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.check}</span> Done</button>`);
  }catch(e){ console.error(e); }
}
function openVis(){
  openSheet(`<h3>Open from Drive</h3>
    <p class="sub">Load data from a workouts-data file in your Drive.</p>
    ${visLocRow()}
    <button class="primary" onclick="doOpenVis()">Open</button>`);
}
function doOpenVis(){
  closeSheet();
  visToken(visOpenGo, "vis-open");
}
async function visOpenGo(){
    if(visUseDefault()){
      try{
        const fid = await ensureDefaultFolder(vfetch);
        const q = await (await vfetch("https://www.googleapis.com/drive/v3/files?orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime)&q=" +
          encodeURIComponent(`'${fid}' in parents and trashed=false and mimeType='application/json'`))).json();
        if(!q.files?.length){
          return openSheet(`<h3>Folder is empty</h3><p class="sub">No data files in the <b>workouts</b> folder yet — use "Save to Drive file" first, or uncheck the default-folder option to browse elsewhere.</p>
            <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
        }
        /* Drive file ids are URL-safe (letters, digits, - _) so they're fine
           inside inline handler strings; names are only rendered as HTML text. */
        openSheet(`<h3>Open from workouts</h3><p class="sub">Files in your default Drive folder.</p>` +
          q.files.map(f=>`<button class="sheet-btn" onclick="visDownload('${f.id}')"><span>${ICON.open}</span> ${esc(f.name)}<small style="margin-left:auto;color:var(--sage)">${esc((f.modifiedTime||"").slice(0,10))}</small></button>`).join(""));
      }catch(e){
        console.error(e);
        openSheet(`<h3>Couldn't read the folder</h3><p class="sub">Drive didn't respond — check your connection and try again.</p>
          <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
      }
    } else pickerReady(hasPicker=>{
      if(hasPicker){
        const view = new google.picker.DocsView().setMimeTypes("application/json");
        const p = new google.picker.PickerBuilder()
          .setOAuthToken(VIS.token).setDeveloperKey(VIS.API_KEY)
          .addView(view).setTitle("Open a Health Tracker file")
          .setCallback(d=>{ if(d.action==="picked") visDownload(d.docs[0].id); })
          .build();
        p.setVisible(true);
      } else if(VIS.fileId){ visDownload(VIS.fileId); }
      else openSheet(`<h3>No file yet</h3><p class="sub">Save to Drive first to create a file. To browse and open shared files, the app needs a Google Picker API key: set the PICKER_API_KEY repo secret (setup steps in the comment above <code>VIS</code> in js/04-drive.js).</p>
        <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
    });
}
async function visDownload(id){
  try{
    const data = await (await vfetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json();
    if(!data || typeof data !== "object") throw 0;
    VIS.fileId = id;
    importFlow(data);
  }catch(e){
    openSheet(`<h3>Couldn't open that file</h3><p class="sub">It doesn't look like a Health Tracker data file.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
  }
}
/* ---------- share one workout as a Drive file ----------
   Uploads an importFlow-compatible {workouts:[w], customEx, exImages} JSON
   (photos included, unlike the URL share) to the default "workouts" folder
   and makes it anyone-with-link readable, so the Drive link works for people
   the file wasn't explicitly shared with. Recipients download the file and
   use Settings → Import file / Paste data. The pending workout id lives in
   sessionStorage so the flow survives the iOS full-page OAuth redirect
   (resumed via the "wo-share" purpose in handleAuthReturn). */
function shareWoDrive(id){
  try{ sessionStorage.setItem("woSharePending", id); }catch(e){}
  closeSheet();
  visToken(woShareDriveGo, "wo-share");
}
async function woShareDriveGo(){
  let id = null; try{ id = sessionStorage.getItem("woSharePending"); }catch(e){}
  const w = woById(id); if(!w) return;
  try{
    const names = new Set(w.exercises.map(e=>e.n));
    const body = {
      workouts: [w],
      customEx: (state.customEx||[]).filter(x=>names.has(x.n)),
      exImages: Object.fromEntries(Object.entries(state.exImages||{}).filter(([n])=>names.has(n)))
    };
    const safe = w.name.replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"-").slice(0,40) || "workout";
    const meta = {name:`workout-${safe}.json`};
    try{ meta.parents = [await ensureDefaultFolder(vfetch)]; }catch(e){ console.error(e); }
    const m = await (await vfetch("https://www.googleapis.com/drive/v3/files",
      {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(meta)})).json();
    if(!m.id) throw new Error("create failed");
    await vfetch(`https://www.googleapis.com/upload/drive/v3/files/${m.id}?uploadType=media`,
      {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    await vfetch(`https://www.googleapis.com/drive/v3/files/${m.id}/permissions`,
      {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({role:"reader", type:"anyone"})});
    /* Drive ids are URL-safe (letters, digits, - _): fine in the attribute. */
    window._woShareLink = `https://drive.google.com/file/d/${m.id}/view`;
    openSheet(`<h3>Workout file on Drive</h3>
      <p class="sub">${esc(meta.name)} is link-shareable — anyone with the link can view it. Recipients download the file and use Settings → "Import file" (or "Paste data"). Exercise photos are included.</p>
      <input class="field" readonly value="${window._woShareLink}" onclick="this.select()">
      <button class="primary" onclick="copyWoShareLink()">${navigator.share ? "Share link" : "Copy link"}</button>
      <button class="sheet-btn" style="margin-top:8px" onclick="closeSheet()"><span>${ICON.check}</span> Done</button>`);
  }catch(e){
    console.error(e);
    openSheet(`<h3>Couldn't share via Drive</h3><p class="sub">Drive didn't respond — check your connection and try again.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
  }
}
async function copyWoShareLink(){
  const url = window._woShareLink; if(!url) return closeSheet();
  try{
    if(navigator.share){ await navigator.share({url}); closeSheet(); return; }
  }catch(e){ if(e.name === "AbortError") return; }
  try{ await navigator.clipboard.writeText(url); }catch(e){}
  closeSheet();
}
async function dfetch(url, opts={}){
  const r = await fetch(url, {...opts, headers:{...(opts.headers||{}), Authorization:"Bearer "+DRIVE.token}});
  if(r.status===401){ DRIVE.token=null; DRIVE.status="off"; render(); throw new Error("token expired"); }
  return r;
}
async function driveInit(){
  try{
    let parent = "appDataFolder";
    let url = "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27health-tracker.json%27&fields=files(id)";
    if(syncLoc()==="folder"){
      const pref = syncFolderPref();
      parent = pref?.id || await ensureDefaultFolder(dfetch);
      url = "https://www.googleapis.com/drive/v3/files?fields=files(id)&q=" +
        encodeURIComponent(`name='health-tracker.json' and '${parent}' in parents and trashed=false`);
    }
    const q = await (await dfetch(url)).json();
    if(q.files?.length){
      DRIVE.fileId = q.files[0].id;
      const remote = await (await dfetch(`https://www.googleapis.com/drive/v3/files/${DRIVE.fileId}?alt=media`)).json();
      if(remote?.savedAt && remote.savedAt > (state.savedAt||0)){ state = remote; store.set("steady", state); materializeToday(); }
      else { driveUploadSoon(); }
    } else {
      const meta = await (await dfetch("https://www.googleapis.com/drive/v3/files", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({name:"health-tracker.json", parents:[parent]})
      })).json();
      DRIVE.fileId = meta.id;
      driveUploadSoon();
    }
    DRIVE.status="on"; render();
    fetchDriveUser();   // avatar/email for the Settings account row (fire-and-forget)
  }catch(e){ if(DRIVE.status!=="off"){ DRIVE.status="error"; render(); } }
}
function driveUploadSoon(){
  if(getMode()!=="drive") return;
  DRIVE.pending = true;                        // remember there's something to push
  if(!DRIVE.token || !DRIVE.fileId) return;    // token expired/absent: driveInit's
                                               // savedAt compare uploads it on reconnect
  clearTimeout(DRIVE.timer);
  DRIVE.timer = setTimeout(driveUpload, 1500);   // debounce rapid taps
}
async function driveUpload(){
  try{
    DRIVE.status="saving"; renderSyncOnly();
    await dfetch(`https://www.googleapis.com/upload/drive/v3/files/${DRIVE.fileId}?uploadType=media`, {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(state)
    });
    DRIVE.pending = false;
    DRIVE.status="on"; renderSyncOnly();
  }catch(e){ if(DRIVE.status!=="off"){ DRIVE.status="error"; renderSyncOnly(); } }   // pending stays true → retried on next save/foreground
}
/* ---------- lifecycle sync (multi-device staleness fixes) ----------
   Hole 1: uploads are debounced 1.5 s. On mobile, logging something and
   immediately switching apps froze the page before the timer fired, so the
   newest edits never reached Drive. Flush at once when the page hides
   (keepalive lets a small request outlive the page).
   Hole 2: pulls only happened in driveInit() at startup. A tab resumed from
   the background never re-fetched, so it showed stale data — and, being
   last-write-wins by savedAt, its next edit would overwrite the newer remote.
   Pull when the page returns to the foreground.
   Hole 3: the 55-min expiry setTimeout is throttled while hidden, so a
   resumed tab could hold a token that expired hours ago. Re-check the stored
   expiry on every return to foreground. */
function driveFlushNow(){
  if(getMode()!=="drive" || !DRIVE.pending || !DRIVE.token || !DRIVE.fileId) return;
  clearTimeout(DRIVE.timer); DRIVE.timer = null;
  const body = JSON.stringify(state);
  const opts = {method:"PATCH", headers:{"Content-Type":"application/json", Authorization:"Bearer "+DRIVE.token}, body};
  if(body.length < 60000) opts.keepalive = true;   // keepalive caps at ~64 KB; bigger states send best-effort
  DRIVE.pending = false;
  fetch(`https://www.googleapis.com/upload/drive/v3/files/${DRIVE.fileId}?uploadType=media`, opts)
    .then(r=>{ if(!r.ok) DRIVE.pending = true; })
    .catch(()=>{ DRIVE.pending = true; });
}
async function drivePullLatest(){
  if(getMode()!=="drive" || !DRIVE.token || !DRIVE.fileId) return;
  if(DRIVE.pending){ driveUploadSoon(); return; }         // we owe Drive an upload; LWW as ever
  if(typeof PLAYER!=="undefined" && PLAYER && !PLAYER.done) return;   // don't swap state mid-workout
  const sheet = document.getElementById("sheet");
  if(sheet && sheet.classList.contains("open")) return;   // sheet handlers hold indices into current state
  try{
    const remote = await (await dfetch(`https://www.googleapis.com/drive/v3/files/${DRIVE.fileId}?alt=media`)).json();
    if(remote?.savedAt && remote.savedAt > (state.savedAt||0)){
      state = remote; persist();   // adopting, not authoring — don't bump savedAt
      materializeToday();
      render();
    }
  }catch(e){}
}
function driveOnShow(){
  if(getMode()!=="drive") return;
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem("driveTok")); }catch(e){}
  const valid = saved && saved.exp > Date.now() && (saved.scope || SCOPES.appdata) === driveScope();
  if(!valid){                       // expired while backgrounded (throttled timer never fired)
    if(DRIVE.token){ dropDriveTokenKeepFile(); render(); }
    return;                         // pill shows "Drive: off" — tap to reconnect
  }
  if(!DRIVE.token){ DRIVE.token = saved.t; scheduleTokenExpiry(saved.exp - Date.now()); }
  if(!DRIVE.fileId){ driveInit(); return; }
  drivePullLatest();
}
/* Like dropDriveToken but keeps fileId — the file didn't move, only the token died. */
function dropDriveTokenKeepFile(){
  DRIVE.token = null; DRIVE.status = "off";
  clearTimeout(DRIVE.expTimer);
  try{ localStorage.removeItem("driveTok"); }catch(e){}
}
document.addEventListener("visibilitychange", ()=>{ document.hidden ? driveFlushNow() : driveOnShow(); });
window.addEventListener("pagehide", driveFlushNow);
window.addEventListener("pageshow", e=>{ if(e.persisted) driveOnShow(); });   // bfcache restore skips init()
function renderSyncOnly(){
  const el = document.querySelector(".syncpill");
  if(el){ el.textContent = DRIVE.label(); el.className = "syncpill "+(DRIVE.status==="on"?"on":DRIVE.status==="error"?"err":""); }
}
/* Pick a custom folder for app-data sync (folder mode). Uses the Picker, so it
   needs an API key; picking also grants drive.file access to that folder. */
function chooseSyncFolder(){
  visToken(()=>pickerReady(hasPicker=>{
    if(!hasPicker){
      return openSheet(`<h3>Picker key needed</h3><p class="sub">Choosing a custom folder uses the Google file browser, which needs the PICKER_API_KEY repo secret. Without it, sync uses the default <b>workouts</b> folder.</p>
        <button class="sheet-btn" onclick="openDataMenu()"><span>${ICON.back}</span> Back</button>`);
    }
    const p = new google.picker.PickerBuilder()
      .setOAuthToken(VIS.token).setDeveloperKey(VIS.API_KEY)
      .addView(new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true))
      .setTitle("Choose a sync folder")
      .setCallback(d=>{
        if(d.action!=="picked") return;
        try{ localStorage.setItem("driveSyncFolder", JSON.stringify({id:d.docs[0].id, name:d.docs[0].name})); }catch(e){}
        DRIVE.fileId = null;               // look up / create the file in the new folder
        if(getMode()==="drive" && DRIVE.token) driveInit();
        openDataMenu();
      })
      .build();
    p.setVisible(true);
  }));
}
function resetSyncFolder(){
  try{ localStorage.removeItem("driveSyncFolder"); }catch(e){}
  DRIVE.fileId = null;
  if(getMode()==="drive" && DRIVE.token) driveInit();
  openDataMenu();
}
