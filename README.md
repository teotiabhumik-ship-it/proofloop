# ProofLoop

For the short demo script, architecture summary, API proof points, and honest
submission boundaries, see [`SUBMISSION.md`](SUBMISSION.md).

ProofLoop is an evidence-backed decision workspace for AI recommendations. It makes the recommendation inspectable by keeping the question, criteria, evidence, assumptions, and source conflicts visible in one place.

## Demo

The included demo compares three laptops for a software developer:

- Framework Laptop 13
- Lenovo ThinkPad X1 Carbon Gen 12
- ASUS Zenbook 14 OLED

The recommendation starts with the ASUS Zenbook 14 OLED. Open **New brief** and switch to **Traveling engineer** to make battery life and portability more important; the recommendation changes to the ThinkPad X1 Carbon Gen 12.

## Run locally

This is a dependency-free Node app. Node.js 20.19.5 is the pinned runtime in
`.nvmrc`. The Node server serves both the browser app and the same-origin API.
From the repository root, run:

```bash
npm ci
npm test
npm start
```

Then open [http://localhost:4173](http://localhost:4173).

The canonical test command is `npm test`; it is fully offline and uses Node's
built-in test runner. If GNU Make is available, the same check can be run with
`make test`.

## Demo flow

1. Start with the recommendation card.
2. Open **New brief** and choose a different persona.
3. Drag a criterion slider to show deterministic recalculation.
4. Read **How stable is this pick?** to see which priority changes could flip the recommendation.
5. Click a product score row to inspect that product's evidence.
6. Open **Conflicts** to show the manufacturer-vs-independent battery disagreement.
7. Use **Add evidence** to paste a local source quote.
8. Use **Export** to download a Markdown decision report.
9. Refresh the page to see the active brief, weights, selected evidence, and user-added sources restored locally. **Reset** clears that saved workspace and returns to the demo state.

## Project structure

- `index.html` — application shell and accessible modal forms
- `styles.css` — responsive visual system
- `data.js` — curated demo data, sources, conflicts, assumptions, and brief presets
- `app.js` — scoring, sensitivity analysis, rendering, evidence intake, source removal, and report export
- `server.js` — dependency-free HTTP server, API routing, validation, and static serving
- `lib/decision.js` — server-side scoring, sensitivity, catalog validation, and preview composition
- `lib/workspaces.js` — atomic file-backed workspace persistence
- `lib/research.js` — constrained HTML/plain-text retrieval and sanitization
- `test/core.test.js` — offline regression coverage for scoring, personas, persistence, reset, reports, and data references
- `test/api.test.js` — offline HTTP/API, validation, routing, and static-serving coverage
- `Dockerfile` — reproducible container image that runs the tests and serves the app

The workspace persists controls in browser `localStorage` and mirrors the
workspace plus user-added evidence to the optional local server when available.
No credentials are sent to the browser or stored in the workspace file.

## Container deployment

Build and run the reproducible static server with Docker:

```bash
docker build -t proofloop .
docker run --rm -p 4173:4173 proofloop
```

The image runs `npm test` during the build, then serves the app on port 4173.

## API

The first backend slice is stateless and uses the curated dataset already in
the demo:

- `GET /api/health` — readiness and data version
- `GET /api/ready` — readiness including writable persistence
- `GET /api/v1/catalog` — criteria, products, sources, conflicts, assumptions, and briefs
- `POST /api/v1/decision/preview` — deterministic recommendation preview
- `POST /api/v1/decision/report` — deterministic Markdown decision report
- `GET /api/v1/workspaces/:workspaceId` — read a persisted workspace
- `PUT /api/v1/workspaces/:workspaceId` — create or replace workspace state
- `POST /api/v1/workspaces/:workspaceId/sources` — persist user-provided evidence
- `DELETE /api/v1/workspaces/:workspaceId/sources/:sourceId` — remove user-provided evidence
- `POST /api/v1/research/fetch` — fetch and sanitize an HTML/plain-text source
- `POST /api/v1/research/extract` — extract criterion claims through an optional OpenAI-compatible LLM

Example preview request:

```bash
curl -X POST http://localhost:4173/api/v1/decision/preview \
  -H 'Content-Type: application/json' \
  -d '{"briefId":"traveler"}'
```

The preview API does not persist data, make network calls, authenticate users,
or accept user evidence. Invalid JSON, unknown briefs/criteria, missing
weights, unsupported methods, oversized bodies, and unsupported content types
return stable JSON error envelopes.

The report endpoint accepts the same JSON body as the preview endpoint and
returns a JSON envelope containing a Markdown string and filename. The browser
uses it for exports when no local user-provided sources need to be included;
otherwise it keeps the local export so pasted evidence is not lost.

Workspace state is stored in `.data/workspaces.json` by default. Writes use a
temporary file and atomic rename, and `.data/` is ignored by Git. Set
`PROOFLOOP_DATA_DIR` to use another writable data directory in a deployment.

The server also emits request IDs and security headers, caps request bodies and
headers, supports graceful shutdown, and applies a per-client write rate limit.
Configure the limiter with `PROOFLOOP_RATE_LIMIT_WINDOW_MS` and
`PROOFLOOP_RATE_LIMIT_MAX`.

Research fetch accepts `{ "url": "https://example.com/article" }`, blocks
embedded credentials and private/loopback targets, rejects non-text content,
limits responses to 1 MiB, applies a 10-second timeout, and returns cleaned
text plus title and publisher metadata. It does not call an LLM or change the
catalog automatically.

Claims extraction accepts `{ "text": "..." }`. Configure an OpenAI-compatible
provider with `PROOFLOOP_LLM_ENDPOINT`, `PROOFLOOP_LLM_API_KEY`, and
`PROOFLOOP_LLM_MODEL`. The key is read only on the server and is never sent to
the browser. Without configuration, the endpoint returns `503 NOT_CONFIGURED`.

When the app is opened through `npm start`, the browser renders its local
calculation immediately and then synchronizes the recommendation and
sensitivity view with the API. If the API is unavailable, the UI stays usable
and falls back to the local calculation. Opening `index.html` directly keeps
the app in local-only mode.

## Scope and limitations

The submission intentionally uses a curated local dataset so the demo is
reliable and reproducible. Retrieved and user-provided evidence is labeled and
kept separate from scoring unless explicitly promoted into the catalog. The
optional LLM extractor requires a configured OpenAI-compatible provider. User
authentication, multi-user authorization, and production database migration
are deployment follow-ups rather than hidden assumptions in this demo.
