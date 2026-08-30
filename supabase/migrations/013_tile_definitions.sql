-- =====================================================================
-- Migration 013 — Tileset customizável (tiles com imagem própria,
-- reutilizáveis entre campanhas) + estado alternável (porta aberta/
-- fechada etc).
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Um tile customizado é dono do usuário (igual a game_systems e
-- monster_templates) mas a LEITURA é liberada pra qualquer autenticado
-- — diferente do resto desse padrão de dono — porque um mapa pintado
-- pelo Mestre com um tile customizado precisa renderizar certo também
-- pros jogadores da campanha, não só pra quem criou o tile. Só
-- criar/editar/apagar continua sendo exclusivo do dono.
create table public.tile_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  category text not null default 'Meus tiles',
  color text,               -- cor de fallback / usada quando não há imagem
  image_path text,          -- bucket "tiles", opcional
  interactive boolean not null default false,
  alt_color text,           -- cor do estado "alternado" (ex: porta aberta)
  alt_image_path text,      -- imagem do estado "alternado", opcional
  created_at timestamptz not null default now()
);

alter table public.tile_definitions enable row level security;

create policy "tile_definitions_select_any_authenticated"
  on public.tile_definitions for select
  to authenticated
  using (true);

create policy "tile_definitions_insert_owner"
  on public.tile_definitions for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "tile_definitions_update_owner"
  on public.tile_definitions for update
  to authenticated
  using (owner_id = auth.uid());

create policy "tile_definitions_delete_owner"
  on public.tile_definitions for delete
  to authenticated
  using (owner_id = auth.uid());

alter publication supabase_realtime add table public.tile_definitions;

-- Bucket "tiles": leitura pública (a imagem do tile precisa carregar
-- pro navegador de qualquer jogador), upload/remoção só pelo dono —
-- caminho no formato "{owner_id}/{arquivo}".
insert into storage.buckets (id, name, public)
values ('tiles', 'tiles', true)
on conflict (id) do nothing;

create policy "tiles_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'tiles');

create policy "tiles_bucket_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'tiles' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "tiles_bucket_delete_owner"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'tiles' and (storage.foldername(name))[1] = auth.uid()::text);
