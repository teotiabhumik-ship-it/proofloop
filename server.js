'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const data = require('./data.js');
const decision = require('./lib/decision.js');
const workspaces = require('./lib/workspaces.js');
const research = require('./lib/research.js');
const extraction = require('./lib/extraction.js');

const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_PORT = 4173;
const DEFAULT_HOST = '0.0.0.0';
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

decision.validateCatalog(data);

function jsonHeaders() {
  return Object.assign(securityHeaders(), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  };
}

function sendJson(response, statusCode, payload, extraHeaders) {
  response.writeHead(statusCode, Object.assign(jsonHeaders(), extraHeaders || {}));
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, code, message, details, extraHeaders) {
  var error = { code: code, message: message };
  if (details && details.length) error.details = details;
  sendJson(response, statusCode, { error: error }, extraHeaders);
}

function methodNotAllowed(response, allowed) {
  sendError(response, 405, 'METHOD_NOT_ALLOWED', 'This method is not supported for this route.', null, { Allow: allowed });
}

function workspacePayload(id, workspace) {
  return { schemaVersion: 1, workspaceId: id, workspace: workspace };
}

function sourceForProduct(productId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  var source = {
    id: typeof input.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(input.id) ? input.id : 'user-source-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    productId: productId,
    publisher: typeof input.publisher === 'string' ? input.publisher.trim() : '',
    type: 'user-provided',
    userProvided: true,
    title: typeof input.title === 'string' ? input.title.trim() : '',
    url: typeof input.url === 'string' ? input.url.trim() : '',
    published: 'Added via API',
    reliability: 'Provided by the user; not independently verified.',
    quote: typeof input.quote === 'string' ? input.quote.trim() : '',
    claims: []
  };
  return source;
}

function validateWorkspaceInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [validationError('$', 'TYPE_ERROR', 'Workspace must be a JSON object.')];
  var errors = [];
  if (body.briefId !== undefined && (typeof body.briefId !== 'string' || !decision.briefById(data, body.briefId))) errors.push(validationError('briefId', 'UNKNOWN_BRIEF', 'Choose a brief from the catalog.'));
  if (body.weights !== undefined && (typeof body.weights !== 'object' || Array.isArray(body.weights) || !body.weights)) errors.push(validationError('weights', 'TYPE_ERROR', 'Weights must be an object.'));
  if (body.userSources !== undefined && !Array.isArray(body.userSources)) errors.push(validationError('userSources', 'TYPE_ERROR', 'User sources must be an array.'));
  if (Array.isArray(body.userSources)) body.userSources.forEach(function (source, index) {
    var sourceErrors = validateSourceInput(source).map(function (item) {
      return Object.assign({}, item, { path: 'userSources[' + index + '].' + item.path });
    });
    if (!source || typeof source.productId !== 'string' || !data.products.some(function (product) { return product.id === source.productId; })) {
      sourceErrors.push(validationError('userSources[' + index + '].productId', 'UNKNOWN_PRODUCT', 'Product ID is not in the catalog.'));
    }
    if (!source || typeof source.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(source.id)) {
      sourceErrors.push(validationError('userSources[' + index + '].id', 'INVALID_ID', 'Source ID contains unsupported characters.'));
    }
    errors = errors.concat(sourceErrors);
  });
  return errors;
}

function validateSourceInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [validationError('$', 'TYPE_ERROR', 'Source must be a JSON object.')];
  var errors = [];
  ['title', 'publisher', 'quote'].forEach(function (field) {
    if (typeof body[field] !== 'string' || !body[field].trim()) errors.push(validationError(field, 'REQUIRED_FIELD', 'Field is required.'));
  });
  if (body.url !== undefined && typeof body.url !== 'string') errors.push(validationError('url', 'TYPE_ERROR', 'URL must be a string.'));
  if (body.url && !/^https?:\/\//i.test(body.url)) errors.push(validationError('url', 'INVALID_URL', 'URL must use http or https.'));
  return errors;
}

function readJsonBody(request) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    request.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject({ statusCode: 413, code: 'BODY_TOO_LARGE', message: 'Request body exceeds 64 KiB.' });
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', function () {
      if (size > MAX_BODY_BYTES) return;
      var raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        reject({ statusCode: 400, code: 'INVALID_JSON', message: 'Request body must contain JSON.' });
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject({ statusCode: 400, code: 'INVALID_JSON', message: 'Request body contains malformed JSON.' });
      }
    });
    request.on('error', function () {
      reject({ statusCode: 400, code: 'INVALID_JSON', message: 'Request body could not be read.' });
    });
  });
}

function validationError(pathname, code, message) {
  return { path: pathname, code: code, message: message };
}

function validatePreviewRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [validationError('$', 'TYPE_ERROR', 'Request body must be a JSON object.')];
  }

  var errors = [];
  Object.keys(body).forEach(function (key) {
    if (key !== 'briefId' && key !== 'weights') errors.push(validationError(key, 'UNKNOWN_FIELD', 'Field is not supported.'));
  });
  if (body.briefId !== undefined && typeof body.briefId !== 'string') {
    errors.push(validationError('briefId', 'TYPE_ERROR', 'Brief ID must be a string.'));
  }
  if (body.weights !== undefined) {
    if (!body.weights || typeof body.weights !== 'object' || Array.isArray(body.weights)) {
      errors.push(validationError('weights', 'TYPE_ERROR', 'Weights must be an object.'));
    } else {
      var knownIds = new Set(data.criteria.map(function (criterion) { return criterion.id; }));
      Object.keys(body.weights).forEach(function (criterionId) {
        if (!knownIds.has(criterionId)) {
          errors.push(validationError('weights.' + criterionId, 'UNKNOWN_CRITERION', 'Criterion is not in the catalog.'));
          return;
        }
        var value = body.weights[criterionId];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(validationError('weights.' + criterionId, 'TYPE_ERROR', 'Weight must be a finite number.'));
        } else if (value < 0 || value > 1) {
          errors.push(validationError('weights.' + criterionId, 'OUT_OF_RANGE', 'Weight must be between 0 and 1.'));
        }
      });
      data.criteria.forEach(function (criterion) {
        if (!Object.prototype.hasOwnProperty.call(body.weights, criterion.id)) {
          errors.push(validationError('weights.' + criterion.id, 'MISSING_FIELD', 'Every catalog criterion must have a weight.'));
        }
      });
    }
  }
  return errors;
}

function catalogPayload() {
  return {
    schemaVersion: 1,
    dataVersion: data.version,
    title: data.title,
    currency: data.currency,
    criteria: data.criteria,
    products: data.products,
    sources: data.sources,
    conflicts: data.conflicts,
    assumptions: data.assumptions,
    briefs: data.briefs,
    defaults: data.defaults
  };
}

function serveStatic(rootDir, requestPath, response) {
  var decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch (error) {
    sendError(response, 404, 'NOT_FOUND', 'The requested resource was not found.');
    return;
  }
  var relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  var resolvedRoot = path.resolve(rootDir);
  var resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) {
    sendError(response, 404, 'NOT_FOUND', 'The requested resource was not found.');
    return;
  }
  fs.stat(resolvedPath, function (statError, stats) {
    if (statError || !stats.isFile()) {
      sendError(response, 404, 'NOT_FOUND', 'The requested resource was not found.');
      return;
    }
    var extension = path.extname(resolvedPath).toLowerCase();
    response.writeHead(200, Object.assign(securityHeaders(), { 'Content-Type': MIME_TYPES[extension] || 'application/octet-stream' }));
    fs.createReadStream(resolvedPath).pipe(response);
  });
}

async function handleDecisionEndpoint(request, response, endpoint) {
  var contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    sendError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type application/json.');
    return;
  }
  var body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendError(response, error.statusCode || 400, error.code || 'INVALID_JSON', error.message || 'Request body is invalid.');
    return;
  }
  var errors = validatePreviewRequest(body);
  if (errors.length) {
    sendError(response, 422, 'VALIDATION_ERROR', 'Request body is invalid.', errors);
    return;
  }
  var briefId = body.briefId || data.defaults.briefId;
  if (!decision.briefById(data, briefId)) {
    sendError(response, 422, 'UNKNOWN_BRIEF', 'Brief ID is not in the catalog.', [validationError('briefId', 'UNKNOWN_BRIEF', 'Choose a brief from the catalog.')]);
    return;
  }
  var options = { briefId: briefId, weights: body.weights };
  if (endpoint === 'preview') {
    sendJson(response, 200, decision.preview(data, options));
    return;
  }
  var report = decision.buildReport(data, options);
  sendJson(response, 200, {
    schemaVersion: report.result.schemaVersion,
    dataVersion: report.result.dataVersion,
    format: 'markdown',
    filename: 'proofloop-decision-report.md',
    markdown: report.markdown
  });
}

async function handleWorkspaceEndpoint(request, response, workspaceStore, requestPath) {
  var segments = requestPath.split('/').filter(Boolean);
  var workspaceId = segments[3];
  if (!workspaces.validateWorkspaceId(workspaceId)) {
    sendError(response, 400, 'INVALID_WORKSPACE_ID', 'Workspace ID must contain only letters, numbers, underscores, or hyphens.');
    return;
  }
  var sourceId = segments[5];

  if (segments.length === 4 && request.method === 'GET') {
    var existing = workspaceStore.get(workspaceId);
    if (!existing) {
      sendError(response, 404, 'WORKSPACE_NOT_FOUND', 'Workspace was not found.');
      return;
    }
    sendJson(response, 200, workspacePayload(workspaceId, existing));
    return;
  }
  if (segments.length === 4 && request.method === 'PUT') {
    var contentType = String(request.headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      sendError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type application/json.');
      return;
    }
    var body;
    try { body = await readJsonBody(request); } catch (error) {
      sendError(response, error.statusCode || 400, error.code || 'INVALID_JSON', error.message || 'Request body is invalid.');
      return;
    }
    var errors = validateWorkspaceInput(body);
    if (errors.length) {
      sendError(response, 422, 'VALIDATION_ERROR', 'Workspace body is invalid.', errors);
      return;
    }
    var saved = workspaceStore.save(workspaceId, workspaces.normalizeWorkspace(data, body));
    sendJson(response, 200, workspacePayload(workspaceId, saved));
    return;
  }
  if (segments.length === 5 && segments[4] === 'sources' && request.method === 'POST') {
    var sourceContentType = String(request.headers['content-type'] || '').toLowerCase();
    if (!sourceContentType.startsWith('application/json')) {
      sendError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type application/json.');
      return;
    }
    var sourceBody;
    try { sourceBody = await readJsonBody(request); } catch (error) {
      sendError(response, error.statusCode || 400, error.code || 'INVALID_JSON', error.message || 'Request body is invalid.');
      return;
    }
    var sourceErrors = validateSourceInput(sourceBody);
    if (!sourceBody || typeof sourceBody.productId !== 'string' || !data.products.some(function (product) { return product.id === sourceBody.productId; })) sourceErrors.push(validationError('productId', 'UNKNOWN_PRODUCT', 'Product ID is not in the catalog.'));
    if (sourceErrors.length) {
      sendError(response, 422, 'VALIDATION_ERROR', 'Source body is invalid.', sourceErrors);
      return;
    }
    var workspace = workspaceStore.get(workspaceId) || workspaces.defaultWorkspace(data);
    var source = sourceForProduct(sourceBody.productId, sourceBody);
    if (workspace.userSources.some(function (item) { return item.id === source.id; })) {
      sendError(response, 409, 'SOURCE_EXISTS', 'A source with this ID already exists in the workspace.');
      return;
    }
    workspace.userSources = workspace.userSources.concat(source);
    var updated = workspaceStore.save(workspaceId, workspace);
    sendJson(response, 201, { schemaVersion: 1, workspaceId: workspaceId, source: source, workspace: updated });
    return;
  }
  if (segments.length === 6 && segments[4] === 'sources' && request.method === 'DELETE') {
    var changed = workspaceStore.removeSource(workspaceId, sourceId);
    if (!changed) {
      sendError(response, 404, 'WORKSPACE_NOT_FOUND', 'Workspace was not found.');
      return;
    }
    sendJson(response, 200, workspacePayload(workspaceId, changed));
    return;
  }
  methodNotAllowed(response, 'GET, PUT, POST, DELETE');
}

async function handleResearchEndpoint(request, response, options) {
  var contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    sendError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type application/json.');
    return;
  }
  var body;
  try { body = await readJsonBody(request); } catch (error) {
    sendError(response, error.statusCode || 400, error.code || 'INVALID_JSON', error.message || 'Request body is invalid.');
    return;
  }
  if (!body || typeof body.url !== 'string') {
    sendError(response, 422, 'VALIDATION_ERROR', 'Research request is invalid.', [validationError('url', 'REQUIRED_FIELD', 'A source URL is required.')]);
    return;
  }
  try {
    var source = await research.fetchSource(body.url, options.fetchImpl, options.lookupImpl);
    sendJson(response, 200, { schemaVersion: 1, source: source });
  } catch (error) {
    var message = error && error.message ? error.message : 'Source could not be fetched.';
    var status = message.includes('URL') || message.includes('Private') ? 422 : (error && error.name === 'AbortError' ? 504 : 502);
    sendError(response, status, status === 422 ? 'VALIDATION_ERROR' : 'SOURCE_FETCH_FAILED', message);
  }
}

async function handleExtractionEndpoint(request, response, options) {
  var contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    sendError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type application/json.');
    return;
  }
  var body;
  try { body = await readJsonBody(request); } catch (error) {
    sendError(response, error.statusCode || 400, error.code || 'INVALID_JSON', error.message || 'Request body is invalid.');
    return;
  }
  try {
    var result = await extraction.extractClaims(body, { criteria: data.criteria, env: options.env, fetchImpl: options.fetchImpl });
    sendJson(response, 200, { schemaVersion: 1, extraction: result });
  } catch (error) {
    var code = error.code === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : (error.code === 'INVALID_TEXT' ? 'VALIDATION_ERROR' : 'EXTRACTION_FAILED');
    var status = code === 'NOT_CONFIGURED' ? 503 : (code === 'VALIDATION_ERROR' ? 422 : 502);
    sendError(response, status, code, error.message || 'Claims could not be extracted.');
  }
}

async function handleRequest(request, response, options) {
  var rawPath = String(request.url || '').split('?')[0];
  try {
    if (decodeURIComponent(rawPath).split('/').some(function (segment) { return segment === '..'; })) {
      sendError(response, 404, 'NOT_FOUND', 'The requested resource was not found.');
      return;
    }
  } catch (error) {
    sendError(response, 404, 'NOT_FOUND', 'The requested resource was not found.');
    return;
  }
  var requestUrl;
  try {
    requestUrl = new URL(request.url, 'http://localhost');
  } catch (error) {
    sendError(response, 400, 'INVALID_QUERY', 'The request URL is invalid.');
    return;
  }
  var requestPath = requestUrl.pathname;

  if (requestPath === '/api/health') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
    sendJson(response, 200, { ok: true, service: 'proofloop', apiVersion: '1', dataVersion: data.version });
    return;
  }
  if (requestPath === '/api/v1/catalog') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
    sendJson(response, 200, catalogPayload());
    return;
  }
  if (requestPath === '/api/v1/decision/preview') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    await handleDecisionEndpoint(request, response, 'preview');
    return;
  }
  if (requestPath === '/api/v1/decision/report') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    await handleDecisionEndpoint(request, response, 'report');
    return;
  }
  if (requestPath.startsWith('/api/v1/workspaces/')) {
    await handleWorkspaceEndpoint(request, response, options.workspaceStore, requestPath);
    return;
  }
  if (requestPath === '/api/v1/research/fetch') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    await handleResearchEndpoint(request, response, options);
    return;
  }
  if (requestPath === '/api/v1/research/extract') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    await handleExtractionEndpoint(request, response, options);
    return;
  }
  if (requestPath.startsWith('/api/')) {
    sendError(response, 404, 'NOT_FOUND', 'The requested API route was not found.');
    return;
  }
  if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
  serveStatic(options.rootDir, requestPath, response);
}

function createServer(options) {
  var config = options || {};
  var rootDir = path.resolve(config.rootDir || __dirname);
  var workspaceStore = config.workspaceStore || workspaces.createStore({ directory: config.dataDir || process.env.PROOFLOOP_DATA_DIR || path.join(rootDir, '.data') });
  return http.createServer(function (request, response) {
    response.setHeader('X-Request-Id', crypto.randomUUID());
    handleRequest(request, response, { rootDir: rootDir, workspaceStore: workspaceStore, fetchImpl: config.fetchImpl, lookupImpl: config.lookupImpl, env: config.env || process.env }).catch(function () {
      if (!response.headersSent) sendError(response, 500, 'INTERNAL_ERROR', 'The server could not complete the request.');
      else response.destroy();
    });
  });
}

function parsePort(value) {
  if (value === undefined || value === '') return DEFAULT_PORT;
  var port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  return port;
}

if (require.main === module) {
  var port = parsePort(process.env.PORT);
  var host = process.env.HOST || DEFAULT_HOST;
  createServer({ rootDir: __dirname }).listen(port, host, function () {
    process.stdout.write('ProofLoop server listening on http://' + host + ':' + port + '\n');
  });
}

module.exports = {
  createServer: createServer,
  MAX_BODY_BYTES: MAX_BODY_BYTES,
  catalogPayload: catalogPayload
};
