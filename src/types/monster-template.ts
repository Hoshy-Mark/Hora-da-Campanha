// Formato dos JSONs embutidos em monster_templates.abilities/items.
// Espelham as colunas de character_abilities/inventory_items, sem os
// campos que só fazem sentido depois de instanciado (id, character_id,
// visible_to_player — sempre nasce oculto quando vira personagem de
// verdade numa campanha).

import { z } from 'zod';

export interface TemplateAbility {
  name: string;
  category?: string;
  cost?: string;
  tier?: string;
  description?: string;
}

export interface TemplateItem {
  name: string;
  description?: string;
  quantity?: number;
}

// Formato de backup/importação de moldes do Bestiário — mesma ideia do
// Catálogo (JSON validado com zod, sistema escolhido à parte na UI, não
// dentro do próprio JSON). sheet_data não é validado contra o schema do
// sistema aqui: é aceito em formato solto e só faz sentido de fato se
// corresponder ao sistema escolhido no import.
const templateAbilitySchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  cost: z.string().optional(),
  tier: z.string().optional(),
  description: z.string().optional(),
});

const templateItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  quantity: z.number().optional(),
});

// Espelha ResourceValue de types/game-system.ts: recurso "bar" guarda
// `atual`/`max` (em português, igual ao resto do app — não "current"),
// recurso "text" guarda `texto`. Aceita as três chaves como opcionais
// porque o formato de fato usado depende do tipo do recurso no schema
// do sistema escolhido no import, que este arquivo não enxerga.
const sheetDataSchema = z.object({
  fields: z.record(z.string(), z.union([z.number(), z.string()])),
  resources: z.record(
    z.string(),
    z.object({ atual: z.number().optional(), max: z.number().optional(), texto: z.string().optional() })
  ),
});

export const templateEntrySchema = z.object({
  name: z.string().min(1),
  isBoss: z.boolean().optional(),
  sheetData: sheetDataSchema,
  abilities: z.array(templateAbilitySchema).optional(),
  items: z.array(templateItemSchema).optional(),
  notes: z.string().optional(),
});

export type TemplateEntryInput = z.infer<typeof templateEntrySchema>;

const templateImportSchema = z.array(templateEntrySchema).min(1);

export interface TemplateParseResult {
  ok: boolean;
  entries?: TemplateEntryInput[];
  error?: string;
}

export function parseTemplateJson(raw: string): TemplateParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }

  const result = templateImportSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join('.') || '(raiz)';
    return { ok: false, error: `Molde inválido em "${path}": ${first.message}` };
  }

  return { ok: true, entries: result.data };
}
