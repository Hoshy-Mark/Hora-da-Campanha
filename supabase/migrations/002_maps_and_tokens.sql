-- =====================================================================
-- Migration 002 — Mapa tático (maps + map_tokens)
-- Rode isto no SQL Editor do Supabase DEPOIS de já ter rodado o
-- schema.sql original. Não rode o schema.sql inteiro de novo — as
-- tabelas dele já existem no seu projeto e a criação vai dar erro.
-- =====================================================================

-- =====================================================================
-- MAPS — imagens de mapa por campanha, guardadas no bucket de Storage
-- "maps" (criado mais abaixo). `image_path` é o caminho dentro do bucket,
-- no formato "{campaign_id}/{arquivo}" — as policies de Storage abaixo
-- dependem dessa convenção pra saber quem é o Mestre daquele caminho.
-- =====================================================================
create table public.maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.maps enable row level security;

create policy "maps_select_members"
  on public.maps for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "maps_insert_gm_only"
  on public.maps for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "maps_update_gm_only"
  on public.maps for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "maps_delete_gm_only"
  on public.maps for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

-- Qual mapa a mesa está vendo agora. Fica em campaigns (não em maps)
-- porque é um estado da campanha, não do mapa — e assim já reaproveita
-- a policy de update "campaigns_update_gm_only" que já existe.
alter table public.campaigns add column current_map_id uuid references public.maps(id) on delete set null;

-- =====================================================================
-- MAP_TOKENS — ícones de personagens/NPCs/inimigos posicionados sobre um
-- mapa. Posição em porcentagem (0-100) da imagem, não em pixels — assim
-- funciona independente do tamanho de tela de quem está vendo.
-- =====================================================================
create table public.map_tokens (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null, -- null = token avulso (ex: "Goblin #3")
  label text not null,
  token_type text not null default 'other' check (token_type in ('player', 'npc', 'enemy', 'other')),
  color text,
  pos_x numeric not null default 50,
  pos_y numeric not null default 50,
  visible_to_player boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.map_tokens enable row level security;

create policy "map_tokens_select_visible_or_gm"
  on public.map_tokens for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "map_tokens_insert_gm_only"
  on public.map_tokens for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

-- Mover um token: o Mestre move qualquer um; um jogador só move o token
-- do próprio personagem (arrastar no mapa durante a cena).
create policy "map_tokens_update_gm_or_owner"
  on public.map_tokens for update
  to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    or exists (
      select 1 from public.characters c
      where c.id = map_tokens.character_id and c.owner_id = auth.uid()
    )
  );

create policy "map_tokens_delete_gm_only"
  on public.map_tokens for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

-- =====================================================================
-- STORAGE — bucket público "maps" para as imagens. Público só para
-- LEITURA (qualquer um com a URL vê a imagem, sem exigir sessão) — o
-- controle de quem sabe que aquele mapa existe continua sendo feito
-- pela tabela `maps` acima. Upload e remoção exigem ser Mestre da
-- campanha cujo id é o primeiro segmento do caminho do arquivo.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('maps', 'maps', true)
on conflict (id) do nothing;

create policy "maps_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'maps');

create policy "maps_bucket_insert_gm"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'maps' and public.is_campaign_gm((storage.foldername(name))[1]::uuid));

create policy "maps_bucket_delete_gm"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'maps' and public.is_campaign_gm((storage.foldername(name))[1]::uuid));

-- =====================================================================
-- REALTIME — inclui as tabelas novas na replicação ao vivo
-- =====================================================================
alter publication supabase_realtime add table public.campaigns;
alter publication supabase_realtime add table public.maps;
alter publication supabase_realtime add table public.map_tokens;
