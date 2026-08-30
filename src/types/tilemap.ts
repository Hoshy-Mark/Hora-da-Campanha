// Formato de um mapa do tipo "tilemap" (maps.tile_data), a alternativa
// a subir uma imagem: um grid de tamanho fixo onde cada célula guarda a
// chave de um tipo de terreno. Camada única, sem fog-of-war — só o
// básico pra montar uma sala/corredor/dungeon rapidamente na tela.

export const TILE_TYPES = ['empty', 'floor', 'wall', 'door', 'tree', 'water'] as const;
export type TileType = (typeof TILE_TYPES)[number];

export const TILE_LABEL: Record<TileType, string> = {
  empty: 'Vazio',
  floor: 'Chão',
  wall: 'Parede',
  door: 'Porta',
  tree: 'Árvore',
  water: 'Água',
};

export const TILE_COLOR: Record<TileType, string> = {
  empty: 'transparent',
  floor: '#4a4436',
  wall: '#2a2c33',
  door: '#8a5a34',
  tree: '#2f5a3a',
  water: '#2f5a7a',
};

export interface TileMapData {
  cols: number;
  rows: number;
  tiles: TileType[]; // comprimento cols*rows, índice = row*cols+col
}

export function emptyTileMap(cols: number, rows: number): TileMapData {
  return { cols, rows, tiles: Array(cols * rows).fill('floor') };
}
