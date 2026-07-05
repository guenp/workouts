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
  label(){ if(getMode()==="local") return "Local"; return {off:"Drive: off", connecting:"Connecting…", on:"Drive ✓", saving:"Saving…", error:"Sync error"}[this.status]; }
};
function pillTap(){
  if(getMode()==="drive" && DRIVE.status!=="on" && DRIVE.status!=="connecting"){ driveConnect(); }
  else { openDataMenu(); }
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
function driveConnect(){
  if(DRIVE.status==="on"){ return; }
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
  tc.requestAccessToken();
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
function visToken(cb){
  if(VIS.token) return cb();
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
  visToken(async ()=>{
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
  visToken(async ()=>{
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
      if(remote?.savedAt && remote.savedAt > (state.savedAt||0)){ state = remote; store.set("steady", state); }
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
  }catch(e){ if(DRIVE.status!=="off"){ DRIVE.status="error"; render(); } }
}
function driveUploadSoon(){
  if(getMode()!=="drive" || !DRIVE.token || !DRIVE.fileId) return;
  clearTimeout(DRIVE.timer);
  DRIVE.timer = setTimeout(driveUpload, 1500);   // debounce rapid taps
}
async function driveUpload(){
  try{
    DRIVE.status="saving"; renderSyncOnly();
    await dfetch(`https://www.googleapis.com/upload/drive/v3/files/${DRIVE.fileId}?uploadType=media`, {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(state)
    });
    DRIVE.status="on"; renderSyncOnly();
  }catch(e){ if(DRIVE.status!=="off"){ DRIVE.status="error"; renderSyncOnly(); } }
}
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
