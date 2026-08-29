// Formato genérico de um "sistema de jogo" (D&D, Blade Strands, o que for).
// Isto é a fonte da verdade do schema — supabase/schema.sql só descreve
// isso em comentário. Qualquer mudança de forma precisa ser refletida
// nos dois lugares.
//
// v1 é deliberadamente só "forma da ficha": seções de campos e recursos.
// Sem fórmulas derivadas ainda (ver decisão registrada no README) — um
// campo como "Capacidade de Spirit" em Blade Strands vira, por enquanto,
// um campo numérico comum que o grupo preenche à mão.

import { z } from 'zod';

export const FIELD_TYPES = ['number', 'text', 'longtext', 'select'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldDefSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    min: z.number().optional(),
    max: z.number().optional(),
    options: z.array(z.string()).optional(), // usado quando type === 'select'
    defaultValue: z.union([z.number(), z.string()]).optional(),
    helpText: z.string().optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options && f.options.length > 0), {
    message: 'Campos do tipo "select" precisam de ao menos uma opção em `options`.',
  });

export type FieldDef = z.infer<typeof fieldDefSchema>;

export const fieldSectionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(fieldDefSchema).min(1),
});

export type FieldSection = z.infer<typeof fieldSectionSchema>;

export const RESOURCE_TYPES = ['bar', 'text'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const resourceDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(RESOURCE_TYPES),
  maxDefault: z.number().optional(), // só faz sentido para type === 'bar'
  color: z.string().optional(),
});

export type ResourceDef = z.infer<typeof resourceDefSchema>;

export const gameSystemSchemaSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  sections: z.array(fieldSectionSchema).min(1),
  resources: z.array(resourceDefSchema).default([]),
});

// Nome do tipo é redundante de propósito (gameSystemSchemaSchema = o
// validador Zod; GameSystemSchema = o tipo TS que ele produz).
export type GameSystemSchema = z.infer<typeof gameSystemSchemaSchema>;

export interface ParseResult {
  ok: boolean;
  schema?: GameSystemSchema;
  error?: string;
}

export function parseGameSystemSchema(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }

  const result = gameSystemSchemaSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join('.') || '(raiz)';
    return { ok: false, error: `Schema inválido em "${path}": ${first.message}` };
  }

  // Chaves de campo/recurso duplicadas dentro do mesmo sistema quebram o
  // sheet_data (elas viram a mesma chave no JSON da ficha) — checa aqui
  // em vez de deixar a UI se comportar de forma estranha depois.
  const allFieldKeys = result.data.sections.flatMap((s) => s.fields.map((f) => f.key));
  const dupField = findDuplicate(allFieldKeys);
  if (dupField) return { ok: false, error: `Chave de campo duplicada entre seções: "${dupField}"` };

  const resourceKeys = result.data.resources.map((r) => r.key);
  const dupResource = findDuplicate(resourceKeys);
  if (dupResource) return { ok: false, error: `Chave de recurso duplicada: "${dupResource}"` };

  return { ok: true, schema: result.data };
}

function findDuplicate(keys: string[]): string | null {
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) return k;
    seen.add(k);
  }
  return null;
}

// ---------------------------------------------------------------------
// Dados de uma ficha (o que fica em characters.sheet_data), moldados
// pelo GameSystemSchema da campanha.
// ---------------------------------------------------------------------

export interface ResourceValue {
  atual?: number;
  max?: number;
  texto?: string; // usado quando o ResourceDef correspondente é type: 'text'
}

export interface SheetData {
  fields: Record<string, number | string>;
  resources: Record<string, ResourceValue>;
}

export function emptySheetData(schema: GameSystemSchema): SheetData {
  const fields: Record<string, number | string> = {};
  for (const section of schema.sections) {
    for (const f of section.fields) {
      fields[f.key] = f.defaultValue ?? (f.type === 'number' ? f.min ?? 0 : '');
    }
  }

  const resources: Record<string, ResourceValue> = {};
  for (const r of schema.resources) {
    resources[r.key] = r.type === 'bar' ? { atual: r.maxDefault ?? 0, max: r.maxDefault ?? 0 } : { texto: '' };
  }

  return { fields, resources };
}
