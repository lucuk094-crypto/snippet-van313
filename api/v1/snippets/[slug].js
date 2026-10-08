import { STARTER_SNIPPETS } from '../../../src/data.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

export default function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Gunakan GET untuk endpoint ini.' } });
  }

  const rawSlug = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
  const slug = String(rawSlug || '').trim().toLowerCase();
  const snippet = STARTER_SNIPPETS.find((item) => String(item.id).toLowerCase() === slug);

  if (!snippet) {
    return res.status(404).json({
      ok: false,
      error: { code: 'SNIPPET_NOT_FOUND', message: `Snippet dengan slug “${slug}” tidak ditemukan.` },
    });
  }

  return res.status(200).json({
    ok: true,
    data: {
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
      downloads: snippet.downloads || 0,
      code: snippet.code || '',
    },
  });
}
