import { getServerSupabase, applyPublicCors, jsonError } from '../_lib/supabase.js';

const LIST_FIELDS = 'id,name,slug,method,path,category_id,subfolder,description,output_type,example_url,params,requires_api_key,key_param_name,key_description,sample_response,sort_order,created_at,updated_at,category:endpoint_categories(id,name,slug,icon)';

export default async function handler(req, res) {
  applyPublicCors(req, res, 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Gunakan GET untuk katalog endpoint.');
  }

  let supabase;
  try { supabase = getServerSupabase(); }
  catch { return jsonError(res, 503, 'SUPABASE_NOT_CONFIGURED', 'Catalog belum terhubung ke Supabase.'); }

  const params = req.query || {};
  const q = String(params.q || params.search || '').trim().replace(/[%(),]/g, ' ').slice(0, 100);
  const method = String(params.method || '').toUpperCase();
  const rawLimit = Number.parseInt(params.limit, 10);
  const rawOffset = Number.parseInt(params.offset, 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

  try {
    const { data: categories, error: categoryError } = await supabase
      .from('endpoint_categories')
      .select('id,name,slug,icon,parent_id,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (categoryError) return jsonError(res, 502, 'CATALOG_READ_FAILED', categoryError.message);

    let query = supabase
      .from('api_endpoints')
      .select(LIST_FIELDS, { count: 'exact' })
      .eq('is_public', true)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    const categorySlug = String(params.category || '').trim().toLowerCase();
    if (categorySlug) {
      const category = (categories || []).find((item) => item.slug.toLowerCase() === categorySlug || item.name.toLowerCase() === categorySlug);
      if (!category) return res.status(200).json({ ok: true, data: [], categories: categories || [], pagination: { total: 0, limit, offset, returned: 0, hasMore: false } });
      query = query.eq('category_id', category.id);
    }
    if (['GET','POST','PUT','DELETE'].includes(method)) query = query.eq('method', method);
    if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,path.ilike.%${q}%,description.ilike.%${q}%,subfolder.ilike.%${q}%`);

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return jsonError(res, 502, 'CATALOG_READ_FAILED', error.message);
    const rows = data || [];
    return res.status(200).json({
      ok: true,
      data: rows,
      categories: categories || [],
      pagination: { total: count || 0, limit, offset, returned: rows.length, hasMore: offset + rows.length < (count || 0) },
    });
  } catch (error) {
    return jsonError(res, 500, 'CATALOG_ERROR', error.message || 'Tidak dapat membaca katalog.');
  }
}
