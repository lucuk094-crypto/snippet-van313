import Busboy from 'busboy';
import dns from 'node:dns/promises';
import net from 'node:net';
import { getServerSupabase, applyPublicCors, jsonError } from './_lib/supabase.js';

export const config = { api: { bodyParser: false } };
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const rateMap = globalThis.__snippetVaultApiRateMap || (globalThis.__snippetVaultApiRateMap = new Map());

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const previous = rateMap.get(ip) || { count: 0, start: now };
  if (now - previous.start >= RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, start: now });
    return false;
  }
  previous.count += 1;
  rateMap.set(ip, previous);
  return previous.count > RATE_LIMIT;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fields = {};
    const files = [];
    let totalFileBytes = 0;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    let parser;
    try {
      parser = Busboy({ headers: req.headers, limits: { files: 4, fields: 100, fileSize: MAX_UPLOAD_BYTES, fieldSize: 256 * 1024 } });
    } catch (error) { return finish(reject, error); }
    parser.on('field', (name, value) => { fields[name] = value; });
    parser.on('file', (name, stream, info) => {
      const chunks = [];
      let size = 0;
      stream.on('data', (chunk) => {
        size += chunk.length;
        totalFileBytes += chunk.length;
        if (totalFileBytes > MAX_UPLOAD_BYTES) {
          finish(reject, new Error('Total ukuran upload melewati batas 5 MB.'));
          stream.resume();
          return;
        }
        if (size <= MAX_UPLOAD_BYTES) chunks.push(chunk);
      });
      stream.on('limit', () => finish(reject, new Error('Ukuran file melewati batas 5 MB.')));
      stream.on('end', () => {
        if (size > MAX_UPLOAD_BYTES || totalFileBytes > MAX_UPLOAD_BYTES) return;
        files.push({ fieldName: name, filename: info.filename || 'upload.bin', mimeType: info.mimeType || 'application/octet-stream', buffer: Buffer.concat(chunks) });
      });
    });
    parser.on('filesLimit', () => finish(reject, new Error('Maksimal empat file per request.')));
    parser.on('fieldsLimit', () => finish(reject, new Error('Jumlah field terlalu banyak.')));
    parser.on('error', (error) => finish(reject, error));
    parser.on('finish', () => finish(resolve, { fields, files }));
    req.pipe(parser);
  });
}

function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const p = address.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224
      || (p[0] === 169 && p[1] === 254)
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      || (p[0] === 192 && p[1] === 168)
      || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
  }
  if (version === 6) {
    const ip = address.toLowerCase();
    if (ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:') || ip.startsWith('ff')) return true;
    const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  return true;
}

async function validatePublicTarget(url) {
  if (url.protocol !== 'https:') throw new Error('Endpoint harus memakai HTTPS.');
  if (url.username || url.password || url.port && url.port !== '443') throw new Error('URL endpoint tidak diizinkan.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Endpoint lokal/private tidak dapat dipanggil.');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Alamat IP private tidak dapat dipanggil.');
    return;
  }
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error('Host endpoint tidak valid atau mengarah ke jaringan private.');
}

function asString(value) {
  if (typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function readBoundedBody(response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        const error = new Error('Respons endpoint melewati batas preview 6 MB.');
        error.code = 'RESPONSE_TOO_LARGE';
        throw error;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export default async function handler(req, res) {
  applyPublicCors(req, res, 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Gunakan POST untuk menjalankan playground.');
  }
  if (rateLimited(clientIp(req))) return jsonError(res, 429, 'RATE_LIMITED', 'Batas playground tercapai. Coba lagi sebentar.');

  let supabase;
  try { supabase = getServerSupabase(); }
  catch { return jsonError(res, 503, 'SUPABASE_NOT_CONFIGURED', 'Playground belum terhubung ke Supabase.'); }

  let fields; let files;
  try {
    ({ fields, files } = await parseMultipart(req));
  } catch (error) {
    return jsonError(res, 400, 'INVALID_MULTIPART', error.message || 'Request form-data tidak valid.');
  }

  const endpointId = String(fields.endpointId || '').trim();
  let params;
  try { params = JSON.parse(fields.params || '{}'); }
  catch { return jsonError(res, 400, 'INVALID_PARAMS', 'Parameter harus berupa objek JSON.'); }
  if (!endpointId || !params || Array.isArray(params) || typeof params !== 'object') {
    return jsonError(res, 400, 'INVALID_REQUEST', 'Endpoint dan parameter request wajib diisi.');
  }

  const { data: endpoint, error: endpointError } = await supabase
    .from('api_endpoints')
    .select('id,name,method,path,example_url,params,requires_api_key,key_param_name,is_public,is_active,output_type')
    .eq('id', endpointId)
    .eq('is_public', true)
    .eq('is_active', true)
    .maybeSingle();
  if (endpointError) return jsonError(res, 502, 'ENDPOINT_LOOKUP_FAILED', endpointError.message);
  if (!endpoint) return jsonError(res, 404, 'ENDPOINT_NOT_FOUND', 'Endpoint tidak tersedia untuk publik.');

  const method = String(endpoint.method || 'GET').toUpperCase();
  if (!['GET','POST','PUT','DELETE'].includes(method)) return jsonError(res, 400, 'INVALID_METHOD', 'HTTP method endpoint tidak didukung.');
  let base;
  try { base = new URL(endpoint.example_url); }
  catch { return jsonError(res, 422, 'INVALID_EXAMPLE_URL', 'URL contoh endpoint belum valid.'); }
  let target;
  try { target = new URL(endpoint.path, base.origin); }
  catch { return jsonError(res, 422, 'INVALID_ENDPOINT_PATH', 'Path endpoint belum valid.'); }
  if (target.origin !== base.origin) return jsonError(res, 422, 'INVALID_ENDPOINT_PATH', 'Path endpoint tidak boleh mengganti host sumber.');
  try { await validatePublicTarget(target); }
  catch (error) { return jsonError(res, 422, 'UNSAFE_ENDPOINT', error.message); }

  const definitions = Array.isArray(endpoint.params) ? endpoint.params : [];
  const filesByName = new Map(files.map((file) => [file.fieldName, file]));
  const normalized = [];
  for (const definition of definitions) {
    const name = String(definition.name || definition.n || '').trim();
    if (!name) continue;
    const type = String(definition.type || definition.t || 'string').toLowerCase();
    const uploaded = filesByName.get(`file:${name}`) || filesByName.get(name);
    const value = params[name];
    if (definition.required || definition.r) {
      const missing = type === 'file' ? !uploaded : value === undefined || value === null || String(value).trim() === '';
      if (missing) return jsonError(res, 400, 'MISSING_PARAMETER', `Parameter “${name}” wajib diisi.`);
    }
    if (type === 'file') {
      if (uploaded) normalized.push({ name, file: uploaded });
      continue;
    }
    if (value !== undefined && value !== null && String(value) !== '') normalized.push({ name, value: asString(value) });
  }

  if (endpoint.requires_api_key) {
    const keyName = String(endpoint.key_param_name || 'key').trim();
    const key = params[keyName];
    if (!key) return jsonError(res, 400, 'API_KEY_REQUIRED', `Masukkan API key pada parameter “${keyName}”.`);
    if (!normalized.some((item) => item.name === keyName)) normalized.push({ name: keyName, value: asString(key) });
  }

  try {
    const hasFiles = normalized.some((item) => item.file);
    if (method === 'GET' || method === 'DELETE') {
      for (const item of normalized) if (!item.file) target.searchParams.set(item.name, item.value);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const options = {
      method,
      headers: { Accept: 'application/json, text/plain, image/*, video/*, audio/*', 'User-Agent': 'SnippetVault-Endpoint-Playground/1.0' },
      signal: controller.signal,
      redirect: 'manual',
    };
    if ((method === 'POST' || method === 'PUT') && (normalized.length || hasFiles)) {
      const formData = new FormData();
      for (const item of normalized) {
        if (item.file) formData.append(item.name, new Blob([item.file.buffer], { type: item.file.mimeType }), item.file.filename);
        else formData.append(item.name, item.value);
      }
      options.body = formData;
    }

    try {
      const upstream = await fetch(target, options);
      if (upstream.status >= 300 && upstream.status < 400) return jsonError(res, 502, 'UPSTREAM_REDIRECT_BLOCKED', 'Endpoint mengembalikan redirect; redirect diblokir untuk keamanan.');
      const bytes = await readBoundedBody(upstream);
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Upstream-Status', String(upstream.status));
      res.setHeader('X-Upstream-Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(upstream.status).send(bytes);
    } catch (error) {
      if (error.code === 'RESPONSE_TOO_LARGE') return jsonError(res, 502, 'RESPONSE_TOO_LARGE', error.message);
      if (error.name === 'AbortError') return jsonError(res, 504, 'UPSTREAM_TIMEOUT', 'Endpoint tidak merespons dalam 20 detik.');
      return jsonError(res, 502, 'UPSTREAM_REQUEST_FAILED', error.message || 'Request ke endpoint gagal.');
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error.name === 'AbortError') return jsonError(res, 504, 'UPSTREAM_TIMEOUT', 'Endpoint tidak merespons dalam 20 detik.');
    return jsonError(res, 502, 'UPSTREAM_REQUEST_FAILED', error.message || 'Request ke endpoint gagal.');
  }
}
