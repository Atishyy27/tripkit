/* Capture real screenshots of the real app, so the README shows what it is rather
   than describing it. Run: node tests/shots.js */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DOCS = path.join(__dirname, "..", "docs");
const OUT = path.join(DOCS, "shots");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml", ".png":"image/png",
  ".txt":"text/plain" };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = path.join(DOCS, p);
    if (!fs.existsSync(f)) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(rs);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/`;

  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  const shot = async (name, note) => {
    await page.screenshot({ path: path.join(OUT, name + ".png") });
    console.log("  " + name + ".png  " + note);
  };

  await page.goto(base, { waitUntil: "networkidle" });
  await shot("01-landing", "the first screen");

  await page.fill("#q", "Pushkar");
  await page.waitForSelector("#hits .hit", { timeout: 45000 });
  await page.locator("#hits .hit").first().click();
  await page.waitForSelector("#s2.on");
  await shot("02-when", "the hours you have");

  await page.click("#goBtn");
  await page.waitForSelector("#s4.on", { timeout: 240000 });
  await page.waitForTimeout(1500);
  await shot("03-now", "what is open right now");

  await page.click('#views .chip[data-v="plan"]');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = document.querySelector('#vPlan [data-auto="steady"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1600);
  await shot("04-plan", "a day it built");

  await page.click('#views .chip[data-v="map"]');
  await page.waitForTimeout(3000);
  await shot("05-map", "the map");

  await page.click('#views .chip[data-v="weather"]');
  await page.waitForTimeout(900);
  await shot("06-weather", "weather and light");

  await b.close();
  server.close();
  console.log("\n  written to docs/shots\n");
})();
