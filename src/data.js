export const STARTER_SNIPPETS = [
  {
    id: 'fetch-json',
    title: 'fetchJSON yang rapi',
    description: 'Wrapper Fetch API ringkas dengan pemeriksaan HTTP dan header JSON yang konsisten.',
    language: 'JavaScript',
    category: 'API',
    tags: ['fetch', 'api', 'error handling'],
    code: `export async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error("Request failed: " + response.status);
  }

  return response.json();
}`,
    sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
    author: 'Van313 | Official',
    downloads: 184,
    createdAt: Date.now() - 1000 * 60 * 28,
  },
  {
    id: 'debounce-function',
    title: 'Debounce function',
    description: 'Menunda pemanggilan callback sampai input berhenti berubah—berguna untuk pencarian dan event resize.',
    language: 'JavaScript',
    category: 'Frontend',
    tags: ['utility', 'performance', 'events'],
    code: `export function debounce(callback, delay = 250) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}`,
    sourceUrl: 'https://developer.mozilla.org/en-US/docs/Glossary/Debounce',
    author: 'Van313 | Official',
    downloads: 126,
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: 'slugify-text',
    title: 'Slugify teks & URL',
    description: 'Normalisasi teks menjadi slug yang mudah dibaca, konsisten, dan ramah URL.',
    language: 'JavaScript',
    category: 'Utility',
    tags: ['string', 'url', 'text'],
    code: `export function slugify(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}`,
    sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize',
    author: 'Van313 | Official',
    downloads: 97,
    createdAt: Date.now() - 1000 * 60 * 60 * 8,
  },
  {
    id: 'pixabay-official-api',
    title: 'Cari gambar via Pixabay API',
    description: 'Contoh integrasi API resmi Pixabay. Simpan API key di environment variable—bukan di source publik.',
    language: 'JavaScript',
    category: 'API',
    tags: ['pixabay', 'api', 'images'],
    code: `export async function searchPixabay(query) {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) throw new Error("Set PIXABAY_API_KEY first.");

  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Pixabay API error: " + response.status);
  return response.json();
}`,
    sourceUrl: 'https://pixabay.com/api/docs/',
    author: 'Van313 | Official',
    downloads: 73,
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 'python-json-file',
    title: 'Baca file JSON dengan aman',
    description: 'Membaca file JSON dan memberi pesan error yang jelas saat file tidak valid atau tidak ditemukan.',
    language: 'Python',
    category: 'Data',
    tags: ['python', 'json', 'file'],
    code: `import json
from pathlib import Path


def read_json(path):
    file_path = Path(path)
    with file_path.open("r", encoding="utf-8") as file:
        return json.load(file)


if __name__ == "__main__":
    data = read_json("settings.json")
    print(json.dumps(data, indent=2, ensure_ascii=False))`,
    sourceUrl: 'https://docs.python.org/3/library/json.html',
    author: 'Van313 | Official',
    downloads: 62,
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: 'bash-folder-backup',
    title: 'Backup folder ke .tar.gz',
    description: 'Arsip folder dengan nama bertanggal. Jalankan hanya pada folder yang memang Anda miliki.',
    language: 'Bash',
    category: 'Automation',
    tags: ['bash', 'backup', 'cli'],
    code: `#!/usr/bin/env bash
set -euo pipefail

source_dir="\${1:?Usage: backup-folder <directory>}"
archive="\${2:-$(basename "$source_dir")-$(date +%Y%m%d-%H%M%S).tar.gz}"

tar -czf "$archive" -C "$(dirname "$source_dir")" "$(basename "$source_dir")"
printf 'Archive created: %s\\n' "$archive"`,
    sourceUrl: 'https://www.gnu.org/software/tar/manual/',
    author: 'Van313 | Official',
    downloads: 45,
    createdAt: Date.now() - 1000 * 60 * 60 * 72,
  },
];

export const CATEGORIES = ['Semua', 'Frontend', 'API', 'Utility', 'Data', 'Automation'];
export const LANGUAGES = ['Semua bahasa', 'JavaScript', 'TypeScript', 'Python', 'Bash', 'JSON'];
export const LANG_INFO = {
  JavaScript: { short: 'JS', className: 'js', lexer: 'javascript', ext: 'js' },
  TypeScript: { short: 'TS', className: 'ts', lexer: 'typescript', ext: 'ts' },
  Python: { short: 'PY', className: 'py', lexer: 'python', ext: 'py' },
  Bash: { short: 'SH', className: 'sh', lexer: 'bash', ext: 'sh' },
  JSON: { short: 'JSN', className: 'json', lexer: 'json', ext: 'json' },
};

