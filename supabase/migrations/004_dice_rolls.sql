-- =====================================================================
-- Migration 004 — Rolador de Dados
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations 002 e 003.
-- =====================================================================

create table public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  label text,
  expression text not null,
  results jsonb not null default '[]'::jsonb,
  total integer not null,
  created_at timestamptz not null default now()
);

alter table public.dice_rolls enable row level security;

-- Log de rolagem é público pra mesa inteira — não existe "rolagem oculta"
-- nesta v1 (diferente de itens/habilidades/tokens, que têm revelação
-- gradual). Qualquer membro rola por si mesmo; ninguém rola em nome de
-- outro usuário.
create policy "dice_rolls_select_members"
  on public.dice_rolls for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "dice_rolls_insert_own"
  on public.dice_rolls for insert
  to authenticated
  with check (public.is_campaign_member(campaign_id) and user_id = auth.uid());

-- Sem update/delete: rolagem é um registro histórico, não se edita depois.

alter publication supabase_realtime add table public.dice_rolls;
