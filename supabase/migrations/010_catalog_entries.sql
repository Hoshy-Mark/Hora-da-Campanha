-- =====================================================================
-- Migration 010 — Catálogo de itens/habilidades reutilizáveis
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Um "molde" de item ou habilidade, dono é o usuário (igual a
-- game_systems e monster_templates): importa uma vez por JSON, reusa
-- em qualquer personagem de campanhas que usem o mesmo sistema. Uma
-- linha por entrada (não um documento grande) pra dar pra filtrar/listar
-- fácil num seletor.
create table public.catalog_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  game_system_id uuid not null references public.game_systems(id) on delete cascade,
  kind text not null check (kind in ('item', 'ability')),
  name text not null,
  category text,          -- usado por ability
  cost text,               -- usado por ability
  tier text,                -- usado por ability
  description text,
  default_quantity int,   -- usado por item
  created_at timestamptz not null default now()
);

alter table public.catalog_entries enable row level security;

create policy "catalog_entries_owner_all"
  on public.catalog_entries for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter publication supabase_realtime add table public.catalog_entries;
