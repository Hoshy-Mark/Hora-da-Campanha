-- =====================================================================
-- Migration 012 — Combate: status effects, derrotado
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Mesma ideia de status_effects que já existe em map_tokens (lista de
-- strings livres), só que por combatente na iniciativa — não são
-- sincronizados automaticamente com o token do mapa, são dois lugares
-- independentes de acompanhar condição (um pensado pra durante o
-- combate, outro pra exploração no mapa).
alter table public.initiative_entries add column status_effects jsonb not null default '[]'::jsonb;

-- Marca um combatente como fora da luta sem precisar apagar da lista
-- (perderia a posição/iniciativa). "Próximo turno" pula quem está
-- derrotado.
alter table public.initiative_entries add column is_defeated boolean not null default false;
