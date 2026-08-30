-- Categorias nas Notas do Mestre — texto livre com sugestões na UI (Geral,
-- NPC, Local, Facção, Missão), mesmo espírito de character_abilities.category.
-- Notas já existentes ganham 'Geral' por padrão.
alter table public.gm_notes add column category text not null default 'Geral';
