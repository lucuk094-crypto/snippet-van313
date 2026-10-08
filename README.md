# SnippetVault — Van313 | Official

SnippetVault menggabungkan perpustakaan kode yang sudah ada dengan **Endpoint Portal** responsif: katalog berdasarkan kategori, pencarian, detail endpoint, form parameter dinamis, playground/output preview, serta code generator JavaScript, Python, PHP, dan cURL. Data endpoint dan kategori tersimpan di Supabase; katalog endpoint sengaja dimulai tanpa endpoint contoh. Admin mengelolanya melalui Supabase Auth dan dashboard terlindungi di `/admin`.

## Jalankan lokal

```bash
npm install
cp .env.example .env.local
# Isi URL dan anon key project Supabase di .env.local
npm run dev
```

Gunakan `npm run build` untuk pemeriksaan produksi. `npm run preview` menyajikan build lokal. Supabase Functions/playground proxy berjalan penuh setelah deploy ke Vercel; pada Vite lokal proxy API belum berjalan dan playground hanya dapat mencoba fallback browser yang bergantung pada CORS endpoint.

## Supabase: database dan admin pertama

1. Buat project Supabase.
2. Buka **SQL Editor** dan jalankan seluruh `supabase/schema.sql`. Ini membuat `endpoint_categories`, `endpoint_admins`, `api_endpoints`, trigger `updated_at`, indeks, dan RLS. Hanya kategori dasar yang di-seed; **tidak ada record endpoint/API contoh**.
3. Schema menambahkan folder dasar (termasuk AI/Claude AI, Anime/Otakudesu, AIO, Music) tanpa endpoint/API contoh. Di **Authentication → Users**, buat/invite akun admin dan salin UUID user tersebut.
4. Di SQL Editor, daftarkan UUID itu:

   ```sql
   insert into public.endpoint_admins (user_id)
   values ('UUID_USER_ADMIN');
   ```

5. Isi environment variables lokal dan Vercel seperti contoh di `.env.example`.
6. Masuk di `https://domain-anda/admin`. Buat/edit/hapus kategori dan endpoint dari dashboard.

Dashboard tidak menyediakan registrasi publik. Supabase Auth memvalidasi sesi; policy RLS hanya mengizinkan user yang ada di `endpoint_admins` melakukan perubahan. **Jangan** masukkan service-role key ke browser atau repository. Client menggunakan anon key dan RLS.

### Field endpoint

Form admin mencakup nama, slug, method (GET/POST/PUT/DELETE), kategori/folder dan parent folder, subfolder, path, description, output type, example URL HTTPS, definisi parameter (nama, tipe, wajib, deskripsi, default), kebutuhan API key/nama/deskripsi, sample response opsional, sort order, serta status public/active. Katalog publik hanya membaca endpoint yang `is_public` dan `is_active`.

API key provider hanya dimasukkan pemakai ketika menjalankan playground dan tidak disimpan di record endpoint. `key_param_name` dan `key_description` hanyalah metadata petunjuk input.

## Deploy ke Vercel

1. Push project ke GitHub dan import repository di Vercel.
2. Pilih preset **Vite**, build command `npm run build`, output directory `dist`.
3. Tambahkan environment variables berikut untuk Preview dan Production:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Jalankan deploy. `vercel.json` mengarahkan `/api-doc` dan `/admin` ke aplikasi SPA; file di `api/` berjalan sebagai Vercel Functions.
5. Jalankan SQL schema dan daftarkan admin sebelum menguji katalog/playground.

## Endpoint publik

- `GET /api/v1/endpoints?q=anime&category=anime&method=GET&limit=50&offset=0` — katalog dan kategori aktif.
- `GET /api/v1/endpoints/:slug` — detail endpoint publik.
- `POST /api/execute` — proxy playground. Terima multipart form dengan `endpointId`, object JSON `params`, dan file parameter opsional.
- Endpoint lama `/api/v1/snippets` dan `/api/check` tetap dipertahankan untuk snippet library/preflight.

Proxy playground hanya mengambil endpoint aktif dan publik dari Supabase; ia menolak URL non-HTTPS, jaringan privat, port non-443, redirect, dan respons lebih dari 6 MB. Batas upload 5 MB, timeout 20 detik, maksimal 20 eksekusi per menit per IP (rate-limit in-memory pada instance Vercel). Ini bukan kuota/tagihan per-user. Jangan daftarkan endpoint pihak ketiga tanpa hak untuk menggunakannya.

## Snippet library & terminal

- Pencarian, kategori/bahasa, favorit, snippet lokal, halaman detail, salin/unduh, dan tema terang/gelap.
- Terminal menyediakan `help`, `list`, `check <id|all>`, `search`, `status`, dan `clear`. Perintah `run` sengaja dinonaktifkan.
- Preflight hanya pemeriksaan statis/parse terbatas; kode snippet tidak dieksekusi dan hasilnya bukan jaminan runtime.
- Migrasi baca lokal membuang item lama berlabel `API`/`apiPreview` dari `localStorage` yang tersimpan. Snippet non-API tetap dipertahankan.

## Catatan keamanan

- Simpan data admin melalui Supabase Auth + RLS; jangan mematikan RLS atau menaruh service-role key di frontend.
- Hindari API key di URL, sample response, kode yang dicopy, dan screenshot. Gunakan key sementara di playground.
- Browser preview memerlukan CORS yang sesuai jika fungsi Vercel belum tersedia.
- Data provider/endpoint dari internet perlu sumber, izin, dan lisensi yang jelas; jangan bypass proteksi anti-bot tanpa izin.
