/* The in-app survey asks once. These pin that rule, since a survey that nags is
   worse than no survey. The DOM part is not exercised here; the shim document has
   no body to mount into. */

describe("survey: show once", () => {
  it("does not show before any stop is done", () => {
    no(surveyShouldShow(null, 0));
  });
  it("shows after the first done stop when never answered", () => {
    ok(surveyShouldShow(null, 1));
  });
  it("never shows again once any record exists, answered or dismissed", () => {
    for (const answer of ["yes", "no", "dismissed"])
      no(surveyShouldShow({ answer, note: "", at: "2026-11-11T00:00:00Z" }, 3));
  });
  it("maybe() with no done stops asks nothing and stores nothing", () => {
    localStorage.setItem(SURVEY_KEY, "");
    tkSurvey.maybe(0);
    eq(surveyRead(), null);
  });
  it("reads a corrupt record as unanswered rather than throwing", () => {
    localStorage.setItem(SURVEY_KEY, "{not json");
    eq(surveyRead(), null);
  });
  it("round-trips a record", () => {
    surveyWrite({ answer: "yes", note: "", at: "x" });
    eq(surveyRead().answer, "yes");
    no(surveyShouldShow(surveyRead(), 5));
  });
});
