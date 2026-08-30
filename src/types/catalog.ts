// Catálogo reutilizável de itens/habilidades "padrão" de um sistema —
// mesma ideia do Bestiário, mas pra equipamento/magias em vez de
// monstros: importa uma vez por JSON (igual a Sistemas), depois escolhe
// da lista ao criar um item/habilidade num personagem, em vez de
// digitar tudo de novo toda vez.

import { z } from 'zod';

export const CATALOG_KINDS = ['item', 'ability'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const catalogEntrySchema = z.object({
  kind: z.enum(CATALOG_KINDS),
  name: z.string().min(1),
  category: z.string().optional(), // usado por ability
  cost: z.string().optional(), // usado por ability
  tier: z.string().optional(), // usado por ability
  description: z.string().optional(),
  defaultQuantity: z.number().optional(), // usado por item
});

export type CatalogEntryInput = z.infer<typeof catalogEntrySchema>;

const catalogImportSchema = z.array(catalogEntrySchema).min(1);

export interface CatalogParseResult {
  ok: boolean;
  entries?: CatalogEntryInput[];
  error?: string;
}

export function parseCatalogJson(raw: string): CatalogParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }

  const result = catalogImportSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join('.') || '(raiz)';
    return { ok: false, error: `Entrada inválida em "${path}": ${first.message}` };
  }

  return { ok: true, entries: result.data };
}
