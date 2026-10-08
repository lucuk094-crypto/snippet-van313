import { getServerSupabase, applyPublicCors, jsonError } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  applyPublicCors(req, res, 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Gunakan GET untuk detail endpoint.');
  }
  let supabase;
  try { supabase = getServerSupabase(); }
  catch { return jsonError(res, 503, 'SUPABASE_NOT_CONFIGURED', 'Catalog belum terhubung ke Supabase.'); }

  const rawSlug = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
  const slug = String(rawSlug || '').trim().toLowerCase();
  if (!slug) return jsonError(res, 400, 'SLUG_REQUIRED', 'Slug endpoint wajib diisi.');

  const { data, error } = await supabase
    .from('api_endpoints')
    .select('*,category:endpoint_categories(id,name,slug,icon)')
    .eq('slug', slug)
    .eq('is_public', true)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return jsonError(res, 502, 'CATALOG_READ_FAILED', error.message);
  if (!data) return jsonError(res, 404, 'ENDPOINT_NOT_FOUND', `Endpoint “${slug}” tidak ditemukan.`);
  return res.status(200).json({ ok: true, data });
}
