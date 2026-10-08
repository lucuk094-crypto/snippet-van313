import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown, Copy, Download, Edit3, FileCode2, FolderPlus, KeyRound,
  LoaderCircle, LockKeyhole, LogOut, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, Upload, X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase, SUPABASE_SETUP_HINT } from './lib/supabase.js';
import './admin-dashboard.css';

const OUTPUT_TYPES = [
  ['json', 'JSON (Default)'], ['text', 'Plain text'], ['image', 'Gambar (JPG/PNG)'], ['binary-png', 'PNG Transparan'],
  ['video', 'Video Loop (MP4)'], ['mp4', 'Video Player (MP4)'], ['audio', 'Audio'], ['mp3', 'Audio Player (MP3)'],
];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const PARAM_TYPES = ['string', 'number', 'boolean', 'file'];

function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'endpoint';
}
function readableError(error) {
  return error?.message || error?.error_description || 'Operasi gagal. Periksa koneksi dan kebijakan Supabase.';
}
function emptyEndpoint(categoryId = '') {
  return { name: '', slug: '', method: 'GET', path: '/', category_id: categoryId, subfolder: '', description: '', output_type: 'json', example_url: '', params: [], requires_api_key: false, key_param_name: 'key', key_description: '', sample_response: null, is_public: true, is_active: true, sort_order: 0 };
}

function EndpointForm({ initial, categories, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => ({ ...emptyEndpoint(categories[0]?.id || ''), ...initial }));
  const [slugLocked, setSlugLocked] = useState(Boolean(initial?.id));
  const [sampleText, setSampleText] = useState(() => initial?.sample_response ? JSON.stringify(initial.sample_response, null, 2) : '');
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeName = (value) => setForm((current) => ({ ...current, name: value, ...(!slugLocked ? { slug: slugify(value) } : {}) }));
  const updateParam = (index, key, value) => setForm((current) => ({ ...current, params: current.params.map((param, i) => i === index ? { ...param, [key]: value } : param) }));
  const addParam = () => setForm((current) => ({ ...current, params: [...current.params, { name: '', type: 'string', required: false, description: '', default_value: '' }] }));
  const deleteParam = (index) => setForm((current) => ({ ...current, params: current.params.filter((_, i) => i !== index) }));

  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (!form.name.trim() || !form.slug.trim() || !form.path.trim() || !form.example_url.trim() || !form.category_id) {
      setError('Nama, slug, kategori, path, dan contoh URL wajib diisi.'); return;
    }
    if (!form.path.startsWith('/') || form.path.startsWith('//') || form.path.includes(String.fromCharCode(92))) { setError('Path harus diawali satu “/” dan tidak boleh mengubah host.'); return; }
    try {
      const example = new URL(form.example_url.trim());
      if (example.protocol !== 'https:') { setError('Contoh URL harus memakai HTTPS.'); return; }
    } catch { setError('Contoh URL tidak valid.'); return; }
    const params = form.params.map((param) => ({
      name: String(param.name || '').trim(), type: param.type || 'string', required: Boolean(param.required),
      description: String(param.description || '').trim(), default_value: param.default_value ?? '',
    }));
    if (params.some((param) => !param.name)) { setError('Isi nama untuk setiap parameter atau hapus baris parameter kosong.'); return; }
    let sampleResponse = null;
    if (sampleText.trim()) {
      try { sampleResponse = JSON.parse(sampleText); }
      catch (parseError) { setError(`Sample response bukan JSON valid: ${parseError.message}`); return; }
    }
    const record = {
      name: form.name.trim(), slug: slugify(form.slug), method: form.method, path: form.path.trim(),
      category_id: form.category_id, subfolder: form.subfolder.trim(), description: form.description.trim(),
      output_type: form.output_type, example_url: form.example_url.trim(), params,
      requires_api_key: Boolean(form.requires_api_key), key_param_name: form.key_param_name.trim() || 'key',
      key_description: form.key_description.trim(), sample_response: sampleResponse,
      is_public: Boolean(form.is_public), is_active: Boolean(form.is_active), sort_order: Number(form.sort_order) || 0,
    };
    if (initial?.id) record.id = initial.id;
    await onSave(record, setError);
  };

  return (
    <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="endpoint-form-title">
        <div className="admin-modal-head"><div><span className="admin-eyebrow">ENDPOINT METADATA</span><h2 id="endpoint-form-title">{initial?.id ? 'Edit endpoint' : 'Add new endpoint'}</h2><p>Field metadata ini dipakai oleh search, playground, output renderer, dan code generator.</p></div><button className="admin-icon-button" onClick={onClose} aria-label="Tutup"><X size={17} /></button></div>
        <form className="admin-form" onSubmit={submit}>
          <div className="admin-form-grid two">
            <label>Name *<input value={form.name} onChange={(event) => changeName(event.target.value)} placeholder="Anime Search" maxLength={90} /></label>
            <label>Slug *<input value={form.slug} onChange={(event) => { setSlugLocked(true); update('slug', slugify(event.target.value)); }} placeholder="anime-search" /></label>
          </div>
          <div className="admin-form-grid three">
            <label>Method *<select value={form.method} onChange={(event) => update('method', event.target.value)}>{HTTP_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label>Category / Folder *<select value={form.category_id} onChange={(event) => update('category_id', event.target.value)}><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? `↳ ${categories.find((parent) => parent.id === category.parent_id)?.name || 'Subfolder'} / ` : ''}{category.name}</option>)}</select></label>
            <label>Subfolder<input value={form.subfolder} onChange={(event) => update('subfolder', event.target.value)} placeholder="opsional" /></label>
          </div>
          <div className="admin-form-grid two">
            <label>Path Endpoint *<input value={form.path} onChange={(event) => update('path', event.target.value)} placeholder="/anime" /></label>
            <label>Format Output<select value={form.output_type} onChange={(event) => update('output_type', event.target.value)}>{OUTPUT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label>Description<textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Jelaskan fungsi endpoint dan sumber data." rows={2} maxLength={500} /></label>
          <label>Example execution URL *<input value={form.example_url} onChange={(event) => update('example_url', event.target.value)} placeholder="https://api.example.com/search?q=..." /></label>

          <div className="admin-param-box">
            <div className="admin-param-head"><div><b>Parameters</b><small>Parameter ini jadi input dinamis pada playground.</small></div><button type="button" className="admin-add-param" onClick={addParam}><Plus size={13} />Add Param</button></div>
            {form.params.length === 0 ? <div className="admin-no-params">Belum ada parameter. Tambahkan jika endpoint menerima query/body/file.</div> : <div className="admin-param-list">
              {form.params.map((param, index) => <div className="admin-param-row" key={index}>
                <input value={param.name || ''} onChange={(event) => updateParam(index, 'name', event.target.value)} placeholder="name" aria-label="Nama parameter" />
                <select value={param.type || 'string'} onChange={(event) => updateParam(index, 'type', event.target.value)} aria-label="Tipe parameter">{PARAM_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                <label className="admin-required-toggle"><input type="checkbox" checked={Boolean(param.required)} onChange={(event) => updateParam(index, 'required', event.target.checked)} />Req</label>
                <input value={param.description || ''} onChange={(event) => updateParam(index, 'description', event.target.value)} placeholder="description" aria-label="Deskripsi parameter" />
                <input value={param.default_value || ''} onChange={(event) => updateParam(index, 'default_value', event.target.value)} placeholder="default" aria-label="Nilai awal parameter" />
                <button type="button" className="admin-delete-param" onClick={() => deleteParam(index)} aria-label="Hapus parameter"><X size={14} /></button>
              </div>)}
            </div>}
          </div>

          <div className="admin-api-key-box">
            <label className="admin-check-row"><input type="checkbox" checked={Boolean(form.requires_api_key)} onChange={(event) => update('requires_api_key', event.target.checked)} /><span><b>Butuh API Key?</b><small>Playground akan membuat input rahasia sementara.</small></span></label>
            {form.requires_api_key && <div className="admin-form-grid two"><label>Key Param Name<input value={form.key_param_name} onChange={(event) => update('key_param_name', event.target.value)} placeholder="key" /></label><label>Key Description<input value={form.key_description} onChange={(event) => update('key_description', event.target.value)} placeholder="Key provider, tidak disimpan." /></label></div>}
          </div>

          <details className="admin-optional-fields"><summary>Sample response JSON (opsional)</summary><textarea value={sampleText} onChange={(event) => setSampleText(event.target.value)} rows={8} spellCheck="false" placeholder={'{\n  "success": true,\n  "data": []\n}'} /></details>
          <div className="admin-form-grid two"><label>Sort order<input type="number" value={form.sort_order} onChange={(event) => update('sort_order', event.target.value)} /></label><label className="admin-check-row inline"><input type="checkbox" checked={Boolean(form.is_public)} onChange={(event) => update('is_public', event.target.checked)} /><span>Public</span></label><label className="admin-check-row inline"><input type="checkbox" checked={Boolean(form.is_active)} onChange={(event) => update('is_active', event.target.checked)} /><span>Active</span></label></div>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-modal-actions"><button type="button" className="admin-secondary-button" onClick={onClose}>Cancel</button><button className="admin-primary-button" type="submit" disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save endpoint'}</button></div>
        </form>
      </section>
    </div>
  );
}

export default function AdminDashboard({ onPortal }) {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState('endpoints');
  const [endpoints, setEndpoints] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [categoryForm, setCategoryForm] = useState(null);
  const [categoryError, setCategoryError] = useState('');
  const [toast, setToast] = useState('');
  const [importError, setImportError] = useState('');
  const importRef = useRef(null);

  const notify = (message) => setToast(message);
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer); }, [toast]);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return undefined; }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) { setSession(data.session); setAuthLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !supabase) { setIsAdmin(false); setCheckingAdmin(false); return undefined; }
    let active = true; setCheckingAdmin(true);
    supabase.from('endpoint_admins').select('user_id').eq('user_id', session.user.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      setIsAdmin(Boolean(data?.user_id) && !error);
      setCheckingAdmin(false);
      if (error) setLoginError(readableError(error));
    });
    return () => { active = false; };
  }, [session]);

  const loadData = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    setLoading(true);
    const [{ data: categoryRows, error: categoryErrorValue }, { data: endpointRows, error: endpointErrorValue }] = await Promise.all([
      supabase.from('endpoint_categories').select('*').order('sort_order').order('name'),
      supabase.from('api_endpoints').select('*,category:endpoint_categories(id,name,slug)').order('sort_order').order('name'),
    ]);
    if (categoryErrorValue || endpointErrorValue) notify(readableError(categoryErrorValue || endpointErrorValue));
    setCategories(categoryRows || []); setEndpoints(endpointRows || []); setLoading(false);
  }, [isAdmin]);
  useEffect(() => { loadData(); }, [loadData]);

  const filteredEndpoints = useMemo(() => {
    const term = search.trim().toLowerCase();
    return endpoints.filter((endpoint) => !term || `${endpoint.name} ${endpoint.slug} ${endpoint.path} ${endpoint.description} ${endpoint.subfolder} ${endpoint.category?.name || ''}`.toLowerCase().includes(term));
  }, [endpoints, search]);

  const login = async (event) => {
    event.preventDefault(); setLoginError('');
    if (!supabase) { setLoginError(SUPABASE_SETUP_HINT); return; }
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    setAuthLoading(false);
    if (error) { setLoginError(readableError(error)); return; }
    setSession(data.session);
    setLoginPassword('');
  };

  const logout = async () => {
    await supabase?.auth.signOut();
    setSession(null); setIsAdmin(false); notify('Anda sudah logout dari admin.');
  };

  const saveEndpoint = async (record, setFormError) => {
    if (!supabase) return setFormError(SUPABASE_SETUP_HINT);
    setSaving(true);
    const operation = record.id
      ? supabase.from('api_endpoints').update({ ...record, updated_at: new Date().toISOString() }).eq('id', record.id)
      : supabase.from('api_endpoints').insert(record);
    const { error } = await operation;
    setSaving(false);
    if (error) { setFormError(readableError(error)); return; }
    setFormInitial(null); notify(record.id ? 'Endpoint diperbarui.' : 'Endpoint ditambahkan.'); loadData();
  };

  const deleteEndpoint = async (endpoint) => {
    if (!window.confirm(`Hapus endpoint “${endpoint.name}”?`)) return;
    const { error } = await supabase.from('api_endpoints').delete().eq('id', endpoint.id);
    if (error) notify(readableError(error)); else { notify('Endpoint dihapus.'); loadData(); }
  };

  const saveCategory = async (event) => {
    event.preventDefault(); setCategoryError('');
    const record = { name: categoryForm.name.trim(), slug: slugify(categoryForm.slug || categoryForm.name), icon: categoryForm.icon.trim() || 'Folder', sort_order: Number(categoryForm.sort_order) || 0, is_active: Boolean(categoryForm.is_active), parent_id: categoryForm.parent_id || null };
    if (!record.name) { setCategoryError('Nama kategori wajib diisi.'); return; }
    const operation = categoryForm.id ? supabase.from('endpoint_categories').update(record).eq('id', categoryForm.id) : supabase.from('endpoint_categories').insert(record);
    const { error } = await operation;
    if (error) setCategoryError(readableError(error)); else { setCategoryForm(null); notify('Kategori tersimpan.'); loadData(); }
  };

  const deleteCategory = async (category) => {
    if (!window.confirm(`Hapus kategori “${category.name}”? Endpoint yang masih menggunakannya akan menolak penghapusan.`)) return;
    const { error } = await supabase.from('endpoint_categories').delete().eq('id', category.id);
    if (error) notify(readableError(error)); else { notify('Kategori dihapus.'); loadData(); }
  };

  const exportBackup = () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), categories, endpoints };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `snippetvault-api-backup-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url);
  };

  const importBackup = async (file) => {
    setImportError('');
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.endpoints)) throw new Error('File perlu berisi arrays categories dan endpoints.');
      if (!window.confirm(`Import ${parsed.categories.length} kategori dan ${parsed.endpoints.length} endpoint? Data dengan slug sama akan diperbarui.`)) return;
      const oldCategories = new Map(parsed.categories.map((item) => [item.id, item]));
      const categoryRecord = (item, index, parentId = null) => ({ name: item.name, slug: slugify(item.slug || item.name), icon: item.icon || 'Folder', sort_order: item.sort_order ?? index * 10, is_active: item.is_active !== false, parent_id: parentId });
      const topLevel = parsed.categories.filter((item) => !item.parent_id).map((item, index) => categoryRecord(item, index));
      if (topLevel.length) {
        const { error: topError } = await supabase.from('endpoint_categories').upsert(topLevel, { onConflict: 'slug' });
        if (topError) throw topError;
      }
      let { data: refreshedCategories, error: refreshedError } = await supabase.from('endpoint_categories').select('id,slug');
      if (refreshedError) throw refreshedError;
      let categoryIds = new Map((refreshedCategories || []).map((item) => [item.slug, item.id]));
      const childRecords = parsed.categories.flatMap((item, index) => {
        if (!item.parent_id) return [];
        const originalParent = oldCategories.get(item.parent_id);
        const parentSlug = item.parent_slug || originalParent?.slug;
        const parentId = categoryIds.get(slugify(parentSlug || ''));
        if (!parentId) throw new Error(`Parent category untuk “${item.name}” tidak ditemukan di backup.`);
        return [categoryRecord(item, index, parentId)];
      });
      if (childRecords.length) {
        const { error: childError } = await supabase.from('endpoint_categories').upsert(childRecords, { onConflict: 'slug' });
        if (childError) throw childError;
        const refreshed = await supabase.from('endpoint_categories').select('id,slug');
        if (refreshed.error) throw refreshed.error;
        refreshedCategories = refreshed.data;
        categoryIds = new Map((refreshedCategories || []).map((item) => [item.slug, item.id]));
      }
      const existingCategoryIds = new Set((refreshedCategories || []).map((item) => item.id));
      const endpointRecords = parsed.endpoints.map((item) => {
        const categorySlug = item.category?.slug || item.category_slug || item.folder_slug || '';
        return {
          name: item.name, slug: slugify(item.slug || item.name), method: item.method || item.m || 'GET', path: item.path || '/',
          category_id: categoryIds.get(categorySlug) || (existingCategoryIds.has(item.category_id) ? item.category_id : null), subfolder: item.subfolder || '', description: item.description || item.desc || '',
          output_type: item.output_type || item.outputType || 'json', example_url: item.example_url || item.ex || '',
          params: (item.params || []).map((param) => ({ name: param.name || param.n, type: param.type || param.t || 'string', required: Boolean(param.required ?? param.r), description: param.description || param.d || '', default_value: param.default_value || '' })),
          requires_api_key: Boolean(item.requires_api_key ?? item.needKey), key_param_name: item.key_param_name || item.keyParam || 'key', key_description: item.key_description || item.keyDesc || '',
          sample_response: item.sample_response || null, is_public: item.is_public !== false, is_active: item.is_active !== false, sort_order: item.sort_order || 0,
        };
      });
      if (endpointRecords.some((item) => !item.category_id)) throw new Error('Setiap endpoint backup perlu category_id atau category.slug yang sudah di-import.');
      const { error: endpointErrorValue } = await supabase.from('api_endpoints').upsert(endpointRecords, { onConflict: 'slug' });
      if (endpointErrorValue) throw endpointErrorValue;
      notify('Backup berhasil di-import.'); loadData();
    } catch (error) { setImportError(readableError(error)); }
    finally { if (importRef.current) importRef.current.value = ''; }
  };

  if (!isSupabaseConfigured) return <AdminShell onPortal={onPortal}><AdminSetupCard /></AdminShell>;
  if (authLoading || checkingAdmin) return <AdminShell onPortal={onPortal}><div className="admin-loading"><LoaderCircle size={21} className="portal-spin" />Memeriksa akses admin…</div></AdminShell>;
  if (session && !isAdmin) return <AdminShell onPortal={onPortal}><section className="admin-login-card">
    <div className="admin-login-logo"><ShieldCheck size={19} /></div><span className="admin-eyebrow">ACCESS NOT GRANTED</span><h1>Akun ini bukan admin</h1><p>Sesi Supabase valid, tetapi user ID ini belum terdaftar di tabel <code>endpoint_admins</code>. Minta owner project menambahkan UUID Anda.</p>
    {loginError && <div className="admin-form-error">{loginError}</div>}<button className="admin-secondary-button" onClick={logout}><LogOut size={14} />Logout</button>
  </section></AdminShell>;
  if (!session) return <AdminShell onPortal={onPortal}><section className="admin-login-card">
    <div className="admin-login-logo"><LockKeyhole size={19} /></div><span className="admin-eyebrow">RESTRICTED WORKSPACE</span><h1>Admin dashboard</h1><p>Masuk menggunakan akun Supabase yang sudah didaftarkan sebagai endpoint admin.</p>
    <form onSubmit={login}><label>Email<input type="email" autoComplete="username" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required placeholder="admin@example.com" /></label><label>Password<input type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required placeholder="••••••••••" /></label>{loginError && <div className="admin-form-error">{loginError}</div>}<button className="admin-primary-button" disabled={authLoading}><KeyRound size={14} />{authLoading ? 'Memeriksa…' : 'Login admin'}</button></form>
    <small>Akun harus dibuat di Supabase Auth dan UUID-nya tercantum pada tabel <code>endpoint_admins</code>. Tidak ada password admin di source code.</small>
  </section></AdminShell>;

  return <AdminShell onPortal={onPortal}>
    <main className="admin-workspace">
      <header className="admin-workspace-head"><div><span className="admin-eyebrow"><span className="admin-online-dot" />ADMIN CONTROL PANEL</span><h1>Kelola API portal</h1><p>Data endpoint dan kategori disimpan di Supabase, tidak di localStorage.</p></div><div className="admin-head-actions"><button className="admin-secondary-button" onClick={exportBackup}><Download size={14} />Backup JSON</button><button className="admin-secondary-button" onClick={() => importRef.current?.click()}><Upload size={14} />Import</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => event.target.files?.[0] && importBackup(event.target.files[0])} /><button className="admin-icon-button" onClick={logout} title="Logout"><LogOut size={15} /></button></div></header>
      {importError && <div className="admin-form-error">{importError}</div>}
      <div className="admin-summary-grid"><div><span>ENDPOINTS</span><b>{endpoints.length}</b></div><div><span>PUBLIC</span><b>{endpoints.filter((item) => item.is_public && item.is_active).length}</b></div><div><span>CATEGORIES</span><b>{categories.length}</b></div><div><span>ADMIN</span><b>AUTH</b></div></div>
      <div className="admin-tabs"><button className={tab === 'endpoints' ? 'active' : ''} onClick={() => setTab('endpoints')}><FileCode2 size={14} />Endpoints<span>{endpoints.length}</span></button><button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}><FolderPlus size={14} />Categories<span>{categories.length}</span></button></div>

      {tab === 'endpoints' && <section className="admin-table-card"><div className="admin-table-heading"><div><h2>Manage endpoints</h2><p>Nama, method, path, dan status publik.</p></div><div className="admin-table-actions"><label className="admin-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari endpoint…" /></label><button className="admin-primary-button" onClick={() => setFormInitial(emptyEndpoint(categories[0]?.id || ''))}><Plus size={14} />Add new endpoint</button></div></div>
        {loading ? <div className="admin-loading"><LoaderCircle size={17} className="portal-spin" />Memuat data…</div> : <div className="admin-table-scroll"><table className="admin-endpoint-table"><thead><tr><th>NAME</th><th>METHOD</th><th>PATH</th><th>KATEGORI</th><th>AKSI</th></tr></thead><tbody>
          {filteredEndpoints.map((endpoint) => <tr key={endpoint.id}><td><b>{endpoint.name}</b><small>{endpoint.slug} · {endpoint.output_type}</small></td><td><span className={`portal-method method-${String(endpoint.method).toLowerCase()}`}>{endpoint.method}</span></td><td><code>{endpoint.path}</code></td><td>{endpoint.category?.name || categories.find((item) => item.id === endpoint.category_id)?.name || '—'}{endpoint.subfolder && <small>{endpoint.subfolder}</small>}</td><td><div className="admin-row-actions"><button onClick={() => setFormInitial(endpoint)} title="Edit endpoint"><Edit3 size={14} /></button><button onClick={() => deleteEndpoint(endpoint)} title="Hapus endpoint"><Trash2 size={14} /></button></div></td></tr>)}
          {!filteredEndpoints.length && <tr><td colSpan="5" className="admin-table-empty">Belum ada endpoint. Pilih <b>Add new endpoint</b> untuk mulai.</td></tr>}
        </tbody></table></div>}
      </section>}

      {tab === 'categories' && <section className="admin-table-card"><div className="admin-table-heading"><div><h2>Manage category tree</h2><p>Kategori dapat berupa folder utama atau subfolder.</p></div><button className="admin-primary-button" onClick={() => setCategoryForm({ name: '', slug: '', icon: 'Folder', sort_order: categories.length * 10, is_active: true, parent_id: '' })}><Plus size={14} />Add category</button></div>
        <div className="admin-category-list">{categories.map((category) => <div className="admin-category-row" key={category.id}><span className="admin-category-icon"><FolderPlus size={14} /></span><div><b>{category.name}</b><small>{category.parent_id ? `↳ ${categories.find((parent) => parent.id === category.parent_id)?.name || 'Folder'} / ` : ''}/{category.slug} · {category.is_active ? 'active' : 'hidden'}</small></div><div className="admin-category-actions"><button onClick={() => setCategoryForm(category)} title="Edit category"><Edit3 size={14} /></button><button onClick={() => deleteCategory(category)} title="Delete category"><Trash2 size={14} /></button></div></div>)}{!categories.length && <div className="admin-table-empty">Belum ada kategori.</div>}</div>
      </section>}
      <div className="admin-security-note"><ShieldCheck size={14} /><span>Admin write access is checked by Supabase RLS and endpoint_admins. Anon key is public; never put a service-role key in the frontend.</span></div>
    </main>
    {formInitial && <EndpointForm initial={formInitial} categories={categories} onClose={() => setFormInitial(null)} onSave={saveEndpoint} saving={saving} />}
    {categoryForm && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCategoryForm(null); }}><section className="admin-modal admin-category-modal"><div className="admin-modal-head"><div><span className="admin-eyebrow">CATEGORY TREE</span><h2>{categoryForm.id ? 'Edit category' : 'Add category'}</h2><p>Folder untuk grouping endpoint di katalog publik.</p></div><button className="admin-icon-button" onClick={() => setCategoryForm(null)}><X size={16} /></button></div><form className="admin-form" onSubmit={saveCategory}><div className="admin-form-grid two"><label>Category name *<input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required /></label><label>Slug<input value={categoryForm.slug} onChange={(event) => setCategoryForm((current) => ({ ...current, slug: event.target.value }))} placeholder="auto from name" /></label></div><div className="admin-form-grid three"><label>Icon name<input value={categoryForm.icon} onChange={(event) => setCategoryForm((current) => ({ ...current, icon: event.target.value }))} placeholder="Folder" /></label><label>Parent folder<select value={categoryForm.parent_id || ''} onChange={(event) => setCategoryForm((current) => ({ ...current, parent_id: event.target.value }))}><option value="">Top-level</option>{categories.filter((item) => item.id !== categoryForm.id && !item.parent_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sort order<input type="number" value={categoryForm.sort_order} onChange={(event) => setCategoryForm((current) => ({ ...current, sort_order: event.target.value }))} /></label></div><label className="admin-check-row inline"><input type="checkbox" checked={Boolean(categoryForm.is_active)} onChange={(event) => setCategoryForm((current) => ({ ...current, is_active: event.target.checked }))} /><span>Visible in public portal</span></label>{categoryError && <div className="admin-form-error">{categoryError}</div>}<div className="admin-modal-actions"><button type="button" className="admin-secondary-button" onClick={() => setCategoryForm(null)}>Cancel</button><button className="admin-primary-button" type="submit"><Save size={14} />Save category</button></div></form></section></div>}
    {toast && <div className="portal-toast"><Check size={14} />{toast}</div>}
  </AdminShell>;
}

function AdminSetupCard() {
  return <section className="admin-login-card"><div className="admin-login-logo"><LockKeyhole size={19} /></div><span className="admin-eyebrow">SUPABASE SETUP REQUIRED</span><h1>Siapkan koneksi database</h1><p>{SUPABASE_SETUP_HINT}</p><ul><li>Jalankan <code>supabase/schema.sql</code> di SQL Editor.</li><li>Set URL dan anon key di environment variables frontend/Vercel.</li><li>Buat akun melalui Supabase Auth, lalu tambahkan UUID ke <code>endpoint_admins</code>.</li></ul></section>;
}

function AdminShell({ children, onPortal }) {
  return <div className="admin-shell"><header className="admin-public-header"><button className="portal-brand" onClick={onPortal}><span className="portal-brand-mark"><FileCode2 size={18} /></span><span><b>Snippet<span>Vault</span></b><small>ADMIN WORKSPACE</small></span></button><a href="/api-doc"><ArrowLeft size={14} />Kembali ke katalog</a></header>{children}</div>;
}
