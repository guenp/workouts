/* ---------- TRENDS ---------- */
let trendSel = null, trendEnd = null;
function trendsHTML(){
  const days = [];
  const end = trendEnd || new Date();
  for(let i=6;i>=0;i--){
    const d = new Date(end); d.setDate(d.getDate()-i);
    const k = todayKey(d), day = state.days[k];
    const rating = day?.gut?.length ? Math.round(day.gut.reduce((a,g)=>a+g.sev,0)/day.gut.length) : null;
    days.push({label:DAY_NAMES[d.getDay()][0], key:k, orange:day?.orange||0, rating,
      done:day? day.items.filter(x=>x.status==="done"||x.status==="swapped").length : 0,
      total:day? day.items.length : 0});
  }
  const maxO = Math.max(15, ...days.map(d=>d.orange));
  const wk = weekOrange();
  const done = days.reduce((a,d)=>a+d.done,0), tot = days.reduce((a,d)=>a+d.total,0);
  const gutDays = days.filter(d=>d.rating!==null && d.rating>=3).length;
  const sevColor = ["#3F8A3F","#7BA05B","#C08A2E","#E8722E","#B4543C"];
  return `
  <div class="top"><button style="text-align:left" onclick="openTrendCal()"><h1>Trends</h1><div class="date">${trendEnd?"7 days to "+end.toLocaleDateString(undefined,{month:"short",day:"numeric"}):"last 7 days"} ▾</div></button>${topBarHTML()}</div>
  <div class="stat-row">
    <div class="stat"><div class="n">${wk}</div><div class="l">orange min this week</div></div>
    <div class="stat"><div class="n">${tot?Math.round(done/tot*100):0}%</div><div class="l">plan completed</div></div>
    <div class="stat"><div class="n">${7-gutDays}<span style="font-size:15px;color:var(--muted)">/7</span></div><div class="l">good days</div></div>
  </div>
  <div class="sec"><div class="sec-h"><h2>Orange minutes & health</h2></div>
    <div class="bars">${days.map(d=>`
      <button class="bar ${trendSel===d.key?'sel':''}" onclick="trendSel = trendSel==='${d.key}' ? null : '${d.key}'; render()">
        <i style="height:${Math.round(d.orange/maxO*70)}px" title="${d.orange} min"></i>
        <span class="sevdot" style="background:${d.rating===null?'var(--line)':sevColor[d.rating]}"></span>
        <b>${d.label}</b>
      </button>`).join("")}
    </div>
    <p style="font-size:12px;color:var(--muted);margin:8px 2px 0">Bars = orange-zone minutes · dot = day's health rating, green (great) to red (bad). Tap a day to see its logs; tap again to close.</p>
  </div>
  ${trendSel ? trendDetailHTML(trendSel) : ""}`;
}
function gotoGutDay(k){
  gutDate = k===todayKey() ? null : new Date(k+"T12:00");
  setTab('gut');
}
function trendDetailHTML(k){
  const day = state.days[k];
  if(!day) return `<div class="sec"><div class="sec-h"><h2>${fmtDay(k)}</h2><button class="addbtn" onclick="gotoGutDay('${k}')">+ Add</button></div><div class="card"><div class="empty">No data logged for this day.</div></div></div>`;
  const statusMark = {done:"✓", swapped:"↷", skipped:"✕", planned:"○"};
  return `
  <div class="sec"><div class="sec-h"><h2>${fmtDay(k)} · ${day.orange} orange min</h2><button class="addbtn" onclick="gotoGutDay('${k}')">+ Add</button></div>
    <div class="card">
      ${day.items.map(it=>`
        <div class="gut-entry">
          <div class="gh"><span>${statusMark[it.status]} ${esc(it.title)}</span><span class="tag">${it.status}</span></div>
          ${it.status==="swapped"&&it.actual?`<div class="gn">Instead: ${esc(it.actual)}</div>`:""}
        </div>`).join("") || `<div class="empty">No plan items.</div>`}
      ${day.gut.map((g,i)=>`
        <div class="gut-entry" style="position:relative;${editGut?'padding-left:36px;padding-right:44px':''}"
          onpointerdown="gutDown(event,'${k}',${i})" onclick="gutTap('${k}',${i})" onpointercancel="clearTimeout(pressTimer)" onpointerleave="clearTimeout(pressTimer)" oncontextmenu="return false">
          ${editGut?`<span class="minus" style="top:12px;left:10px" onclick="removeGut('${k}',${i});event.stopPropagation()" onpointerdown="event.stopPropagation()">−</span>
          <span class="pencilbtn" onclick="editGut=false;openGutEdit('${k}',${i});event.stopPropagation()" onpointerdown="event.stopPropagation()">${ICON.pencil}</span>`:""}
          <div class="gh"><span>${g.time} · health check</span><span class="sev sev${g.sev}">${SEV[g.sev]}</span></div>
          <div class="gt">${g.tags.length?esc(g.tags.join(", ")):""}${g.food?(g.tags.length?" · ":"")+esc(g.food):""}</div>
          ${g.note?`<div class="gn">${esc(g.note)}</div>`:""}
        </div>`).join("")}
    </div>
  </div>`;
}
