-- Raio de visão customizável por token — null = usa o padrão do app
-- (AUTO_VISION_RADIUS, hoje 3 células) em vez de um valor fixo pra todo
-- token de jogador.
alter table public.map_tokens add column vision_radius integer;
