import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, AudioLines, Bot, Check, ChevronDown, Copy, Download, ExternalLink,
  FileCode2, Film, FolderOpen, Image, Info, Layers, Link2, LoaderCircle, LockKeyhole, Moon,
  Music2, Newspaper, Palette, Play, RefreshCw, Search, ShieldCheck, Shuffle, Terminal, Upload, Video, Wrench,
} from 'lucide-react';
import { isSupabaseConfigured, supabase, SUPABASE_SETUP_HINT } from './lib/supabase.js';
import './endpoint-portal.css';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const CODE_TABS = [
  { id: 'js', label: 'JavaScript' },
  { id: 'py', label: 'Python' },
  { id: 'php', label: 'PHP' },
  { id: 'curl', label: 'cURL' },
];
const CATEGORY_ICONS = { bot: Bot, wrench: Wrench, download: Download, film: Film, palette: Palette, shuffle: Shuffle, search: Search, activity: Activity, newspaper: Newspaper, info: Info, moon: Moon, upload: Upload, music2: Music2, layers: Layers, folder: FolderOpen };
function CategoryGlyph({ category, size = 17 }) {
  const Icon = CATEGORY_ICONS[String(category?.icon || 'folder').toLowerCase()] || FolderOpen;
  return <Icon size={size} />;
}

function paramInfo(raw) {
  return {
    name: String(raw?.name || raw?.n || '').trim(),
    type: String(raw?.type || raw?.t || 'string').toLowerCase(),
    required: Boolean(raw?.required ?? raw?.r),
    description: String(raw?.description || raw?.d || ''),
    defaultValue: raw?.default_value ?? raw?.defaultValue ?? raw?.default ?? '',
  };
}

function initialParams(endpoint) {
  let example;
  try { example = new URL(endpoint.example_url); } catch { example = null; }
  const values = {};
  (endpoint.params || []).map(paramInfo).filter((param) => param.name && param.type !== 'file').forEach((param) => {
    const fromExample = example?.searchParams.get(param.name);
    const value = fromExample ?? param.defaultValue;
    values[param.name] = param.type === 'boolean' ? String(value || 'false') : String(value ?? '');
  });
  if (endpoint.requires_api_key) values[endpoint.key_param_name || 'key'] = '';
  return values;
}

function getHost(endpoint) {
  try { return new URL(endpoint.example_url).origin; } catch { return ''; }
}

function buildRequestUrl(endpoint, values, maskApiKey = false) {
  const host = getHost(endpoint);
  const path = String(endpoint.path || '/');
  if (!host) return endpoint.example_url || path;
  const url = new URL(path, host);
  const method = String(endpoint.method || 'GET').toUpperCase();
  const queryMethod = ['GET', 'DELETE'].includes(method);
  const keyName = endpoint.key_param_name || 'key';
  const parameters = (endpoint.params || []).map(paramInfo);
  if (queryMethod) for (const parameter of parameters) {
    if (!parameter.name || parameter.type === 'file') continue;
    const value = endpoint.requires_api_key && parameter.name === keyName && maskApiKey ? 'YOUR_API_KEY' : values[parameter.name];
    if (value !== undefined && value !== '') url.searchParams.set(parameter.name, String(value));
  }
  if (endpoint.requires_api_key && queryMethod) {
    const keyValue = values[keyName];
    if (maskApiKey) url.searchParams.set(keyName, 'YOUR_API_KEY');
    else if (keyValue) url.searchParams.set(keyName, keyValue);
  }
  return url.toString();
}

function generateSnippet(endpoint, values, language) {
  const method = String(endpoint.method || 'GET').toUpperCase();
  const hasBody = ['POST', 'PUT'].includes(method);
  const keyName = endpoint.key_param_name || 'key';
  const url = buildRequestUrl(endpoint, { ...values, ...(endpoint.requires_api_key ? { [keyName]: 'YOUR_API_KEY' } : {}) }, true);
  const fields = (endpoint.params || []).map(paramInfo).filter((parameter) => parameter.name).map((parameter) => ({
    ...parameter,
    value: endpoint.requires_api_key && parameter.name === keyName ? 'YOUR_API_KEY' : (values[parameter.name] ?? parameter.defaultValue ?? ''),
  }));
  if (endpoint.requires_api_key && !fields.some((field) => field.name === keyName)) fields.push({ name: keyName, type: 'string', value: 'YOUR_API_KEY' });
  const regularFields = fields.filter((field) => field.type !== 'file');
  const fileFields = fields.filter((field) => field.type === 'file');
  const quoteShell = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
  const responseHandling = `if (response.headers.get("content-type")?.includes("application/json")) {\n  console.log(await response.json());\n} else {\n  console.log(await response.text());\n}`;

  if (language === 'py') {
    if (!hasBody) return `import requests\n\nurl = ${JSON.stringify(url)}\nresponse = requests.request(${JSON.stringify(method)}, url)\nresponse.raise_for_status()\nprint(response.text)`;
    const pyFields = regularFields.map((field) => `    ${JSON.stringify(field.name)}: (None, ${JSON.stringify(String(field.value))}),`).join('\n');
    const pyFiles = fileFields.map((field) => `    ${JSON.stringify(field.name)}: (${JSON.stringify('upload.bin')}, open(${JSON.stringify('upload.bin')}, "rb"), "application/octet-stream"),`).join('\n');
    const contents = [pyFields, pyFiles].filter(Boolean).join('\n');
    return `import requests\n\nurl = ${JSON.stringify(url)}\nfiles = {\n${contents}\n}\nresponse = requests.request(${JSON.stringify(method)}, url, files=files)\nresponse.raise_for_status()\nprint(response.text)`;
  }
  if (language === 'php') {
    const phpFields = regularFields.map((field) => `  ${JSON.stringify(field.name)} => ${JSON.stringify(String(field.value))},`).join('\n');
    const phpFiles = fileFields.map((field) => `  ${JSON.stringify(field.name)} => new CURLFile(${JSON.stringify('upload.bin')}),`).join('\n');
    const postFields = [phpFields, phpFiles].filter(Boolean).join('\n');
    return `<?php\n$url = ${JSON.stringify(url)};\n$ch = curl_init($url);\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\ncurl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${JSON.stringify(method)});${hasBody ? `\ncurl_setopt($ch, CURLOPT_POSTFIELDS, [\n${postFields}\n]);` : ''}\n$response = curl_exec($ch);\n$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);\ncurl_close($ch);\necho $response;\n?>`;
  }
  if (language === 'curl') {
    const args = [`curl -X ${method} ${quoteShell(url)} -H 'Accept: */*'`];
    regularFields.forEach((field) => args.push(`  -F ${quoteShell(`${field.name}=${field.value}`)}`));
    fileFields.forEach((field) => args.push(`  -F ${quoteShell(`${field.name}=@upload.bin`)}`));
    return args.join(' \\\n');
  }
  if (!hasBody) return `const url = ${JSON.stringify(url)};\nconst response = await fetch(url, {\n  method: ${JSON.stringify(method)},\n  headers: { Accept: "*/*" }\n});\n${responseHandling}`;
  const formLines = regularFields.map((field) => `formData.append(${JSON.stringify(field.name)}, ${JSON.stringify(String(field.value))});`);
  const fileLines = fileFields.map((field, index) => `const upload${index + 1}Input = document.querySelector('input[name=${JSON.stringify(field.name)}]');\nif (upload${index + 1}Input?.files?.[0]) formData.append(${JSON.stringify(field.name)}, upload${index + 1}Input.files[0]);`);
  return `const url = ${JSON.stringify(url)};\nconst formData = new FormData();\n${[...formLines, ...fileLines].join('\n')}\nconst response = await fetch(url, {\n  method: ${JSON.stringify(method)},\n  headers: { Accept: "*/*" },\n  body: formData\n});\n${responseHandling}`;
}

function classifyOutput(endpoint, mime = '') {
  const type = String(endpoint.output_type || 'json').toLowerCase();
  if (type === 'image' || type === 'binary-png' || mime.startsWith('image/')) return 'image';
  if (['video', 'mp4'].includes(type) || mime.startsWith('video/')) return 'video';
  if (['audio', 'mp3'].includes(type) || mime.startsWith('audio/')) return 'audio';
  return 'json';
}

function parseResponseBody(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function ResultView({ result }) {
  if (!result) return <div className="portal-output-empty"><Terminal size={17} /><span>Jalankan request untuk melihat respons endpoint.</span></div>;
  if (result.loading) return <div className="portal-output-empty"><LoaderCircle size={18} className="portal-spin" /><span>Mengirim request dan membaca respons…</span></div>;
  if (result.kind === 'image' && result.url) return <div className="portal-media-output"><img src={result.url} alt="Output API" /><a href={result.url} download="api-output.png"><Download size={14} />Unduh gambar</a></div>;
  if (result.kind === 'video' && result.url) return <div className="portal-media-output"><video src={result.url} controls playsInline /><a href={result.url} download="api-output.mp4"><Download size={14} />Unduh video</a></div>;
  if (result.kind === 'audio' && result.url) return <div className="portal-media-output"><audio src={result.url} controls /><a href={result.url} download="api-output.mp3"><Download size={14} />Unduh audio</a></div>;
  const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2);
  return <pre className={`portal-json-output ${result.error ? 'portal-json-error' : ''}`}><code>{text || 'Tidak ada body respons.'}</code></pre>;
}

function EndpointPlayground({ endpoint, onToast }) {
  const [values, setValues] = useState(() => initialParams(endpoint));
  const [files, setFiles] = useState({});
  const [activeTab, setActiveTab] = useState('js');
  const [result, setResult] = useState(endpoint.sample_response ? { mode: 'sample', kind: 'json', status: 'SAMPLE', mime: 'application/json', body: endpoint.sample_response } : null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [showSample, setShowSample] = useState(Boolean(endpoint.sample_response));

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result?.url]);

  const paramsList = useMemo(() => (endpoint.params || []).map(paramInfo).filter((parameter) => parameter.name && !(endpoint.requires_api_key && parameter.name === (endpoint.key_param_name || 'key'))), [endpoint.params, endpoint.requires_api_key, endpoint.key_param_name]);
  const requestUrl = useMemo(() => buildRequestUrl(endpoint, values, true), [endpoint, values]);
  const snippet = useMemo(() => generateSnippet(endpoint, values, activeTab), [endpoint, values, activeTab]);

  const updateValue = (name, value) => setValues((current) => ({ ...current, [name]: value }));

  const readResponse = async (response, mode = 'live') => {
    const mime = response.headers.get('content-type') || 'text/plain';
    const upstreamStatus = response.headers.get('x-upstream-status') || String(response.status);
    const kind = classifyOutput(endpoint, mime);
    if (['image', 'video', 'audio'].includes(kind)) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setResult((current) => { if (current?.url) URL.revokeObjectURL(current.url); return { mode, kind, status: upstreamStatus, mime, url, size: blob.size }; });
      return;
    }
    const body = parseResponseBody(await response.text());
    setResult((current) => { if (current?.url) URL.revokeObjectURL(current.url); return { mode, kind: 'json', status: upstreamStatus, mime, body }; });
  };

  const runDirectFallback = async () => {
    const method = String(endpoint.method || 'GET').toUpperCase();
    const url = new URL(buildRequestUrl(endpoint, values, false));
    const options = { method, headers: { Accept: 'application/json, text/plain, */*' } };
    if (['POST','PUT'].includes(method)) {
      const form = new FormData();
      for (const param of paramsList) {
        if (param.type === 'file') { if (files[param.name]) form.append(param.name, files[param.name]); }
        else if (values[param.name] !== undefined && values[param.name] !== '') form.append(param.name, values[param.name]);
      }
      if (endpoint.requires_api_key) form.append(endpoint.key_param_name || 'key', values[endpoint.key_param_name || 'key'] || '');
      options.body = form;
    }
    const response = await fetch(url, options);
    await readResponse(response, 'direct');
  };

  const runEndpoint = async () => {
    if (endpoint.requires_api_key && !String(values[endpoint.key_param_name || 'key'] || '').trim()) {
      onToast(`Masukkan ${endpoint.key_param_name || 'API key'} terlebih dahulu.`);
      return;
    }
    for (const param of paramsList) {
      if (param.required && param.type !== 'file' && !String(values[param.name] || '').trim()) {
        onToast(`Parameter “${param.name}” wajib diisi.`);
        return;
      }
      if (param.required && param.type === 'file' && !files[param.name]) {
        onToast(`Pilih file untuk parameter “${param.name}”.`);
        return;
      }
    }
    setBusy(true);
    setResult({ loading: true });
    setShowSample(false);
    try {
      const form = new FormData();
      form.append('endpointId', endpoint.id);
      form.append('params', JSON.stringify(values));
      for (const param of paramsList) if (param.type === 'file' && files[param.name]) form.append(`file:${param.name}`, files[param.name]);
      const response = await fetch('/api/execute', { method: 'POST', body: form });
      const contentType = response.headers.get('content-type') || '';
      // Vite's SPA fallback returns index.html for serverless paths; try a direct CORS request for local preview.
      if (contentType.includes('text/html')) await runDirectFallback();
      else await readResponse(response);
    } catch (error) {
      setResult({ mode: 'error', kind: 'json', status: 'ERROR', mime: 'application/json', error: true, body: { error: 'Browser tidak dapat membaca endpoint. Periksa CORS, URL, atau konfigurasi Vercel/Supabase.', detail: error.message } });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      onToast(key === 'url' ? 'URL contoh disalin (API key disamarkan).' : 'Kode integrasi disalin.');
      window.setTimeout(() => setCopied(''), 1500);
    } catch { onToast('Clipboard tidak tersedia di browser ini.'); }
  };

  const showSavedSample = () => {
    if (!endpoint.sample_response) return;
    if (result?.url) URL.revokeObjectURL(result.url);
    setShowSample(true);
    setResult({ mode: 'sample', kind: 'json', status: 'SAMPLE', mime: 'application/json', body: endpoint.sample_response });
  };

  return (
    <div className="portal-playground">
      <div className="portal-step-heading"><span>TRY IT OUT</span><p>Parameter diisi langsung di browser. Kunci API tidak disimpan di katalog.</p></div>
      <div className="portal-request-line">
        <span className={`portal-method method-${String(endpoint.method || 'GET').toLowerCase()}`}>{endpoint.method || 'GET'}</span>
        <code title={requestUrl}>{requestUrl}</code>
        <button onClick={() => copy(requestUrl, 'url')} aria-label="Salin URL request"><Copy size={14} />{copied === 'url' ? 'Tersalin' : 'Salin URL'}</button>
      </div>

      {(endpoint.requires_api_key || paramsList.length > 0) && <div className="portal-params-grid">
        {paramsList.map((param) => (
          <label className="portal-param-field" key={param.name}>
            <span>{param.name}{param.required && <b>Wajib</b>}<small>{param.type}</small></span>
            {param.type === 'file' ? (
              <input type="file" name={param.name} onChange={(event) => setFiles((current) => ({ ...current, [param.name]: event.target.files?.[0] || null }))} />
            ) : param.type === 'boolean' ? (
              <select value={values[param.name] ?? 'false'} onChange={(event) => updateValue(param.name, event.target.value)}><option value="false">false</option><option value="true">true</option></select>
            ) : (
              <input type={param.type === 'number' ? 'number' : 'text'} value={values[param.name] ?? ''} onChange={(event) => updateValue(param.name, event.target.value)} placeholder={param.description || param.defaultValue || `Isi ${param.name}`} />
            )}
            {param.description && <small className="portal-param-help">{param.description}</small>}
          </label>
        ))}
        {endpoint.requires_api_key && <label className="portal-param-field"><span>{endpoint.key_param_name || 'key'}<b>API KEY</b><small>secret</small></span><input type="password" autoComplete="off" value={values[endpoint.key_param_name || 'key'] || ''} onChange={(event) => updateValue(endpoint.key_param_name || 'key', event.target.value)} placeholder={endpoint.key_description || 'Masukkan key untuk request ini'} /><small className="portal-param-help">Hanya dikirim untuk request ini; tidak disimpan.</small></label>}
      </div>}

      <div className="portal-run-row">
        <button className="portal-run-button" onClick={runEndpoint} disabled={busy}><Play size={14} fill="currentColor" />{busy ? 'Memproses…' : 'EXECUTE REQUEST'}</button>
        {endpoint.sample_response && <button className="portal-sample-button" onClick={showSavedSample}><RefreshCw size={13} />Lihat sample</button>}
        <span>Preview dibatasi 20 detik / respons 6 MB.</span>
      </div>

      <section className="portal-code-section">
        <div className="portal-section-label"><FileCode2 size={14} />INTEGRASI SNIPPET</div>
        <div className="portal-code-frame">
          <div className="portal-code-tabs">
            <div>{CODE_TABS.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</div>
            <button className="portal-copy-code" onClick={() => copy(snippet, 'code')}><Copy size={13} />{copied === 'code' ? 'Tersalin' : 'Salin kode'}</button>
          </div>
          <pre><code>{snippet}</code></pre>
        </div>
      </section>

      <section className="portal-output-section">
        <div className="portal-output-head">
          <div className="portal-section-label"><Terminal size={14} />LIVE OUTPUT</div>
          {result && !result.loading && <div className="portal-output-badges"><span className={`portal-status ${String(result.status).startsWith('2') || result.status === 'SAMPLE' ? 'ok' : 'bad'}`}>HTTP {result.status}</span><span>{result.mime}</span>{result.mode === 'sample' && <i>Sample</i>}{result.mode === 'direct' && <i>Direct/CORS</i>}</div>}
        </div>
        {result?.body?.success !== undefined && <div className={`portal-truth ${result.body.success ? 'true' : 'false'}`}>{result.body.success ? 'TRUE' : 'FALSE'}<span>response success flag</span></div>}
        <ResultView result={result} />
        {result && !result.loading && result.kind === 'json' && result.body !== undefined && <button className="portal-copy-response" onClick={() => copy(typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2), 'response')}><Copy size={13} />Salin JSON response</button>}
      </section>
    </div>
  );
}

export default function EndpointPortal({ onHome }) {
  const [categories, setCategories] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedCategory, setExpandedCategory] = useState('');
  const [expandedEndpoint, setExpandedEndpoint] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [sortMode, setSortMode] = useState('name');

  const showToast = useCallback((message) => setToast(message), []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadCatalog = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/v1/endpoints?limit=100&offset=0');
      const type = response.headers.get('content-type') || '';
      if (type.includes('application/json')) {
        const firstPage = await response.json();
        if (!response.ok || !firstPage.ok) throw new Error(firstPage.error?.message || 'Katalog endpoint gagal dimuat.');
        const allRows = [...(firstPage.data || [])];
        let offset = allRows.length;
        let hasMore = Boolean(firstPage.pagination?.hasMore);
        while (hasMore && offset < 10000) {
          const nextResponse = await fetch(`/api/v1/endpoints?limit=100&offset=${offset}`);
          const nextPage = await nextResponse.json();
          if (!nextResponse.ok || !nextPage.ok) throw new Error(nextPage.error?.message || 'Halaman katalog berikutnya gagal dimuat.');
          allRows.push(...(nextPage.data || []));
          if (!(nextPage.data || []).length) break;
          offset = allRows.length;
          hasMore = Boolean(nextPage.pagination?.hasMore);
        }
        setCategories(firstPage.categories || []);
        setEndpoints(allRows);
        return;
      }
      if (!isSupabaseConfigured || !supabase) throw new Error(SUPABASE_SETUP_HINT);
      const [{ data: categoryRows, error: categoryError }, { data: endpointRows, error: endpointError }] = await Promise.all([
        supabase.from('endpoint_categories').select('id,name,slug,icon,parent_id,sort_order,is_active').eq('is_active', true).order('sort_order').order('name'),
        supabase.from('api_endpoints').select('id,name,slug,method,path,category_id,subfolder,description,output_type,example_url,params,requires_api_key,key_param_name,key_description,sample_response,sort_order,created_at,category:endpoint_categories(id,name,slug,icon,parent_id)').eq('is_public', true).eq('is_active', true).order('sort_order').order('name'),
      ]);
      if (categoryError) throw categoryError;
      if (endpointError) throw endpointError;
      setCategories(categoryRows || []); setEndpoints(endpointRows || []);
    } catch (loadError) {
      setError(loadError.message || 'Katalog belum tersedia.');
      setCategories([]); setEndpoints([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = endpoints.filter((endpoint) => {
      const category = endpoint.category?.name || categories.find((item) => item.id === endpoint.category_id)?.name || '';
      const categoryMatch = categoryFilter === 'all' || endpoint.category_id === categoryFilter;
      const searchable = `${endpoint.name} ${endpoint.slug} ${endpoint.path} ${endpoint.description} ${endpoint.subfolder} ${category}`.toLowerCase();
      return categoryMatch && (!term || searchable.includes(term));
    });
    if (sortMode === 'name') rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === 'newest') rows = rows.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return rows;
  }, [endpoints, categories, categoryFilter, search, sortMode]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const category of categories) map.set(category.id, { category, rows: [] });
    for (const endpoint of filtered) {
      const id = endpoint.category_id || 'uncategorized';
      if (!map.has(id)) map.set(id, { category: endpoint.category || { id, name: 'Lainnya', icon: 'Folder', sort_order: 999 }, rows: [] });
      map.get(id).rows.push(endpoint);
    }
    return [...map.values()].filter((item) => categoryFilter === 'all' || item.category.id === categoryFilter || item.rows.length > 0);
  }, [categories, filtered, categoryFilter]);

  const categoryCount = categories.length;
  const methodCount = new Set(endpoints.map((endpoint) => endpoint.method)).size;
  const mediaCount = endpoints.filter((endpoint) => ['image','binary-png','video','mp4','audio','mp3'].includes(endpoint.output_type)).length;

  return (
    <div className="endpoint-portal">
      <header className="portal-topbar">
        <button className="portal-brand" onClick={onHome} aria-label="Kembali ke SnippetVault"><span className="portal-brand-mark"><FileCode2 size={18} /></span><span><b>Snippet<span>Vault</span></b><small>ENDPOINT PORTAL</small></span></button>
        <div className="portal-top-actions"><button className="portal-nav-link" onClick={onHome}><ArrowLeft size={14} />Library</button><a className="portal-admin-link" href="/admin"><LockKeyhole size={14} />Admin dashboard</a></div>
      </header>

      <main className="portal-main">
        <section className="portal-hero">
          <div className="portal-hero-copy">
            <span className="portal-eyebrow"><span />PUBLIC API CATALOG</span>
            <h1>Endpoint yang bisa <em>dicoba langsung.</em></h1>
            <p>Katalog endpoint, parameter dinamis, contoh integrasi, dan live output dalam satu playground. Dikelola oleh <b>Van313 | Official</b>.</p>
            <div className="portal-hero-actions"><a href="#catalog"><span>Jelajahi endpoint</span><ArrowRight size={15} /></a><a href="/admin" className="portal-hero-secondary"><LockKeyhole size={14} />Kelola katalog</a></div>
          </div>
          <div className="portal-hero-card">
            <div className="portal-window-head"><span><i /><i /><i /></span><b>request.ts</b><span className="portal-window-badge">LIVE</span></div>
            <pre><code><span>const</span> response = <b>await</b> fetch(endpoint);<br /><span>const</span> data = <b>await</b> response.json();<br />console.log(data);</code></pre>
            <div className="portal-window-foot"><span><Activity size={12} /> Playground siap dipakai</span><span>JSON · MEDIA</span></div>
          </div>
        </section>

        <section className="portal-stat-grid" aria-label="Ringkasan catalog">
          <div><span>KATEGORI</span><b>{categoryCount.toString().padStart(2, '0')}</b><small>folder tersedia</small></div>
          <div><span>ENDPOINT</span><b>{endpoints.length.toString().padStart(2, '0')}</b><small>data katalog aktif</small></div>
          <div><span>METHOD</span><b>{methodCount.toString().padStart(2, '0')}</b><small>HTTP method dipakai</small></div>
          <div><span>MEDIA OUTPUT</span><b>{mediaCount.toString().padStart(2, '0')}</b><small>image / audio / video</small></div>
        </section>

        <section className="portal-catalog" id="catalog">
          <div className="portal-catalog-heading">
            <div><span className="portal-section-kicker"><FolderOpen size={13} />KATALOG ENDPOINT</span><h2>Temukan endpoint<span>{filtered.length}</span></h2><p>Pilih endpoint, isi parameter, jalankan, dan salin kode integrasinya.</p></div>
            <div className="portal-catalog-tools"><label className="portal-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, path, kategori…" /><kbd>/</kbd></label><select value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Urutkan endpoint"><option value="name">Nama A–Z</option><option value="newest">Terbaru</option></select></div>
          </div>

          <div className="portal-category-filters" role="tablist" aria-label="Filter kategori">
            <button className={categoryFilter === 'all' ? 'active' : ''} onClick={() => setCategoryFilter('all')}>Semua <span>{endpoints.length}</span></button>
            {categories.map((category) => <button key={category.id} className={categoryFilter === category.id ? 'active' : ''} onClick={() => setCategoryFilter(category.id)}>{category.name}<span>{endpoints.filter((endpoint) => endpoint.category_id === category.id).length}</span></button>)}
          </div>

          {error && <div className="portal-config-alert"><ShieldCheck size={17} /><div><b>Katalog belum terhubung</b><p>{error}</p><small>Setelah konfigurasi, endpoint akan dimuat dari Supabase. Tidak ada data API demo yang dipasang.</small></div></div>}
          {loading && <div className="portal-load-state"><LoaderCircle size={20} className="portal-spin" />Memuat katalog…</div>}
          {!loading && !error && endpoints.length === 0 && <div className="portal-empty"><div><Plug size={22} /></div><span className="portal-section-kicker">KATALOG KOSONG</span><h3>Endpoint pertama dimulai di sini.</h3><p>Belum ada data endpoint. Masuk ke admin untuk menambahkan API, kategori, parameter, dan contoh request.</p><a href="/admin"><LockKeyhole size={14} />Buka admin dashboard</a></div>}

          {!loading && !error && endpoints.length > 0 && <div className="portal-category-stack">
            {grouped.map(({ category, rows }) => (
              <section className="portal-category-card" key={category.id}>
                <button className="portal-category-heading" onClick={() => setExpandedCategory((current) => current === category.id ? '' : category.id)} aria-expanded={expandedCategory === category.id}>
                  <span className="portal-category-icon"><CategoryGlyph category={category} /></span><span className="portal-category-title"><b>{category.name}</b>{category.parent_id && <small>Subfolder</small>}</span><span className="portal-category-count">{rows.length} endpoint</span><ChevronDown size={16} className={expandedCategory === category.id ? 'rotate' : ''} />
                </button>
                {(expandedCategory === category.id || categoryFilter === category.id || Boolean(search.trim()) || rows.some((row) => row.id === expandedEndpoint)) && <div className="portal-endpoint-list">
                  {rows.length === 0 ? <div className="portal-empty-category">Belum ada endpoint di folder ini.</div> : rows.map((endpoint) => <article className="portal-endpoint-card" key={endpoint.id}>
                    <div className="portal-endpoint-summary">
                      <button className="portal-endpoint-main" onClick={() => setExpandedEndpoint((current) => current === endpoint.id ? '' : endpoint.id)} aria-expanded={expandedEndpoint === endpoint.id}>
                        <span className={`portal-method method-${String(endpoint.method || 'GET').toLowerCase()}`}>{endpoint.method || 'GET'}</span>
                        <span className="portal-endpoint-title"><b>{endpoint.name}</b><code>{endpoint.path}</code></span>
                        <span className="portal-endpoint-subfolder">{endpoint.subfolder || category.name}</span>
                      </button>
                      <button className="portal-try-button" onClick={() => setExpandedEndpoint((current) => current === endpoint.id ? '' : endpoint.id)}><Play size={13} fill="currentColor" />Coba</button>
                    </div>
                    {expandedEndpoint === endpoint.id && <div className="portal-endpoint-detail">
                      <p className="portal-endpoint-description">{endpoint.description || 'Deskripsi endpoint belum ditambahkan.'}</p>
                      <div className="portal-endpoint-meta"><span>{endpoint.output_type || 'json/text'}</span>{endpoint.requires_api_key && <span><LockKeyhole size={11} />API key</span>}{endpoint.example_url && <a href={endpoint.example_url} target="_blank" rel="noreferrer"><ExternalLink size={11} />URL contoh</a>}</div>
                      <EndpointPlayground key={endpoint.id} endpoint={endpoint} onToast={showToast} />
                    </div>}
                  </article>)}
                </div>}
              </section>
            ))}
          </div>}
        </section>

        <footer className="portal-footer"><span>© {new Date().getFullYear()} SnippetVault</span><span>Developer <b>Van313 | Official</b></span><span>Endpoint preview diproxy secara terbatas</span></footer>
      </main>
      {toast && <div className="portal-toast"><Check size={14} />{toast}</div>}
    </div>
  );
}
