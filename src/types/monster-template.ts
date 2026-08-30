// Formato dos JSONs embutidos em monster_templates.abilities/items.
// Espelham as colunas de character_abilities/inventory_items, sem os
// campos que só fazem sentido depois de instanciado (id, character_id,
// visible_to_player — sempre nasce oculto quando vira personagem de
// verdade numa campanha).

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
