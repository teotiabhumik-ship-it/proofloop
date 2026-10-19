const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { createServer, MAX_BODY_BYTES } = require('../server.js');

const projectRoot = path.resolve(__dirname, '..');

async function withServer(callback) {
  const server = createServer({ rootDir: projectRoot });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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

    const catalog = await request(baseUrl, '/api/v1/catalog');
    assert.equal(catalog.response.status, 200);
    assert.equal(catalog.body.schemaVersion, 1);
    assert.equal(catalog.body.products.length, 3);
    assert.equal(catalog.body.briefs.length, 3);
    assert.equal(catalog.body.sources.length, 9);
  });
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
