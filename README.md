# SnippetVault — Van313 | Official

Perpustakaan snippet kode dengan pencarian, kategori/bahasa, favorit, tambah snippet, salin/unduh/bagikan, halaman detail, dokumentasi REST API publik, live API playground, dan preflight kode statis. Dibangun dengan React + Vite, ikon Lucide, serta siap di-build/deploy ke Vercel.

## Jalankan lokal

```bash
npm install
npm run dev
```

Build produksi:

```bash
npm run build
npm run preview
```

Buka halaman API docs di `/api-doc`.

## Deploy ke Vercel

1. Push project ke GitHub.
2. Di Vercel, pilih **Add New → Project** lalu import repo.
3. Framework preset: **Vite** (atau biarkan auto-detect). Build command `npm run build`, output directory `dist`.
4. Deploy. Fungsi di `api/` tersedia sebagai Vercel Functions.

Tidak ada API key yang dibutuhkan untuk API snippet publik.

## REST API publik

Semua endpoint read-only, JSON, dan mengizinkan CORS:

- `GET /api/v1/snippets?q=fetch&category=API&language=javascript&tag=api&limit=10&offset=0`
- `GET /api/v1/snippets/:slug`
- `GET /api/health`
- `POST /api/check` — preflight statis kode; bukan runtime execution.

Endpoint daftar menyaring judul/deskripsi/slug/tag serta mendukung filter kategori, bahasa, tag, pagination (maksimal `limit=50`). Endpoint detail menyertakan source code. API awal mengembalikan enam snippet demo terkurasi dari `src/data.js`.

## Fitur

- Cari snippet menurut judul, deskripsi, bahasa, tag, atau kategori.
- Filter kategori dan bahasa, sort terbaru/populer, bookmark/favorit.
- Tambah snippet dengan judul, bahasa, tag, source URL, dan kode.
- Detail snippet dengan syntax highlighting, copy, download, dan share URL.
- Workspace **Endpoint API**: filter Anime/Otakudesu, AI/Claude, AIO, Music, atau lainnya; tambahkan URL, method, request body, dan sample response JSON.
- Setiap endpoint punya panel preview: sample JSON tetap bisa dilihat, tombol request live menampilkan HTTP status/JSON, dan `data.results` dirender sebagai kartu hasil bila ada.
- Halaman `/api-doc` bergaya mobile-first seperti API reference, contoh cURL, tombol salin, live request tester (hasil HTTP/JSON dan TRUE/FALSE), dan pemeriksaan kode statis real-time.
- Tema terang/gelap, desain responsif, akses keyboard dasar.

## Penyimpanan

Tanpa konfigurasi database, snippet, endpoint API, dan favorit baru disimpan di `localStorage` browser. Artinya, data itu hanya terlihat pada browser/perangkat yang menyimpannya. API publik hanya membaca seed snippets di `src/data.js`. Untuk katalog bersama berisi data impor/scrape yang berizin, hubungkan Supabase/Postgres atau database lain, lalu tambahkan autentikasi dan kebijakan akses sebelum publikasi. Header/kunci yang dimasukkan di panel preview hanya berada di memori halaman saat itu, tidak disimpan ke koleksi.

## Terminal & keamanan

Terminal dan halaman API docs hanya melakukan **preflight statis**: memeriksa apakah source tersedia, mencoba parse-only untuk JavaScript sederhana/module, mencari placeholder umum, dan memberi peringatan pola berisiko. Snippet **tidak pernah dieksekusi** di browser/server. Status `TRUE` berarti lolos preflight awal, bukan jaminan kode aktif di runtime atau layanan eksternal.

Jika mengimpor snippet dari internet, cantumkan sumber dan lisensinya. Hindari scraper yang melewati proteksi situs; gunakan API resmi atau izin pemilik sumber.
