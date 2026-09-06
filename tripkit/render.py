"""Render the dataset into a static multi-page site."""
from __future__ import annotations
import json, os, shutil, datetime as dt
from .spec import Spec

HERE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(os.path.dirname(HERE), "templates")

HEAD = """<!doctype html><html lang="{lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d0b12">
<title>{title}</title><meta name="description" content="{desc}">
<link rel="stylesheet" href="assets/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>{icon}</text></svg>">
{extra}</head><body>
<div class="hero"><div class="wrap">{hero}</div></div>
<div class="wrap">
"""
FOOT = """</div>
<script src="assets/data.js"></script><script src="assets/core.js"></script>
{scripts}
<script>mountChrome("{page}");</script>
</body></html>
"""

BROWSE_JS = """<script>
const CATS=%s;
function go(){
  const t=localMins(), ph=phaseAt(t), town=effectiveTown(t);
  const s=(document.querySelector("#sortf .chip[aria-pressed=true]")||{dataset:{s:"now"}}).dataset.s;
  let l=DATA.places.filter(p=>CATS.indexOf(p.cat)>=0);
  if(s==="open") l=l.filter(p=>["open","closing"].indexOf(openState(p,t).state)>=0);
  const rows=l.map(p=>({p,st:openState(p,t),sc:(score(p,t,town,ph)||{s:-999}).s}));
  if(s==="now") rows.sort((a,b)=>b.sc-a.sc);
  else if(s==="cheap") rows.sort((a,b)=>(a.p.lo===null?9e9:a.p.lo)-(b.p.lo===null?9e9:b.p.lo));
  else if(s==="quick") rows.sort((a,b)=>(a.p.dur||30)-(b.p.dur||30));
  else rows.sort((a,b)=>a.p.name.localeCompare(b.p.name));
  document.getElementById("list").innerHTML=rows.length?rows.map(x=>placeCard(x)).join("")
    :'<div class="empty">Nothing here matches.</div>';
  document.getElementById("count").textContent=rows.length+" places";
}
document.querySelectorAll("#sortf .chip").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#sortf .chip").forEach(x=>x.setAttribute("aria-pressed","false"));
  b.setAttribute("aria-pressed","true");go();});
go(); setInterval(go,60000);
</script>"""

SORTBAR = """<div class="chips" id="sortf">
  <button class="chip" data-s="now" aria-pressed="true">Best right now</button>
  <button class="chip" data-s="open" aria-pressed="false">Open now only</button>
  <button class="chip" data-s="cheap" aria-pressed="false">Cheapest</button>
  <button class="chip" data-s="quick" aria-pressed="false">Quickest</button>
  <button class="chip" data-s="az" aria-pressed="false">A–Z</button>
</div><p class="tiny" id="count"></p><div id="list"></div>"""


class Site:
    def __init__(self, spec: Spec, data: dict, outdir: str):
        self.spec, self.data, self.out = spec, data, outdir
        self.pages: list[tuple[str, str, str]] = []

    # ---------- helpers ----------
    def _write(self, name, title, desc, hero, body, scripts="", extra=""):
        html = HEAD.format(lang="en", title=title, desc=desc, icon=self.spec.favicon,
                           hero=hero, extra=extra) + body + \
               FOOT.format(scripts=scripts, page=name)
        with open(os.path.join(self.out, name), "w", encoding="utf-8") as f:
            f.write(html)

    def _has(self, *cats) -> bool:
        return any(p.get("cat") in cats for p in self.data.get("places", []))

    def _count(self, *cats) -> int:
        return sum(1 for p in self.data.get("places", []) if p.get("cat") in cats)

    # ---------- config the browser engine reads ----------
    def config(self) -> dict:
        s = self.spec
        hub = s.hub_place
        return {
            "title": s.title,
            "dest": s.dest.name.lower(),
            "hub": (hub.name.lower() if hub else s.dest.name.lower()),
            "destLabel": s.dest.name,
            "hubLabel": hub.name if hub else s.dest.name,
            "country": s.country,
            "arrive": f"{s.arrive:%H:%M}" if s.arrive else "00:00",
            "depart": f"{s.depart:%H:%M}" if s.depart else "23:59",
            "arriveDate": f"{s.arrive:%A %d %B %Y}" if s.arrive else None,
            "multiDay": not s.is_single_day,
            "hopMinutes": s.hub_to_dest_minutes,
            "exitBufferMinutes": s.exit_buffer_minutes,
            "tzOffsetMinutes": s.tz_offset_minutes,
            "tzLabel": s.timezone.split("/")[-1].replace("_", " "),
            "currencySymbol": s.currency_symbol,
            "currency": s.currency,
            "locale": "en-IN" if s.currency == "INR" else "en",
            "foodLink": "https://www.google.com/search?q=",
            "traveller": s.traveller,
            "nav": [list(p) for p in self.pages],
        }

    # ---------- build ----------
    def build(self) -> list[str]:
        os.makedirs(os.path.join(self.out, "assets"), exist_ok=True)
        for a in ("style.css", "core.js"):
            shutil.copyfile(os.path.join(TPL, "assets", a),
                            os.path.join(self.out, "assets", a))

        d = self.data
        self.pages = [("index.html", "⏱", "Now"), ("open.html", "🟢", "Open")]
        if self._has("temple", "ghat", "view", "museum", "park", "practical", "outdoor"):
            self.pages.append(("see.html", "📸", "See"))
        if self._has("food", "cafe", "sweet", "street", "bar"):
            self.pages.append(("eat.html", "🍽", "Eat"))
        if self._has("do", "wellness", "nightlife"):
            self.pages.append(("do.html", "🎪", "Do"))
        if self._has("shop"):
            self.pages.append(("shop.html", "🛍", "Shop"))
        if d.get("move"):
            self.pages.append(("move.html", "🚕", "Move"))
        self.pages.append(("map.html", "📍", "Map"))
        self.pages.append(("money.html", "💰", "Money"))
        if d.get("scams"):
            self.pages.append(("safe.html", "🛡", "Safe"))
        if d.get("say"):
            self.pages.append(("say.html", "🗣", "Say"))
        if self.spec.hub_place and self._has("hub") or self._hub_places():
            self.pages.append(("hub.html", "🚏", self.spec.hub_place.name if self.spec.hub_place else "Hub"))
        if d.get("help"):
            self.pages.append(("help.html", "🆘", "Help"))

        payload = dict(d)
        payload["config"] = self.config()
        payload["built"] = dt.datetime.now().strftime("%d %b %Y, %H:%M")
        with open(os.path.join(self.out, "assets", "data.js"), "w", encoding="utf-8") as f:
            f.write("/* generated by tripkit - do not edit by hand */\nconst DATA = ")
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n")

        self.page_now(); self.page_open(); self.page_map(); self.page_money()
        if any(p[0] == "see.html" for p in self.pages): self.page_browse(
            "see.html", "See", ["temple","ghat","view","museum","park","practical","outdoor"],
            "Sights, landmarks and viewpoints, ranked by what suits this hour.")
        if any(p[0] == "eat.html" for p in self.pages): self.page_browse(
            "eat.html", "Eat", ["food","cafe","sweet","street","bar"],
            "Everywhere to eat, sorted by what is actually open now.")
        if any(p[0] == "do.html" for p in self.pages): self.page_browse(
            "do.html", "Do", ["do","wellness","nightlife"],
            "Classes, tours, activities and everything that is not a sight or a meal.")
        if any(p[0] == "shop.html" for p in self.pages): self.page_shop()
        if any(p[0] == "move.html" for p in self.pages): self.page_move()
        if any(p[0] == "safe.html" for p in self.pages): self.page_safe()
        if any(p[0] == "say.html" for p in self.pages): self.page_say()
        if any(p[0] == "hub.html" for p in self.pages): self.page_hub()
        if any(p[0] == "help.html" for p in self.pages): self.page_help()
        return [p[0] for p in self.pages]

    def _hub_places(self):
        h = self.spec.hub_place
        return [p for p in self.data.get("places", [])
                if h and p.get("town") == h.name.lower()]

    # ---------------- pages ----------------
    def page_now(self):
        s = self.spec
        who = f" for {s.traveller}" if s.traveller else ""
        when = ""
        if s.arrive and s.depart:
            when = (f"Arriving {'at ' + s.hub_place.name + ' ' if s.hub_place else ''}"
                    f"around <b>{s.arrive:%H:%M}</b>, leaving at <b>{s.depart:%H:%M}</b>. "
                    f"{s.window_hours:g} hours. ")
        hero = (f"<h1>Right now.</h1><p class=\"lead\">{when}This page does not ask what "
                f"kind of day you want. It reads the clock and tells you what is actually "
                f"open, what the light and the heat are doing, and what still fits.</p>")
        body = """
<div class="chips" id="whereChips">
  <button class="chip" data-w="auto" aria-pressed="true">Work it out</button>
  <button class="chip" data-w="__DEST__" aria-pressed="false">I'm in __DESTL__</button>
  __HUBCHIP__
</div>
<div class="card hi">
  <h3 data-livephase>…</h3>
  <p class="sub" data-liveline style="margin:6px 0 0"></p>
  <div id="sunline" class="tiny" style="margin-top:8px"></div>
</div>
<div id="alerts"></div>
<h2><span class="n">01</span> Do this next</h2>
<p class="sub" id="rankwhy"></p>
<div class="chips" id="catChips">__CATCHIPS__</div>
<div id="now"></div>
<h2><span class="n">02</span> The whole day, live</h2>
<p class="sub">Not a plan to follow. A description of what each stretch of the day is good
for, with the current one lit up. Derived from today's actual sunrise and sunset, not from
a generic morning-afternoon-evening split.</p>
<div class="tl" id="tl"></div>
<p class="src" id="built"></p>
"""
        hub = s.hub_place
        body = body.replace("__DEST__", s.dest.name.lower()).replace("__DESTL__", s.dest.name)
        body = body.replace("__HUBCHIP__",
            f'<button class="chip" data-w="{hub.name.lower()}" aria-pressed="false">I\'m in {hub.name}</button>'
            if hub and hub.name.lower() != s.dest.name.lower() else "")
        cats = [("all", "Anything")] + [
            (c, c.capitalize()) for c in
            sorted({p.get("cat") for p in self.data.get("places", []) if p.get("cat")})]
        body = body.replace("__CATCHIPS__", "".join(
            f'<button class="chip" data-c="{c}" aria-pressed="{"true" if c=="all" else "false"}">{l}</button>'
            for c, l in cats))

        scripts = """<script>
function renderNow(){
  const t=localMins();
  const w=(document.querySelector("#whereChips .chip[aria-pressed=true]")||{dataset:{}}).dataset;
  const cat=(document.querySelector("#catChips .chip[aria-pressed=true]")||{dataset:{c:"all"}}).dataset;
  const opts={cat:cat.c}; if(w.w && w.w!=="auto") opts.town=w.w;
  const r=rankNow(t,opts), ex=exitState(t), top=r.list.slice(0,7);
  document.getElementById("now").innerHTML = top.length ? top.map((x,i)=>placeCard(x,i)).join("")
    : ((ex.level==="now"||ex.level==="gone")
       ? '<div class="card warn"><h3>There is nothing to do but go</h3><p class="sub">That is not a filter problem. At '+HM(t)+', every remaining option costs more time than you have left. The honest answer is the road.</p></div>'
       : '<div class="empty">Nothing in this category is open and still fits.<br>Try another filter, or see <a href="open.html">what is open</a>.</div>');
  document.getElementById("rankwhy").textContent =
    "Ranked for "+HM(t)+", assuming you are in "+(r.town.charAt(0).toUpperCase()+r.town.slice(1))+
    ". "+r.list.length+" of "+DATA.places.length+" places qualify right now.";

  const cs=closingSoon(t), os=openingSoon(t); let a="";
  if(ex.msg) a+='<div class="card '+(ex.level==="soon"?"cool":"warn")+'"><h3>'+
    (ex.level==="soon"?"Start sorting the way out":ex.level==="urgent"?"Leave soon":
     ex.level==="now"?"Leave now":"Departure passed")+'</h3><p class="sub" style="margin:6px 0 0">'+ex.msg+'</p></div>';
  if(cs.length) a+='<div class="card warn"><h3>Closing soon</h3>'+cs.slice(0,4).map(x=>
    '<p class="sub" style="margin:4px 0"><b>'+x.p.name+'</b> — '+x.st.label+'</p>').join("")+'</div>';
  if(os.length) a+='<div class="card cool"><h3>About to open</h3>'+os.slice(0,4).map(x=>
    '<p class="sub" style="margin:4px 0"><b>'+x.p.name+'</b> — '+x.st.label+', in '+x.st.opensIn+' min</p>').join("")+'</div>';
  document.getElementById("alerts").innerHTML=a;

  const sr=SUNRISE, ss=SUNSET; let sl;
  if(t<sr) sl="🌑 Dark. Sunrise "+HM(sr)+", "+(sr-t)+" minutes away.";
  else if(t<sr+60) sl="🌅 Sunrise was "+HM(sr)+". Best light of the day, right now.";
  else if(t<ss-70) sl="☀️ Daylight. Sunset "+HM(ss)+", "+Math.floor((ss-t)/60)+"h "+((ss-t)%60)+"m of light left.";
  else if(t<ss) sl="🌇 Golden hour. Sunset "+HM(ss)+", "+(ss-t)+" minutes away.";
  else sl="🌙 Sun is down. It set at "+HM(ss)+".";
  document.getElementById("sunline").textContent=sl;

  document.getElementById("tl").innerHTML=PHASES.map(p=>{
    const on=t>=p.from&&t<p.to, past=t>=p.to;
    return '<div class="tlrow'+(on?" on":past?" past":"")+'"><div class="h">'+HM(p.from)+' – '+HM(p.to)+
      (on?' &nbsp;<span class="tag t-open">now</span>':'')+'</div><div style="font-weight:700;font-size:14px;margin:1px 0 2px">'+
      p.name+'</div><div class="sub" style="font-size:12.5px">'+p.line+'</div></div>';}).join("");
  document.getElementById("built").textContent="Assembled "+(DATA.built||"")+". "+
    DATA.places.length+" places, "+DATA.places.filter(p=>p.open).length+" with sourced opening hours.";
}
function bind(sel,fn){document.querySelectorAll(sel+" .chip").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(sel+" .chip").forEach(x=>x.setAttribute("aria-pressed","false"));
  b.setAttribute("aria-pressed","true");if(fn)fn(b);renderNow();});}
bind("#whereChips",b=>setWhere(b.dataset.w)); bind("#catChips");
(function(){const w=where(),b=document.querySelector('#whereChips .chip[data-w="'+w+'"]');
 if(b){document.querySelectorAll("#whereChips .chip").forEach(x=>x.setAttribute("aria-pressed","false"));
 b.setAttribute("aria-pressed","true");}})();
renderNow(); setInterval(renderNow,60000);
</script>"""
        self._write("index.html", f"Now — {s.title}",
                    f"What to do in {s.dest.name} right this minute, computed from the clock.",
                    hero, body, scripts)

    def page_open(self):
        hero = ('<h1>What is open.</h1><p class="lead">Everything, sorted by whether its '
                'doors are open at this exact minute. Sorted rather than filtered, so you '
                'can also see what is shut and when it comes back.</p>')
        body = """<div class="chips" id="f">
  <button class="chip" data-s="open" aria-pressed="true">Open now</button>
  <button class="chip" data-s="soon" aria-pressed="false">Opening soon</button>
  <button class="chip" data-s="shut" aria-pressed="false">Shut</button>
  <button class="chip" data-s="unknown" aria-pressed="false">Hours unknown</button>
  <button class="chip" data-s="all" aria-pressed="false">Everything</button>
</div><div class="grid2" id="stats"></div><div id="list"></div>"""
        scripts = """<script>
function go(){
  const t=localMins();
  const s=(document.querySelector("#f .chip[aria-pressed=true]")||{dataset:{s:"open"}}).dataset.s;
  const all=DATA.places.map(p=>({p,st:openState(p,t)}));
  const c={open:0,closing:0,soon:0,shut:0,unknown:0}; all.forEach(x=>c[x.st.state]++);
  document.getElementById("stats").innerHTML=
   '<div class="stat"><div class="v">'+(c.open+c.closing)+'</div><div class="k">open now</div></div>'+
   '<div class="stat"><div class="v">'+c.shut+'</div><div class="k">shut</div></div>'+
   '<div class="stat"><div class="v">'+c.soon+'</div><div class="k">opening within 75 min</div></div>'+
   '<div class="stat"><div class="v">'+c.unknown+'</div><div class="k">hours never found</div></div>';
  let f=all;
  if(s==="open") f=all.filter(x=>x.st.state==="open"||x.st.state==="closing");
  else if(s!=="all") f=all.filter(x=>x.st.state===s);
  f.sort((a,b)=>a.p.name.localeCompare(b.p.name));
  document.getElementById("list").innerHTML=f.length?f.map(x=>placeCard(x)).join("")
    :'<div class="empty">Nothing in this bucket right now.</div>';
}
document.querySelectorAll("#f .chip").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#f .chip").forEach(x=>x.setAttribute("aria-pressed","false"));
  b.setAttribute("aria-pressed","true");go();});
go(); setInterval(go,60000);
</script>"""
        self._write("open.html", f"Open now — {self.spec.title}",
                    "Everything sorted by whether it is open this minute.", hero, body, scripts)

    def page_browse(self, name, h1, cats, lead, note=""):
        hero = f'<h1>{h1}.</h1><p class="lead">{lead}</p>'
        self._write(name, f"{h1} — {self.spec.title}", lead, hero,
                    note + SORTBAR, BROWSE_JS % json.dumps(cats))

    def page_shop(self):
        buy = self.data.get("buy") or []
        priced = sum(1 for b in buy if b.get("realPrice"))
        note = ""
        if buy:
            note = (f'<div class="card{" warn" if priced==0 else ""}"><h3>On the prices</h3>'
                    f'<p class="sub">{priced} of {len(buy)} items have a sourced price anchor. '
                    f'Where a field is empty it means nobody could source it, not that it is free. '
                    f'An invented anchor would make you confident at exactly the wrong moment, so '
                    f'there are none.</p></div>'
                    '<h2><span class="n">01</span> What to buy</h2><div id="buy"></div>'
                    '<h2><span class="n">02</span> Where</h2>')
        js = """<script>
const b=DATA.buy||[];
const el=document.getElementById("buy");
if(el) el.innerHTML = b.length ? b.map(x=>'<details><summary>'+(x.item||"")+'</summary>'+
 (x.realPrice?'<p class="sub"><b>Real price:</b> '+x.realPrice+'</p>':'')+
 (x.askPrice?'<p class="sub"><b>You will be quoted:</b> '+x.askPrice+'</p>':'')+
 (x.counterAt?'<p class="sub"><b>Counter at:</b> '+x.counterAt+'</p>':'')+
 (x.howToTell?'<p class="sub"><b>Real or fake:</b> '+x.howToTell+'</p>':'')+
 (x.why?'<p class="sub">'+x.why+'</p>':'')+
 (x.warn?'<p class="tiny" style="color:#ff9aa2">⚠ '+x.warn+'</p>':'')+
 (x.src?'<p class="src"><a href="'+x.src+'" target="_blank" rel="noopener">source</a></p>':'')+
 '</details>').join("") : '<div class="empty">No buying guide in this build.</div>';
</script>""" + (BROWSE_JS % json.dumps(["shop"]))
        hero = ('<h1>Shop.</h1><p class="lead">Markets and what things actually cost, so you '
                'have a number in your head before someone gives you one.</p>')
        self._write("shop.html", f"Shop — {self.spec.title}", "Markets and price anchors.",
                    hero, note + SORTBAR, js)

    def page_hub(self):
        h = self.spec.hub_place
        n = h.name if h else "Hub"
        lead = (f"You arrive and leave through {n}. What is worth doing there, and when, "
                f"given you are only passing through.")
        hero = f'<h1>{n}.</h1><p class="lead">{lead}</p>'
        cats = sorted({p.get("cat") for p in self._hub_places() if p.get("cat")})
        self._write("hub.html", f"{n} — {self.spec.title}", lead, hero, SORTBAR,
                    BROWSE_JS % json.dumps(cats or ["hub"]))

    def page_map(self):
        hero = ('<h1>Map.</h1><p class="lead">Pins marked <i>approx</i> were inferred rather '
                'than sourced: good enough to walk toward, not good enough to argue with a '
                'driver about. Faded pins are currently shut.</p>')
        cats = sorted({p.get("cat") for p in self.data.get("places", []) if p.get("cat")})
        chips = ('<button class="chip" data-f="all" aria-pressed="true">Everything</button>'
                 '<button class="chip" data-f="open" aria-pressed="false">Open now</button>'
                 + "".join(f'<button class="chip" data-f="{c}" aria-pressed="false">'
                           f'{c.capitalize()}</button>' for c in cats))
        body = (f'<div class="chips" id="mf">{chips}</div><div id="map"></div>'
                '<div id="legend" class="card flat"></div>')
        scripts = """<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const PAL=["#ffc857","#6ee7d0","#ff7ab8","#8ab8ff","#b98cff","#ff8a4c","#7ee0a8","#ff5f6d","#a99fc4"];
const CATS=[...new Set(DATA.places.map(p=>p.cat))].sort();
const COL={}; CATS.forEach((c,i)=>COL[c]=PAL[i%PAL.length]);
const pts=DATA.places.filter(p=>p.lat&&p.lng);
const map=L.map("map",{scrollWheelZoom:false});
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
if(pts.length) map.fitBounds(pts.map(p=>[p.lat,p.lng]),{padding:[28,28],maxZoom:15});
else map.setView([0,0],2);
let ms=[];
function draw(f){
  ms.forEach(m=>map.removeLayer(m)); ms=[];
  const t=localMins(); let l=pts;
  if(f==="open") l=l.filter(p=>["open","closing"].indexOf(openState(p,t).state)>=0);
  else if(f!=="all") l=l.filter(p=>p.cat===f);
  l.forEach(p=>{
    const st=openState(p,t), c=COL[p.cat]||"#a99fc4", dim=st.state==="shut";
    ms.push(L.circleMarker([p.lat,p.lng],{radius:dim?5:8,color:c,fillColor:c,
      fillOpacity:dim?.25:.85,weight:dim?1:2})
     .bindPopup('<b>'+p.name+'</b><br><span style="color:#a99fc4">'+price(p)+' · '+st.label+'</span><br>'+
       '<a href="'+LINK.map(p)+'" target="_blank" rel="noopener">Maps</a> · '+
       '<a href="'+LINK.walk(p)+'" target="_blank" rel="noopener">Walk</a> · '+
       '<a href="'+LINK.uber(p)+'" target="_blank" rel="noopener">Ride</a>').addTo(map));
  });
  document.getElementById("legend").innerHTML="<p class='tiny' style='margin:0'>Showing <b>"+
    l.length+"</b> of "+pts.length+" mapped places. "+
    CATS.map(k=>'<span style="color:'+COL[k]+'">■ '+k+'</span>').join(" &nbsp; ")+"</p>";
}
document.querySelectorAll("#mf .chip").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#mf .chip").forEach(x=>x.setAttribute("aria-pressed","false"));
  b.setAttribute("aria-pressed","true");draw(b.dataset.f);});
draw("all");
</script>"""
        self._write("map.html", f"Map — {self.spec.title}", "Every place on one map.",
                    hero, body, scripts,
                    extra='<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">')

    def page_money(self):
        s, cur = self.spec, self.spec.currency_symbol
        pl = [p for p in self.data.get("places", []) if p.get("lo") or p.get("hi")]
        rows = "".join(
            f'<tr><td>{p["name"]}</td><td style="color:var(--cool);white-space:nowrap">'
            f'{cur}{p.get("lo") or 0:g}'
            f'{"–" + cur + format(p["hi"], "g") if p.get("hi") and p["hi"] != p.get("lo") else ""}'
            f'</td><td class="sub" style="font-size:12px">{p.get("priceNote") or ""}</td></tr>'
            for p in sorted(pl, key=lambda x: x.get("lo") or 0)[:60])
        free = sum(1 for p in self.data.get("places", [])
                   if (p.get("lo") in (0, None)) and p.get("hi") in (0, None))
        hero = (f'<h1>Money.</h1><p class="lead">Every price in the dataset, and a calculator '
                f'for the day. {free} of {len(self.data.get("places", []))} places cost nothing '
                f'to visit, which is usually the more useful number.</p>')
        body = f"""
<div class="card"><h3>Today, priced</h3>
<div style="display:grid;grid-template-columns:1fr auto;gap:9px 12px;align-items:center;margin-top:10px">
  <label class="sub">Transport</label>
  <select id="a"><option value="200">Public / shared</option><option value="700" selected>Mix of both</option><option value="1800">Cabs all day</option></select>
  <label class="sub">Food</label>
  <select id="b"><option value="200">Street only</option><option value="700" selected>Street plus one sit-down</option><option value="1600">Restaurants</option></select>
  <label class="sub">Entries, tickets and tips</label>
  <select id="c"><option value="0" selected>Only the free things</option><option value="400">A few paid entries</option><option value="1200">Everything ticketed</option></select>
  <label class="sub">Activities</label>
  <select id="d"><option value="0" selected>None</option><option value="700">One</option><option value="2000">Two or more</option></select>
  <label class="sub">Shopping</label>
  <span><input type="range" id="e" min="0" max="8000" step="250" value="0" style="width:120px;accent-color:var(--hot)"> <span class="tiny" id="ev">{cur}0</span></span>
</div><hr style="margin:14px 0">
<div style="display:flex;justify-content:space-between;align-items:flex-end">
 <div><div class="tiny">plus a {cur}500 buffer</div><b>Day total</b></div>
 <div style="font-size:30px;font-weight:800;color:var(--cool);letter-spacing:-1px" id="tot">{cur}0</div>
</div></div>
<h2><span class="n">01</span> Every price we found</h2>
<p class="sub">Sorted cheapest first. These are the anchors: if a quote is more than double
the number here, it is a price invented for you.</p>
<div class="scroll"><table><tr><th>Thing</th><th>{cur}</th><th></th></tr>{rows}</table></div>
"""
        scripts = """<script>
const ids=["a","b","c","d","e"];
function calc(){const v=ids.map(i=>+document.getElementById(i).value);
 document.getElementById("ev").textContent=inr(v[4]);
 document.getElementById("tot").textContent=inr(v.reduce((x,y)=>x+y,0)+500);}
ids.forEach(i=>document.getElementById(i).addEventListener("input",calc));
document.querySelectorAll("select").forEach(s=>s.style.cssText=
 "background:var(--bg2);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px;font-family:inherit;font-size:12.5px");
calc();
</script>"""
        self._write("money.html", f"Money — {s.title}", "What the day costs.", hero, body, scripts)

    def page_move(self):
        s = self.spec
        hub = s.hub_place.name if s.hub_place else ""
        hero = (f'<h1>Moving.</h1><p class="lead">Getting in, getting around, and the leg that '
                f'actually strands people: getting out. Every row is marked official, reported '
                f'or estimate, because a fare nobody sourced should not look like one that was.</p>')
        body = ('<div class="card hi" id="legnow"></div>'
                '<h2><span class="n">01</span> Every option</h2>'
                '<div class="chips" id="cf">'
                '<button class="chip" data-c="all" aria-pressed="true">All</button>'
                '<button class="chip" data-c="official" aria-pressed="false">Official only</button>'
                '</div><div id="list"></div>')
        scripts = """<script>
(function(){const t=localMins(),ex=exitState(t),el=document.getElementById("legnow");
 let h,b;
 if(t<TRIP.arrive){h="Not there yet";b="Screenshot this before you lose signal. Check your ticket for the exact arrival point and drop that pin into Maps now.";}
 else if(t<TRIP.arrive+90){h="Get moving from the arrival point";b="Prefer whatever books to a GPS pin over whatever you have to find. With luggage, at an odd hour, a car beats anything two-wheeled.";}
 else if(ex.level==="ok"){h="You are in the walking part of the day";b="Save the money for the ride out. That is the leg that goes wrong.";}
 else {h="Sort the way out";b=ex.msg||"";}
 el.innerHTML='<h3>'+h+'</h3><p class="sub" style="margin:6px 0 0">'+b+'</p>';})();
function go(){
 const f=(document.querySelector("#cf .chip[aria-pressed=true]")||{dataset:{c:"all"}}).dataset.c;
 let m=DATA.move||[]; if(f==="official") m=m.filter(x=>x.confidence==="official");
 document.getElementById("list").innerHTML = m.length ? m.map(x=>
  '<div class="card"><h3>'+(x.from||"")+' → '+(x.to||"")+'<span class="money">'+
  (((x.lo||x.lo===0)?inr(x.lo)+(x.hi&&x.hi!==x.lo?"–"+inr(x.hi):""):(x.priceNote||"?")))+'</span></h3>'+
  '<div><span class="tag t-info">'+(x.mode||"")+'</span>'+
   (x.confidence?'<span class="tag '+(x.confidence==="official"?"t-open":x.confidence==="reported"?"t-info":"t-unv")+'">'+x.confidence+'</span>':'')+
   (x.first?'<span class="tag t-info">first '+x.first+'</span>':'')+
   (x.last?'<span class="tag t-soon">last '+x.last+'</span>':'')+
   (x.dur?'<span class="tag t-info">'+x.dur+'</span>':'')+'</div>'+
  (x.where?'<p class="tiny" style="margin:6px 0 0">📍 '+x.where+'</p>':'')+
  (x.why?'<p class="sub" style="margin:6px 0 0">'+x.why+'</p>':'')+
  (x.warn?'<p class="tiny" style="color:#ff9aa2;margin:5px 0 0">⚠ '+x.warn+'</p>':'')+
  (x.phone?'<div class="btns"><a class="btn r" href="tel:'+String(x.phone).replace(/[^0-9+]/g,"")+'">'+x.phone+'</a></div>':'')+
  (x.src?'<p class="src" style="margin:6px 0 0"><a href="'+x.src+'" target="_blank" rel="noopener">source</a></p>':'')+
  '</div>').join("") : '<div class="empty">No transport rows.</div>';
}
document.querySelectorAll("#cf .chip").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("#cf .chip").forEach(x=>x.setAttribute("aria-pressed","false"));
 b.setAttribute("aria-pressed","true");go();});
go();
</script>"""
        self._write("move.html", f"Move — {s.title}", "Transport with real fares and times.",
                    hero, body, scripts)

    def page_safe(self):
        hero = ('<h1>The traps.</h1><p class="lead">Not "be careful". The actual opening lines, '
                'so a routine is recognisable in the first five seconds rather than the fifth '
                'minute. Each one is marked by how well corroborated it is.</p>')
        body = '<div id="scams"></div><div class="card cool" id="cond"></div>'
        scripts = """<script>
document.getElementById("scams").innerHTML=(DATA.scams||[]).map((x,i)=>
 '<div class="card warn"><h3>'+(i+1)+'. '+(x.name||"")+'</h3>'+
 (x.opener?'<p class="sub" style="font-size:15px;color:var(--ink)">“'+x.opener+'”</p>':'')+
 (x.how?'<p class="sub">'+x.how+'</p>':'')+
 (x.cost?'<p class="sub"><b>What it costs:</b> '+x.cost+'</p>':'')+
 (x.counter?'<p class="sub"><b>What ends it:</b> '+x.counter+'</p>':'')+
 '<div>'+(x.confidence?'<span class="tag '+(x.confidence==="corroborated"?"t-open":x.confidence==="single-source"?"t-soon":"t-unv")+'">'+x.confidence+'</span>':'')+'</div>'+
 (x.src?'<p class="src" style="margin:6px 0 0"><a href="'+x.src+'" target="_blank" rel="noopener">source</a></p>':'')+
 '</div>').join("") || '<div class="empty">No scam data in this build.</div>';
const C=DATA.conditions||{};
if(C.sunrise) document.getElementById("cond").innerHTML=
 '<h3>Light and weather'+(C.date?' — '+C.date:'')+'</h3>'+
 '<p class="sub" style="margin:6px 0 0">First light <b>'+(C.firstLight||"?")+'</b>, sunrise <b>'+C.sunrise+
 '</b>, sunset <b>'+(C.sunset||"?")+'</b>, last light <b>'+(C.lastLight||"?")+'</b>.</p>'+
 (C.weather?'<p class="sub" style="margin:6px 0 0">'+C.weather+'</p>':'')+
 ((C.festivals&&C.festivals.length)?'<p class="sub" style="margin:6px 0 0"><b>Dates that change the day:</b> '+
   C.festivals.map(f=>f.name+" ("+f.date+")").join(", ")+'</p>'
  :'<p class="sub" style="margin:6px 0 0">No festival or holiday falls on this date, so no crowd surge to plan around.</p>')+
 ((C.unverified&&C.unverified.length)?'<p class="tiny" style="margin:8px 0 0">Not verified: '+C.unverified.join("; ")+'</p>':'');
else document.getElementById("cond").style.display="none";
</script>"""
        self._write("safe.html", f"Safe — {self.spec.title}", "Scams, rules and conditions.",
                    hero, body, scripts)

    def page_say(self):
        langs = ", ".join(self.spec.languages) or "the local language"
        hero = (f'<h1>Say this.</h1><p class="lead">Not a phrasebook. Lines for specific '
                f'moments, in {langs}. Anything marked <i>verify</i> is a phrasing nobody '
                f'could confirm from a source.</p>')
        cats = sorted({x.get("cat") for x in (self.data.get("say") or []) if x.get("cat")})
        chips = '<button class="chip" data-c="all" aria-pressed="true">All</button>' + "".join(
            f'<button class="chip" data-c="{c}" aria-pressed="false">{c.capitalize()}</button>'
            for c in cats)
        body = f'<div class="chips" id="sf">{chips}</div><div id="say"></div>'
        scripts = """<script>
function go(){
 const c=(document.querySelector("#sf .chip[aria-pressed=true]")||{dataset:{c:"all"}}).dataset.c;
 let l=DATA.say||[]; if(c!=="all") l=l.filter(x=>x.cat===c);
 document.getElementById("say").innerHTML=l.length?l.map(x=>
  '<div class="card"><h3>'+(x.situation||"")+(x.verify?' <span class="tag t-unv">verify</span>':'')+'</h3>'+
  (x.say?'<div class="dev">'+x.say+'</div>':'')+
  (x.roman?'<div class="rom">'+x.roman+'</div>':'')+
  (x.means?'<p class="tiny" style="margin:6px 0 0">'+x.means+'</p>':'')+
  (x.why?'<p class="sub" style="margin:6px 0 0">'+x.why+'</p>':'')+'</div>').join("")
  :'<div class="empty">Nothing in this category.</div>';
}
document.querySelectorAll("#sf .chip").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("#sf .chip").forEach(x=>x.setAttribute("aria-pressed","false"));
 b.setAttribute("aria-pressed","true");go();});
go();
</script>"""
        self._write("say.html", f"Say — {self.spec.title}", "The lines that work.",
                    hero, body, scripts)

    def page_help(self):
        h = self.data.get("help") or []
        ver = sum(1 for x in h if x.get("verified"))
        hero = (f'<h1>If something goes wrong.</h1><p class="lead">{ver} of {len(h)} entries '
                f'are confirmed from an official source. The rest are marked unverified and say '
                f'what to use instead. A wrong number in an emergency is worse than no number, '
                f'so the marking matters more than the length of the list.</p>')
        cats = sorted({x.get("cat") for x in h if x.get("cat")})
        chips = '<button class="chip" data-c="all" aria-pressed="true">All</button>' + "".join(
            f'<button class="chip" data-c="{c}" aria-pressed="false">{c.capitalize()}</button>'
            for c in cats)
        quick = [x for x in h if x.get("verified") and x.get("phone")][:3]
        sos = ('<div class="sos">' + "".join(
            f'<a href="tel:{str(x["phone"]).replace(" ", "")}">{x["phone"]} {x.get("name","")[:14]}</a>'
            for x in quick) + '</div>') if quick else ""
        body = f'{sos}<div class="chips" id="hf">{chips}</div><div id="help"></div>'
        scripts = """<script>
function go(){
 const c=(document.querySelector("#hf .chip[aria-pressed=true]")||{dataset:{c:"all"}}).dataset.c;
 let l=(DATA.help||[]).slice(); if(c!=="all") l=l.filter(x=>x.cat===c);
 l.sort((a,b)=>(b.verified?1:0)-(a.verified?1:0));
 document.getElementById("help").innerHTML=l.length?l.map(x=>
  '<div class="card'+(x.verified?"":" flat")+'"><h3>'+(x.name||"")+'</h3><div>'+
  (x.verified?'<span class="tag t-open">verified</span>':'<span class="tag t-unv">unverified</span>')+
  (x.town?'<span class="tag t-info">'+x.town+'</span>':'')+
  (x.hours?'<span class="tag t-info">'+x.hours+'</span>':'')+'</div>'+
  (x.addr?'<p class="sub" style="margin:6px 0 0">'+x.addr+'</p>':'')+
  (x.note?'<p class="tiny" style="margin:5px 0 0">'+x.note+'</p>':'')+
  (x.phone?'<div class="btns"><a class="btn r" href="tel:'+String(x.phone).replace(/[^0-9+]/g,"")+'">'+x.phone+'</a></div>':'')+
  (x.src?'<p class="src" style="margin:6px 0 0"><a href="'+x.src+'" target="_blank" rel="noopener">source</a></p>':'')+
  '</div>').join("") : '<div class="empty">Nothing here.</div>';
}
document.querySelectorAll("#hf .chip").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("#hf .chip").forEach(x=>x.setAttribute("aria-pressed","false"));
 b.setAttribute("aria-pressed","true");go();});
go();
</script>"""
        self._write("help.html", f"Help — {self.spec.title}", "Verified emergency contacts.",
                    hero, body, scripts)
