// Formato de um mapa do tipo "tilemap" (maps.tile_data), a alternativa
// a subir uma imagem: um grid de tamanho fixo onde cada célula guarda a
// chave de um tipo de terreno. Camada única — só o básico pra montar
// uma sala/corredor/dungeon rapidamente na tela.
//
// A chave de uma célula (`tiles[i]`) tanto pode ser um tile "de fábrica"
// (ver BUILTIN_TILES abaixo) quanto um tile customizado do usuário —
// nesse caso a chave é `custom:<id da linha em tile_definitions>`.
// `resolveTile` sabe resolver os dois casos.

export interface TileDef {
  key: string;
  label: string;
  category: string;
  color?: string;
  imagePath?: string; // URL pública já resolvida, só tiles customizados têm
  interactive: boolean;
  altColor?: string;
  altImagePath?: string;
}

export const BUILTIN_TILES: TileDef[] = [
  { key: 'empty', label: 'Vazio', category: 'Básico', color: 'transparent', interactive: false },
  { key: 'floor', label: 'Chão de Pedra', category: 'Chão', color: '#4a4436', interactive: false },
  { key: 'floor_wood', label: 'Chão de Madeira', category: 'Chão', color: '#6b4a2f', interactive: false },
  { key: 'floor_grass', label: 'Grama', category: 'Chão', color: '#3d5c33', interactive: false },
  { key: 'floor_sand', label: 'Areia', category: 'Chão', color: '#a89060', interactive: false },
  { key: 'rubble', label: 'Entulho', category: 'Chão', color: '#5c5548', interactive: false },
  { key: 'wall', label: 'Parede de Pedra', category: 'Parede', color: '#2a2c33', interactive: false },
  { key: 'wall_brick', label: 'Parede de Tijolo', category: 'Parede', color: '#5a3a30', interactive: false },
  { key: 'wall_wood', label: 'Parede de Madeira Maciça', category: 'Parede', color: '#4a3624', interactive: false },
  { key: 'tree', label: 'Árvore', category: 'Natureza', color: '#2f5a3a', interactive: false },
  { key: 'water', label: 'Água', category: 'Natureza', color: '#2f5a7a', interactive: false },
  { key: 'lava', label: 'Lava', category: 'Natureza', color: '#c9401f', interactive: false },
  {
    key: 'door',
    label: 'Porta (fechada)',
    category: 'Objetos',
    color: '#8a5a34',
    interactive: true,
    altColor: '#c9a060',
    altImagePath: undefined,
  },
  { key: 'stairs', label: 'Escada', category: 'Objetos', color: '#8b8f99', interactive: false },
  { key: 'chest', label: 'Baú (fechado)', category: 'Objetos', color: '#a8862f', interactive: true, altColor: '#e0c25a' },
  { key: 'altar', label: 'Altar', category: 'Objetos', color: '#7a5a9e', interactive: false },
];

export const BUILTIN_TILE_CATEGORIES = ['Básico', 'Chão', 'Parede', 'Natureza', 'Objetos'] as const;

const BUILTIN_BY_KEY = new Map(BUILTIN_TILES.map((t) => [t.key, t]));

export function builtinTile(key: string): TileDef | undefined {
  return BUILTIN_BY_KEY.get(key);
}

// Formato mínimo do que MapBoard busca de public.tile_definitions —
// definido aqui (em vez de um arquivo à parte) porque é essencialmente
// só mais uma fonte de TileDef.
export interface CustomTileRow {
  id: string;
  owner_id: string;
  label: string;
  category: string;
  color: string | null;
  image_path: string | null;
  interactive: boolean;
  alt_color: string | null;
  alt_image_path: string | null;
}

export function customTileKey(id: string): string {
  return `custom:${id}`;
}

// `resolveUrl` recebe o `image_path` (caminho no bucket "tiles") e
// devolve a URL pública — passado de fora pra este módulo não precisar
// conhecer o client do Supabase.
export function resolveTile(key: string, customTiles: CustomTileRow[], resolveUrl: (path: string) => string): TileDef | undefined {
  const builtin = builtinTile(key);
  if (builtin) return builtin;

  if (key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    const row = customTiles.find((c) => c.id === id);
    if (!row) return undefined;
    return {
      key,
      label: row.label,
      category: row.category,
      color: row.color ?? undefined,
      imagePath: row.image_path ? resolveUrl(row.image_path) : undefined,
      interactive: row.interactive,
      altColor: row.alt_color ?? undefined,
      altImagePath: row.alt_image_path ? resolveUrl(row.alt_image_path) : undefined,
    };
  }

  return undefined;
}

export interface TileMapData {
  cols: number;
  rows: number;
  tiles: string[]; // comprimento cols*rows, índice = row*cols+col
  // Névoa de guerra: ausente = recurso desligado, mapa sempre visível por
  // inteiro (comportamento de antes desta feature existir, e o que todo
  // mapa criado antes dela continua tendo). Presente = um booleano por
  // célula, true = revelado pros jogadores. O Mestre sempre vê o terreno
  // de verdade independente disso; só os jogadores enxergam a máscara.
  fog?: boolean[];
  // Estado alternado de um tile interativo (porta aberta/fechada, baú
  // aberto/fechado...) — só faz sentido pra célula cujo tile é
  // `interactive`; ausente ou false = estado "padrão" (fechado).
  tileStates?: boolean[];
}

export function emptyTileMap(cols: number, rows: number): TileMapData {
  return { cols, rows, tiles: Array(cols * rows).fill('floor') };
}

export const FOG_HIDDEN_COLOR = '#08090c';

export function emptyFog(cols: number, rows: number, revealed: boolean): boolean[] {
  return Array(cols * rows).fill(revealed);
}

// Raio de "visão" (em células) revelado automaticamente ao redor de um
// token de jogador quando ele se move sobre um mapa de tiles com névoa
// ativa — simplificação de linha de visão (círculo, sem considerar
// paredes bloqueando) em vez de raycasting de verdade.
export const AUTO_VISION_RADIUS = 3;

// Recebe a posição do token em porcentagem (0-100) da imagem/grid — o
// mesmo formato de map_tokens.pos_x/pos_y — e devolve o tile_data com a
// névoa ao redor revelada, ou `null` se não havia névoa pra revelar (já
// revelado, ou mapa sem névoa ativa).
export function revealFogAroundPosition(
  data: TileMapData,
  posXPercent: number,
  posYPercent: number,
  radius = AUTO_VISION_RADIUS
): TileMapData | null {
  if (!data.fog) return null;
  const { cols, rows, fog } = data;
  const col = Math.min(cols - 1, Math.max(0, Math.floor((posXPercent / 100) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((posYPercent / 100) * rows)));

  let changed = false;
  const nextFog = fog.slice();
  const rMin = Math.max(0, row - radius);
  const rMax = Math.min(rows - 1, row + radius);
  const cMin = Math.max(0, col - radius);
  const cMax = Math.min(cols - 1, col + radius);
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const dx = c - col;
      const dy = r - row;
      if (dx * dx + dy * dy > radius * radius) continue;
      const idx = r * cols + c;
      if (!nextFog[idx]) {
        nextFog[idx] = true;
        changed = true;
      }
    }
  }

  return changed ? { ...data, fog: nextFog } : null;
}

export type PaintTool =
  | { mode: 'terrain'; tile: string }
  | { mode: 'fog'; reveal: boolean }
  | { mode: 'measure' }
  | { mode: 'interact' };
