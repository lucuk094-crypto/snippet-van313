-- SnippetVault Endpoint Catalog (Supabase/Postgres)
-- Paste into Supabase SQL Editor. This creates schema + empty endpoint catalog.
-- Only categories are seeded; endpoint records start empty by design.

create extension if not exists pgcrypto;

create table if not exists public.endpoint_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text not null default 'Folder',
  parent_id uuid references public.endpoint_categories(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint endpoint_categories_name_unique unique (name, parent_id)
);

create table if not exists public.endpoint_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_endpoint_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.endpoint_admins a where a.user_id = auth.uid()
  );
$$;

-- The function only returns whether auth.uid() is an enrolled admin. Anon calls
-- return false; granting execution allows public RLS policies to evaluate safely.
grant execute on function public.is_endpoint_admin() to anon, authenticated;

create table if not exists public.api_endpoints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  method text not null default 'GET' check (method in ('GET','POST','PUT','DELETE')),
  path text not null check (left(path, 1) = '/'),
  category_id uuid references public.endpoint_categories(id) on delete restrict,
  subfolder text not null default '',
  description text not null default '',
  output_type text not null default 'json' check (output_type in ('json','text','image','binary-png','video','mp4','audio','mp3')),
  example_url text not null default '',
  params jsonb not null default '[]'::jsonb check (jsonb_typeof(params) = 'array'),
  requires_api_key boolean not null default false,
  key_param_name text not null default 'key',
  key_description text not null default '',
  sample_response jsonb,
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_endpoints_category_idx on public.api_endpoints(category_id, sort_order, name);
create index if not exists api_endpoints_public_idx on public.api_endpoints(is_public, is_active);
create index if not exists api_endpoints_slug_idx on public.api_endpoints(slug);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists api_endpoints_touch_updated_at on public.api_endpoints;
create trigger api_endpoints_touch_updated_at
before update on public.api_endpoints
for each row execute procedure public.touch_updated_at();

alter table public.endpoint_categories enable row level security;
alter table public.endpoint_admins enable row level security;
alter table public.api_endpoints enable row level security;

grant select on public.endpoint_categories to anon, authenticated;
grant insert, update, delete on public.endpoint_categories to authenticated;
grant select on public.endpoint_admins to authenticated;
grant select on public.api_endpoints to anon, authenticated;
grant insert, update, delete on public.api_endpoints to authenticated;

-- Public catalog reads only active categories/endpoints. Admins can manage everything.
drop policy if exists "public can read active endpoint categories" on public.endpoint_categories;
create policy "public can read active endpoint categories"
on public.endpoint_categories for select to anon, authenticated
using (is_active or public.is_endpoint_admin());

drop policy if exists "admins manage endpoint categories" on public.endpoint_categories;
create policy "admins manage endpoint categories"
on public.endpoint_categories for all to authenticated
using (public.is_endpoint_admin()) with check (public.is_endpoint_admin());

drop policy if exists "admins can read own admin record" on public.endpoint_admins;
create policy "admins can read own admin record"
on public.endpoint_admins for select to authenticated
using (user_id = auth.uid());

drop policy if exists "public can read active public endpoints" on public.api_endpoints;
create policy "public can read active public endpoints"
on public.api_endpoints for select to anon, authenticated
using ((is_public and is_active) or public.is_endpoint_admin());

drop policy if exists "admins manage endpoints" on public.api_endpoints;
create policy "admins manage endpoints"
on public.api_endpoints for all to authenticated
using (public.is_endpoint_admin()) with check (public.is_endpoint_admin());

-- Empty endpoint catalog categories (no sample/API records are inserted).
insert into public.endpoint_categories (name, slug, icon, sort_order)
values
  ('AI', 'ai', 'Bot', 10),
  ('Tools', 'tools', 'Wrench', 20),
  ('Downloader', 'downloader', 'Download', 30),
  ('Anime', 'anime', 'Film', 40),
  ('Canvas', 'canvas', 'Palette', 50),
  ('Random', 'random', 'Shuffle', 60),
  ('Search', 'search', 'Search', 70),
  ('SMM', 'smm', 'Activity', 80),
  ('Berita', 'berita', 'Newspaper', 90),
  ('Info', 'info', 'Info', 100),
  ('Islami', 'islami', 'Moon', 110),
  ('Uploader', 'uploader', 'Upload', 120),
  ('Music', 'music', 'Music2', 130),
  ('AIO', 'aio', 'Layers', 140)
on conflict (slug) do nothing;

-- Useful empty subfolders for common API types; these are category rows only.
insert into public.endpoint_categories (name, slug, icon, parent_id, sort_order)
select 'Otakudesu', 'otakudesu', 'Film', id, 45
from public.endpoint_categories where slug = 'anime'
on conflict (slug) do nothing;

insert into public.endpoint_categories (name, slug, icon, parent_id, sort_order)
select 'Claude AI', 'claude-ai', 'Bot', id, 15
from public.endpoint_categories where slug = 'ai'
on conflict (slug) do nothing;

-- Admin setup after creating your auth account:
-- 1. Supabase Dashboard > Authentication > Users > create/invite your admin user.
-- 2. Copy that user's UUID and run, replacing the example UUID:
--    insert into public.endpoint_admins (user_id) values ('00000000-0000-0000-0000-000000000000');
