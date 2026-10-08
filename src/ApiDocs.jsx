import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  House,
  Menu,
  Play,
  Plug,
  Search,
  Send,
  ShieldCheck,
  Terminal,
  UserRound,
  X,
} from 'lucide-react';
import './api-docs.css';

const API_PREFIX = '/api/v1/snippets';
const PLACEHOLDER_RE = /\b(TODO|FIXME|YOUR[_ -]?API[_ -]?KEY|YOUR[_ -]?TOKEN|REPLACE[_ -]?ME|CHANGE[_ -]?ME|process\.env\.[A-Z0-9_]+)\b/i;
const RISK_RE = /\beval\s*\(|\bnew\s+Function\s*\(|\b(child_process|execSync|spawnSync|execFileSync)\b|\brm\s+-rf\b|\bsudo\s+/i;

function toPublicSnippet(snippet, includeCode = false) {
  const record = {
    id: snippet.id,
    slug: snippet.id,
    title: snippet.title,
    description: snippet.description,
    category: snippet.category,
    language: String(snippet.language || '').toLowerCase(),
    tags: snippet.tags || [],
    thumbnail: snippet.thumbnail || null,
    sourceUrl: snippet.sourceUrl || null,
    author: snippet.author || 'Van313 | Official',
    updatedAt: new Date(Number(snippet.createdAt || Date.now())).toISOString(),
    ...(snippet.apiPreview ? { apiPreview: includeCode ? snippet.apiPreview : { type: snippet.apiPreview.type, method: snippet.apiPreview.method, endpoint: snippet.apiPreview.endpoint } } : {}),
    ...(includeCode ? { code: snippet.code || '' } : { codeLines: String(snippet.code || '').split('\n').length }),
  };
  return record;
}

function makeLocalResponse(path, snippets) {
  const url = new URL(path, typeof window === 'undefined' ? 'https://local.test' : window.location.origin);
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === API_PREFIX) {
    const q = (url.searchParams.get('q') || url.searchParams.get('search') || '').toLowerCase();
    const category = (url.searchParams.get('category') || '').toLowerCase();
    const language = (url.searchParams.get('language') || '').toLowerCase();
    const tag = (url.searchParams.get('tag') || '').toLowerCase();
    const max = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '10', 10) || 10));
    const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const matching = snippets.filter((item) => {
      const text = `${item.title} ${item.description} ${item.id} ${item.apiPreview?.type || ''} ${item.apiPreview?.endpoint || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
      return (!q || text.includes(q))
        && (!category || item.category.toLowerCase() === category)
        && (!language || item.language.toLowerCase() === language)
        && (!tag || (item.tags || []).some((value) => value.toLowerCase() === tag));
    }).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const data = matching.slice(offset, offset + max).map((item) => toPublicSnippet(item));
    return {
      httpStatus: 200,
      body: { ok: true, data, pagination: { total: matching.length, limit: max, offset, returned: data.length, hasMore: offset + data.length < matching.length } },
      mode: 'Preview lokal',
    };
  }
  const slug = pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() || '';
  const item = snippets.find((snippet) => snippet.id.toLowerCase() === slug);
  if (!item) {
    return { httpStatus: 404, body: { ok: false, error: { code: 'SNIPPET_NOT_FOUND', message: `Snippet “${slug}” tidak ditemukan.` } }, mode: 'Preview lokal' };
  }
  return { httpStatus: 200, body: { ok: true, data: toPublicSnippet(item, true) }, mode: 'Preview lokal' };
}

function localPreflight(code, language) {
  const source = String(code || '').trim();
  const checks = [];
  if (!source) {
    return { state: 'review', label: 'Kode kosong', checks: [{ label: 'Source', status: 'fail', detail: 'Tempel kode untuk mulai memeriksa.' }], note: 'Pemeriksaan statis saja; kode tidak dijalankan.' };
  }
  checks.push({ label: 'Source', status: 'pass', detail: `${source.split('\n').length} baris kode ditemukan.` });
  const placeholder = source.match(PLACEHOLDER_RE);
  const isRisky = RISK_RE.test(source);
  const isJavaScript = /javascript/i.test(language);
  let syntax = { label: 'Parser', status: 'limited', detail: `Parser ${language} tidak tersedia di browser; perlu tinjau manual.` };
  if (isJavaScript) {
    const parseOnly = source
      .replace(/^\s*import\s+.*?;?\s*$/gm, '')
      .replace(/^\s*export\s+default\s+/gm, '')
      .replace(/^\s*export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '')
      .replace(/^\s*export\s+\{[^}]*\}\s*;?\s*$/gm, '');
    try {
      // Compile only to validate syntax. The resulting function is never invoked.
      new Function(parseOnly);
      syntax = { label: 'Sintaks JavaScript', status: 'pass', detail: 'Lolos parse-only check; tidak dieksekusi.' };
    } catch (error) {
      syntax = { label: 'Sintaks JavaScript', status: 'fail', detail: error.message.split('\n')[0] };
    }
  }
  checks.push(syntax);
  checks.push(placeholder
    ? { label: 'Konfigurasi', status: 'warn', detail: `Perlu isi/periksa ${placeholder[0]}.` }
    : { label: 'Konfigurasi', status: 'pass', detail: 'Tidak menemukan placeholder umum.' });
  checks.push(isRisky
    ? { label: 'Pola risiko', status: 'warn', detail: 'Ada pola yang perlu ditinjau manual.' }
    : { label: 'Pola risiko', status: 'pass', detail: 'Tidak menemukan pola risiko umum.' });
  const state = syntax.status === 'fail' || isRisky ? 'review' : placeholder || syntax.status === 'limited' ? 'setup' : 'ready';
  return {
    state,
    label: state === 'ready' ? 'Lolos preflight' : state === 'setup' ? 'Perlu konfigurasi/tinjau' : 'Perlu ditinjau',
    checks,
    note: 'Pemeriksaan statis saja. Tidak menjamin runtime atau layanan pihak ketiga aktif; kode tidak dijalankan.',
  };
}

function PrettyJson({ value, compact = false }) {
  return <pre className={`api-json ${compact ? 'api-json-compact' : ''}`}><code>{JSON.stringify(value, null, 2)}</code></pre>;
}

function ApiDocs({ snippets = [], onHome, onAddSnippet }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [toast, setToast] = useState('');
  const [testerPath, setTesterPath] = useState(`${API_PREFIX}?limit=10`);
  const [requestResult, setRequestResult] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [selectedCodeId, setSelectedCodeId] = useState(snippets[0]?.id || 'fetch-json');
  const [codeLanguage, setCodeLanguage] = useState(snippets[0]?.language || 'JavaScript');
  const [codeValue, setCodeValue] = useState(snippets[0]?.code || '');
  const [codeCheck, setCodeCheck] = useState(() => localPreflight(snippets[0]?.code || '', snippets[0]?.language || 'JavaScript'));
  const [codeBusy, setCodeBusy] = useState(false);
  const searchRef = useRef(null);
  const testerRef = useRef(null);
  const codeReviewRef = useRef(null);
  const live = !import.meta.env.DEV;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://snippet-van313.vercel.app';

  useEffect(() => {
    document.title = 'API Publik — SnippetVault';
    return () => { document.title = 'SnippetVault — Code Library by Van313'; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const local = localPreflight(codeValue, codeLanguage);
      setCodeCheck(local);
      if (!live || !codeValue.trim()) return;
      setCodeBusy(true);
      try {
        const response = await fetch('/api/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ code: codeValue, language: codeLanguage }),
        });
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) setCodeCheck(await response.json());
      } catch {
        // Keep the local parse-only result if the API is temporarily unavailable.
      } finally {
        setCodeBusy(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [codeValue, codeLanguage, live]);

  const snippetsFiltered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return [];
    return snippets.filter((item) => `${item.title} ${item.description} ${(item.tags || []).join(' ')}`.toLowerCase().includes(q)).slice(0, 5);
  }, [searchValue, snippets]);

  const listPreview = useMemo(() => makeLocalResponse(`${API_PREFIX}?limit=5`, snippets).body, [snippets]);
  const defaultSnippet = snippets.find((item) => item.id === 'fetch-json') || snippets[0];
  const detailPreview = useMemo(() => defaultSnippet ? makeLocalResponse(`${API_PREFIX}/${encodeURIComponent(defaultSnippet.id)}`, snippets).body : { ok: true, data: null }, [defaultSnippet, snippets]);

  const showToast = (message) => setToast(message);
  const copyText = async (text, message = 'Tersalin ke clipboard.') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message);
    } catch {
      showToast('Clipboard tidak tersedia di browser ini.');
    }
  };

  const executeRequest = useCallback(async (path) => {
    const cleanPath = path.trim();
    if (!cleanPath.startsWith('/api/v1/snippets')) {
      setRequestResult({ httpStatus: 400, body: { ok: false, error: { code: 'INVALID_PATH', message: 'Path harus diawali /api/v1/snippets.' } }, mode: 'Validasi lokal' });
      return;
    }
    setRequestBusy(true);
    setRequestResult(null);
    try {
      const response = await fetch(cleanPath, { headers: { Accept: 'application/json' } });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        setRequestResult({ httpStatus: response.status, body: await response.json(), mode: 'Live API' });
      } else if (import.meta.env.DEV) {
        setRequestResult(makeLocalResponse(cleanPath, snippets));
      } else {
        setRequestResult({ httpStatus: response.status, body: { ok: false, error: { code: 'NON_JSON_RESPONSE', message: 'API tidak mengembalikan JSON. Periksa deployment/functions.' } }, mode: 'Live API' });
      }
    } catch (error) {
      if (import.meta.env.DEV) setRequestResult(makeLocalResponse(cleanPath, snippets));
      else setRequestResult({ httpStatus: 0, body: { ok: false, error: { code: 'NETWORK_ERROR', message: error.message || 'Request gagal.' } }, mode: 'Live API' });
    } finally {
      setRequestBusy(false);
    }
  }, [snippets]);

  const tryEndpoint = (path) => {
    setTesterPath(path);
    window.setTimeout(() => {
      testerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      executeRequest(path);
    }, 40);
  };

  const onChooseSnippet = (snippet) => {
    setSelectedCodeId(snippet.id);
    setCodeLanguage(snippet.language || 'JavaScript');
    setCodeValue(snippet.code || '');
    setSearchValue('');
    codeReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const runCodeCheck = async () => {
    const local = localPreflight(codeValue, codeLanguage);
    setCodeCheck(local);
    if (!live) return;
    setCodeBusy(true);
    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code: codeValue, language: codeLanguage }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) setCodeCheck(await response.json());
    } catch {
      // Local result remains visible.
    } finally {
      setCodeBusy(false);
    }
  };

  const testerIsTrue = requestResult?.httpStatus >= 200 && requestResult?.httpStatus < 300 && requestResult?.body?.ok === true;
  const codeIsTrue = codeCheck?.state === 'ready';
  const curlList = `curl -sS "${baseUrl}${API_PREFIX}?limit=10"`;
  const detailSlug = defaultSnippet?.id || 'fetch-json';
  const curlDetail = `curl -sS "${baseUrl}${API_PREFIX}/${detailSlug}"`;

  return (
    <div className="apidoc-page">
      <header className="apidoc-topbar">
        <button className="api-icon-btn api-menu-button" aria-label="Buka menu" onClick={() => setDrawerOpen((open) => !open)}>{drawerOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <div className="api-search-wrap">
          <Search size={17} />
          <input ref={searchRef} value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Cari snippet di SnippetVault..." aria-label="Cari snippet" />
          {searchValue && <button aria-label="Bersihkan pencarian" onClick={() => setSearchValue('')}><X size={15} /></button>}
          {snippetsFiltered.length > 0 && <div className="api-search-results">{snippetsFiltered.map((snippet) => <button key={snippet.id} onClick={() => onChooseSnippet(snippet)}><FileCode2 size={15} /><span><b>{snippet.title}</b><small>{snippet.language} · {snippet.category}</small></span><ChevronRight size={14} /></button>)}</div>}
        </div>
      </header>

      {drawerOpen && <div className="api-drawer-backdrop" onClick={() => setDrawerOpen(false)}><nav className="api-drawer" onClick={(event) => event.stopPropagation()}><div className="api-drawer-head"><b>SnippetVault</b><button className="api-icon-btn" onClick={() => setDrawerOpen(false)}><X size={18} /></button></div><button onClick={onHome}><House size={17} />Beranda</button><button className="drawer-active"><Plug size={17} />API Publik</button><button onClick={() => { setDrawerOpen(false); testerRef.current?.scrollIntoView({ behavior: 'smooth' }); }}><Activity size={17} />Coba endpoint</button><button onClick={() => { setDrawerOpen(false); codeReviewRef.current?.scrollIntoView({ behavior: 'smooth' }); }}><Code2 size={17} />Review kode</button></nav></div>}

      <main className="apidoc-container">
        <section className="apidoc-intro">
          <div className="api-title-row"><span className="api-title-icon"><Plug size={20} fill="currentColor" /></span><h1>API Publik</h1><span className="api-readonly-pill"><span />READ ONLY</span></div>
          <p>Ambil snippet SnippetVault lewat REST API. Tanpa API key, respons JSON, dan CORS terbuka untuk integrasi publik.</p>
        </section>

        <section className="api-base-card" aria-label="Base URL API">
          <span>BASE URL</span>
          <div><code>{baseUrl}</code><button className="api-copy-inline" aria-label="Salin base URL" onClick={() => copyText(baseUrl, 'Base URL disalin.')}><Copy size={15} /></button></div>
        </section>

        <EndpointCard
          method="GET"
          path={`${API_PREFIX}`}
          title="Daftar Snippet"
          description="Ambil snippet terbaru. Filter lewat search, category, language, tag, limit maksimal 50, dan offset."
          curl={curlList}
          response={listPreview}
          onCopy={copyText}
          onTry={() => tryEndpoint(`${API_PREFIX}?limit=10`)}
          showTry
        />

        <EndpointCard
          method="GET"
          path={`${API_PREFIX}/:slug`}
          title="Detail Snippet"
          description="Ambil satu snippet lengkap beserta isi kodenya menggunakan slug snippet."
          curl={curlDetail}
          response={detailPreview}
          onCopy={copyText}
          onTry={() => tryEndpoint(`${API_PREFIX}/${detailSlug}`)}
        />

        <section className="api-query-reference">
          <div className="reference-title"><span><BookOpen size={17} /></span><div><small>QUERY PARAMETERS</small><h2>Filter yang tersedia</h2></div></div>
          <div className="query-table">
            <div className="query-table-head"><span>Parameter</span><span>Tipe</span><span>Fungsi</span></div>
            {[
              ['q / search', 'string', 'Cari judul, deskripsi, slug, dan tag.'],
              ['category', 'string', 'Filter kategori, mis. API atau Frontend.'],
              ['language', 'string', 'Filter bahasa, mis. javascript atau python.'],
              ['tag', 'string', 'Filter berdasarkan satu tag.'],
              ['limit', '1–50', 'Jumlah hasil per halaman; default 10.'],
              ['offset', 'integer', 'Geser halaman; default 0.'],
            ].map(([name, type, description]) => <div className="query-table-row" key={name}><code>{name}</code><span>{type}</span><p>{description}</p></div>)}
          </div>
          <div className="reference-note"><ShieldCheck size={14} />Endpoint publik bersifat read-only. Snippet baru perlu dikurasi dan diterbitkan melalui sumber data project.</div>
        </section>

        <section className="api-tester-card" ref={testerRef} id="api-tester">
          <div className="tester-heading"><span className="tester-icon"><Terminal size={18} /></span><div><small>LIVE API PLAYGROUND</small><h2>Coba endpoint sekarang</h2><p>Kirim request GET sungguhan dan lihat respons serta statusnya.</p></div><span className="tester-live"><i />{live ? 'LIVE' : 'LOCAL'}</span></div>
          <div className="tester-request-row"><span className="method-chip">GET</span><input aria-label="Path endpoint" value={testerPath} onChange={(event) => setTesterPath(event.target.value)} spellCheck="false" /><button className="tester-run-button" onClick={() => executeRequest(testerPath)} disabled={requestBusy}><Play size={15} fill="currentColor" />{requestBusy ? 'Mengirim…' : 'Kirim request'}</button></div>
          <div className="quick-paths"><span>Coba cepat:</span><button onClick={() => setTesterPath(`${API_PREFIX}?limit=5`)}>Daftar 5</button><button onClick={() => setTesterPath(`${API_PREFIX}?language=javascript`)}>JavaScript</button><button onClick={() => setTesterPath(`${API_PREFIX}/${detailSlug}`)}>Detail contoh</button></div>
          {requestResult ? (
            <div className="api-result-panel">
              <div className="result-panel-head"><div className={`bool-result ${testerIsTrue ? 'bool-true' : 'bool-false'}`}><span>{testerIsTrue ? 'TRUE' : 'FALSE'}</span><b>{testerIsTrue ? 'Request berhasil' : 'Request gagal'}</b></div><div className="http-result"><span className={testerIsTrue ? 'http-ok' : 'http-error'}>{requestResult.httpStatus || 'ERR'}</span><span>{requestResult.mode}</span></div></div>
              <PrettyJson value={requestResult.body} />
            </div>
          ) : (
            <div className="tester-empty"><div><ArrowDown size={16} /><span>Jalankan request untuk melihat JSON response dan hasil TRUE/FALSE.</span></div><button onClick={() => executeRequest(testerPath)} disabled={requestBusy}><Play size={14} fill="currentColor" />Coba Langsung</button></div>
          )}
        </section>

        <section className="code-review-card" ref={codeReviewRef} id="code-review">
          <div className="review-heading"><span className="review-icon"><Code2 size={18} /></span><div><small>REAL-TIME PREFLIGHT</small><h2>Review snippet sebelum dipakai</h2><p>Status berubah saat kode diedit. Pemeriksaan tidak mengeksekusi kode.</p></div></div>
          <div className="review-toolbar"><label>Snippet<select value={selectedCodeId} onChange={(event) => { const item = snippets.find((snippet) => snippet.id === event.target.value); setSelectedCodeId(event.target.value); if (item) { setCodeValue(item.code || ''); setCodeLanguage(item.language || 'JavaScript'); } }}>{snippets.map((snippet) => <option value={snippet.id} key={snippet.id}>{snippet.title}</option>)}</select></label><span className="review-language"><FileCode2 size={14} />{codeLanguage}</span></div>
          <label className="sr-only" htmlFor="preflight-editor">Kode snippet untuk direview</label>
          <textarea id="preflight-editor" className="review-editor" value={codeValue} onChange={(event) => setCodeValue(event.target.value)} spellCheck="false" maxLength={60000} />
          <div className="review-result-row">
            <div className={`review-verdict ${codeIsTrue ? 'verdict-true' : 'verdict-false'}`}><span>{codeIsTrue ? 'TRUE' : 'FALSE'}</span><b>{codeCheck?.label || 'Memeriksa…'}</b><small>{codeBusy ? 'Memeriksa…' : 'Static check · tanpa eksekusi'}</small></div>
            <button className="review-run-button" onClick={runCodeCheck} disabled={codeBusy}><Activity size={15} />{codeBusy ? 'Memeriksa…' : 'Periksa ulang'}</button>
          </div>
          <div className="review-checks">{(codeCheck?.checks || []).map((check, index) => <div className={`review-check review-check-${check.status}`} key={`${check.label}-${index}`}><span>{check.status === 'pass' ? <CheckCircle2 size={14} /> : check.status === 'warn' ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}</span><b>{check.label}</b><small>{check.detail}</small></div>)}</div>
          <div className="review-footnote"><AlertTriangle size={14} /><span>TRUE berarti lolos pemeriksaan statis awal, bukan jaminan kode aktif di runtime. Untuk kode asing, tinjau sumber dan uji di lingkungan terisolasi.</span></div>
        </section>

        <section className="api-note"><Database size={16} /><p><b>Catatan:</b> API ini read-only dan memakai koleksi snippet publik yang dikurasi. Untuk memuat data bersama hasil impor yang berizin, sambungkan database sebelum dipakai produksi.</p></section>
        <footer className="api-doc-footer"><span>© {new Date().getFullYear()} SnippetVault</span><span>By <b>Van313 | Official</b></span><a href="https://github.com/lucuk094-crypto/snippet-van313" target="_blank" rel="noreferrer">Project source <ExternalLink size={12} /></a></footer>
      </main>

      <nav className="api-bottom-nav" aria-label="Navigasi bawah">
        <button onClick={onHome}><House size={18} /><span>Beranda</span></button>
        <button onClick={() => searchRef.current?.focus()}><Search size={18} /><span>Cari</span></button>
        <button className="bottom-nav-active" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><Plug size={18} /><span>API</span></button>
        <button onClick={onAddSnippet}><Send size={17} /><span>Request</span></button>
        <button onClick={() => showToast('Developer: Van313 | Official')}><UserRound size={18} /><span>Owner</span></button>
      </nav>

      {toast && <div className="api-toast" role="status"><Check size={14} />{toast}</div>}
    </div>
  );
}

function EndpointCard({ method, path, title, description, curl, response, onCopy, onTry, showTry = false }) {
  return (
    <section className="endpoint-card">
      <div className="endpoint-route"><span className="endpoint-method">{method}</span><code>{path}</code></div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="curl-window"><code>{curl}</code></div>
      <div className="endpoint-actions"><button className="api-copy-button" onClick={() => onCopy(curl, 'Perintah cURL disalin.')}><Copy size={15} />Salin</button>{showTry && <button className="endpoint-try-button" onClick={onTry}><Play size={14} fill="currentColor" />Coba Langsung</button>}{!showTry && <button className="endpoint-try-button endpoint-try-secondary" onClick={onTry}><Play size={14} fill="currentColor" />Tes detail</button>}</div>
      <div className="response-label"><span>Contoh response</span><span>JSON</span></div>
      <PrettyJson value={response} compact />
    </section>
  );
}

export default ApiDocs;
