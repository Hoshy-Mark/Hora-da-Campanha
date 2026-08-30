// Formato do backup de campanha gerado por CampaignRoom (handleExportBackup)
// e consumido tanto por "Importar campanha (JSON)" quanto por "Clonar
// campanha" no Dashboard — os dois alimentam o mesmo
// `restoreCampaignFromSnapshot` (src/lib/campaignRestore.ts), só mudam de
// onde o snapshot vem (arquivo colado vs. dados ao vivo de uma campanha
// que o usuário já é Mestre).
//
// É uma restauração PARCIAL por natureza: o backup nunca incluiu bytes de
// imagem (mapas de imagem, handouts com imagem), então esses ficam de
// fora — só o que é dado estruturado (fichas, mapas de tiles, texto) é
// restaurado de verdade. Ver warnings retornados por
// `restoreCampaignFromSnapshot` pra saber o que ficou de fora.

import { z } from 'zod';
import { gameSystemSchemaSchema } from './game-system';

const backupAbilitySchema = z.object({
  name: z.string(),
  category: z.string().nullable().optional(),
  cost: z.string().nullable().optional(),
  tier: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const backupItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  quantity: z.number().optional(),
});

const backupSecretSchema = z.object({
  title: z.string(),
  content: z.string(),
});

const backupCharacterSchema = z.object({
  name: z.string(),
  isNpc: z.boolean(),
  sheetData: z.object({
    fields: z.record(z.string(), z.union([z.number(), z.string()])),
    resources: z.record(
      z.string(),
      z.object({ atual: z.number().optional(), max: z.number().optional(), texto: z.string().optional() })
    ),
  }),
  abilities: z.array(backupAbilitySchema).default([]),
  items: z.array(backupItemSchema).default([]),
  secrets: z.array(backupSecretSchema).default([]),
});

const backupMapSchema = z.object({
  name: z.string(),
  kind: z.enum(['image', 'tilemap']),
  tileData: z
    .object({
      cols: z.number(),
      rows: z.number(),
      tiles: z.array(z.string()),
      fog: z.array(z.boolean()).optional(),
      tileStates: z.array(z.boolean()).optional(),
    })
    .optional(),
});

const backupNoteSchema = z.object({
  title: z.string(),
  content: z.string().nullable().optional(),
  category: z.string().optional(),
});

const backupHandoutSchema = z.object({
  title: z.string(),
  content: z.string().nullable().optional(),
});

export const campaignBackupSchema = z.object({
  name: z.string().min(1),
  exportedAt: z.string().optional(),
  gameSystem: z.object({ name: z.string(), schema: gameSystemSchemaSchema }).nullable(),
  characters: z.array(backupCharacterSchema).default([]),
  maps: z.array(backupMapSchema).default([]),
  gmNotes: z.array(backupNoteSchema).default([]),
  handouts: z.array(backupHandoutSchema).default([]),
});

export type CampaignSnapshot = z.infer<typeof campaignBackupSchema>;

export interface CampaignBackupParseResult {
  ok: boolean;
  snapshot?: CampaignSnapshot;
  error?: string;
}

export function parseCampaignBackupJson(raw: string): CampaignBackupParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }

  const result = campaignBackupSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join('.') || '(raiz)';
    return { ok: false, error: `Backup inválido em "${path}": ${first.message}` };
  }

  return { ok: true, snapshot: result.data };
}
