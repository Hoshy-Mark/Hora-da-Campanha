-- =====================================================================
-- Migration 009 — Avatar de imagem em token de mapa
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Sem bucket novo nem policy nova: reaproveita o bucket "maps" que já
-- existe (upload/remoção já são GM-only lá, o mesmo dono de tokens) —
-- os avatares ficam em "{campaign_id}/tokens/{arquivo}", mesma
-- convenção de path que já autoriza o Mestre daquela campanha.
alter table public.map_tokens add column image_path text;
