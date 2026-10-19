'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateWorkspaceId(id) {
  return typeof id === 'string' && WORKSPACE_ID_PATTERN.test(id);
}

function createStore(options) {
  const directory = path.resolve(options.directory);
  const filePath = path.join(directory, 'workspaces.json');
  let cache = null;

  function readAll() {
    if (cache) return cache;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      cache = JSON.parse(raw);
      if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      cache = {};
    }
    return cache;
  }

  function writeAll(value) {
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(temporaryPath, filePath);
    cache = value;
  }

  function get(id) {
    const value = readAll()[id];
    return value ? clone(value) : null;
  }

  function save(id, workspace) {
    const all = readAll();
    all[id] = clone(workspace);
    writeAll(all);
    return clone(all[id]);
  }

  function removeSource(id, sourceId) {
    const workspace = get(id);
    if (!workspace) return null;
    const before = workspace.userSources.length;
    workspace.userSources = workspace.userSources.filter((source) => source.id !== sourceId);
    if (workspace.userSources.length === before) return workspace;
    return save(id, workspace);
  }

  return { get, save, removeSource, filePath, directory };
}

function defaultWorkspace(data) {
  const brief = data.briefs.find((item) => item.id === data.defaults.briefId) || data.briefs[0];
  return {
    version: 1,
    briefId: brief.id,
    question: brief.question,
    budget: brief.budget,
    weights: Object.assign({}, brief.weights),
    activeTab: data.defaults.activeTab || 'evidence',
    selectedProductId: data.defaults.selectedProductId || data.products[0].id,
    selectedSourceId: data.defaults.selectedSourceId,
    userSources: []
  };
}

function normalizeWorkspace(data, input) {
  const fallback = defaultWorkspace(data);
  const brief = data.briefs.find((item) => item.id === input.briefId) || data.briefs.find((item) => item.id === fallback.briefId);
  const weights = {};
  data.criteria.forEach((criterion) => {
    const value = Number(input.weights && input.weights[criterion.id]);
    weights[criterion.id] = Number.isFinite(value) && value >= 0 ? value : brief.weights[criterion.id];
  });
  return {
    version: 1,
    briefId: brief.id,
    question: brief.question,
    budget: brief.budget,
    weights,
    activeTab: ['evidence', 'assumptions', 'conflicts'].includes(input.activeTab) ? input.activeTab : fallback.activeTab,
    selectedProductId: data.products.some((product) => product.id === input.selectedProductId) ? input.selectedProductId : fallback.selectedProductId,
    selectedSourceId: typeof input.selectedSourceId === 'string' ? input.selectedSourceId : fallback.selectedSourceId,
    userSources: Array.isArray(input.userSources) ? input.userSources.map(function (source) {
      return {
        id: source.id,
        productId: source.productId,
        publisher: source.publisher,
        type: 'user-provided',
        userProvided: true,
        title: source.title,
        url: source.url || '',
        published: 'Added via API',
        reliability: 'Provided by the user; not independently verified.',
        quote: source.quote,
        claims: []
      };
    }) : []
  };
}

module.exports = {
  createStore,
  defaultWorkspace,
  normalizeWorkspace,
  validateWorkspaceId
};
