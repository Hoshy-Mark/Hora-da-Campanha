// Formato de um mapa do tipo "tilemap" (maps.tile_data), a alternativa
// a subir uma imagem: um grid de tamanho fixo onde cada célula guarda a
// chave de um tipo de terreno. Camada única, sem fog-of-war — só o
// básico pra montar uma sala/corredor/dungeon rapidamente na tela.

export const TILE_TYPES = [
  'empty',
  'floor',
  'wall',
  'door',
  'tree',
  'water',
  'stairs',
  'chest',
  'lava',
  'altar',
  'rubble',
] as const;
export type TileType = (typeof TILE_TYPES)[number];

export const TILE_LABEL: Record<TileType, string> = {
  empty: 'Vazio',
  floor: 'Chão',
  wall: 'Parede',
  door: 'Porta',
  tree: 'Árvore',
  water: 'Água',
  stairs: 'Escada',
  chest: 'Baú',
  lava: 'Lava',
  altar: 'Altar',
  rubble: 'Entulho',
};

export const TILE_COLOR: Record<TileType, string> = {
  empty: 'transparent',
  floor: '#4a4436',
  wall: '#2a2c33',
  door: '#8a5a34',
  tree: '#2f5a3a',
  water: '#2f5a7a',
  stairs: '#8b8f99',
  chest: '#a8862f',
  lava: '#c9401f',
  altar: '#7a5a9e',
  rubble: '#5c5548',
};

export interface TileMapData {
  cols: number;
  rows: number;
  tiles: TileType[]; // comprimento cols*rows, índice = row*cols+col
  // Névoa de guerra: ausente = recurso desligado, mapa sempre visível por
  // inteiro (comportamento de antes desta feature existir, e o que todo
  // mapa criado antes dela continua tendo). Presente = um booleano por
  // célula, true = revelado pros jogadores. O Mestre sempre vê o terreno
  // de verdade independente disso; só os jogadores enxergam a máscara.
  fog?: boolean[];
}

export function emptyTileMap(cols: number, rows: number): TileMapData {
  return { cols, rows, tiles: Array(cols * rows).fill('floor') };
}

export const FOG_HIDDEN_COLOR = '#08090c';

export function emptyFog(cols: number, rows: number, revealed: boolean): boolean[] {
  return Array(cols * rows).fill(revealed);
}

export type PaintTool = { mode: 'terrain'; tile: TileType } | { mode: 'fog'; reveal: boolean } | { mode: 'measure' };
