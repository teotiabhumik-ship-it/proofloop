const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createServer, MAX_BODY_BYTES } = require('../server.js');

const projectRoot = path.resolve(__dirname, '..');

async function withServer(callback, serverOptions = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofloop-test-'));
  const server = createServer(Object.assign({ rootDir: projectRoot, dataDir }, serverOptions));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function request(baseUrl, pathname, options) {
  const response = await fetch(baseUrl + pathname, options);
  const body = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body };
}

async function rawRequest(baseUrl, rawPath) {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: rawPath, method: 'GET' }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ response, body: response.headers['content-type']?.includes('application/json') ? JSON.parse(text) : text });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function jsonOptions(body, method = 'POST') {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}

test('health and catalog endpoints expose deterministic service data', async () => {
  await withServer(async (baseUrl) => {
    const health = await request(baseUrl, '/api/health');
    assert.equal(health.response.status, 200);
    assert.deepEqual(health.body, {
      ok: true,
      service: 'proofloop',
      apiVersion: '1',
      dataVersion: '1.0.0'
    });
    assert.match(health.response.headers.get('content-type'), /application\/json/);
    assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(health.response.headers.get('x-request-id'));

    const ready = await request(baseUrl, '/api/ready');
    assert.equal(ready.response.status, 200);
    assert.equal(ready.body.persistence, 'ready');

    const catalog = await request(baseUrl, '/api/v1/catalog');
    assert.equal(catalog.response.status, 200);
    assert.equal(catalog.body.schemaVersion, 1);
    assert.equal(catalog.body.products.length, 3);
    assert.equal(catalog.body.briefs.length, 3);
    assert.equal(catalog.body.sources.length, 9);
  });
});

test('write APIs enforce a bounded per-client rate limit', async () => {
  await withServer(async (baseUrl) => {
    const first = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({}));
    const second = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({}));
    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 429);
    assert.equal(second.body.error.code, 'RATE_LIMITED');
    assert.ok(Number(second.response.headers.get('retry-after')) >= 1);
  }, { rateLimitMax: 1, rateLimitWindowMs: 1000 });
});

test('decision preview returns default and traveler recommendations', async () => {
  await withServer(async (baseUrl) => {
    const defaultPreview = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({}));
    assert.equal(defaultPreview.response.status, 200);
    assert.equal(defaultPreview.body.recommendation.productId, 'asus-zenbook-14-oled');
    assert.equal(defaultPreview.body.recommendation.score, 89.6);
    assert.equal(defaultPreview.body.sensitivity.winnerId, 'asus-zenbook-14-oled');

    const travelerPreview = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({ briefId: 'traveler' }));
    assert.equal(travelerPreview.response.status, 200);
    assert.equal(travelerPreview.body.recommendation.productId, 'thinkpad-x1-carbon-gen12');
  });
});

test('decision preview accepts explicit battery-only weights', async () => {
  await withServer(async (baseUrl) => {
    const weights = { price: 0, performance: 0, battery: 1, portability: 0, display: 0 };
    const result = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({ weights }));

    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.ranking.map((entry) => entry.score), [88, 81, 78]);
    assert.deepEqual(result.body.weights, weights);
  });
});

test('decision report returns a reproducible markdown artifact', async () => {
  await withServer(async (baseUrl) => {
    const first = await request(baseUrl, '/api/v1/decision/report', jsonOptions({ briefId: 'traveler' }));
    const second = await request(baseUrl, '/api/v1/decision/report', jsonOptions({ briefId: 'traveler' }));

    assert.equal(first.response.status, 200);
    assert.equal(first.body.format, 'markdown');
    assert.equal(first.body.filename, 'proofloop-decision-report.md');
    assert.match(first.body.markdown, /# ProofLoop decision report/);
    assert.match(first.body.markdown, /Lenovo ThinkPad X1 Carbon Gen 12/);
    assert.equal(first.body.markdown, second.body.markdown);
  });
});

test('research fetch endpoint extracts safe HTML through an injected offline adapter', async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get(name) { return name === 'content-type' ? 'text/html' : null; } },
    text: async () => '<html><head><title>Test source</title></head><body><script>bad()</script><p>Battery lasted eleven hours.</p></body></html>'
  });
  const fakeLookup = async () => [{ address: '93.184.216.34', family: 4 }];
  await withServer(async (baseUrl) => {
    const result = await request(baseUrl, '/api/v1/research/fetch', jsonOptions({ url: 'https://example.com/review' }));
    assert.equal(result.response.status, 200);
    assert.equal(result.body.source.title, 'Test source');
    assert.match(result.body.source.text, /Battery lasted eleven hours/);
    assert.doesNotMatch(result.body.source.text, /bad/);
  }, { fetchImpl: fakeFetch, lookupImpl: fakeLookup });
});

test('research fetch rejects private targets', async () => {
  await withServer(async (baseUrl) => {
    const result = await request(baseUrl, '/api/v1/research/fetch', jsonOptions({ url: 'http://localhost:8080/admin' }));
    assert.equal(result.response.status, 422);
    assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  });
});

test('claims extraction uses the configured provider without exposing its key', async () => {
  const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ claims: [{ criterionId: 'battery', value: 11, unit: 'hours', stance: 'independent-measurement', confidence: 0.9, quote: 'The test lasted 11 hours.' }] }) } }] })
    };
  };
  await withServer(async (baseUrl) => {
    const result = await request(baseUrl, '/api/v1/research/extract', jsonOptions({ text: 'The test lasted 11 hours.' }));
    assert.equal(result.response.status, 200);
    assert.equal(result.body.extraction.claims[0].criterionId, 'battery');
    assert.equal(result.body.extraction.claims[0].confidence, 0.9);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer test-secret');
    assert.doesNotMatch(JSON.stringify(result.body), /test-secret/);
  }, { env: { PROOFLOOP_LLM_ENDPOINT: 'https://llm.example.test/v1/chat/completions', PROOFLOOP_LLM_API_KEY: 'test-secret', PROOFLOOP_LLM_MODEL: 'test-model' }, fetchImpl: fakeFetch });
});

test('claims extraction reports when no provider is configured', async () => {
  await withServer(async (baseUrl) => {
    const result = await request(baseUrl, '/api/v1/research/extract', jsonOptions({ text: 'Battery lasted 11 hours.' }));
    assert.equal(result.response.status, 503);
    assert.equal(result.body.error.code, 'NOT_CONFIGURED');
  }, { env: {} });
});

test('all-zero preview is safe and does not fabricate a recommendation', async () => {
  await withServer(async (baseUrl) => {
    const weights = { price: 0, performance: 0, battery: 0, portability: 0, display: 0 };
    const result = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({ weights }));

    assert.equal(result.response.status, 200);
    assert.equal(result.body.recommendation, null);
    assert.equal(result.body.sensitivity.active, false);
    assert.deepEqual(result.body.ranking.map((entry) => entry.score), [0, 0, 0]);
  });
});

test('workspace and evidence APIs persist and read back state', async () => {
  await withServer(async (baseUrl) => {
    const workspaceId = 'demo-workspace';
    const saved = await request(baseUrl, `/api/v1/workspaces/${workspaceId}`, jsonOptions({
      briefId: 'traveler',
      weights: { price: 0.1, performance: 0.2, battery: 0.4, portability: 0.25, display: 0.05 },
      activeTab: 'conflicts',
      selectedProductId: 'thinkpad-x1-carbon-gen12',
      selectedSourceId: 'notebookcheck-x1-carbon'
    }, 'PUT'));
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.workspace.briefId, 'traveler');
    assert.equal(saved.body.workspace.activeTab, 'conflicts');

    const read = await request(baseUrl, `/api/v1/workspaces/${workspaceId}`);
    assert.equal(read.response.status, 200);
    assert.equal(read.body.workspace.weights.battery, 0.4);

    const invalidSource = await request(baseUrl, `/api/v1/workspaces/${workspaceId}/sources`, jsonOptions({
      productId: 'thinkpad-x1-carbon-gen12', title: 'Bad URL', publisher: 'Notes', quote: 'x', url: 'file:///secret'
    }));
    assert.equal(invalidSource.response.status, 422);

    const source = await request(baseUrl, `/api/v1/workspaces/${workspaceId}/sources`, jsonOptions({
      id: 'user-source-test-1',
      productId: 'thinkpad-x1-carbon-gen12',
      title: 'My travel test',
      publisher: 'Local notes',
      quote: 'The keyboard remained comfortable on a long flight.',
      url: 'https://example.com/test'
    }));
    assert.equal(source.response.status, 201);
    assert.equal(source.body.source.id, 'user-source-test-1');

    const withSource = await request(baseUrl, `/api/v1/workspaces/${workspaceId}`);
    assert.equal(withSource.body.workspace.userSources.length, 1);

    const removed = await request(baseUrl, `/api/v1/workspaces/${workspaceId}/sources/user-source-test-1`, { method: 'DELETE' });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.body.workspace.userSources.length, 0);
  });
});

test('preview validates content type, fields, and weight boundaries', async () => {
  await withServer(async (baseUrl) => {
    const noContentType = await request(baseUrl, '/api/v1/decision/preview', { method: 'POST', body: '{}' });
    assert.equal(noContentType.response.status, 415);
    assert.equal(noContentType.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');

    const unknownBrief = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({ briefId: 'missing' }));
    assert.equal(unknownBrief.response.status, 422);
    assert.equal(unknownBrief.body.error.code, 'UNKNOWN_BRIEF');

    const invalidWeights = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({
      weights: { price: 0, performance: 0, battery: 2, portability: 0, display: 0 }
    }));
    assert.equal(invalidWeights.response.status, 422);
    assert.equal(invalidWeights.body.error.code, 'VALIDATION_ERROR');
    assert.equal(invalidWeights.body.error.details[0].code, 'OUT_OF_RANGE');

    const missingWeight = await request(baseUrl, '/api/v1/decision/preview', jsonOptions({ weights: { price: 1 } }));
    assert.equal(missingWeight.response.status, 422);
    assert.ok(missingWeight.body.error.details.some((detail) => detail.code === 'MISSING_FIELD'));
  });
});

test('routing handles methods, unknown paths, malformed JSON, and oversized bodies', async () => {
  await withServer(async (baseUrl) => {
    const method = await request(baseUrl, '/api/health', { method: 'POST' });
    assert.equal(method.response.status, 405);
    assert.equal(method.response.headers.get('allow'), 'GET');

    const unknown = await request(baseUrl, '/api/v1/missing');
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.body.error.code, 'NOT_FOUND');

    const malformed = await request(baseUrl, '/api/v1/decision/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');

    const oversized = await request(baseUrl, '/api/v1/decision/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(MAX_BODY_BYTES) })
    });
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.body.error.code, 'BODY_TOO_LARGE');
  });
});

test('the same server serves the app and rejects traversal', async () => {
  await withServer(async (baseUrl) => {
    const home = await request(baseUrl, '/');
    assert.equal(home.response.status, 200);
    assert.match(home.body, /ProofLoop/);

    const script = await request(baseUrl, '/app.js');
    assert.equal(script.response.status, 200);
    assert.match(script.body, /calculateSensitivity/);

    const traversal = await rawRequest(baseUrl, '/%2e%2e/%2e%2e/package.json');
    assert.equal(traversal.response.statusCode, 404);
  });
});
