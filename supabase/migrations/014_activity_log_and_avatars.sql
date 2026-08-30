-- =====================================================================
-- Migration 014 — Log de atividade da mesa + avatar de personagem
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Feed cronológico de eventos da campanha (revelações, trocas de turno,
-- personagem que entrou na mesa...) — complementa o log de dados que já
-- existe (dice_rolls), sem misturar os dois na mesma tabela. Mensagem
-- já vem pronta de quem dispara o evento (o app decide o texto), sem
-- estrutura própria por tipo — mantém a escrita trivial.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

create policy "activity_log_select_members"
  on public.activity_log for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "activity_log_insert_members"
  on public.activity_log for insert
  to authenticated
  with check (public.is_campaign_member(campaign_id));

alter publication supabase_realtime add table public.activity_log;

-- Avatar opcional de personagem, mesma convenção de path do avatar de
-- token (bucket "maps" já existente, pasta "{campaign_id}/characters/").
alter table public.characters add column avatar_path text;
