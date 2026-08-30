-- =====================================================================
-- Migration 006 — Mapas de tiles (alternativa a upload de imagem)
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- `kind` distingue os dois jeitos de ter um mapa: 'image' (o que já
-- existia, upload de PNG/JPEG pro Storage) ou 'tilemap' (grid montado
-- na própria tela, sem precisar de arquivo nenhum). `image_path` só é
-- obrigatório pro primeiro; `tile_data` só pro segundo — o check abaixo
-- garante que a linha sempre tem o campo certo pro seu tipo.
alter table public.maps add column kind text not null default 'image';
alter table public.maps alter column image_path drop not null;
alter table public.maps add column tile_data jsonb;

alter table public.maps add constraint maps_kind_check check (kind in ('image', 'tilemap'));
alter table public.maps add constraint maps_kind_data_check check (
  (kind = 'image' and image_path is not null)
  or (kind = 'tilemap' and tile_data is not null)
);
