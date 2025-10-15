# WDI Code API

Three endpoints for the WDI coding platform:

- POST `/api/save_project` — save project + files (MVP: acknowledge + projectId)
- POST `/api/make_plan` — PRE (re-engineer prompt, return steps 1..N)
- POST `/api/run_step` — guarded codegen for a single step, ≤600 lines, returns ZIP + status

**Guard word:** `Ok WDI Code Now`
