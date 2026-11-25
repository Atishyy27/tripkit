/* The build's two changes: the timezone comes from the weather answer, and the
   three sources are fetched together. Everything here runs against the mock
   sources in tests/mocks/sources.js, never the network. */

describe("timezone from the weather answer", () => {
  it("reads the offset in minutes", () => {
    eq(tzMinutesFromWeather({ tzOffsetSeconds: 28800 }), 480, "Bali");
    eq(tzMinutesFromWeather({ tzOffsetSeconds: 10800 }), 180, "Tel Aviv in summer");
    eq(tzMinutesFromWeather({ tzOffsetSeconds: 18000 }), 300, "Karachi");
    eq(tzMinutesFromWeather({ tzOffsetSeconds: 19800 }), 330, "India");
    eq(tzMinutesFromWeather({ tzOffsetSeconds: -10800 }), -180, "west of UTC");
  });
  it("is null when the answer has no offset, so the table still decides", () => {
    eq(tzMinutesFromWeather(null), null);
    eq(tzMinutesFromWeather({}), null, "the fallback weather source carries none");
    eq(tzMinutesFromWeather({ tzOffsetSeconds: undefined }), null);
    eq(tzMinutesFromWeather({ tzOffsetSeconds: "28800" }), null, "a string is not a number");
    eq(tzMinutesFromWeather({ tzOffsetSeconds: NaN }), null);
    eq(tzMinutesFromWeather({ tzOffsetSeconds: 999999 }), null, "beyond any real zone");
  });
  it("the table really is wrong for Bali, which is the reason for the change", () => {
    eq(tzOffsetFor("ID", 115.2, new Date("2026-07-01T00:00:00Z")), 420);
    ok(tzMinutesFromWeather({ tzOffsetSeconds: 28800 }) !== 420);
  });
});

const NOOP_UI = { step() {}, progress() {} };
const PLACE_T = { name: "Mockville", country: "", countryCode: "", lat: 1, lng: 1 };

describe("build: sources fetched together", () => {
  itAsync("takes about the slowest call, not the sum of three", async () => {
    const S = mockSources({ delay: 150 });
    const t0 = Date.now();
    const g = await gatherSources(PLACE_T, 2500, S, NOOP_UI);
    const took = Date.now() - t0;
    // one after another this is at least 3 x 150 = 450 ms (live group adds more)
    ok(took < 400, `took ${took} ms, expected well under 450`);
    ok(g.places.length >= 2);
  });
  itAsync("gives the merged guide data the fixtures describe", async () => {
    const g = await gatherSources(PLACE_T, 2500, mockSources(), NOOP_UI);
    eq(g.wvTitle, "Mockville");
    eq(g.places.map(p => p.name).sort(), ["Mock Cafe", "Mock Fort"]);
    eq(g.notes, []);
    eq(g.wx.value.tzOffsetSeconds, 28800);
  });
  itAsync("OpenStreetMap failing leaves a guide with the same note as before", async () => {
    const g = await gatherSources(PLACE_T, 2500, mockSources({ fail: ["overpass"] }), NOOP_UI);
    eq(g.notes, ["No OpenStreetMap data. The guide will be thin."]);
  });
  itAsync("notes stay in OSM, Wikivoyage order even when the later one finishes first", async () => {
    const S = mockSources({ fail: ["overpass", "wvnone"] });
    const slow = S.overpass;
    S.overpass = () => new Promise(res => setTimeout(res, 60)).then(slow);
    const g = await gatherSources(PLACE_T, 2500, S, NOOP_UI);
    eq(g.notes, ["No OpenStreetMap data. The guide will be thin.",
                 "No Wikivoyage guide exists here, so descriptions come only from map data."]);
  });
  itAsync("one source throwing does not stop the others", async () => {
    const g = await gatherSources(PLACE_T, 2500, mockSources({ fail: ["wikivoyage", "weather"] }), NOOP_UI);
    eq(g.places.map(p => p.name).sort(), ["Mock Cafe", "Mock Fort"]);
    eq(g.wvTitle, null);
    eq(g.wx.value, null);
  });
  it("uses the real calls unless TK_SOURCES is set", () => {
    const real = sourcesInUse();
    eq(real.overpass, overpass);
    eq(real.getWeather, getWeather);
    global.TK_SOURCES = { marker: 1 };
    eq(sourcesInUse().marker, 1);
    delete global.TK_SOURCES;
    eq(sourcesInUse().overpass, overpass);
  });
});
