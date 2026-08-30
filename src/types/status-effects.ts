// Marcadores de condição num token de mapa (envenenado, atordoado...).
// Guardados como texto livre (map_tokens.status_effects, jsonb de
// strings) — esta lista é só um atalho de "adicionar rápido" na UI, não
// uma restrição: o Mestre também pode digitar uma condição customizada.

export interface QuickStatusEffect {
  key: string;
  label: string;
  icon: string;
}

export const QUICK_STATUS_EFFECTS: QuickStatusEffect[] = [
  { key: 'Envenenado', label: 'Envenenado', icon: '🧪' },
  { key: 'Atordoado', label: 'Atordoado', icon: '💫' },
  { key: 'Amedrontado', label: 'Amedrontado', icon: '😨' },
  { key: 'Paralisado', label: 'Paralisado', icon: '🔒' },
  { key: 'Sangrando', label: 'Sangrando', icon: '🩸' },
  { key: 'Invisível', label: 'Invisível', icon: '👻' },
  { key: 'Escondido', label: 'Escondido', icon: '🫥' },
  { key: 'Concentrando', label: 'Concentrando', icon: '🧠' },
];

const ICON_BY_KEY = new Map(QUICK_STATUS_EFFECTS.map((s) => [s.key, s.icon]));

export function iconForStatus(status: string): string {
  return ICON_BY_KEY.get(status) ?? '⚠️';
}
