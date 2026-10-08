import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Eye, Play, RefreshCw, ShieldCheck } from 'lucide-react';

function isSafePublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { return { ok: false, message: 'Masukkan URL endpoint yang valid.' }; }
  if (!['https:', 'http:'].includes(url.protocol)) return { ok: false, message: 'Hanya URL HTTP/HTTPS yang didukung.' };
  const host = url.hostname.toLowerCase();
  const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || privateIpv4) {
    return { ok: false, message: 'Endpoint lokal/private tidak dapat dipanggil dari preview publik.' };
  }
  if (url.protocol === 'http:' && typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return { ok: false, message: 'Gunakan HTTPS agar browser tidak memblokir mixed content.' };
  }
  return { ok: true, url };
}

function prettifyTitle(value) {
  return String(value || 'Hasil').replace(/[\t\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function AnimeResults({ results }) {
  if (!results.length) return null;
  return (
    <div className="api-result-list">
      {results.map((item, index) => (
        <article className="api-result-card" key={`${item.link || item.title || 'result'}-${index}`}>
          {item.image ? <img className="api-result-image" src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="api-result-image api-result-no-image">JSON</div>}
          <div className="api-result-copy">
            <h4>{prettifyTitle(item.title)}</h4>
            <div className="api-result-meta">
              {item.type && <span>{item.type}</span>}
              {item.latestEpisode && <span>{item.latestEpisode}</span>}
            </div>
            {item.link && <a href={item.link} target="_blank" rel="noreferrer">Buka sumber <ExternalLink size={12} /></a>}
          </div>
        </article>
      ))}
    </div>
  );
}

export default function ApiEndpointPreview({ apiPreview }) {
  const [endpoint, setEndpoint] = useState(apiPreview?.endpoint || '');
  const [method, setMethod] = useState(apiPreview?.method || 'GET');
  const [headersText, setHeadersText] = useState('{}');
  const [bodyText, setBodyText] = useState(apiPreview?.requestBody || '');
  const [result, setResult] = useState({
    mode: 'sample',
    httpStatus: apiPreview?.sampleResponse?.status || null,
    body: apiPreview?.sampleResponse ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyLabel, setCopyLabel] = useState('Salin URL');

  const sampleResponse = apiPreview?.sampleResponse ?? null;
  const body = result?.body;
  const resultList = useMemo(() => {
    const rows = body?.data?.results || body?.results || [];
    return Array.isArray(rows) ? rows : [];
  }, [body]);
  const declaredTotal = body?.data?.total ?? body?.total ?? resultList.length;
  const resultStatus = result?.httpStatus ?? body?.status ?? null;
  const passed = result?.mode === 'error'
    ? false
    : result?.mode === 'live'
      ? resultStatus >= 200 && resultStatus < 400 && body?.success !== false
      : typeof body?.success === 'boolean' ? body.success : resultStatus !== null ? resultStatus >= 200 && resultStatus < 400 : null;

  const showSample = () => {
    setError('');
    setResult({ mode: 'sample', httpStatus: sampleResponse?.status || null, body: sampleResponse });
  };

  const runPreview = async () => {
    setError('');
    const validation = isSafePublicUrl(endpoint.trim());
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    let headers;
    try {
      headers = JSON.parse(headersText || '{}');
      if (!headers || Array.isArray(headers) || typeof headers !== 'object') throw new Error('Header harus berupa objek JSON.');
    } catch (parseError) {
      setError(`Header JSON tidak valid: ${parseError.message}`);
      return;
    }

    const requestOptions = { method, headers: { Accept: 'application/json', ...headers } };
    if (method !== 'GET' && bodyText.trim()) {
      try {
        JSON.parse(bodyText);
      } catch (parseError) {
        setError(`Body JSON tidak valid: ${parseError.message}`);
        return;
      }
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.body = bodyText;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    requestOptions.signal = controller.signal;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(validation.url.toString(), requestOptions);
      const raw = await response.text();
      let payload;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
      setResult({ mode: 'live', httpStatus: response.status, body: payload });
    } catch (requestError) {
      const message = requestError.name === 'AbortError'
        ? 'Request melewati batas 15 detik.'
        : 'Request gagal dibaca browser. Endpoint mungkin menolak CORS, memerlukan autentikasi, atau sedang tidak tersedia.';
      setResult({ mode: 'error', httpStatus: 0, body: { error: message } });
      setError(message);
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  };

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopyLabel('Tersalin');
    } catch {
      setCopyLabel('Gagal menyalin');
    }
    window.setTimeout(() => setCopyLabel('Salin URL'), 1600);
  };

  return (
    <section className="api-preview-panel" aria-label="Preview API endpoint">
      <div className="api-preview-heading">
        <div>
          <span className="api-preview-kicker"><Eye size={13} /> API ENDPOINT PREVIEW</span>
          <h3>Pratinjau respons</h3>
        </div>
        <span className="api-type-chip">{apiPreview?.type || 'API'}</span>
      </div>

      <div className="api-request-bar">
        <label className="api-method-select" aria-label="HTTP method">
          <select value={method} onChange={(event) => setMethod(event.target.value)}>
            <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
          </select>
        </label>
        <input aria-label="Endpoint URL" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck="false" />
        <button className="api-copy-url" onClick={copyEndpoint} title="Salin endpoint"><Copy size={14} /><span>{copyLabel}</span></button>
      </div>

      {method !== 'GET' && (
        <label className="api-preview-field">Request body (JSON)
          <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} placeholder={'{\n  "prompt": "..."\n}'} spellCheck="false" />
        </label>
      )}

      <details className="api-header-details">
        <summary>Headers opsional <span>· hanya tersimpan di memori halaman ini</span></summary>
        <textarea value={headersText} onChange={(event) => setHeadersText(event.target.value)} placeholder={'{\n  "x-api-key": "tempel-key-sementara"\n}'} spellCheck="false" />
        <small>Jangan masukkan kunci produksi di situs publik. Header tidak disimpan ke koleksi; request dikirim langsung dari browser ke endpoint.</small>
      </details>

      <div className="api-preview-actions">
        <button className="api-live-button" onClick={runPreview} disabled={busy}><Play size={14} fill="currentColor" />{busy ? 'Memanggil API…' : 'Coba endpoint live'}</button>
        <button className="api-sample-button" onClick={showSample} disabled={!sampleResponse}><RefreshCw size={14} />Tampilkan sample</button>
      </div>

      <div className="api-preview-note"><ShieldCheck size={14} /><span>Preview live memakai fetch browser. Jika CORS/auth memblokirnya, tampilkan sample JSON yang disimpan di snippet.</span></div>
      {error && <div className="api-preview-error"><AlertTriangle size={14} />{error}</div>}

      <div className="api-response-shell">
        <div className="api-response-topline">
          <div><span className={`api-response-dot ${result?.mode === 'live' && resultStatus >= 200 && resultStatus < 400 ? 'is-live' : result?.mode === 'error' ? 'is-error' : ''}`} />
            <b>{result?.mode === 'live' ? 'LIVE RESPONSE' : result?.mode === 'error' ? 'LIVE REQUEST GAGAL' : 'SAMPLE RESPONSE'}</b>
            <span>{resultStatus ? `HTTP ${resultStatus}` : result?.mode === 'error' ? 'HTTP —' : 'Contoh tersimpan'}</span>
          </div>
          <div className="api-response-state">{passed !== null && <span className={passed ? 'api-boolean api-boolean-true' : 'api-boolean api-boolean-false'}>{passed ? 'TRUE' : 'FALSE'}</span>}{result?.mode === 'live' && resultStatus >= 200 && resultStatus < 400 ? <CheckCircle2 size={15} className="api-response-ok" /> : null}</div>
        </div>
        {resultList.length > 0 && (
          <div className="api-results-summary"><b>{declaredTotal}</b> hasil dari respons{body?.data?.query ? <span> untuk “{body.data.query}”</span> : null}</div>
        )}
        <AnimeResults results={resultList} />
        <details className="api-json-details" open>
          <summary><span>{resultList.length ? 'JSON mentah' : 'Respons JSON'}</span><span>{resultList.length ? `${resultList.length} item` : 'pretty print'}</span></summary>
          <pre><code>{JSON.stringify(body, null, 2) ?? 'Belum ada respons.'}</code></pre>
        </details>
      </div>
    </section>
  );
}
