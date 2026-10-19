'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const data = require('./data.js');
const decision = require('./lib/decision.js');

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
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
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
    response.writeHead(200, { 'Content-Type': MIME_TYPES[extension] || 'application/octet-stream' });
    fs.createReadStream(resolvedPath).pipe(response);
  });
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
    sendJson(response, 200, decision.preview(data, { briefId: briefId, weights: body.weights }));
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
  return http.createServer(function (request, response) {
    handleRequest(request, response, { rootDir: rootDir }).catch(function () {
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
