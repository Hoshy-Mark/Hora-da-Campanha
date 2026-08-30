import { supabase } from './supabase';
import type { CampaignSnapshot } from '../types/campaign-backup';

export interface RestoreResult {
  campaignId: string;
  warnings: string[];
}

// Recria uma campanha nova a partir de um snapshot (vindo de um backup
// JSON colado, ou ao vivo de uma campanha que o usuário já é Mestre, via
// buildCampaignSnapshot). É uma restauração PARCIAL por natureza: mapas de
// imagem e imagens de handout não fazem parte do snapshot (nunca fizeram,
// nem no export), então ficam de fora — o resto (sistema, personagens,
// habilidades/itens/segredos, mapas de tiles, notas, handouts em texto)
// é restaurado de verdade.
//
// Segue o mesmo padrão "melhor esforço" já usado em
// handleInstantiateTemplate (CampaignRoom): cada insert que falha vira um
// aviso na lista de warnings em vez de abortar tudo — não há transação
// client-side de verdade aqui, então uma falha no meio deixa uma campanha
// PARCIALMENTE restaurada (mas já criada e utilizável) em vez de nenhuma.
// Todo personagem restaurado nasce sem dono (NPC) — o Mestre atribui a um
// jogador depois, na própria campanha.
export async function restoreCampaignFromSnapshot(snapshot: CampaignSnapshot): Promise<RestoreResult> {
  if (!snapshot.gameSystem) {
    throw new Error('Este backup não tem um sistema de jogo — não dá pra restaurar sem um.');
  }

  const warnings: string[] = [];

  const { data: system, error: systemError } = await supabase.rpc('create_game_system', {
    p_name: `${snapshot.gameSystem.name} (restaurado)`,
    p_schema: snapshot.gameSystem.schema,
  });
  if (systemError || !system) throw new Error(systemError?.message ?? 'Erro ao recriar o sistema de jogo.');

  const { data: campaign, error: campaignError } = await supabase.rpc('create_campaign', {
    p_name: snapshot.name,
    p_game_system_id: system.id,
  });
  if (campaignError || !campaign) throw new Error(campaignError?.message ?? 'Erro ao criar a campanha.');

  const campaignId = campaign.id as string;

  for (const c of snapshot.characters) {
    const { data: character, error } = await supabase
      .from('characters')
      .insert({ campaign_id: campaignId, owner_id: null, name: c.name, sheet_data: c.sheetData, is_npc: true })
      .select('id')
      .single();

    if (error || !character) {
      warnings.push(`Personagem "${c.name}" não pôde ser restaurado (${error?.message ?? 'erro desconhecido'}).`);
      continue;
    }

    if (c.abilities.length > 0) {
      const { error: abilitiesError } = await supabase.from('character_abilities').insert(
        c.abilities.map((a) => ({
          character_id: character.id,
          campaign_id: campaignId,
          name: a.name,
          category: a.category ?? null,
          cost: a.cost ?? null,
          tier: a.tier ?? null,
          description: a.description ?? null,
          visible_to_player: false,
        }))
      );
      if (abilitiesError) warnings.push(`Habilidades de "${c.name}" não foram restauradas (${abilitiesError.message}).`);
    }

    if (c.items.length > 0) {
      const { error: itemsError } = await supabase.from('inventory_items').insert(
        c.items.map((it) => ({
          character_id: character.id,
          campaign_id: campaignId,
          name: it.name,
          description: it.description ?? null,
          quantity: it.quantity ?? 1,
          visible_to_player: false,
        }))
      );
      if (itemsError) warnings.push(`Itens de "${c.name}" não foram restaurados (${itemsError.message}).`);
    }

    if (c.secrets.length > 0) {
      const { error: secretsError } = await supabase.from('character_secrets').insert(
        c.secrets.map((s) => ({ character_id: character.id, campaign_id: campaignId, title: s.title, content: s.content }))
      );
      if (secretsError) warnings.push(`Segredos de "${c.name}" não foram restaurados (${secretsError.message}).`);
    }
  }

  if (snapshot.gmNotes.length > 0) {
    const { error } = await supabase.from('gm_notes').insert(
      snapshot.gmNotes.map((n) => ({
        campaign_id: campaignId,
        title: n.title,
        content: n.content ?? null,
        category: n.category ?? 'Geral',
      }))
    );
    if (error) warnings.push(`Notas do Mestre não foram restauradas (${error.message}).`);
  }

  if (snapshot.handouts.length > 0) {
    const { error } = await supabase.from('handouts').insert(
      snapshot.handouts.map((h) => ({
        campaign_id: campaignId,
        title: h.title,
        content: h.content ?? null,
        visible_to_player: false,
      }))
    );
    if (error) warnings.push(`Handouts não foram restaurados (${error.message}).`);
  }

  const tilemapMaps = snapshot.maps.filter((m) => m.kind === 'tilemap' && m.tileData);
  if (tilemapMaps.length > 0) {
    const { error } = await supabase.from('maps').insert(
      tilemapMaps.map((m) => ({ campaign_id: campaignId, name: m.name, kind: 'tilemap' as const, tile_data: m.tileData }))
    );
    if (error) warnings.push(`Mapas de tiles não foram restaurados (${error.message}).`);
  }

  const skippedImageMaps = snapshot.maps.length - tilemapMaps.length;
  if (skippedImageMaps > 0) {
    warnings.push(
      `${skippedImageMaps} mapa(s) de imagem não foram restaurados (a imagem não faz parte do backup) — suba de novo manualmente.`
    );
  }

  return { campaignId, warnings };
}
