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
  SCOPE: "https://www.googleapis.com/auth/drive.appdata",
  token:null, fileId:null, status:"off", timer:null, expTimer:null,
  label(){ if(getMode()==="local") return "Local"; return {off:"Drive: off", connecting:"Connecting…", on:"Drive ✓", saving:"Saving…", error:"Sync error"}[this.status]; }
};
function pillTap(){
  if(getMode()==="drive" && DRIVE.status!=="on" && DRIVE.status!=="connecting"){ driveConnect(); }
  else { openDataMenu(); }
}
function driveConnect(){
  if(DRIVE.status==="on"){ return; }
  if(!window.google?.accounts){ DRIVE.status="error"; render(); return; }
  DRIVE.status="connecting"; render();
  const tc = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE.CLIENT_ID,
    scope: DRIVE.SCOPE,
    callback: async (resp)=>{
      if(resp.error){ console.error("Drive auth error:", resp); DRIVE.status="error"; render(); return; }
      DRIVE.token = resp.access_token;
      try{ localStorage.setItem("driveTok", JSON.stringify({t:resp.access_token, exp:Date.now()+55*60*1000})); }catch(e){}
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
      deploy. Per-device override: Settings sheet -> "Google Picker API key".

   Without a key the Picker is skipped: saves go to My Drive root (you can
   move the file afterwards; the app tracks it by ID) and shared files can't
   be browsed. */
/* Injected at deploy time from the PICKER_API_KEY repo secret (see
   .github/workflows/pages.yml). Stays "__PICKER_API_KEY__" in git and local dev. */
const VIS_BUILD_KEY = "__PICKER_API_KEY__";
const VIS = {
  // localStorage (Settings sheet) overrides the build-time key on this device;
  // the key is safe to expose client-side once referrer-restricted.
  get API_KEY(){
    const bk = VIS_BUILD_KEY.indexOf("__")===0 ? "" : VIS_BUILD_KEY;
    try{ return localStorage.getItem("visApiKey") || bk; }catch(e){ return bk; }
  },
  set API_KEY(v){ try{ v ? localStorage.setItem("visApiKey", v) : localStorage.removeItem("visApiKey"); }catch(e){} },
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
function saveVis(){
  closeSheet();
  visToken(()=>pickerReady(hasPicker=>{
    if(hasPicker && !VIS.fileId){
      const p = new google.picker.PickerBuilder()
        .setOAuthToken(VIS.token).setDeveloperKey(VIS.API_KEY)
        .addView(new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true))
        .setTitle("Choose a folder")
        .setCallback(d=>{ if(d.action==="picked") visUpload(d.docs[0].id); })
        .build();
      p.setVisible(true);
    } else visUpload(null);
  }));
}
async function visUpload(folderId){
  try{
    if(VIS.fileId){
      const r = await vfetch(`https://www.googleapis.com/upload/drive/v3/files/${VIS.fileId}?uploadType=media`,
        {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(state)});
      if(r.status===404){ VIS.fileId=null; return visUpload(folderId); }
    } else {
      const meta = {name:"health-tracker.json", ...(folderId?{parents:[folderId]}:{})};
      const m = await (await vfetch("https://www.googleapis.com/drive/v3/files",
        {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(meta)})).json();
      VIS.fileId = m.id;
      await vfetch(`https://www.googleapis.com/upload/drive/v3/files/${m.id}?uploadType=media`,
        {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(state)});
    }
    openSheet(`<h3>Saved to Drive</h3><p class="sub">health-tracker.json is in your Drive — share it like any file. Future saves update the same file even if you move it.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.check}</span> Done</button>`);
  }catch(e){ console.error(e); }
}
function openVis(){
  closeSheet();
  visToken(()=>pickerReady(hasPicker=>{
    if(hasPicker){
      const view = new google.picker.DocsView().setMimeTypes("application/json");
      const p = new google.picker.PickerBuilder()
        .setOAuthToken(VIS.token).setDeveloperKey(VIS.API_KEY)
        .addView(view).setTitle("Open a Health Tracker file")
        .setCallback(d=>{ if(d.action==="picked") visDownload(d.docs[0].id); })
        .build();
      p.setVisible(true);
    } else if(VIS.fileId){ visDownload(VIS.fileId); }
    else openSheet(`<h3>No file yet</h3><p class="sub">Save to Drive first to create a file. To browse and open shared files, the app needs a Google Picker API key: create one in Google Cloud Console (steps in the comment above <code>VIS</code> in js/04-drive.js), then paste it under Settings → Google Picker API key.</p>
      <button class="sheet-btn" onclick="closeSheet()"><span>${ICON.back}</span> Close</button>`);
  }));
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
    const q = await (await dfetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27health-tracker.json%27&fields=files(id)")).json();
    if(q.files?.length){
      DRIVE.fileId = q.files[0].id;
      const remote = await (await dfetch(`https://www.googleapis.com/drive/v3/files/${DRIVE.fileId}?alt=media`)).json();
      if(remote?.savedAt && remote.savedAt > (state.savedAt||0)){ state = remote; store.set("steady", state); }
      else { driveUploadSoon(); }
    } else {
      const meta = await (await dfetch("https://www.googleapis.com/drive/v3/files", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({name:"health-tracker.json", parents:["appDataFolder"]})
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
/* Settings-sheet handler: reads the input element directly (never interpolate
   user text into inline handler args — see CLAUDE.md). */
function setVisApiKey(el){ VIS.API_KEY = (el.value||"").trim(); }
