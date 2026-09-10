/* Capture real screenshots of the real app, so the README shows what it is rather
   than describing it. Run: node tests/shots.js

   The clock is frozen to a fixed mid-day instant so the guide shot always shows a
   real "open now" count instead of whatever the wall clock happens to make open
   when the script runs. Same reason the browser suite freezes it. */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DOCS = path.join(__dirname, "..", "docs");
const OUT = path.join(DOCS, "shots");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml", ".png":"image/png",
  ".txt":"text/plain", ".json":"application/json", ".webp":"image/webp" };

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
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // 2026-09-16 13:00 UTC is a Wednesday; Porto (+60 WEST) reads 14:00, mid-day and
  // open, and the town photo hero shows a real open-now count.
  await page.clock.setFixedTime(new Date("2026-09-16T13:00:00Z"));
  const shot = async (name, note) => {
    await page.screenshot({ path: path.join(OUT, name + ".png") });
    console.log("  " + name + ".png  " + note);
  };

  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000); // let a hero photo paint
  await shot("new-landing", "the full-bleed photo landing");

  await page.fill("#q", "Porto");
  await page.waitForSelector("#hits .hit", { timeout: 45000 });
  await page.locator("#hits .hit").first().click();
  await page.waitForSelector("#s2.on");
  const fresh = page.locator("#freshBuild");
  if (await fresh.count()) { await fresh.click(); } else { await page.click("#goBtn"); }
  await page.waitForSelector("#s4.on .pc, #s4.on .dhero", { timeout: 240000 });
  await page.waitForTimeout(2500);
  await shot("new-guide", "the guide, town photo hero and what is open now");

  await b.close();
  server.close();
  console.log("\n  written to docs/shots\n");
})();
