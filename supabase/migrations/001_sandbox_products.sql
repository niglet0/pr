-- Migration: sandbox_products
-- Run this in your Supabase SQL Editor (Database → SQL Editor → New query)
--
-- This table stores publicly shareable sandbox project listings.
-- Each seller can publish a product with a zip_url pointing to their project archive.
-- The slug + seller_username pair forms the human-readable URL:
--   https://yourdomain.com/sandbox/@seller/project-slug
--
-- APPLY: paste into Supabase SQL Editor and click Run.

create table if not exists sandbox_products (
  id               uuid        primary key default gen_random_uuid(),
  seller_username  text        not null,
  slug             text        not null,
  title            text,
  description      text,
  zip_url          text        not null,
  listing_url      text,
  price_cents      integer     not null default 0,
  tags             text[]      not null default '{}',
  cover_image_url  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint uq_seller_slug unique (seller_username, slug)
);

-- Keep updated_at current automatically
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sandbox_products_updated_at on sandbox_products;
create trigger trg_sandbox_products_updated_at
  before update on sandbox_products
  for each row execute function set_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table sandbox_products enable row level security;

-- Anyone can read (public marketplace browsing)
drop policy if exists "sandbox_products_public_read" on sandbox_products;
create policy "sandbox_products_public_read"
  on sandbox_products for select
  using (true);

-- Only the seller can insert their own products.
-- Matches seller_username against the username stored in user metadata.
drop policy if exists "sandbox_products_owner_insert" on sandbox_products;
create policy "sandbox_products_owner_insert"
  on sandbox_products for insert
  with check (
    auth.uid() is not null
    and seller_username = (
      auth.jwt() -> 'user_metadata' ->> 'username'
    )
  );

-- Only the seller can update their own products
drop policy if exists "sandbox_products_owner_update" on sandbox_products;
create policy "sandbox_products_owner_update"
  on sandbox_products for update
  using (
    seller_username = (auth.jwt() -> 'user_metadata' ->> 'username')
  );

-- Only the seller can delete
drop policy if exists "sandbox_products_owner_delete" on sandbox_products;
create policy "sandbox_products_owner_delete"
  on sandbox_products for delete
  using (
    seller_username = (auth.jwt() -> 'user_metadata' ->> 'username')
  );

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_sandbox_products_seller
  on sandbox_products (seller_username);

create index if not exists idx_sandbox_products_created_at
  on sandbox_products (created_at desc);

-- ── Sample data (remove before production) ────────────────────────────────
-- insert into sandbox_products (seller_username, slug, title, zip_url, price_cents)
-- values ('demo', 'react-starter', 'React Starter Kit', 'https://example.com/starter.zip', 999);
