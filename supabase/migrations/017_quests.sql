-- =====================================================================
-- QUESTS — rastreador de missões/objetivos do Mestre. Mesmo mecanismo de
-- revelação gradual de handouts/habilidades: Mestre cria oculta, revela
-- quando quiser; jogador só vê o que foi revelado.
-- =====================================================================
create table public.quests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'completed', 'failed')),
  visible_to_player boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quests enable row level security;

create policy "quests_select_visible_or_gm"
  on public.quests for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "quests_insert_gm_only"
  on public.quests for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "quests_update_gm_only"
  on public.quests for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "quests_delete_gm_only"
  on public.quests for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

alter publication supabase_realtime add table public.quests;
