import { supabase } from './supabase';
import type { CampaignSnapshot } from '../types/campaign-backup';
import type { GameSystemSchema } from '../types/game-system';

// Monta o mesmo formato de snapshot usado tanto por "Baixar backup (JSON)"
// (CampaignRoom) quanto por "Clonar campanha" (Dashboard) — os dois
// precisam exatamente da mesma fatia de dados, só um baixa como arquivo e
// o outro alimenta `restoreCampaignFromSnapshot` direto, sem passar por
// JSON. Quem chama precisa ser o Mestre da campanha (RLS de gm_notes/
// character_secrets só libera pra ele mesmo).
export async function buildCampaignSnapshot(campaignId: string): Promise<CampaignSnapshot> {
  const [
    { data: campaignRow },
    { data: charactersData },
    { data: abilitiesData },
    { data: itemsData },
    { data: secretsData },
    { data: mapsData },
    { data: notesData },
    { data: handoutsData },
  ] = await Promise.all([
    supabase.from('campaigns').select('name, game_systems(name, schema)').eq('id', campaignId).single(),
    supabase.from('characters').select('id, name, is_npc, sheet_data').eq('campaign_id', campaignId),
    supabase
      .from('character_abilities')
      .select('character_id, name, category, cost, tier, description')
      .eq('campaign_id', campaignId),
    supabase.from('inventory_items').select('character_id, name, description, quantity').eq('campaign_id', campaignId),
    supabase.from('character_secrets').select('character_id, title, content').eq('campaign_id', campaignId),
    supabase.from('maps').select('name, kind, tile_data').eq('campaign_id', campaignId),
    supabase.from('gm_notes').select('title, content, category').eq('campaign_id', campaignId),
    supabase.from('handouts').select('title, content').eq('campaign_id', campaignId),
  ]);

  type Linked<T> = T & { character_id: string | null };
  const abilities = (abilitiesData ?? []) as unknown as Linked<{
    name: string;
    category: string | null;
    cost: string | null;
    tier: string | null;
    description: string | null;
  }>[];
  const items = (itemsData ?? []) as unknown as Linked<{
    name: string;
    description: string | null;
    quantity: number;
  }>[];
  const secrets = (secretsData ?? []) as unknown as Linked<{ title: string; content: string }>[];
  const characters = (charactersData ?? []) as unknown as {
    id: string;
    name: string;
    is_npc: boolean;
    sheet_data: CampaignSnapshot['characters'][number]['sheetData'];
  }[];
  const campaign = campaignRow as unknown as {
    name: string;
    game_systems: { name: string; schema: GameSystemSchema } | null;
  };

  return {
    name: campaign.name,
    exportedAt: new Date().toISOString(),
    gameSystem: campaign.game_systems
      ? { name: campaign.game_systems.name, schema: campaign.game_systems.schema }
      : null,
    characters: characters.map((c) => ({
      name: c.name,
      isNpc: c.is_npc,
      sheetData: c.sheet_data,
      abilities: abilities.filter((a) => a.character_id === c.id),
      items: items.filter((it) => it.character_id === c.id),
      secrets: secrets.filter((s) => s.character_id === c.id),
    })),
    maps: ((mapsData ?? []) as unknown as { name: string; kind: 'image' | 'tilemap'; tile_data: unknown }[]).map(
      (m) => ({
        name: m.name,
        kind: m.kind,
        tileData: m.kind === 'tilemap' ? (m.tile_data as CampaignSnapshot['maps'][number]['tileData']) : undefined,
      })
    ),
    gmNotes: (notesData ?? []) as CampaignSnapshot['gmNotes'],
    handouts: (handoutsData ?? []) as CampaignSnapshot['handouts'],
  };
}
