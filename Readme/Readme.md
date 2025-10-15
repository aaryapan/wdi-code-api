# WDI Assistants API

Minimal API for WDI's internal coding platform using **OpenAI Assistants**.

## Endpoints
- `POST /api/save_project` → returns `{ ok, projectId }`
- `POST /api/make_plan` → calls Planner Assistant → returns `{ proposedPrompt, inScope, outOfScope, assumptions, acceptanceCriteria, questions, steps }`
- `POST /api/run_step` → server-guarded; calls Builder Assistant → returns `{ status: "passed" | "continue", zipUrl?, addedStep?, validatorSummary, githubPrUrl? }`

## Env Vars (set in Vercel Project → Settings → Environment Variables)
- `OPENAI_API_KEY`
- `PLANNER_ASSISTANT_ID`
- `BUILDER_ASSISTANT_ID`
- `GUARD_WORD` → e.g. `Ok WDI Code Now`

> The UI must only call these endpoints. Do not put secrets in the UI.

