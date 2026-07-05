/* ---------- FIT EXPORT ---------- */
/* FIT numeric (category, name) ids from the official Garmin FIT SDK profile */
const FITX = {"Squat":[28,61],"Goblet Squat":[28,37],"Barbell Back Squat":[28,6],"Bulgarian Split Squat":[17,18],"Jump Squat":[20,37],"Wall Squat":[28,20],"Lunge":[17,32],"Reverse Lunge":[17,82],"Walking Lunge":[17,78],"Side Lunge":[17,61],"Step Up":[28,32],"Deadlift":[8,0],"Romanian Deadlift":[8,23],"Single Leg Deadlift":[8,12],"Kettlebell Swing":[12,0],"Glute Bridge":[37,17],"Hip Raise":[10,11],"Push Up with Rotation":[22,65],"Plank with Arm Lift":[19,54],"Lateral Pillar Bridge":[19,66],"Push Up":[22,77],"Incline Push Up":[22,27],"Bench Press":[0,1],"Dumbbell Bench Press":[0,6],"Chest Fly":[9,2],"Pull Up":[21,38],"Chin Up":[21,39],"Bent Over Row":[23,46],"Single Arm Row":[23,13],"Lat Pulldown":[21,13],"Face Pull":[23,5],"Overhead Press":[24,14],"Arnold Press":[24,1],"Lateral Raise":[14,34],"Front Raise":[14,10],"Shrug":[26,1],"Biceps Curl":[7,46],"Hammer Curl":[7,16],"Triceps Extension":[30,21],"Triceps Dip":[30,0],"Plank":[19,43],"Side Plank":[19,66],"Crunch":[6,83],"Bicycle Crunch":[6,0],"Russian Twist":[5,46],"Mountain Climber":[19,34],"Dead Bug":[11,1],"Bird Dog":[5,48],"Jumping Jacks":[2,12],"Burpee":[29,0],"High Knees":[31,26],"Jump Rope":[2,6],"Stationary Bike":[41,3],"Downward Dog":[36,21],"Pigeon Pose":[36,45],"Child's Pose":[36,11],"Cat Cow":[5,51],"Warrior II":[36,84],"Cobra Pose":[13,38],"Tree Pose":[36,78],"Bridge Pose":[36,8],"Hundred":[5,72],"Roll Up":[5,61],"Single Leg Circle":[5,66],"Swimming":[5,70],"Scissor Kick":[5,65],"Criss Cross":[5,53],"Hamstring Stretch":[31,33],"Hip Flexor Stretch":[31,49],"Foam Roll Back":[31,78],"Leg Raise":[16,8]};
function fitCRC(bytes){
  const T = [0x0000,0xCC01,0xD801,0x1400,0xF001,0x3C00,0x2800,0xE401,0xA001,0x6C00,0x7800,0xB401,0x5000,0x9C01,0x8801,0x4400];
  let crc = 0;
  for(const b of bytes){
    let tmp = T[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ T[b & 0xF];
    tmp = T[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ T[(b >> 4) & 0xF];
  }
  return crc;
}
function encodeWorkoutFIT(w){
  const out = [];
  const u8 = v => out.push(v & 0xFF);
  const u16 = v => { u8(v); u8(v >> 8); };
  const u32 = v => { u16(v); u16(v >>> 16); };
  const str = (v, len) => { const b = new TextEncoder().encode(v || ""); for(let i=0;i<len;i++) u8(i < Math.min(b.length, len-1) ? b[i] : 0); };
  const def = (local, global, fields) => { u8(0x40 | local); u8(0); u8(0); u16(global); u8(fields.length); fields.forEach(f=>{ u8(f[0]); u8(f[1]); u8(f[2]); }); };

  /* file_id */
  def(0, 0, [[0,1,0x00],[1,2,0x84],[2,2,0x84],[3,4,0x8C],[4,4,0x86]]);
  u8(0); u8(5); u16(1); u16(65534); u32(0x27051978); u32(Math.floor(Date.now()/1000) - 631065600);

  /* file_creator */
  def(4, 49, [[1,1,0x02],[0,2,0x84]]);
  u8(4); u8(0); u16(2612);

  /* build steps: no per-step names — a custom step name suppresses the watch's
     built-in animation. Identity lives in (category, name) ids; labels go in
     exercise_title messages. Unmapped exercises use category UNKNOWN (0xFFFE)
     with a unique id so their custom title still displays. */
  const customIds = {};
  let nextCustom = 0;
  const steps = expandWorkout(w).map(st=>{
    if(st.restSecs) return {title:null, dur:0, val:st.restSecs*1000, int:1, cat:0xFFFF, ex:0xFFFF};
    const e = st.e, fx = FITX[e.n];
    let cat, ex;
    if(fx){ cat = fx[0]; ex = fx[1]; }
    else { if(!(e.n in customIds)) customIds[e.n] = nextCustom++; cat = 0xFFFE; ex = customIds[e.n]; }
    return {title:e.n, dur: e.mode==="time" ? 0 : 29, val: e.mode==="time" ? e.secs*1000 : e.reps, int:0, cat, ex};
  });
  while(steps.length && steps[steps.length-1].int === 1) steps.pop();

  /* workout — mirrors Garmin Connect exports incl. undocumented fields (9, 10, 16, 21, 23) */
  const estMs = steps.reduce((t,st)=>t + (st.dur===29 ? st.val*3000 : st.val), 0);
  def(1, 26, [[8,34,0x07],[17,64,0x07],[10,4,0x86],[9,1,0x00],[23,1,0x00],[21,4,0x86],[4,1,0x00],[11,1,0x00],[16,16,0x0D],[5,4,0x8C],[6,2,0x84],[254,2,0x84]]);
  u8(1); str(w.name,34); str("Created with Health Companion",64); u32(estMs); u8(0); u8(0); u32(estMs);
  u8(10); u8(20); for(let i=0;i<16;i++) u8(0); u32(32); u16(steps.length); u16(0);

  /* workout_step — field set mirrors Garmin Connect exports */
  def(2, 27, [[254,2,0x84],[7,1,0x00],[3,1,0x00],[4,4,0x86],[19,1,0x00],[20,4,0x86],[1,1,0x00],[2,4,0x86],[10,2,0x84],[11,2,0x84],[13,2,0x84]]);
  steps.forEach((st,i)=>{ u8(2); u16(i); u8(st.int); u8(0xFF); u32(0); u8(0xFF); u32(0); u8(st.dur); u32(st.val); u16(st.cat); u16(st.ex); u16(2); });

  /* exercise_title (mesg 264): maps each (category, name) pair to its label */
  const titles = [], seen = new Set();
  steps.forEach(st=>{
    if(st.title && !seen.has(st.cat+"/"+st.ex)){ seen.add(st.cat+"/"+st.ex); titles.push(st); }
  });
  if(titles.length){
    def(3, 264, [[1,2,0x84],[0,2,0x84],[2,16,0x07],[254,2,0x84]]);
    titles.forEach((st,i)=>{ u8(3); u16(st.ex); u16(st.cat); str(st.title,16); u16(i); });
  }

  /* header + CRC */
  const data = new Uint8Array(out);
  const head = new Uint8Array(14);
  const dv = new DataView(head.buffer);
  dv.setUint8(0,14); dv.setUint8(1,0x10); dv.setUint16(2,2132,true); dv.setUint32(4,data.length,true);
  head.set([0x2E,0x46,0x49,0x54],8);
  dv.setUint16(12, fitCRC(head.slice(0,12)), true);
  const body = new Uint8Array(14 + data.length + 2);
  body.set(head); body.set(data,14);
  new DataView(body.buffer).setUint16(14 + data.length, fitCRC(body.slice(0, 14 + data.length)), true);
  return body;
}
async function downloadFit(){
  const w = curWo(); if(!w || !w.exercises.length) return;
  const bytes = encodeWorkoutFIT(w);
  const fname = w.name.replace(/[^\w\-]+/g,"_").replace(/^_+|_+$/g,"") + ".fit";
  try{
    const file = new File([bytes], fname, {type:"application/octet-stream"});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:w.name});
      return;
    }
  }catch(e){ if(e.name==="AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], {type:"application/octet-stream"}));
  a.download = fname;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

