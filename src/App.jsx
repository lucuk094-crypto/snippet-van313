import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileCode2,
  FolderOpen,
  Heart,
  Layers,
  Menu,
  Moon,
  Plus,
  Plug,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import './styles.css';
import './route-loading.css';
import { STARTER_SNIPPETS, CATEGORIES, LANGUAGES, LANG_INFO } from './data.js';
import ApiEndpointPreview from './ApiEndpointPreview.jsx';
const EndpointPortal = lazy(() => import('./EndpointPortal.jsx'));
const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'));

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);

const STORAGE_KEY = 'snippetvault-van313-snippets-v1';
const FAVORITES_KEY = 'snippetvault-van313-favorites-v1';
const THEME_KEY = 'snippetvault-van313-theme-v1';
const API_TYPE_FILTERS = ['Semua endpoint', 'Anime / Otakudesu', 'AI / Claude', 'AIO', 'Music', 'Lainnya'];

const PLACEHOLDER_RE = /\b(TODO|FIXME|YOUR[_ -]?API[_ -]?KEY|YOUR[_ -]?TOKEN|REPLACE[_ -]?ME|CHANGE[_ -]?ME|process\.env\.[A-Z0-9_]+)\b/i;
const RISK_PATTERNS = [
  { label: 'dynamic evaluation', re: /\beval\s*\(|\bnew\s+Function\s*\(/i },
  { label: 'shell/process access', re: /\b(child_process|execSync|spawnSync|execFileSync)\b/i },
  { label: 'perintah destruktif', re: /\brm\s+-rf\b|\bsudo\s+/i },
];

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function getHighlightedLine(line, language) {
  if (!line) return '&nbsp;';
  const info = LANG_INFO[language];
  if (!info) return escapeHtml(line);
  try {
    return hljs.highlight(line, { language: info.lexer, ignoreIllegals: true }).value || '&nbsp;';
  } catch {
    return escapeHtml(line);
  }
}

function analyzeSnippet(snippet) {
  const code = String(snippet?.code || '').trim();
  if (!code) {
    return {
      state: 'review',
      label: 'Kode kosong',
      checks: [{ label: 'Source', status: 'fail', detail: 'Tidak ada kode untuk diperiksa.' }],
      note: 'Tidak ada kode yang dijalankan.',
    };
  }

  const checks = [{ label: 'Source', status: 'pass', detail: `${code.split('\n').length} baris ditemukan.` }];
  const language = snippet.language || 'JavaScript';
  const isJavaScript = /javascript/i.test(language);
  const hasModuleSyntax = /(^|\n)\s*(import|export)\b/m.test(code);
  const isTyped = /typescript/i.test(language);
  let syntax = { label: 'Parser', status: 'limited', detail: `Pemeriksaan sintaks ${language} terbatas; tinjau sebelum dipakai.` };

  if (isJavaScript && !hasModuleSyntax) {
    try {
      // Compile-only check. Function body is intentionally never invoked.
      new Function(code);
      syntax = { label: 'Sintaks JS', status: 'pass', detail: 'Lolos parse-only check; tidak dieksekusi.' };
    } catch (error) {
      syntax = { label: 'Sintaks JS', status: 'fail', detail: error.message.split('\n')[0] };
    }
  } else if (hasModuleSyntax || isTyped) {
    syntax = { label: 'Parser', status: 'limited', detail: 'Sintaks module/TypeScript tidak dikompilasi di browser.' };
  }
  checks.push(syntax);

  const placeholder = code.match(PLACEHOLDER_RE);
  if (placeholder) {
    checks.push({ label: 'Konfigurasi', status: 'warn', detail: `Periksa nilai konfigurasi: ${placeholder[0]}.` });
  } else {
    checks.push({ label: 'Konfigurasi', status: 'pass', detail: 'Tidak menemukan placeholder umum.' });
  }

  const risks = RISK_PATTERNS.filter((item) => item.re.test(code)).map((item) => item.label);
  checks.push(risks.length
    ? { label: 'Pola berisiko', status: 'warn', detail: `${risks.join(', ')} terdeteksi; tinjau manual.` }
    : { label: 'Pola berisiko', status: 'pass', detail: 'Tidak menemukan pola berisiko umum.' });

  const syntaxFailed = syntax.status === 'fail';
  const needsSetup = Boolean(placeholder);
  const needsReview = syntaxFailed || risks.length > 0;
  const state = needsReview ? 'review' : needsSetup ? 'setup' : 'ready';
  const label = state === 'ready' ? 'Lolos preflight' : state === 'setup' ? 'Konfigurasi dibutuhkan' : 'Perlu ditinjau';

  return {
    state,
    label,
    checks,
    note: 'Pemeriksaan statis saja. Kode tidak dijalankan; status runtime/API pihak ketiga tidak diverifikasi.',
  };
}

function readSnippets() {
  if (typeof window === 'undefined') return STARTER_SNIPPETS;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return STARTER_SNIPPETS;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.length) return STARTER_SNIPPETS;
    // One-time cleanup: remove the old local API endpoint examples as requested.
    const cleaned = parsed.filter((item) => item.category !== 'API' && !item.apiPreview);
    const savedIds = new Set(cleaned.map((item) => item.id));
    const missingStarters = STARTER_SNIPPETS.filter((item) => !savedIds.has(item.id));
    return [...missingStarters, ...cleaned];
  } catch {
    return STARTER_SNIPPETS;
  }
}

function readFavorites() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function slugify(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52) || 'snippet';
}

function relativeDate(timestamp) {
  const diff = Math.max(0, Date.now() - Number(timestamp || Date.now()));
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'Baru saja';
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

function CodeBlock({ code, language, compact = false }) {
  const lines = String(code || '').replace(/\n$/, '').split('\n');
  const shownLines = compact ? lines.slice(0, 4) : lines;
  return (
    <div className={`codeblock ${compact ? 'codeblock-compact' : ''}`} role="region" aria-label={`Kode ${language}`}>
      <div className="code-lines">
        {shownLines.map((line, index) => (
          <div className="code-line" key={`${index}-${line.slice(0, 12)}`}>
            <span className="line-number">{String(index + 1).padStart(2, '0')}</span>
            <code dangerouslySetInnerHTML={{ __html: getHighlightedLine(line, language) }} />
          </div>
        ))}
        {compact && lines.length > shownLines.length && (
          <div className="code-more">+ {lines.length - shownLines.length} baris lainnya</div>
        )}
      </div>
    </div>
  );
}

function LanguageMark({ language }) {
  const info = LANG_INFO[language] || { short: language.slice(0, 3).toUpperCase(), className: 'generic' };
  return <span className={`lang-mark lang-${info.className}`}>{info.short}</span>;
}

function ReadinessBadge({ result }) {
  const Icon = result.state === 'ready' ? CheckCircle2 : result.state === 'setup' ? AlertTriangle : ShieldCheck;
  return (
    <span className={`readiness readiness-${result.state}`} title={result.note}>
      <Icon size={13} strokeWidth={1.8} />
      {result.label}
    </span>
  );
}

function SnippetCard({ snippet, favorite, onFavorite, onOpen, onCopy }) {
  const readiness = analyzeSnippet(snippet);
  const apiPreview = snippet.apiPreview;
  return (
    <article className={`snippet-card ${apiPreview ? 'snippet-card-api' : ''}`}>
      <div className="card-topline">
        <div className="card-badges">
          <span className="category-pill"><Layers size={12} />{snippet.category}</span>
          <LanguageMark language={snippet.language} />
          {apiPreview && <span className="api-type-chip">{apiPreview.type}</span>}
        </div>
        <button className={`icon-button favorite-button ${favorite ? 'is-favorite' : ''}`} aria-label={favorite ? 'Hapus dari tersimpan' : 'Simpan snippet'} onClick={() => onFavorite(snippet.id)}>
          <Heart size={17} fill={favorite ? 'currentColor' : 'none'} strokeWidth={1.8} />
        </button>
      </div>

      <button className="card-title-button" onClick={() => onOpen(snippet)}>
        <h3>{snippet.title}</h3>
        <ArrowUpRight className="title-arrow" size={16} />
      </button>
      <p className="card-description">{snippet.description}</p>
      {apiPreview && <div className="api-card-endpoint"><span>{apiPreview.method}</span><code title={apiPreview.endpoint}>{apiPreview.endpoint}</code></div>}
      <div className="card-code-wrap"><CodeBlock code={snippet.code} language={snippet.language} compact /></div>

      <div className="tag-row">
        {(snippet.tags || []).slice(0, 3).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
        {(snippet.tags || []).length > 3 && <span className="tag tag-more">+{snippet.tags.length - 3}</span>}
      </div>

      <div className="card-footer">
        <div className="author-mini">
          <span className="avatar-mini">V</span>
          <span>{snippet.author || 'Van313 | Official'}</span>
        </div>
        <div className="card-actions">
          <span className="download-count" title="Jumlah salinan contoh"><Download size={13} />{snippet.downloads || 0}</span>
          {apiPreview && <button className="api-card-preview" aria-label={`Preview API ${snippet.title}`} onClick={() => onOpen(snippet)}><Eye size={13} /><span>Preview API</span></button>}
          <button className="card-copy" aria-label="Salin kode" onClick={() => onCopy(snippet)}><Copy size={14} /><span>Salin</span></button>
        </div>
      </div>
      <div className="card-status-row">
        <ReadinessBadge result={readiness} />
        <span className="updated-time"><Clock3 size={12} />{relativeDate(snippet.createdAt)}</span>
      </div>
    </article>
  );
}

function TerminalPanel({ snippets, onOpenSnippet, onSearch }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState([
    { kind: 'system', text: 'SnippetVault console v1.0' },
    { kind: 'muted', text: 'Static preflight · snippet tidak dieksekusi' },
    { kind: 'muted', text: 'Ketik help untuk melihat perintah.' },
  ]);
  const outputRef = useRef(null);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines, busy]);

  const pushLines = (next) => setLines((current) => [...current, ...next]);

  const inspectSnippet = async (snippet) => {
    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: snippet.code, language: snippet.language }),
      });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        return await response.json();
      }
    } catch {
      // Vite preview has no Vercel Functions; use the same bounded, static local check.
    }
    return analyzeSnippet(snippet);
  };

  const resultLines = (snippet, result) => {
    const stateKind = result.state === 'ready' ? 'success' : result.state === 'setup' ? 'warning' : 'error';
    const icon = result.state === 'ready' ? '✓' : result.state === 'setup' ? '!' : '×';
    const output = [{ kind: stateKind, text: `${icon} ${result.label.toUpperCase()} · ${snippet.title} (${snippet.id})` }];
    result.checks.forEach((check) => {
      const mark = check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : check.status === 'fail' ? '×' : '·';
      const kind = check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : check.status === 'fail' ? 'error' : 'muted';
      output.push({ kind, text: `${mark} ${check.label}: ${check.detail}` });
    });
    output.push({ kind: 'muted', text: `i ${result.note}` });
    return output;
  };

  const runCommand = async (raw) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    pushLines([{ kind: 'command', text: `$ ${cleaned}` }]);
    setInput('');
    const [command, ...rest] = cleaned.split(/\s+/);
    const args = rest.join(' ').trim();
    const normalized = command.toLowerCase();

    if (normalized === 'clear' || normalized === 'cls') {
      setLines([
        { kind: 'system', text: 'SnippetVault console v1.0' },
        { kind: 'muted', text: 'Static preflight · snippet tidak dieksekusi' },
      ]);
      return;
    }
    if (normalized === 'help') {
      pushLines([
        { kind: 'system', text: 'Perintah yang tersedia:' },
        { kind: 'muted', text: '  help              tampilkan bantuan' },
        { kind: 'muted', text: '  list              daftar snippet & status awal' },
        { kind: 'muted', text: '  check <id|all>    cek source, sintaks terbatas, config, dan pola risiko' },
        { kind: 'muted', text: '  search <kata>     cari snippet di katalog' },
        { kind: 'muted', text: '  status            ringkasan library dan metode pemeriksaan' },
        { kind: 'muted', text: '  clear             bersihkan terminal' },
        { kind: 'warning', text: '  run dinonaktifkan — snippet tidak pernah dieksekusi di browser/server.' },
      ]);
      return;
    }
    if (normalized === 'run' || normalized === 'exec' || normalized === 'execute') {
      pushLines([{ kind: 'warning', text: 'Eksekusi dinonaktifkan untuk keamanan. Gunakan check <id>, lalu uji sendiri di sandbox/runtime yang Anda kendalikan.' }]);
      return;
    }
    if (normalized === 'list' || normalized === 'ls') {
      pushLines(snippets.map((snippet) => {
        const result = analyzeSnippet(snippet);
        return { kind: result.state === 'ready' ? 'success' : result.state === 'setup' ? 'warning' : 'error', text: `${result.state.toUpperCase().padEnd(7)}  ${snippet.id}  ·  ${snippet.language}` };
      }));
      return;
    }
    if (normalized === 'status') {
      const readyCount = snippets.filter((snippet) => analyzeSnippet(snippet).state === 'ready').length;
      pushLines([
        { kind: 'success', text: `Library tersedia · ${snippets.length} snippet · ${readyCount} lolos preflight statis.` },
        { kind: 'muted', text: 'Runtime check: tidak dijalankan. Status endpoint eksternal: tidak diverifikasi.' },
      ]);
      return;
    }
    if (normalized === 'search') {
      if (!args) {
        pushLines([{ kind: 'warning', text: 'Gunakan: search <kata kunci>' }]);
        return;
      }
      const matches = snippets.filter((snippet) => `${snippet.title} ${snippet.description} ${snippet.language} ${snippet.tags.join(' ')}`.toLowerCase().includes(args.toLowerCase()));
      onSearch(args);
      pushLines([{ kind: matches.length ? 'success' : 'warning', text: `${matches.length} hasil untuk “${args}”. Hasil katalog difilter.` }]);
      return;
    }
    if (normalized === 'check') {
      if (!args) {
        pushLines([{ kind: 'warning', text: 'Pilih id snippet. Contoh: check fetch-json  ·  atau: check all' }]);
        return;
      }
      const targets = args.toLowerCase() === 'all'
        ? snippets
        : [snippets.find((snippet) => snippet.id.toLowerCase() === args.toLowerCase() || snippet.title.toLowerCase().includes(args.toLowerCase()))].filter(Boolean);
      if (!targets.length) {
        pushLines([{ kind: 'error', text: `Snippet “${args}” tidak ditemukan. Ketik list untuk melihat id.` }]);
        return;
      }
      setBusy(true);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      for (const snippet of targets) {
        const result = await inspectSnippet(snippet);
        pushLines(resultLines(snippet, result));
      }
      setBusy(false);
      return;
    }
    if (normalized === 'open') {
      const snippet = snippets.find((item) => item.id.toLowerCase() === args.toLowerCase());
      if (!snippet) {
        pushLines([{ kind: 'error', text: `Snippet “${args}” tidak ditemukan.` }]);
      } else {
        pushLines([{ kind: 'success', text: `Membuka ${snippet.title}…` }]);
        onOpenSnippet(snippet);
      }
      return;
    }
    if (normalized === 'health') {
      try {
        const response = await fetch('/api/health');
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('application/json')) {
          const data = await response.json();
          pushLines([{ kind: data.status === 'ok' ? 'success' : 'warning', text: `API ${String(data.status).toUpperCase()} · ${data.service} · code execution ${data.codeExecution ? 'enabled' : 'disabled'}` }]);
        } else {
          pushLines([{ kind: 'success', text: 'UI berjalan. Vercel API belum aktif di Vite dev; akan tersedia setelah deploy.' }]);
        }
      } catch {
        pushLines([{ kind: 'success', text: 'UI berjalan lokal. Endpoint Vercel tersedia setelah deploy.' }]);
      }
      return;
    }
    pushLines([{ kind: 'error', text: `Perintah “${command}” tidak dikenal. Ketik help.` }]);
  };

  return (
    <section className="terminal-card" id="terminal-panel" aria-labelledby="terminal-heading">
      <div className="terminal-header">
        <div className="terminal-title-wrap">
          <span className="terminal-icon"><Terminal size={16} /></span>
          <div>
            <h2 id="terminal-heading">Terminal status</h2>
            <span className="terminal-caption"><span className="terminal-live-dot" /> preflight aman</span>
          </div>
        </div>
        <div className="terminal-window-dots" aria-hidden="true"><i /><i /><i /></div>
      </div>
      <div className="terminal-intro">
        <ShieldCheck size={14} />
        <span>Validasi statis saja. Kode tidak dieksekusi.</span>
      </div>
      <div className="terminal-output" ref={outputRef} role="log" aria-live="polite" aria-label="Output terminal">
        {lines.map((line, index) => <div className={`terminal-line terminal-${line.kind}`} key={`${index}-${line.text}`}>{line.text}</div>)}
        {busy && <div className="terminal-line terminal-progress"><span className="loading-dot" /> Memeriksa snippet…</div>}
      </div>
      <form className="terminal-form" onSubmit={(event) => { event.preventDefault(); runCommand(input); }}>
        <span className="terminal-prompt">van313<span>~</span><b>$</b></span>
        <input
          aria-label="Perintah terminal"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="help"
          autoComplete="off"
          spellCheck="false"
          disabled={busy}
        />
        <button aria-label="Jalankan perintah" disabled={busy || !input.trim()}><ArrowRight size={15} /></button>
      </form>
      <div className="terminal-hint"><span>Tip</span> coba <button onClick={() => runCommand('check fetch-json')}>check fetch-json</button></div>
    </section>
  );
}

function AddSnippetModal({ onClose, onSave, initialKind = 'code' }) {
  const [form, setForm] = useState(() => ({
    kind: initialKind,
    title: '',
    description: '',
    language: 'JavaScript',
    category: initialKind === 'api' ? 'API' : 'Utility',
    tags: '',
    sourceUrl: '',
    code: '',
    apiType: 'Anime / Otakudesu',
    method: 'GET',
    endpoint: '',
    sampleResponse: '',
    requestBody: '',
  }));
  const [error, setError] = useState('');
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const changeKind = (event) => {
    const kind = event.target.value;
    setForm((current) => ({ ...current, kind, category: kind === 'api' ? 'API' : (current.category === 'API' ? 'Utility' : current.category) }));
    setError('');
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('Judul wajib diisi.');
      return;
    }

    let apiPreview = null;
    let code = form.code.trim();
    let language = form.language;
    let category = form.category;
    let sourceUrl = form.sourceUrl.trim();
    let description = form.description.trim() || 'Snippet baru dari koleksi Van313.';

    if (form.kind === 'api') {
      let endpoint;
      try {
        endpoint = new URL(form.endpoint.trim());
        if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('Gunakan URL HTTP/HTTPS.');
      } catch (parseError) {
        setError(parseError.message || 'Masukkan URL endpoint yang valid.');
        return;
      }
      if (!form.sampleResponse.trim()) {
        setError('Tempel sample response JSON agar preview tetap tersedia saat CORS membatasi request live.');
        return;
      }
      let sampleResponse;
      try {
        sampleResponse = JSON.parse(form.sampleResponse);
      } catch (parseError) {
        setError(`Sample response bukan JSON valid: ${parseError.message}`);
        return;
      }
      let requestBody;
      if (form.method !== 'GET' && form.requestBody.trim()) {
        try { requestBody = JSON.parse(form.requestBody); }
        catch (parseError) {
          setError(`Request body bukan JSON valid: ${parseError.message}`);
          return;
        }
      }
      const endpointLiteral = JSON.stringify(endpoint.toString());
      const methodLiteral = JSON.stringify(form.method);
      const bodyOption = requestBody === undefined ? '' : `, body: JSON.stringify(${JSON.stringify(requestBody, null, 2)})`;
      code = `async function callApi() {\n  const response = await fetch(${endpointLiteral}, { method: ${methodLiteral}${bodyOption} });\n  if (!response.ok) throw new Error("HTTP " + response.status);\n  return response.json();\n}`;
      language = 'JavaScript';
      category = 'API';
      sourceUrl = sourceUrl || endpoint.toString();
      description = description === 'Snippet baru dari koleksi Van313.' ? `Endpoint ${form.apiType} · ${form.method}. Klik Preview API untuk melihat sample atau mencoba request live.` : description;
      apiPreview = {
        type: form.apiType,
        method: form.method,
        endpoint: endpoint.toString(),
        sampleResponse,
        ...(requestBody === undefined ? {} : { requestBody: JSON.stringify(requestBody, null, 2) }),
      };
    } else if (!code) {
      setError('Tempel kode yang akan disimpan.');
      return;
    }

    const base = slugify(form.title);
    const tags = form.tags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean).slice(0, 8);
    if (apiPreview && !tags.some((tag) => tag.toLowerCase() === 'api')) tags.unshift('api');
    const snippet = {
      id: `${base}-${Date.now().toString(36).slice(-4)}`,
      title: form.title.trim(),
      description,
      language,
      category,
      tags,
      ...(apiPreview ? { apiPreview } : {}),
      sourceUrl,
      code,
      author: 'Van313 | Official',
      downloads: 0,
      createdAt: Date.now(),
    };
    onSave(snippet);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="add-modal-title">
        <div className="modal-heading-row">
          <div><span className="modal-kicker">KOLEKSI ANDA</span><h2 id="add-modal-title">{form.kind === 'api' ? 'Tambah API endpoint' : 'Tambah snippet'}</h2><p>API endpoint disimpan lokal dan mendapat preview sample + request live dari browser.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        </div>
        <form className="snippet-form" onSubmit={submit}>
          <label>Jenis item
            <select value={form.kind} onChange={changeKind}>
              <option value="code">Snippet kode</option>
              <option value="api">API endpoint · dengan preview</option>
            </select>
          </label>
          <div className="form-grid two-col">
            <label>Judul <input autoFocus value={form.title} onChange={update('title')} placeholder={form.kind === 'api' ? 'Contoh: Anime search API' : 'Contoh: debounce function'} maxLength={80} /></label>
            {form.kind === 'code' && <label>Bahasa
              <select value={form.language} onChange={update('language')}>
                {LANGUAGES.filter((language) => language !== 'Semua bahasa').map((language) => <option key={language}>{language}</option>)}
              </select>
            </label>}
          </div>
          <label>Deskripsi <input value={form.description} onChange={update('description')} placeholder={form.kind === 'api' ? 'Apa yang dikembalikan endpoint ini?' : 'Apa yang dilakukan snippet ini?'} maxLength={180} /></label>

          {form.kind === 'api' ? (
            <>
              <div className="form-grid two-col">
                <label>Jenis API
                  <select value={form.apiType} onChange={update('apiType')}>
                    <option>Anime / Otakudesu</option><option>AI / Claude</option><option>AIO</option><option>Music</option><option>Lainnya</option>
                  </select>
                </label>
                <label>Method
                  <select value={form.method} onChange={update('method')}>
                    <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
                  </select>
                </label>
              </div>
              <label>Endpoint URL <input type="url" required value={form.endpoint} onChange={update('endpoint')} placeholder="https://api.example.com/search?q=..." /></label>
              {form.method !== 'GET' && <label>Request body (JSON, opsional) <textarea className="form-code-input" value={form.requestBody} onChange={update('requestBody')} placeholder={'{\n  "prompt": "..."\n}'} rows={4} spellCheck="false" /></label>}
              <label>Sample response JSON <textarea className="form-code-input" required value={form.sampleResponse} onChange={update('sampleResponse')} placeholder={'{\n  "success": true,\n  "data": { "results": [] }\n}'} rows={8} spellCheck="false" /></label>
              <div className="form-footnote"><ShieldCheck size={14} />Jangan taruh API key di URL atau sample JSON. Header preview hanya sementara; CORS bisa membatasi request live.</div>
            </>
          ) : (
            <>
              <div className="form-grid two-col">
                <label>Kategori
                  <select value={form.category} onChange={update('category')}>
                    {CATEGORIES.filter((category) => category !== 'Semua').map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label>Tag <input value={form.tags} onChange={update('tags')} placeholder="api, utility, fetch" /></label>
              </div>
            </>
          )}
          {form.kind === 'api' && <label>Tag <input value={form.tags} onChange={update('tags')} placeholder="anime, otakudesu, music, claude" /></label>}
          <label>Sumber / referensi <input type="url" value={form.sourceUrl} onChange={update('sourceUrl')} placeholder="https://... (opsional)" /></label>
          {form.kind === 'code' && <label>Kode <textarea className="form-code-input" value={form.code} onChange={update('code')} placeholder="Tempel snippet di sini…" rows={9} spellCheck="false" /></label>}
          {form.kind === 'code' && <div className="form-footnote"><ShieldCheck size={14} />Terminal hanya melakukan preflight statis. Kode yang ditempel tidak akan dieksekusi.</div>}
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button className="primary-button" type="submit"><Plus size={16} />{form.kind === 'api' ? 'Simpan endpoint' : 'Simpan snippet'}</button></div>
        </form>
      </section>
    </div>
  );
}

function DetailModal({ snippet, onClose, onCopy, onDownload, onShare, onToast }) {
  const readiness = analyzeSnippet(snippet);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="detail-topbar">
          <div className="detail-breadcrumb"><span>SnippetVault</span><span>/</span><span>{snippet.category}</span><span>/</span><b>{snippet.id}</b></div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup detail"><X size={18} /></button>
        </div>
        <div className="detail-layout">
          <main className="detail-main">
            <div className="detail-meta-top"><span className="category-pill"><Layers size={12} />{snippet.category}</span><LanguageMark language={snippet.language} /><ReadinessBadge result={readiness} /></div>
            <h2 id="detail-title">{snippet.title}</h2>
            <p className="detail-description">{snippet.description}</p>
            <div className="detail-code-topline"><div className="file-label"><FileCode2 size={15} /><span>{snippet.id}.{(LANG_INFO[snippet.language] || { ext: 'txt' }).ext}</span></div><div className="code-tools"><button onClick={() => onCopy(snippet)}><Copy size={14} />Salin</button><button onClick={() => onDownload(snippet)}><Download size={14} />Unduh</button></div></div>
            <CodeBlock code={snippet.code} language={snippet.language} />
            {snippet.apiPreview && <ApiEndpointPreview key={snippet.id} apiPreview={snippet.apiPreview} />}
            <div className="detail-bottom-actions"><button className="secondary-button" onClick={() => onShare(snippet)}><Share2 size={15} />Bagikan tautan</button><span className="detail-caution"><ShieldCheck size={14} />Tidak dieksekusi oleh situs</span></div>
          </main>
          <aside className="detail-aside">
            <div className="detail-aside-card">
              <div className="aside-card-title"><span className="aside-icon"><Activity size={15} /></span><h3>Status pemeriksaan</h3></div>
              <ReadinessBadge result={readiness} />
              <p className="detail-note">Pemeriksaan statis membantu menemukan konfigurasi atau pola umum. Ini bukan bukti kode aktif di runtime.</p>
              <button className="check-snippet-button" onClick={() => { onClose(); onToast(`Ketik “check ${snippet.id}” di terminal untuk menjalankan preflight.`); document.getElementById('terminal-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><Terminal size={15} />Periksa di terminal</button>
            </div>
            <div className="detail-aside-card meta-card">
              <h3>Detail snippet</h3>
              <div className="meta-row"><span>Developer</span><b><span className="avatar-mini">V</span>Van313 | Official</b></div>
              <div className="meta-row"><span>Ditambahkan</span><b>{relativeDate(snippet.createdAt)}</b></div>
              <div className="meta-row"><span>Bahasa</span><b>{snippet.language}</b></div>
              <div className="meta-row"><span>Salinan</span><b>{snippet.downloads || 0}</b></div>
              <div className="meta-tags">{(snippet.tags || []).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div>
              {snippet.sourceUrl ? <a className="source-link" href={snippet.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Buka sumber / dokumentasi</a> : <div className="source-missing"><AlertTriangle size={14} />Sumber belum dicantumkan</div>}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(() => typeof window !== 'undefined' ? window.location.pathname : '/');
  const [snippets, setSnippets] = useState(readSnippets);
  const [favorites, setFavorites] = useState(readFavorites);
  const [theme, setTheme] = useState(() => typeof window !== 'undefined' ? window.localStorage.getItem(THEME_KEY) || 'light' : 'light');
  const [view, setView] = useState('explore');
  const [query, setQuery] = useState('');
  const [activeApiType, setActiveApiType] = useState('Semua endpoint');
  const [addKind, setAddKind] = useState('code');
  const [activeCategory, setActiveCategory] = useState('Semua');
  const [activeLanguage, setActiveLanguage] = useState('Semua bahasa');
  const [sort, setSort] = useState('newest');
  const [selectedId, setSelectedId] = useState(() => typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('snippet') : null);
  const [addOpen, setAddOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    const onRouteChange = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onRouteChange);
    return () => window.removeEventListener('popstate', onRouteChange);
  }, []);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets)); }, [snippets]);
  useEffect(() => { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!selectedId) return undefined;
    const onPopState = () => setSelectedId(new URLSearchParams(window.location.search).get('snippet'));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [selectedId]);

  const selectedSnippet = snippets.find((snippet) => snippet.id === selectedId) || null;
  const filteredSnippets = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();
    const result = snippets.filter((snippet) => {
      const apiView = view === 'apis';
      const categoryMatch = apiView || activeCategory === 'Semua' || snippet.category === activeCategory;
      const languageMatch = apiView || activeLanguage === 'Semua bahasa' || snippet.language === activeLanguage;
      const apiMatch = !apiView || Boolean(snippet.apiPreview);
      const apiTypeMatch = !apiView || activeApiType === 'Semua endpoint' || snippet.apiPreview?.type === activeApiType;
      const savedMatch = view !== 'saved' || favorites.includes(snippet.id);
      const searchable = `${snippet.title} ${snippet.description} ${snippet.language} ${snippet.category} ${snippet.apiPreview?.type || ''} ${snippet.apiPreview?.endpoint || ''} ${(snippet.tags || []).join(' ')} ${snippet.id}`.toLowerCase();
      return categoryMatch && languageMatch && apiMatch && apiTypeMatch && savedMatch && (!searchTerm || searchable.includes(searchTerm));
    });
    return result.sort((a, b) => sort === 'popular' ? (b.downloads || 0) - (a.downloads || 0) : Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }, [snippets, activeCategory, activeLanguage, activeApiType, favorites, query, sort, view]);

  const openSnippet = (snippet) => {
    setSelectedId(snippet.id);
    const url = new URL(window.location.href);
    url.searchParams.set('snippet', snippet.id);
    window.history.pushState({}, '', url);
  };
  const closeDetail = () => {
    setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('snippet');
    window.history.replaceState({}, '', url);
  };
  const showToast = (message) => setToast(message);

  const copyCode = async (snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      showToast('Kode berhasil disalin ke clipboard.');
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = snippet.code;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand('copy');
      textArea.remove();
      showToast(copied ? 'Kode berhasil disalin.' : 'Clipboard tidak tersedia di browser ini.');
    }
    setSnippets((current) => current.map((item) => item.id === snippet.id ? { ...item, downloads: (item.downloads || 0) + 1 } : item));
  };

  const downloadCode = (snippet) => {
    const extension = (LANG_INFO[snippet.language] || { ext: 'txt' }).ext;
    const blob = new Blob([snippet.code], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${slugify(snippet.title)}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    showToast('File snippet sedang diunduh.');
  };

  const shareSnippet = async (snippet) => {
    const url = new URL(window.location.href);
    url.searchParams.set('snippet', snippet.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast('Tautan detail disalin.');
    } catch {
      showToast(url.toString());
    }
  };

  const toggleFavorite = (id) => {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    showToast(favorites.includes(id) ? 'Dihapus dari tersimpan.' : 'Snippet disimpan ke favorit.');
  };

  const saveSnippet = (snippet) => {
    setSnippets((current) => [snippet, ...current]);
    setAddOpen(false);
    setView(snippet.apiPreview ? 'apis' : 'explore');
    setActiveCategory('Semua');
    setActiveLanguage('Semua bahasa');
    setActiveApiType('Semua endpoint');
    setQuery('');
    showToast(snippet.apiPreview ? 'API endpoint ditambahkan ke koleksi lokal.' : 'Snippet ditambahkan. Tersimpan di browser ini.');
  };

  const openAddSnippet = (kind = 'code') => {
    setAddKind(kind);
    setAddOpen(true);
  };

  const chooseView = (newView) => {
    if (newView === 'apis') { openEndpointPortal(); return; }
    setView(newView);
    if (newView === 'explore' || newView === 'apis') {
      setActiveCategory('Semua');
      setActiveLanguage('Semua bahasa');
    }
    if (newView === 'apis') setActiveApiType('Semua endpoint');
    setMobileNavOpen(false);
    if (newView === 'terminal') window.setTimeout(() => document.getElementById('terminal-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
  };

  const title = view === 'apis' ? 'Endpoint API' : view === 'saved' ? 'Snippet tersimpan' : activeCategory === 'Semua' ? 'Koleksi terbaru' : `Koleksi ${activeCategory}`;

  const openEndpointPortal = () => {
    window.history.pushState({}, '', '/api-doc');
    setRoute('/api-doc');
    setMobileNavOpen(false);
  };
  const openAdmin = () => {
    window.history.pushState({}, '', '/admin');
    setRoute('/admin');
    setMobileNavOpen(false);
  };
  const returnHome = () => {
    window.history.pushState({}, '', '/');
    setRoute('/');
  };

  if (route === '/admin' || route === '/admin/') {
    return <Suspense fallback={<div className="route-loading">Loading admin workspace…</div>}><AdminDashboard onPortal={openEndpointPortal} /></Suspense>;
  }
  if (route === '/api-doc' || route === '/api-doc/') {
    return <Suspense fallback={<div className="route-loading">Loading endpoint portal…</div>}><EndpointPortal onHome={returnHome} /></Suspense>;
  }

  return (
    <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Tutup menu" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Code2 size={22} strokeWidth={2.25} /></div>
          <div className="brand-text"><b>Snippet<span>Vault</span></b><small>CODE LIBRARY</small></div>
          <button className="icon-button sidebar-mobile-close" aria-label="Tutup navigasi" onClick={() => setMobileNavOpen(false)}><X size={17} /></button>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
          <button className={`nav-item ${view === 'explore' ? 'active' : ''}`} onClick={() => chooseView('explore')}><Code2 size={17} /><span>Jelajahi</span><span className="nav-count">{snippets.length}</span></button>
          <button className={`nav-item ${view === 'saved' ? 'active' : ''}`} onClick={() => chooseView('saved')}><Bookmark size={17} /><span>Tersimpan</span><span className="nav-count">{favorites.length}</span></button>
          <button className={`nav-item ${view === 'terminal' ? 'active' : ''}`} onClick={() => chooseView('terminal')}><Terminal size={17} /><span>Terminal status</span><span className="nav-live" /></button>
          <button className={`nav-item ${route === '/api-doc' ? 'active' : ''}`} onClick={openEndpointPortal}><Plug size={17} /><span>Endpoint portal</span><ArrowUpRight size={13} className="api-nav-arrow" /></button>
          <button className={`nav-item ${route === '/admin' ? 'active' : ''}`} onClick={openAdmin}><ShieldCheck size={17} /><span>Admin dashboard</span><ArrowUpRight size={13} className="api-nav-arrow" /></button>
        </nav>

        <div className="sidebar-section-label category-label">KATEGORI <button aria-label="Tambah snippet" onClick={() => openAddSnippet('code')}><Plus size={14} /></button></div>
        <nav className="sidebar-nav category-nav" aria-label="Kategori">
          {CATEGORIES.filter((category) => category !== 'Semua').map((category, index) => {
            const count = snippets.filter((snippet) => snippet.category === category).length;
            return <button className={`nav-item ${activeCategory === category && view === 'explore' ? 'active' : ''}`} key={category} onClick={() => { setActiveCategory(category); setView('explore'); setMobileNavOpen(false); }}><span className={`category-dot category-dot-${index}`} /><span>{category}</span><span className="nav-count">{count}</span></button>;
          })}
        </nav>

        <div className="sidebar-grow" />
        <div className="sidebar-tip">
          <div className="tip-icon"><ShieldCheck size={16} /></div>
          <div><b>Gunakan dengan bijak</b><p>Periksa sumber dan lisensi sebelum memakai snippet.</p></div>
        </div>
        <div className="sidebar-profile">
          <div className="profile-avatar">V</div>
          <div className="profile-copy"><b>Van313 | Official</b><span>Curator & developer</span></div>
          <span className="profile-status" title="Profil aktif" />
        </div>
        <div className="sidebar-version">SNIPPETVAULT <span>v1.0</span></div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" aria-label="Buka navigasi" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{view === 'saved' ? 'Tersimpan' : view === 'terminal' ? 'Terminal status' : view === 'apis' ? 'Endpoint API' : 'Koleksi kode'}</strong></div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={17} />
              <input ref={searchRef} id="global-search" value={query} onChange={(event) => { setQuery(event.target.value); if (view === 'saved' && !favorites.length) setView('explore'); }} placeholder="Cari snippet, tag, bahasa..." />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button theme-toggle" aria-label={theme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button className="top-add-button" onClick={() => openAddSnippet(view === 'apis' ? 'api' : 'code')}><Plus size={16} /><span>{view === 'apis' ? 'Tambah endpoint' : 'Tambah snippet'}</span></button>
          </div>
        </header>

        <main className="page-content">
          <section className="hero-panel">
            <div className="hero-copy">
              <div className="hero-eyebrow"><span className="eyebrow-dot" />KODE TERKURASI <span className="eyebrow-separator">/</span> VAN313</div>
              <h1>Kecilkan proses.<br /><span>Percepat karya.</span></h1>
              <p>Potongan kode terkurasi, tersusun rapi, dan siap jadi titik awal proyekmu berikutnya.</p>
              <div className="hero-buttons">
                <button className="hero-primary" onClick={() => { chooseView('explore'); document.getElementById('library-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span>Jelajahi koleksi</span><ArrowRight size={16} /></button>
                <button className="hero-secondary" onClick={() => openAddSnippet(view === 'apis' ? 'api' : 'code')}><Plus size={15} />{view === 'apis' ? 'Tambah endpoint' : 'Tambah snippet'}</button>
              </div>
              <div className="hero-stats">
                <div><strong>{snippets.length.toString().padStart(2, '0')}</strong><span>snippet</span></div>
                <i />
                <div><strong>{new Set(snippets.map((snippet) => snippet.language)).size.toString().padStart(2, '0')}</strong><span>bahasa</span></div>
                <i />
                <div><strong>{CATEGORIES.length - 1}</strong><span>kategori</span></div>
              </div>
            </div>
            <div className="hero-art" aria-label="Pratinjau editor snippet">
              <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
              <div className="hero-code-window">
                <div className="hero-code-head"><div className="window-controls"><i /><i /><i /></div><span>snippet.ts</span><span className="hero-code-badge">TS</span></div>
                <div className="hero-code-body">
                  <div><span>01</span><code><b>const</b> <em>focus</em> = <strong>"build"</strong>;</code></div>
                  <div><span>02</span><code><b>while</b> (ideas.<em>length</em>) {'{'}</code></div>
                  <div><span>03</span><code>&nbsp;&nbsp;ship(ideas.<em>pop</em>());</code></div>
                  <div><span>04</span><code>{'}'}</code></div>
                </div>
                <div className="hero-code-foot"><span><span className="tiny-check"><Check size={10} /></span>preflight ready</span><span>UTF-8</span></div>
              </div>
              <div className="floating-check-card"><span className="floating-shield"><ShieldCheck size={16} /></span><div><b>Aman untuk ditinjau</b><small>Static check · no execution</small></div><span className="floating-check-dot" /></div>
              <div className="floating-spark"><Sparkles size={15} /></div>
            </div>
            <div className="hero-watermark">SV<span>.</span></div>
          </section>

          <div className="content-layout">
            <section className="library-section" id="library-section">
              <div className="section-heading">
                <div>
                  <div className="section-eyebrow"><FolderOpen size={13} /> YOUR LIBRARY</div>
                  <h2>{title}<span className="result-count">{filteredSnippets.length}</span></h2>
                  <p>{view === 'apis' ? 'Kumpulan endpoint siap dites. Simpan sample JSON, coba request live, dan lihat hasilnya.' : view === 'saved' ? 'Koleksi kecil yang Anda tandai untuk nanti.' : 'Temukan solusi ringkas, lalu adaptasikan sesuai kebutuhan.'}</p>
                </div>
                <button className="filter-button" onClick={() => document.getElementById(view === 'apis' ? 'api-type-filter' : 'language-filter')?.focus()}><SlidersHorizontal size={15} /><span>Filter</span><ChevronDown size={14} /></button>
              </div>

              <div className={`filter-toolbar ${view === 'apis' ? 'filter-toolbar-api' : ''}`}>
                {view === 'apis' ? (
                  <div className="category-tabs api-type-tabs" role="tablist" aria-label="Filter jenis API">
                    {API_TYPE_FILTERS.map((type) => <button id={type === 'Semua endpoint' ? 'api-type-filter' : undefined} role="tab" aria-selected={activeApiType === type} className={activeApiType === type ? 'selected' : ''} key={type} onClick={() => setActiveApiType(type)}>{type}</button>)}
                  </div>
                ) : (
                  <div className="category-tabs" role="tablist" aria-label="Filter kategori">
                    {CATEGORIES.map((category) => <button role="tab" aria-selected={activeCategory === category} className={activeCategory === category ? 'selected' : ''} key={category} onClick={() => { setActiveCategory(category); setView('explore'); }}>{category}</button>)}
                  </div>
                )}
                <div className="filter-selects">
                  {view !== 'apis' && <label className="select-wrap"><span className="sr-only">Filter bahasa</span><select id="language-filter" value={activeLanguage} onChange={(event) => setActiveLanguage(event.target.value)}>{LANGUAGES.map((language) => <option key={language}>{language}</option>)}</select><ChevronDown size={13} /></label>}
                  <label className="select-wrap sort-select"><span className="sr-only">Urutkan</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Terbaru</option><option value="popular">Populer</option></select><ChevronDown size={13} /></label>
                </div>
              </div>

              {filteredSnippets.length ? (
                <div className="snippet-grid">
                  {filteredSnippets.map((snippet, index) => <div className="card-enter" style={{ '--card-index': index }} key={snippet.id}><SnippetCard snippet={snippet} favorite={favorites.includes(snippet.id)} onFavorite={toggleFavorite} onOpen={openSnippet} onCopy={copyCode} /></div>)}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon"><Search size={22} /></div>
                  <h3>{view === 'apis' ? 'Belum ada endpoint di kategori ini' : view === 'saved' ? 'Belum ada snippet tersimpan' : 'Belum ada hasil yang cocok'}</h3>
                  <p>{view === 'apis' ? 'Tambahkan URL endpoint beserta sample JSON untuk membuat preview yang bisa dites.' : view === 'saved' ? 'Tekan ikon hati pada snippet untuk menyimpannya di sini.' : 'Coba kata kunci lain atau bersihkan filter kategori dan bahasa.'}</p>
                  {view === 'apis' ? <button className="secondary-button" onClick={() => openAddSnippet('api')}><Plus size={14} />Tambah endpoint</button> : <button className="secondary-button" onClick={() => { setQuery(''); setActiveCategory('Semua'); setActiveLanguage('Semua bahasa'); setView('explore'); }}>Reset filter</button>}
                </div>
              )}

              <div className="library-footnote"><ShieldCheck size={14} /><span>{view === 'apis' ? 'Live preview dipanggil langsung dari browser dan bergantung pada izin CORS endpoint. Sample response hanya contoh, bukan hasil live.' : 'Snippet contoh dibuat untuk demo. Selalu tinjau kode, sumber, dan lisensi sebelum digunakan.'}</span></div>
            </section>

            <aside className="right-rail">
              <TerminalPanel snippets={snippets} onOpenSnippet={openSnippet} onSearch={(term) => { setQuery(term); setView('explore'); }} />
              <div className="quick-guide-card">
                <div className="quick-guide-icon"><Zap size={16} /></div>
                <div><span className="guide-label">SAFE WORKFLOW</span><h3>Periksa sebelum pakai.</h3><p>Jalankan <code>check &lt;id&gt;</code> untuk preflight statis. Uji runtime hanya di sandbox milikmu.</p></div>
                <button onClick={() => { setView('terminal'); document.getElementById('terminal-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} aria-label="Lihat terminal"><ArrowUpRight size={16} /></button>
              </div>
              <div className="source-note-card">
                <div className="source-note-head"><div className="source-note-icon"><BookOpen size={16} /></div><span>ETIKA KURASI</span></div>
                <p>Impor manual, catat sumber, dan hormati lisensi. Jangan lewati proteksi anti-bot tanpa izin.</p>
                <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer">API resmi Pixabay <ExternalLink size={13} /></a>
              </div>
            </aside>
          </div>

          <footer className="page-footer"><span>© {new Date().getFullYear()} SnippetVault</span><span>Dikurasi oleh <b>Van313 | Official</b></span><span className="footer-status"><i /> semua sistem tenang</span></footer>
        </main>
      </div>

      {addOpen && <AddSnippetModal onClose={() => setAddOpen(false)} onSave={saveSnippet} initialKind={addKind} />}
      {selectedSnippet && <DetailModal snippet={selectedSnippet} onClose={closeDetail} onCopy={copyCode} onDownload={downloadCode} onShare={shareSnippet} onToast={showToast} />}
      {toast && <div className="toast-message" role="status"><span className="toast-icon"><Check size={15} /></span>{toast}</div>}
    </div>
  );
}

export default App;
