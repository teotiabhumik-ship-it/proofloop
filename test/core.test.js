const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const dataSource = fs.readFileSync(path.join(projectRoot, 'data.js'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'app.js'), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function loadWorkspace(localStorage) {
  const document = {
    readyState: 'complete',
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const context = {
    console,
    Date,
    Intl,
    document,
    localStorage,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.runInNewContext(dataSource, context, { filename: 'data.js' });
  vm.runInNewContext(appSource, context, { filename: 'app.js' });
  return { api: context.ProofLoop, data: context.PROOFLOOP_DATA };
}

function scoreOrder(state) {
  return Array.from(state.scores, (entry) => entry.productId);
}

test('default brief ranks the Zenbook first', () => {
  const { api } = loadWorkspace(createStorage());
  const state = api.getState();

  assert.equal(state.briefId, 'developer');
  assert.equal(state.scores[0].productId, 'asus-zenbook-14-oled');
  assert.equal(state.scores[0].score, 89.6);
  assert.equal(state.scores.length, 3);
});

test('traveler brief prioritizes the lightest, longest-lasting laptop', () => {
  const { api } = loadWorkspace(createStorage());

  api.setBrief('traveler');

  const state = api.getState();
  assert.equal(state.briefId, 'traveler');
  assert.equal(state.scores[0].productId, 'thinkpad-x1-carbon-gen12');
  assert.deepEqual(scoreOrder(state), [
    'thinkpad-x1-carbon-gen12',
    'asus-zenbook-14-oled',
    'framework-laptop-13'
  ]);
});

test('default sensitivity reports the battery and portability crossover points', () => {
  const { api } = loadWorkspace(createStorage());
  const analysis = api.calculateSensitivity();
  const byId = Object.fromEntries(Array.from(analysis.criteria, (item) => [item.id, item]));

  assert.equal(analysis.winnerId, 'asus-zenbook-14-oled');
  assert.equal(analysis.winnerScore, 89.6);
  assert.equal(analysis.scoreGap, 5.7);
  assert.equal(byId.battery.changeAt, 59);
  assert.equal(byId.battery.challengerId, 'thinkpad-x1-carbon-gen12');
  assert.equal(byId.portability.changeAt, 51);
  assert.equal(byId.performance.changeAt, null);
});

test('sensitivity uses the active persona and does not mutate weights', () => {
  const { api } = loadWorkspace(createStorage());
  api.setBrief('traveler');
  const before = JSON.parse(JSON.stringify(api.getState().weights));
  const analysis = api.calculateSensitivity();

  assert.equal(analysis.winnerId, 'thinkpad-x1-carbon-gen12');
  assert.equal(analysis.criteria.find((item) => item.id === 'battery').changeAt, 37);
  assert.deepEqual(JSON.parse(JSON.stringify(api.getState().weights)), before);
});

test('all-zero weights return an inactive sensitivity result', () => {
  const { api } = loadWorkspace(createStorage());
  ['price', 'performance', 'battery', 'portability', 'display'].forEach((criterionId) => api.setWeight(criterionId, 0));

  const analysis = api.calculateSensitivity();
  assert.equal(analysis.active, false);
  assert.equal(analysis.winnerId, null);
  assert.ok(Array.from(analysis.criteria).every((item) => item.changeAt === null));
});

test('weight changes recalculate normalized scores', () => {
  const { api } = loadWorkspace(createStorage());

  api.setWeight('price', 0);
  api.setWeight('performance', 0);
  api.setWeight('portability', 0);
  api.setWeight('display', 0);
  api.setWeight('battery', 100);

  const state = api.getState();
  assert.equal(state.weights.battery, 1);
  assert.deepEqual(scoreOrder(state), [
    'thinkpad-x1-carbon-gen12',
    'asus-zenbook-14-oled',
    'framework-laptop-13'
  ]);
  assert.deepEqual(Array.from(state.scores, (entry) => entry.score), [88, 81, 78]);

  api.setWeight('battery', 0);
  api.setWeight('price', 0);
  api.setWeight('performance', 0);
  api.setWeight('portability', 0);
  api.setWeight('display', 0);
  assert.deepEqual(Array.from(api.getState().scores, (entry) => entry.score), [0, 0, 0]);
});

test('workspace state is persisted and restored', () => {
  const storage = createStorage();
  const first = loadWorkspace(storage).api;

  first.setBrief('creative-coder');
  first.setWeight('display', 80);
  const savedState = first.getState();

  const second = loadWorkspace(storage).api;
  const restoredState = second.getState();
  assert.equal(restoredState.briefId, 'creative-coder');
  assert.equal(restoredState.weights.display, 0.8);
  assert.deepEqual(JSON.parse(JSON.stringify(restoredState.scores)), JSON.parse(JSON.stringify(savedState.scores)));
});

test('reset returns the workspace to the demo defaults', () => {
  const { api } = loadWorkspace(createStorage());

  api.setBrief('traveler');
  api.setWeight('battery', 100);
  api.reset();

  const state = api.getState();
  assert.equal(state.briefId, 'developer');
  assert.equal(state.weights.battery, 0.25);
  assert.equal(state.selectedProductId, 'framework-laptop-13');
  assert.equal(state.selectedSourceId, 'notebookcheck-framework');
});

test('report includes the active question, score breakdown, and evidence', () => {
  const { api } = loadWorkspace(createStorage());
  const report = api.buildReport();

  assert.match(report, /# ProofLoop decision report/);
  assert.match(report, /Which laptop under \$1,500 is the best fit for a software developer/);
  assert.match(report, /## Score breakdown/);
  assert.match(report, /## Evidence used/);
  assert.match(report, /Notebookcheck — ASUS Zenbook 14 OLED review/);
});

test('every product source and conflict reference resolves', () => {
  const { data } = loadWorkspace(createStorage());
  const sourceIds = new Set(data.sources.map((source) => source.id));
  const productIds = new Set(data.products.map((product) => product.id));

  data.products.forEach((product) => {
    product.sourceIds.forEach((sourceId) => assert.ok(sourceIds.has(sourceId), `${product.id} references ${sourceId}`));
  });
  data.conflicts.forEach((conflict) => {
    assert.ok(productIds.has(conflict.productId));
    assert.ok(sourceIds.has(conflict.manufacturerSourceId));
    assert.ok(sourceIds.has(conflict.independentSourceId));
  });
});
