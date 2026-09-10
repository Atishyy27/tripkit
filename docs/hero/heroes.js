/* Bundled landing heroes. Chosen from Wikimedia Commons for iconic, recognizable
   destinations, optimized to WebP. They ship with the app so the landing is
   photo-first even on first paint and offline. Each carries its required
   attribution; the two CC BY-SA images keep that license, credited here and on
   the page. Swapping the set is just editing this list and dropping a .webp in
   this folder. */
const HEROES = [
  { town: "Kyoto",   file: "hero/kyoto.webp",   by: "Basile Morin",  lic: "CC BY-SA 4.0",
    src: "https://commons.wikimedia.org/wiki/File:Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine,_Kyoto,_Japan.jpg" },
  { town: "Udaipur", file: "hero/udaipur.webp", by: "Navneet Sharma", lic: "CC BY-SA 4.0",
    src: "https://commons.wikimedia.org/wiki/File:Taj_Lake_Palace_Udaipur_from_City_Palace.jpg" },
  { town: "Porto",   file: "hero/porto.webp",   by: "Jakub Hałun",   lic: "CC BY 4.0",
    src: "https://commons.wikimedia.org/wiki/File:View_of_Ribeira_from_Cais_de_Gaia,_20250605_1628_9890.jpg" },
];
/* A 214-byte blurred first frame, inlined so the hero has something the instant
   the page paints, before any WebP loads and even with no network. */
const HERO_LQIP = "data:image/webp;base64,UklGRs4AAABXRUJQVlA4IMIAAADwBQCdASogABUAPuVepE2pJSMiMAwBIByJbACsM4T/F5eAXKw2QMQbZrBDsYwordNndXbD+WbpnAD2td9hhQ1x+yP4OJ/2P1m9mvg90zzWUnKw0AQPza+GFPN7QYD+HTjZzQWEQXM+nZx1uZgEDUVwMzwNxmqeVpMRFo4ZBugt+/v1QqOA5PfPhmdCOLDrZr6f3ZxDN2WQCfdD6mYn8ZEGLSDSzVoFhonKZH2bPjpGIa+9Z7EXAS+bwKhaHPWCPAAAAA==";
if (typeof module !== "undefined") module.exports = { HEROES, HERO_LQIP };
