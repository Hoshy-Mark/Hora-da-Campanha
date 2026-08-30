-- =====================================================================
-- Migration 007 — Handouts (imagens/textos que o Mestre revela pros
-- jogadores no momento certo: cartas, retratos de NPC, pistas, mapas de
-- tesouro). Rode isto no SQL Editor do Supabase DEPOIS das migrations
-- anteriores.
-- =====================================================================

create table public.handouts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  content text,       -- texto livre, opcional
  image_path text,    -- caminho no bucket "handouts", opcional
  visible_to_player boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.handouts enable row level security;

create policy "handouts_select_visible_or_gm"
  on public.handouts for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "handouts_insert_gm_only"
  on public.handouts for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "handouts_update_gm_only"
  on public.handouts for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "handouts_delete_gm_only"
  on public.handouts for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

alter publication supabase_realtime add table public.handouts;

-- Bucket próprio pras imagens de handout, mesmo esquema de permissão do
-- bucket "maps": leitura pública (não exige sessão pra ver a URL), mas
-- upload/remoção exigem ser Mestre da campanha (primeiro segmento do
-- caminho do arquivo).
insert into storage.buckets (id, name, public)
values ('handouts', 'handouts', true)
on conflict (id) do nothing;

create policy "handouts_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'handouts');

create policy "handouts_bucket_insert_gm"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'handouts' and public.is_campaign_gm((storage.foldername(name))[1]::uuid));

create policy "handouts_bucket_delete_gm"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'handouts' and public.is_campaign_gm((storage.foldername(name))[1]::uuid));
