/* Canned answers for every outside call the build makes. Synthetic: invented
   places, no real people or accounts. Used by tests, and by dev when a page sets
   window.TK_SOURCES = mockSources(...) before app.js loads. The real calls in
   docs/sources.js stay the default; nothing here ships to the site. */
function mockSources(opts) {
  const o = Object.assign({ delay: 0, tzSeconds: 28800, fail: [] }, opts || {});
  const wait = v => new Promise((res, rej) => setTimeout(() => {
    if (v instanceof Error) rej(v); else res(v);
  }, o.delay));
  const f = name => o.fail.includes(name);
  const live = value => wait({ value, source: "mock" });
  return {
    overpass: () => f("overpass") ? wait(new Error("mock 500")) : wait([
      { type: "node", id: 1, lat: 1.001, lon: 1.001,
        tags: { name: "Mock Cafe", amenity: "cafe", opening_hours: "Mo-Su 08:00-20:00" } },
      { type: "node", id: 2, lat: 1.002, lon: 1.002,
        tags: { name: "Mock Fort", historic: "castle" } }]),
    wikivoyage: () => f("wikivoyage") ? wait(new Error("mock timeout")) : f("wvnone") ? wait(null) : wait({
      title: "Mockville",
      wikitext: "Intro line.\n==See==\n* {{see|name=Mock Fort|lat=1.002|long=1.002|content=An invented fort.}}\n" }),
    wikivoyageSearch: () => wait([]),
    getWeather: () => live(f("weather") ? null : { now: { temp: 20 }, hours: [], today: {},
                                                  tzOffsetSeconds: o.tzSeconds }),
    getAir: () => live(null),
    getCountry: () => live(null),
    getTransit: () => live([]),
    getPhotos: () => live([]),
    attachPhotos: async () => {},
  };
}
if (typeof module !== "undefined") module.exports = { mockSources };
