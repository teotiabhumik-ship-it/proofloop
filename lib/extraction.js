'use strict';

const MAX_TEXT_LENGTH = 100000;

function extractionConfig(env) {
  const values = env || process.env;
  return {
    endpoint: values.PROOFLOOP_LLM_ENDPOINT || '',
    apiKey: values.PROOFLOOP_LLM_API_KEY || '',
    model: values.PROOFLOOP_LLM_MODEL || 'gpt-4o-mini'
  };
}

function parseJsonContent(content) {
  const raw = String(content || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(raw);
}

function validateClaims(payload, criterionIds) {
  if (!payload || !Array.isArray(payload.claims)) throw new Error('Model response must contain a claims array.');
  return payload.claims.filter(function (claim) {
    return claim && criterionIds.has(claim.criterionId) && typeof claim.quote === 'string' && claim.quote.trim() &&
      (typeof claim.value === 'number' || claim.value === null) &&
      typeof claim.unit === 'string' && Number.isFinite(Number(claim.confidence));
  }).map(function (claim) {
    return {
      criterionId: claim.criterionId,
      value: claim.value,
      unit: claim.unit,
      stance: typeof claim.stance === 'string' ? claim.stance : 'extracted',
      confidence: Math.max(0, Math.min(1, Number(claim.confidence))),
      quote: claim.quote.trim().slice(0, 2000)
    };
  });
}

async function extractClaims(input, options) {
  const config = extractionConfig(options && options.env);
  if (!config.endpoint || !config.apiKey) {
    const error = new Error('LLM extraction is not configured. Set PROOFLOOP_LLM_ENDPOINT and PROOFLOOP_LLM_API_KEY.');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > MAX_TEXT_LENGTH) {
    const error = new Error('Source text must be non-empty and no longer than 100000 characters.');
    error.code = 'INVALID_TEXT';
    throw error;
  }
  const criterionIds = new Set(options.criteria.map(function (criterion) { return criterion.id; }));
  const controller = new AbortController();
  const timeout = setTimeout(function () { controller.abort(); }, 20000);
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiKey },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Extract only evidence claims from the supplied source. Return JSON with claims: [{criterionId,value,unit,stance,confidence,quote}]. Use only these criterion IDs: ' + Array.from(criterionIds).join(', ') + '. Use null for value when no numeric value is present. Keep quotes exact and short.' },
          { role: 'user', content: input.text }
        ]
      })
    });
    if (!response.ok) throw new Error('LLM provider returned HTTP ' + response.status + '.');
    const envelope = await response.json();
    const content = envelope && envelope.choices && envelope.choices[0] && envelope.choices[0].message && envelope.choices[0].message.content;
    const payload = parseJsonContent(content);
    return { claims: validateClaims(payload, criterionIds), model: config.model };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { extractClaims, extractionConfig, MAX_TEXT_LENGTH };
