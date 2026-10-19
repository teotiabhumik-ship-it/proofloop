# ProofLoop

ProofLoop is an evidence-backed decision workspace for AI recommendations. It makes the recommendation inspectable by keeping the question, criteria, evidence, assumptions, and source conflicts visible in one place.

## Demo

The included demo compares three laptops for a software developer:

- Framework Laptop 13
- Lenovo ThinkPad X1 Carbon Gen 12
- ASUS Zenbook 14 OLED

The recommendation starts with the ASUS Zenbook 14 OLED. Open **New brief** and switch to **Traveling engineer** to make battery life and portability more important; the recommendation changes to the ThinkPad X1 Carbon Gen 12.

## Run locally

This is a dependency-free static app. Node.js 20.19.5 is the pinned test
runtime in `.nvmrc`; Python 3 is used only to serve the static files. From the
repository root, run:

```bash
npm ci
npm test
python3 -m http.server 4173
```

Then open [http://localhost:4173](http://localhost:4173).

The canonical test command is `npm test`; it is fully offline and uses Node's
built-in test runner. If GNU Make is available, the same check can be run with
`make test`.

## Demo flow

1. Start with the recommendation card.
2. Open **New brief** and choose a different persona.
3. Drag a criterion slider to show deterministic recalculation.
4. Click a product score row to inspect that product's evidence.
5. Open **Conflicts** to show the manufacturer-vs-independent battery disagreement.
6. Use **Add evidence** to paste a local source quote.
7. Use **Export** to download a Markdown decision report.
8. Refresh the page to see the active brief, weights, selected evidence, and user-added sources restored locally. **Reset** clears that saved workspace and returns to the demo state.

## Project structure

- `index.html` — application shell and accessible modal forms
- `styles.css` — responsive visual system
- `data.js` — curated demo data, sources, conflicts, assumptions, and brief presets
- `app.js` — scoring, rendering, evidence intake, source removal, and report export
- `test/core.test.js` — offline regression coverage for scoring, personas, persistence, reset, reports, and data references
- `Dockerfile` — reproducible container image that runs the tests and serves the app

The workspace uses browser `localStorage` only. No credentials, network data, or private content is sent anywhere.

## Container deployment

Build and run the reproducible static server with Docker:

```bash
docker build -t proofloop .
docker run --rm -p 4173:4173 proofloop
```

The image runs `npm test` during the build, then serves the app on port 4173.

## Scope and limitations

The first build intentionally uses a curated local dataset so the demo is reliable and reproducible. User-added evidence is labeled as unverified and does not affect scoring. Live web retrieval, LLM extraction, and production persistence are the next backend steps; the UI is structured so those capabilities can be added without changing the core evidence model.
