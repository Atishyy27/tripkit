/* A test harness small enough to read in one sitting.
   No dependencies, because a test suite that needs an install is a test suite
   people skip. */
const path = require("path");
const fs = require("fs");

let suite = "", pass = 0, fail = 0, skipped = 0;
const failures = [];
const only = process.argv.slice(2).find(a => !a.startsWith("-"));

function describe(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) { skipped++; return; }
  suite = name;
  console.log("\n  " + name);
  fn();
}

function it(what, fn) {
  try {
    fn();
    pass++;
    console.log("    \x1b[32m✓\x1b[0m " + what);
  } catch (e) {
    fail++;
    failures.push({ suite, what, err: e });
    console.log("    \x1b[31m✗\x1b[0m " + what);
    console.log("      \x1b[2m" + String(e.message).split("\n").join("\n      ") + "\x1b[0m");
  }
}

/* Assertions carry the actual and expected values in the message. A failure that
   only says "assertion failed" costs a debugging session to reproduce. */
function eq(actual, expected, note) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${note ? note + "\n" : ""}expected: ${e}\n     got: ${a}`);
}
function ok(v, note) { if (!v) throw new Error(note || `expected truthy, got ${JSON.stringify(v)}`); }
function no(v, note) { if (v) throw new Error(note || `expected falsy, got ${JSON.stringify(v)}`); }
function near(actual, expected, tol, note) {
  if (Math.abs(actual - expected) > tol)
    throw new Error(`${note ? note + "\n" : ""}expected ${expected} +/- ${tol}, got ${actual}`);
}
function throws(fn, matching, note) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (!threw) throw new Error(note || "expected this to throw, it did not");
  if (matching && !String(threw.message).toLowerCase().includes(String(matching).toLowerCase()))
    throw new Error(`threw, but message did not contain ${JSON.stringify(matching)}\n  got: ${threw.message}`);
}

function report() {
  console.log("");
  if (fail) {
    console.log(`  \x1b[31m${fail} failed\x1b[0m, ${pass} passed`);
    process.exitCode = 1;
  } else {
    console.log(`  \x1b[32mall ${pass} passed\x1b[0m` + (skipped ? ` (${skipped} suites skipped by filter)` : ""));
  }
  console.log("");
}

/* load a browser script into this scope the way a <script> tag would */
function loadScripts(dir, names) {
  const src = names.map(n => fs.readFileSync(path.join(dir, n), "utf8")).join("\n;\n");
  return src;
}

module.exports = { describe, it, eq, ok, no, near, throws, report, loadScripts };
