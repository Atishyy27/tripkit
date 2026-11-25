/* The timezone comes from the weather answer, with the country table as the
   fallback. */

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

