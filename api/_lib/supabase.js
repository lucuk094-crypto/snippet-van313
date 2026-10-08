import { createClient } from '@supabase/supabase-js';

export function getServerSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const error = new Error('Supabase server environment is not configured.');
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function applyPublicCors(req, res, methods = 'GET, OPTIONS') {
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, X-Upstream-Status, X-Upstream-Content-Type');
}

export function jsonError(res, status, code, message) {
  return res.status(status).json({ ok: false, error: { code, message } });
}
