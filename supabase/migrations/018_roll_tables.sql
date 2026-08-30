-- =====================================================================
-- Migration 018 — Tabelas de rolagem aleatória (loot / encontros)
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Mesmo padrão owner-scoped de catalog_entries/monster_templates: o
-- Mestre monta a tabela uma vez (fora de qualquer campanha) e reusa em
-- qualquer mesa. `entries` é um array de { text, weight } — sorteio
-- ponderado feito no cliente.
create table public.roll_tables (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.roll_tables enable row level security;

create policy "roll_tables_owner_all"
  on public.roll_tables for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter publication supabase_realtime add table public.roll_tables;
