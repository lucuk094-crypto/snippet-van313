# SnippetVault — Van313 | Official

Perpustakaan snippet kode dengan pencarian, kategori/bahasa, favorit, tambah snippet, salin/unduh/bagikan, tampilan detail, serta terminal **validasi statis**. Dibangun dengan React + Vite, ikon Lucide, dan siap di-build/deploy ke Vercel.

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

## Deploy ke Vercel

1. Push project ke GitHub.
2. Di Vercel, pilih **Add New → Project** lalu import repo.
3. Framework preset: **Vite** (atau biarkan auto-detect). Build command `npm run build`, output directory `dist`.
4. Deploy. Fungsi di `api/` tersedia sebagai Vercel Functions (`/api/health` dan `/api/check`).

Tidak ada API key yang diperlukan untuk demo ini.

## Fitur

- Cari snippet menurut judul, deskripsi, bahasa, tag, atau kategori.
- Filter kategori, sort terbaru/populer, bookmark/favorit.
- Tambah snippet dengan judul, bahasa, tag, source URL, dan kode.
- Detail snippet dengan highlight, copy, download, share URL, dan pemeriksaan di terminal.
- Tema terang/gelap, desain responsif, akses keyboard dasar.
- Data contoh ditulis untuk demo dan tidak di-scrape dari situs pihak ketiga.

## Penyimpanan

Tanpa konfigurasi database, snippet dan favorit baru disimpan di `localStorage` browser. Artinya, data itu hanya terlihat pada browser/perangkat yang menyimpannya. Untuk katalog bersama yang persisten bagi semua pengunjung, hubungkan Supabase/Postgres atau database lain, lalu tambahkan autentikasi dan kebijakan akses sebelum membuka fitur publikasi.

## Terminal & keamanan

Terminal hanya melakukan **preflight statis**: memeriksa apakah kode tersedia, mencoba parse-only untuk JavaScript non-module, mencari placeholder umum, dan memberi peringatan pola berisiko. Snippet **tidak pernah dieksekusi** di browser/server. Status "Lolos preflight" bukan jaminan bahwa kode aktif di runtime atau layanan eksternal.

Jika mengimpor snippet dari internet, cantumkan sumber dan lisensinya. Hindari scraper yang melewati proteksi situs; gunakan API resmi/izin pemilik sumber.
