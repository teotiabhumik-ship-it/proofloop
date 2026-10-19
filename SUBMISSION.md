# ProofLoop submission brief

## One-line pitch

ProofLoop makes AI recommendations show their work by connecting a deterministic
decision engine to inspectable evidence, assumptions, conflicts, and sensitivity
analysis.

## The demo story

The demo answers:

> Which laptop under $1,500 is the best fit for a software developer?

Start with the ASUS Zenbook 14 OLED recommendation. Then:

1. Open **New brief** and switch to **Traveling engineer**.
2. Show the recommendation changing to the ThinkPad X1 Carbon Gen 12.
3. Drag the battery or portability slider.
4. Point to **How stable is this pick?** and show the crossover threshold.
5. Click a shortlist row to inspect supporting evidence.
6. Open **Conflicts** to show vendor claims versus independent testing.
7. Add a local source quote and show it marked as user-provided.
8. Click **Export** to download the decision report.

## What is implemented

- Vanilla browser workspace with no frontend framework or runtime dependency.
- Deterministic weighted recommendation scoring.
- Persona presets for different decision contexts.
- One-factor recommendation sensitivity analysis.
- Evidence, assumptions, and conflict audit views.
- Browser-local fallback for offline or direct-file use.
- Node HTTP server serving the UI and APIs from one origin.
- File-backed workspaces and user evidence with atomic writes.
- Catalog, decision preview, decision report, workspace, source, research fetch,
  and optional LLM claim-extraction APIs.
- SSRF-aware source retrieval with content and size limits.
- Security response headers and request IDs.
- Dockerfile, pinned Node runtime, lockfile, and offline regression suite.

## Fast start

```bash
npm ci
npm test
npm start
```

Open <http://localhost:4173>.

## API proof points

```bash
curl http://localhost:4173/api/health

curl -X POST http://localhost:4173/api/v1/decision/preview \
  -H 'Content-Type: application/json' \
  -d '{"briefId":"traveler"}'

curl -X POST http://localhost:4173/api/v1/decision/report \
  -H 'Content-Type: application/json' \
  -d '{"briefId":"developer"}'
```

## Reproducibility

- Runtime: Node `20.19.5` from `.nvmrc`.
- Dependencies: none beyond Node built-ins.
- Test command: `npm test`.
- Persistent data: `.data/workspaces.json` or `PROOFLOOP_DATA_DIR`.
- Container command: `docker build -t proofloop .` followed by
  `docker run --rm -p 4173:4173 -v proofloop-data:/app/.data proofloop`.

## Honest boundaries

The curated laptop dataset is intentionally local for a reliable submission.
Research retrieval is available as a constrained API, while LLM extraction is
optional and requires server-side provider configuration. Authentication and a
production database are intentionally not faked in the demo.
