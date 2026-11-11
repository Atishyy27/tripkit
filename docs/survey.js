/* The one-question survey from gtm/08-vision.md (DEF-3, usefulness).

   Asked once, after the first stop a person marks done, because that is the
   first moment they have actually used a plan. One tap answers it; a "not
   really" opens an optional "what was missing?" line. Dismissing counts as an
   answer, so nobody is asked twice.

   Nothing leaves the device. The answer and the free text sit in localStorage.
   The only outbound call is the existing cookieless counter, track() in app.js,
   which is off unless ANALYTICS is set and then sends just "/survey/yes" or
   "/survey/no", never the text. */
const SURVEY_KEY = "tripkit.survey";

function surveyRead() {
  try { return JSON.parse(localStorage.getItem(SURVEY_KEY) || "null"); } catch (e) { return null; }
}
function surveyWrite(rec) {
  try { localStorage.setItem(SURVEY_KEY, JSON.stringify(rec)); } catch (e) { /* full or blocked: it just may ask again */ }
}

/* Pure, so the show-once rule can be tested without a page. */
function surveyShouldShow(rec, doneCount) {
  return !rec && doneCount >= 1;
}

function surveyAsk() {
  if (typeof document === "undefined" || !document.body || document.getElementById("tkSurvey")) return;
  const box = document.createElement("div");
  box.id = "tkSurvey";
  box.className = "card";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "One question");
  box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;max-width:420px;margin:0 auto;z-index:950";

  const q = document.createElement("p");
  q.style.margin = "0 0 10px";
  q.textContent = "Did tripkit help with this day?";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center";
  box.append(q, row);

  const mk = (label, fn) => {
    const b = document.createElement("button");
    b.className = "btn"; b.type = "button"; b.textContent = label; b.onclick = fn;
    row.append(b); return b;
  };
  const finish = (answer, note) => {
    surveyWrite({ answer, note: note || "", at: new Date().toISOString() });
    if (answer === "yes" || answer === "no") { try { track("/survey/" + answer); } catch (e) {} }
    box.remove();
  };

  mk("Yes", () => finish("yes"));
  mk("Not really", () => {
    row.textContent = "";
    q.textContent = "What was missing? (optional, stays on this device)";
    const inp = document.createElement("input");
    inp.type = "text"; inp.maxLength = 200; inp.setAttribute("aria-label", "What was missing");
    inp.style.cssText = "flex:1 1 160px;min-width:0";
    row.append(inp);
    mk("Send", () => finish("no", inp.value.trim()));
    inp.focus();
  });
  mk("✕", () => finish("dismissed")).setAttribute("aria-label", "dismiss");
  document.body.append(box);
}

const tkSurvey = {
  maybe(doneCount) {
    if (surveyShouldShow(surveyRead(), doneCount)) surveyAsk();
  },
};
