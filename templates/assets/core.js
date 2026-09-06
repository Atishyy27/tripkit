/* ============================================================
   tripkit engine. Everything keys off the clock.
   Reads DATA.config, so nothing here is specific to one trip.
   ============================================================ */

const CFG = (typeof DATA !== "undefined" && DATA.config) || {};
const COND = (typeof DATA !== "undefined" && DATA.conditions) || {};
const CUR = CFG.currencySymbol || "";

/* ---------- time ---------- */
const M = s => { if(!s) return null; const p=String(s).split(":"); return (+p[0])*60+(+p[1]||0); };
const HM = n => { n=((Math.round(n)%1440)+1440)%1440;
  return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0"); };
function localMins(){
  // Render in the DESTINATION's timezone, not the viewer's. A traveller often
  // lands with their phone still on the old zone, and a guide that silently
  // shifts by hours is worse than one with no clock at all.
  const d=new Date(), off=(CFG.tzOffsetMinutes===undefined?0:CFG.tzOffsetMinutes);
  return (new Date(d.getTime()+d.getTimezoneOffset()*60000+off*60000)).getHours()*60
       + (new Date(d.getTime()+d.getTimezoneOffset()*60000+off*60000)).getMinutes();
}
const istMins = localMins;                       // kept for page-level readability
const dur = n => n<60 ? n+" min"
  : (n%60===0 ? (n/60)+" hr" : Math.floor(n/60)+"h "+(n%60)+"m");
const inr = n => CUR+Number(n||0).toLocaleString(CFG.locale||"en");

/* ---------- the trip ---------- */
const TRIP = {
  arrive: M(CFG.arrive || "00:00"),
  depart: M(CFG.depart || "23:59"),
  hop:    CFG.hopMinutes || 30,               // hub <-> destination travel time
  buffer: CFG.exitBufferMinutes || 60,
  dest:   (CFG.dest || "").toLowerCase(),
  hub:    (CFG.hub  || "").toLowerCase(),
  multiDay: !!CFG.multiDay
};
TRIP.lastExit = TRIP.depart - TRIP.buffer;
TRIP.hardExit = TRIP.depart - TRIP.hop - 10;

const SUNRISE = M(COND.sunrise || "06:30");
const SUNSET  = M(COND.sunset  || "18:30");
const HEAT    = (COND.heatWindow && COND.heatWindow.length===2)
  ? [M(COND.heatWindow[0]), M(COND.heatWindow[1])] : [M("12:00"), M("16:00")];

/* ---------- day phases, derived from the sun rather than hardcoded ---------- */
const PHASES = (function(){
  const p = [];
  const add=(from,to,id,name,tags,line)=>{ if(to>from) p.push({id,from,to,name,tags,line}); };
  add(0, Math.max(0,SUNRISE-70), "night", "Before dawn", ["indoor","transit"],
      "Dark. This is a get-somewhere hour, not a look-at-things hour.");
  add(Math.max(0,SUNRISE-70), SUNRISE-20, "predawn", "First light", ["quiet","transit","sunrise"],
      "The sky is going. Cold light, empty streets, almost nothing open yet.");
  add(SUNRISE-20, SUNRISE+40, "sunrise", "Sunrise", ["sunrise","quiet","photo","outdoor"],
      "The best forty minutes of the day. Soft, empty and cool.");
  add(SUNRISE+40, HEAT[0], "morning", "Golden morning", ["outdoor","quiet","photo","walk","sunrise"],
      "Cool, well lit, not yet crowded. Spend these hours outside; you cannot get them back.");
  add(HEAT[0], HEAT[1], "heat", "The hot hours", ["indoor","shade","aircon","food","rest"],
      "Nobody local is walking around now. Eat, sit somewhere shaded, wait it out.");
  add(HEAT[1], SUNSET-80, "afternoon", "Cooling off", ["outdoor","shop","walk","view"],
      "It comes back to life. Markets are better now than at midday.");
  add(SUNSET-80, SUNSET+10, "golden", "Golden evening", ["view","sunset","photo","rooftop","outdoor"],
      "Second best light of the day. Get somewhere high or somewhere with a view.");
  add(SUNSET+10, M("21:00"), "dusk", "Dusk", ["food","evening","nightlife","shop"],
      "Evening proper. Streets light up, kitchens open, the day softens.");
  add(M("21:00"), 1440, "late", "Late", ["food","indoor","nightlife"],
      "Late. Fewer options, better atmosphere in the ones that are left.");
  return p;
})();
const phaseAt = t => PHASES.find(p => t>=p.from && t<p.to) || PHASES[PHASES.length-1];

/* ---------- openness ---------- */
function openState(p, t){
  if(!p.open) return {state:"unknown", label:"hours unknown"};
  const o=M(p.open), c=M(p.close)||1440;
  const overnight = c<=o;
  if(p.shut && p.shut.length===2){
    const s0=M(p.shut[0]), s1=M(p.shut[1]);
    if(s0!==null && s1!==null && t>=s0 && t<s1)
      return {state:"shut", label:"shut till "+p.shut[1], opensIn:s1-t};
  }
  const inside = overnight ? (t>=o || t<c) : (t>=o && t<c);
  if(!inside){
    const opensIn = t<o ? o-t : (1440-t)+o;
    return {state: opensIn<=75 ? "soon" : "shut", label:"opens "+p.open, opensIn};
  }
  const closesIn = overnight ? ((c+1440)-t)%1440 : c-t;
  if(closesIn<=50)
    return {state:"closing", label:"closes "+p.close+", "+closesIn+" min", closesIn};
  return {state:"open", label:"open till "+p.close, closesIn};
}

/* ---------- where the traveller is ---------- */
function where(){ try{ return localStorage.getItem("tk_where")||"auto"; }catch(e){ return "auto"; } }
function setWhere(v){ try{ localStorage.setItem("tk_where",v); }catch(e){} }
function effectiveTown(t){
  const w=where();
  if(w && w!=="auto") return w;
  if(!TRIP.hub || TRIP.hub===TRIP.dest) return TRIP.dest;
  // early in the day they are probably still at the arrival hub
  return t < (TRIP.arrive + 150) ? TRIP.hub : TRIP.dest;
}

/* ---------- how much day is left ---------- */
function exitState(t){
  if(TRIP.multiDay) return {level:"ok", msg:null};
  const soft=TRIP.lastExit-t, hard=TRIP.hardExit-t, bus=TRIP.depart-t;
  if(bus<=0)  return {level:"gone",  msg:"Your departure time has passed."};
  if(hard<=0) return {level:"now",   msg:"You are past the last safe moment to set off. "+bus+" minutes until departure and the journey takes about "+TRIP.hop+". Go now."};
  if(soft<=0) return {level:"urgent",msg:"Past the comfortable departure. "+hard+" minutes before you have no margin at all."};
  if(soft<=45)return {level:"soon",  msg:"Set off in "+soft+" minutes for a calm departure. Sort your ride now, not then."};
  return {level:"ok", msg:null};
}

/* ---------- scoring ---------- */
function score(p, t, town, phase){
  const st=openState(p,t);
  let s=0; const why=[];
  if(st.state==="shut") return null;
  if(st.state==="soon")    s-=14;
  if(st.state==="unknown") s-=9;
  if(st.state==="open")    s+=12;
  if(st.state==="closing"){ s-=6; why.push("closing in "+st.closesIn+" min, go now or drop it"); }

  if(p.town && town && p.town!==town){
    if(!TRIP.multiDay && t > TRIP.arrive+270 && p.town===TRIP.hub) return null;
    s-=26; why.push("wrong town, costs about "+TRIP.hop+" min each way");
  } else s+=10;

  if(p.best && p.best.length){
    const d=Math.min.apply(null,p.best.map(b=>Math.abs(M(b)-t)));
    if(d<=35){ s+=42; why.push("this is exactly its hour"); }
    else if(d<=75){ s+=22; why.push("close to its best time"); }
  }

  const tg=p.tags||[];
  s += tg.filter(x=>phase.tags.indexOf(x)>=0).length*13;
  const sheltered = tg.indexOf("indoor")>=0||tg.indexOf("shade")>=0||tg.indexOf("aircon")>=0;
  if(phase.id==="heat"){ if(sheltered){ s+=20; why.push("shade, which is the only thing that matters right now"); }
                         else if(tg.indexOf("outdoor")>=0) s-=24; }
  if((phase.id==="night"||phase.id==="predawn") && tg.indexOf("outdoor")>=0) s-=20;

  const need=(p.dur||30)+(p.town===TRIP.dest?20:10);
  let budget=(TRIP.multiDay ? 24*60 : ((town===TRIP.dest?TRIP.hardExit:TRIP.depart)-t));
  if(!TRIP.multiDay && budget<=0) budget=TRIP.depart-TRIP.hop-15-t;
  if(budget<need) return null;
  if(budget<need+30){ s-=15; why.push("tight against your departure"); }

  if((p.lo===0||p.lo===null)&&(p.hi===0||p.hi===null)) s+=6;
  return {p,s,st,why};
}

function rankNow(t, opts){
  opts=opts||{};
  const town=opts.town||effectiveTown(t), phase=phaseAt(t);
  const pool=(typeof DATA!=="undefined"?DATA.places:[])||[];
  let out=pool.map(p=>score(p,t,town,phase)).filter(Boolean);
  if(opts.cat && opts.cat!=="all") out=out.filter(r=>r.p.cat===opts.cat);
  if(opts.cats) out=out.filter(r=>opts.cats.indexOf(r.p.cat)>=0);
  if(opts.tag) out=out.filter(r=>(r.p.tags||[]).indexOf(opts.tag)>=0);
  out.sort((a,b)=> b.s-a.s || (a.p.dur||30)-(b.p.dur||30));
  return {phase, town, list: out};
}
const _pool = () => (typeof DATA!=="undefined"?DATA.places:[])||[];
const openingSoon = t => _pool().map(p=>({p,st:openState(p,t)}))
  .filter(r=>r.st.state==="soon").sort((a,b)=>a.st.opensIn-b.st.opensIn);
const closingSoon = t => _pool().map(p=>({p,st:openState(p,t)}))
  .filter(r=>r.st.state==="closing").sort((a,b)=>a.st.closesIn-b.st.closesIn);

/* ---------- outbound links ---------- */
const enc = encodeURIComponent;
const townLabel = p => {
  const t=(p.town||"").trim();
  return t ? t.charAt(0).toUpperCase()+t.slice(1) : (CFG.dest||"");
};
const LINK = {
  map:  p => "https://www.google.com/maps/search/?api=1&query="+enc(p.name+", "+townLabel(p)+(CFG.country?", "+CFG.country:"")),
  dir:  p => "https://www.google.com/maps/dir/?api=1&destination="+p.lat+","+p.lng+"&travelmode=driving",
  walk: p => "https://www.google.com/maps/dir/?api=1&destination="+p.lat+","+p.lng+"&travelmode=walking",
  uber: p => "https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]="+p.lat+"&dropoff[longitude]="+p.lng+"&dropoff[nickname]="+enc(p.name),
  ride: p => (CFG.rideLinks||[]).map(r=>({label:r.label, url:r.url})),
  food: p => (CFG.foodLink||"https://www.google.com/search?q=")+enc(p.name+" "+townLabel(p))
};
const EATS = ["food","cafe","sweet","street","bar"];

function price(p){
  if((p.lo===0||p.lo===null)&&(p.hi===0)) return "free";
  if(p.lo===null||p.lo===undefined) return p.priceNote||"price unknown";
  if(p.hi && p.hi!==p.lo) return CUR+p.lo+"–"+p.hi+(p.priceNote?" "+p.priceNote:"");
  return CUR+p.lo+(p.priceNote?" "+p.priceNote:"");
}

/* ---------- a place card ---------- */
function placeCard(r, i){
  const p=r.p||r, st=r.st||openState(p, localMins());
  const badge={
    open:'<span class="tag t-open">open now</span>',
    closing:'<span class="tag t-soon">'+st.label+'</span>',
    soon:'<span class="tag t-soon">'+st.label+'</span>',
    shut:'<span class="tag t-shut">'+st.label+'</span>',
    unknown:'<span class="tag t-unv">hours unknown</span>'
  }[st.state]||"";
  const cls=i===0?"rank":i===1?"rank r2":i===2?"rank r3":"rank rn";
  const num=(i!==undefined&&i!==null)?'<div class="num">'+(i+1)+'</div>':'';
  const isFood=EATS.indexOf(p.cat)>=0;
  return '<div class="card'+(i===0?' hi':'')+'"><div class="'+cls+'">'+num+
   '<div style="flex:1;min-width:0">'+
   '<h3>'+p.name+'<span class="money">'+price(p)+'</span></h3><div>'+badge+
   (p.dur?'<span class="tag t-info">'+dur(p.dur)+'</span>':'')+
   ((p.town&&p.town!==TRIP.dest)?'<span class="tag t-info">'+townLabel(p)+'</span>':'')+
   (p.loose?'<span class="tag t-unv">pin approx</span>':'')+'</div>'+
   (p.why?'<p class="sub" style="margin:6px 0 0">'+p.why+'</p>':'')+
   (p.warn?'<p class="tiny" style="color:#ff9aa2;margin:5px 0 0">⚠ '+p.warn+'</p>':'')+
   ((r.why&&r.why.length)?'<div class="why">→ '+r.why[0]+'</div>':'')+
   '<div class="btns">'+
     '<a class="btn g" target="_blank" rel="noopener" href="'+LINK.map(p)+'">Maps</a>'+
     '<a class="btn" target="_blank" rel="noopener" href="'+LINK.walk(p)+'">Walk</a>'+
     '<a class="btn o" target="_blank" rel="noopener" href="'+LINK.uber(p)+'">Ride</a>'+
     (isFood&&CFG.foodLink?'<a class="btn b" target="_blank" rel="noopener" href="'+LINK.food(p)+'">Reviews</a>':'')+
   '</div>'+
   (p.src?'<p class="src" style="margin:7px 0 0"><a href="'+p.src+'" target="_blank" rel="noopener">source</a></p>':'')+
   '</div></div></div>';
}

/* ---------- chrome ---------- */
function mountChrome(active){
  const page=active||(location.pathname.split("/").pop()||"index.html");
  const items=CFG.nav||[];
  if(!document.querySelector(".top")) document.body.insertAdjacentHTML("afterbegin", CHROME());
  document.body.insertAdjacentHTML("beforeend",
    '<nav class="nav"><div class="in">'+items.map(n=>
      '<a href="'+n[0]+'" class="'+(n[0]===page?"on":"")+'"><i>'+n[1]+'</i>'+n[2]+'</a>'
    ).join("")+'</div></nav>');
  tickClock(); setInterval(tickClock, 15000);
}
function CHROME(){
  return '<div class="top"><div class="wrap">'+
    '<div><div class="tnow" id="tnow">--:--</div><div class="tphase" id="tphase">…</div></div>'+
    '<div class="tcd" id="tcd"></div></div></div>';
}
function tickClock(){
  const t=localMins(), ph=phaseAt(t);
  const n=document.getElementById("tnow"), p=document.getElementById("tphase"),
        c=document.getElementById("tcd");
  if(n) n.textContent=HM(t)+(CFG.tzLabel?" "+CFG.tzLabel:"");
  if(p) p.textContent=ph.name;
  if(c){
    if(TRIP.multiDay){ c.innerHTML='<span style="color:var(--dimmer);font-weight:400">'+
      (CFG.dest||"")+'</span>'; }
    else {
      const go=TRIP.lastExit-t, out=TRIP.depart-t;
      c.innerHTML = go>0 ? 'set off in <b>'+Math.floor(go/60)+'h '+(go%60)+'m</b><br>'+
          '<span style="color:var(--dimmer);font-weight:400">departure in '+Math.floor(out/60)+'h '+(out%60)+'m</span>'
        : (out>0 ? 'departure in <b>'+Math.floor(out/60)+'h '+(out%60)+'m</b><br>'+
            '<span style="color:var(--dimmer);font-weight:400">you should be moving</span>'
          : '<span style="color:var(--dimmer);font-weight:400">departure time passed</span>');
    }
  }
  document.querySelectorAll("[data-livephase]").forEach(e=>e.textContent=ph.name);
  document.querySelectorAll("[data-liveline]").forEach(e=>e.textContent=ph.line);
}
