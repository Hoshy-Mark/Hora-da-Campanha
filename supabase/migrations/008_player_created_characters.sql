-- =====================================================================
-- Migration 008 — Jogador cria/apaga a própria ficha
-- Rode isto no SQL Editor do Supabase DEPOIS das migrations anteriores.
-- =====================================================================

-- Até aqui só o Mestre podia inserir/apagar linhas em `characters`. Agora
-- um jogador também pode criar uma ficha pra si mesmo (owner_id = seu
-- próprio id, is_npc = false) dentro de uma campanha em que já é membro,
-- e apagar essa mesma ficha depois. O Mestre continua podendo tudo,
-- incluindo criar/apagar NPCs e fichas de qualquer jogador.
drop policy "characters_insert_gm_only" on public.characters;
drop policy "characters_delete_gm_only" on public.characters;

create policy "characters_insert_gm_or_self"
  on public.characters for insert
  to authenticated
  with check (
    public.is_campaign_gm(campaign_id)
    or (owner_id = auth.uid() and is_npc = false and public.is_campaign_member(campaign_id))
  );

create policy "characters_delete_gm_or_self"
  on public.characters for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id) or owner_id = auth.uid());
