'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_URL_LENGTH = 2048;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10000;

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168);
  }
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return true;
}

async function validateResearchUrl(rawUrl, lookupImpl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > MAX_URL_LENGTH) throw new Error('URL must be a valid http or https URL under 2048 characters.');
  let parsed;
  try { parsed = new URL(rawUrl); } catch (error) { throw new Error('URL must be a valid http or https URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('URL must use http or https without embedded credentials.');
  const lookup = await (lookupImpl || dns.lookup)(parsed.hostname, { all: true });
  if (!lookup.length || lookup.some((entry) => isPrivateAddress(entry.address))) throw new Error('Private and loopback addresses are not allowed.');
  return parsed;
}

function decodeEntities(value) {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}

function extractText(html) {
  return decodeEntities(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function extractTitle(html, fallback) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? extractText(match[1]).slice(0, 180) : fallback;
}

async function readResponse(response) {
  const contentLength = Number(response.headers && response.headers.get && response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('Source response exceeds 1 MiB.');
  if (!response.body || !response.body.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Source response exceeds 1 MiB.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Source response exceeds 1 MiB.');
    }
    chunks.push(Buffer.from(item.value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchSource(rawUrl, fetchImpl, lookupImpl) {
  const parsed = await validateResearchUrl(rawUrl, lookupImpl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await (fetchImpl || fetch)(parsed.href, { redirect: 'error', signal: controller.signal, headers: { Accept: 'text/html,text/plain;q=0.9' } });
    if (!response.ok) throw new Error('Source returned HTTP ' + response.status + '.');
    const contentType = String(response.headers && response.headers.get ? response.headers.get('content-type') : '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('text/plain')) throw new Error('Source must return HTML or plain text.');
    const rawText = await readResponse(response);
    const text = extractText(rawText);
    return {
      url: parsed.href,
      publisher: parsed.hostname,
      title: extractTitle(rawText, parsed.hostname),
      text: text.slice(0, 100000),
      fetchedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchSource, validateResearchUrl, extractText, MAX_RESPONSE_BYTES };
