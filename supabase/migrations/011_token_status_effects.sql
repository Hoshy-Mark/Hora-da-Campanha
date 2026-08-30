-- =====================================================================
-- Migration 011 — Marcadores de condição em token de mapa
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Lista de strings livres (ex: "Envenenado", "Atordoado", ou qualquer
-- texto customizado) — sem tabela nova nem policy nova, as policies de
-- update de map_tokens que já existem cobrem qualquer coluna da linha.
alter table public.map_tokens add column status_effects jsonb not null default '[]'::jsonb;
