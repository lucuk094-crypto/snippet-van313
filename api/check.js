import vm from 'node:vm';

const MAX_CODE_LENGTH = 60_000;
const PLACEHOLDER_RE = /\b(TODO|FIXME|YOUR[_ -]?API[_ -]?KEY|YOUR[_ -]?TOKEN|REPLACE[_ -]?ME|CHANGE[_ -]?ME|process\.env\.[A-Z0-9_]+)\b/i;
const RISK_PATTERNS = [
  { label: 'Dynamic evaluation', re: /\beval\s*\(|\bnew\s+Function\s*\(/i },
  { label: 'Shell/process access', re: /\b(child_process|execSync|spawnSync|execFileSync)\b/i },
  { label: 'Destructive shell command', re: /\brm\s+-rf\b|\bsudo\s+/i },
];

function isTyped(language) {
  return /typescript|tsx|\bts\b/i.test(language);
}

function stripSimpleModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+.*?;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '')
    .replace(/^\s*export\s+\{[^}]*\}\s*;?\s*$/gm, '');
}

function check(code, language) {
  const checks = [];
  const clean = code.trim();

  if (!clean) {
    return {
      state: 'review',
      label: 'Kode kosong',
      checks: [{ label: 'Source', status: 'fail', detail: 'Tidak ada kode untuk diperiksa.' }],
      note: 'Tidak ada kode yang dijalankan.',
    };
  }

  checks.push({ label: 'Source', status: 'pass', detail: `${clean.split('\n').length} baris ditemukan.` });

  const isJs = /javascript|js|jsx/i.test(language);
  let syntax = { label: 'Parser', status: 'limited', detail: 'Validasi sintaks otomatis terbatas untuk bahasa ini.' };
  if (isJs) {
    if (isTyped(language) || /jsx/i.test(language)) {
      syntax = { label: 'Parser', status: 'limited', detail: 'TypeScript/JSX perlu parser khusus; lakukan tinjau manual.' };
    } else {
      try {
        // Strip only common module declarations, then compile syntax without execution.
        new vm.Script(stripSimpleModuleSyntax(clean), { filename: 'snippet-check.js' });
        syntax = { label: 'Sintaks JS', status: 'pass', detail: 'Lolos parse-only check; runtime tidak dijalankan.' };
      } catch (error) {
        syntax = { label: 'Sintaks JS', status: 'fail', detail: error.message.split('\n')[0] };
      }
    }
  }
  checks.push(syntax);

  const placeholders = clean.match(PLACEHOLDER_RE);
  if (placeholders) {
    checks.push({ label: 'Konfigurasi', status: 'warn', detail: `Periksa placeholder/secret: ${placeholders[0]}.` });
  } else {
    checks.push({ label: 'Konfigurasi', status: 'pass', detail: 'Tidak menemukan placeholder umum.' });
  }

  const risks = RISK_PATTERNS.filter((item) => item.re.test(clean)).map((item) => item.label);
  if (risks.length) {
    checks.push({ label: 'Pola berisiko', status: 'warn', detail: risks.join(', ') + '. Tinjau manual sebelum dipakai.' });
  } else {
    checks.push({ label: 'Pola berisiko', status: 'pass', detail: 'Tidak menemukan pola berisiko umum.' });
  }

  const syntaxFailed = syntax.status === 'fail';
  const hasRisk = risks.length > 0;
  const needsSetup = Boolean(placeholders);
  const state = syntaxFailed || hasRisk || syntax.status === 'limited' ? 'review' : needsSetup ? 'setup' : 'ready';
  const label = state === 'ready' ? 'Lolos preflight' : state === 'setup' ? 'Konfigurasi dibutuhkan' : 'Perlu ditinjau';

  return {
    state,
    label,
    checks,
    note: 'Pemeriksaan statis saja. Snippet tidak dijalankan dan status runtime/API pihak ketiga tidak diverifikasi.',
  };
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const code = typeof body.code === 'string' ? body.code : '';
  const language = typeof body.language === 'string' ? body.language : 'JavaScript';

  if (code.length > MAX_CODE_LENGTH) {
    return res.status(413).json({ error: `Kode terlalu panjang (maks. ${MAX_CODE_LENGTH} karakter).` });
  }

  return res.status(200).json(check(code, language));
}
