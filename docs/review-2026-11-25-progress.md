# progress log, 25 Nov 2026
- setup: fetched origin, worktree on review/2026-11-25 from origin/main 4813f2d
- study: read README, ci.yml, traffic-snapshot.yml, app.js boot/search/build/open, sources.js overpass and weather, engine.js clock use; handout at cnc/work/arch/tripkit.md
- product pass: first-run path walked from code, findings F1 to F5, four references
- plan: docs/review-2026-11-25.md written, top 3 chosen; stopped at the plan gate, no code
- build: cherry-picked finding-6 and survey branches (-x), tz from weather, parallel sources, ci trigger for review/**; CI run 45681859602 all 7 jobs green, 247 node tests, 179 browser, 29 now-dom; shots and timing committed
- review round 1: started
- review round 1 (fresh reviewer, product and code lenses): 4 findings fixed in one commit: survey card lifted above the nav and theme toggle; a typed, saved or shared offset is never replaced by the weather offset (box compared with the filled-in guess); a saved offset kept on opening a cached trip; todayISO uses the 04:00 rollover. Not fixed: survey still appears at the moment of a done tap (a timing choice for him)
