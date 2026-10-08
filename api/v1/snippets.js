import { STARTER_SNIPPETS } from '../../src/data.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function asPublicSnippet(snippet) {
  return {
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
    codeLines: String(snippet.code || '').split('\n').length,
  };
}

export default function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Gunakan GET untuk endpoint ini.' } });
  }

  const params = req.query || {};
  const q = normalize(params.q || params.search);
  const category = normalize(params.category);
  const language = normalize(params.language);
  const tag = normalize(params.tag);
  const parsedLimit = Number.parseInt(params.limit, 10);
  const parsedOffset = Number.parseInt(params.offset, 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 10;
  const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;

  const matching = STARTER_SNIPPETS.filter((snippet) => {
    const text = normalize(`${snippet.title} ${snippet.description} ${snippet.id} ${(snippet.tags || []).join(' ')}`);
    const categoryMatch = !category || normalize(snippet.category) === category;
    const languageMatch = !language || normalize(snippet.language) === language;
    const tagMatch = !tag || (snippet.tags || []).some((item) => normalize(item) === tag);
    return categoryMatch && languageMatch && tagMatch && (!q || text.includes(q));
  }).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  const data = matching.slice(offset, offset + limit).map(asPublicSnippet);
  return res.status(200).json({
    ok: true,
    data,
    pagination: {
      total: matching.length,
      limit,
      offset,
      returned: data.length,
      hasMore: offset + data.length < matching.length,
    },
  });
}
