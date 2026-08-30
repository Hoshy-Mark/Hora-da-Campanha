// Marcadores de condição num token de mapa (envenenado, atordoado...).
// Guardados como texto livre (map_tokens.status_effects, jsonb de
// strings) — esta lista é só um atalho de "adicionar rápido" na UI, não
// uma restrição: o Mestre também pode digitar uma condição customizada.

export interface QuickStatusEffect {
  key: string;
  label: string;
  icon: string;
  description: string;
}

export const QUICK_STATUS_EFFECTS: QuickStatusEffect[] = [
  { key: 'Envenenado', label: 'Envenenado', icon: '🧪', description: 'Sofre dano ao longo do tempo até ser curado ou o efeito passar.' },
  { key: 'Atordoado', label: 'Atordoado', icon: '💫', description: 'Não consegue agir nem reagir enquanto durar.' },
  { key: 'Amedrontado', label: 'Amedrontado', icon: '😨', description: 'Não consegue se aproximar voluntariamente da fonte do medo.' },
  { key: 'Paralisado', label: 'Paralisado', icon: '🔒', description: 'Incapaz de se mover ou agir; ataques contra o alvo têm vantagem.' },
  { key: 'Sangrando', label: 'Sangrando', icon: '🩸', description: 'Perde um pouco de vida a cada turno até receber tratamento.' },
  { key: 'Invisível', label: 'Invisível', icon: '👻', description: 'Não pode ser visto normalmente; ataques contra o alvo têm desvantagem.' },
  { key: 'Escondido', label: 'Escondido', icon: '🫥', description: 'Não foi notado pelos inimigos — some da percepção deles até agir ou ser descoberto.' },
  { key: 'Concentrando', label: 'Concentrando', icon: '🧠', description: 'Mantendo um efeito ativo; sofrer dano pode quebrar a concentração.' },
];

const ICON_BY_KEY = new Map(QUICK_STATUS_EFFECTS.map((s) => [s.key, s.icon]));
const DESCRIPTION_BY_KEY = new Map(QUICK_STATUS_EFFECTS.map((s) => [s.key, s.description]));

export function iconForStatus(status: string): string {
  return ICON_BY_KEY.get(status) ?? '⚠️';
}

export function descriptionForStatus(status: string): string {
  return DESCRIPTION_BY_KEY.get(status) ?? 'Condição customizada — sem descrição padrão.';
}
