/* Concatenate the shipped browser scripts and the test body into one script and
   run it, the way a page loads a series of <script> tags. Doing it any other way
   puts the engine's top-level declarations inside an eval scope where the tests
   cannot see them. */
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const DOCS = path.join(ROOT, "docs");

const shims = `
global.localStorage = { _d: {}, getItem(k) { return this._d[k] == null ? null : this._d[k]; },
                        setItem(k, v) { this._d[k] = String(v); } };
global.document = { querySelector: () => null, querySelectorAll: () => [],
                    body: { insertAdjacentHTML() {} }, getElementById: () => null };
const H = require(${JSON.stringify(path.join(__dirname, "harness.js"))});
const { describe, it, eq, ok, no, near, throws, report } = H;
// the concatenated file lives in a temp dir, so hand it the real paths
const DOCS_DIR = ${JSON.stringify(DOCS)};
`;

const sources = ["sun.js", "sources.js", "engine.js"]
  .map(f => fs.readFileSync(path.join(DOCS, f), "utf8"))
  .join("\n;\n")
  .replace(/if \(typeof module !== "undefined"\) module\.exports = \{ sunTimes \};/, "");

// spec.js ends with report(), so anything after it must run before that. Load the
// security suite first and let spec.js close the run.
const security = fs.readFileSync(path.join(__dirname, "security.js"), "utf8");
const regressions = fs.readFileSync(path.join(__dirname, "regressions.js"), "utf8");
// the security suite checks app.js itself, so it has to be loaded too
const appSrc = fs.readFileSync(path.join(DOCS, "app.js"), "utf8")
  .replace(/window\.addEventListener\("DOMContentLoaded"[\s\S]*?\n\}\);\s*$/, "");
const body = fs.readFileSync(path.join(__dirname, "spec.js"), "utf8");

const out = path.join(os.tmpdir(), "tripkit-js-tests-" + process.pid + ".js");
fs.writeFileSync(out, [shims, sources, appSrc, security, regressions, body].join("\n;\n"));
try {
  execFileSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: "inherit" });
} catch (e) {
  process.exitCode = e.status || 1;
} finally {
  fs.unlinkSync(out);
}
