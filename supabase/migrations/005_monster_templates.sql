-- =====================================================================
-- Migration 005 — Bestiário (monstros/NPCs reutilizáveis entre campanhas)
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Um "molde" de monstro/NPC, dono é o usuário (não a campanha) — igual
-- a game_systems: você cria uma vez e reaproveita em qualquer campanha
-- que use o mesmo sistema. `abilities` e `items` ficam embutidos como
-- JSON em vez de tabelas próprias — não precisam de sincronização em
-- tempo real nem de RLS granular, são só o "molde" copiado na hora de
-- instanciar o monstro numa campanha (viram character_abilities e
-- inventory_items de verdade nesse momento).
create table public.monster_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  game_system_id uuid not null references public.game_systems(id) on delete cascade,
  name text not null,
  is_boss boolean not null default false,
  sheet_data jsonb not null default '{"fields": {}, "resources": {}}'::jsonb,
  abilities jsonb not null default '[]'::jsonb, -- [{name, category, cost, tier, description}]
  items jsonb not null default '[]'::jsonb,     -- [{name, description, quantity}]
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monster_templates enable row level security;

create policy "monster_templates_owner_all"
  on public.monster_templates for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter publication supabase_realtime add table public.monster_templates;
