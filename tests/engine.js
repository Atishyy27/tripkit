const fs=require("fs");
const cfg=JSON.parse(process.argv[2]||"{}");
global.DATA={config:cfg.config,conditions:cfg.conditions,places:cfg.places||[]};
global.document={querySelector:()=>null,querySelectorAll:()=>[],body:{insertAdjacentHTML:()=>{}},getElementById:()=>null};
global.localStorage={getItem:()=>null,setItem:()=>{}};
eval(fs.readFileSync(__dirname+"/../templates/assets/core.js","utf8"));
console.log("phases derived from sunrise "+(DATA.conditions.sunrise)+" / sunset "+(DATA.conditions.sunset)+":");
PHASES.forEach(p=>console.log("   "+HM(p.from)+" - "+HM(p.to)+"  "+p.name));
if(!TRIP.multiDay) console.log("set-off deadline "+HM(TRIP.lastExit)+", hard deadline "+HM(TRIP.hardExit));
if(DATA.places.length){
  console.log("\nranking:");
  (cfg.probe||["06:15","09:00","13:00","17:30"]).forEach(hh=>{
    const t=M(hh),r=rankNow(t,{}),e=exitState(t);
    console.log("   "+hh+"  "+phaseAt(t).name.padEnd(16)+" "+String(r.list.length).padStart(3)+
      " fit ["+e.level+"]  "+r.list.slice(0,3).map(x=>x.p.name.slice(0,24)).join(" | "));
  });
}
