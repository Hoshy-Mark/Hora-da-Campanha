-- =====================================================================
-- Migration 003 — Rastreador de Iniciativa
-- Rode isto no SQL Editor do Supabase DEPOIS de já ter rodado o
-- schema.sql original e a migration 002. gm_notes e character_secrets
-- já existem desde o schema.sql — esta migration só adiciona a tabela
-- de iniciativa e coloca as três na replicação em tempo real.
-- =====================================================================

create table public.initiative_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null, -- null = entrada avulsa (ex: "Emboscada")
  label text not null,
  initiative int not null default 0,
  is_current boolean not null default false,
  visible_to_player boolean not null default true, -- mesmo mecanismo de revelação gradual do resto do app
  created_at timestamptz not null default now()
);

alter table public.initiative_entries enable row level security;

create policy "initiative_entries_select_visible_or_gm"
  on public.initiative_entries for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "initiative_entries_insert_gm_only"
  on public.initiative_entries for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "initiative_entries_update_gm_only"
  on public.initiative_entries for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "initiative_entries_delete_gm_only"
  on public.initiative_entries for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

alter publication supabase_realtime add table public.initiative_entries;
alter publication supabase_realtime add table public.gm_notes;
alter publication supabase_realtime add table public.character_secrets;
