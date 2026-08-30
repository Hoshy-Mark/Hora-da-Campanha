import { useEffect, useRef } from 'react';
import { TILE_COLOR, type TileMapData, type TileType } from '../types/tilemap';

interface Props {
  data: TileMapData;
  editable: boolean;
  tool: TileType;
  onChange: (next: TileMapData) => void;
}

// Renderiza só o grid (sem a paleta de ferramentas, que fica fora do
// container medido por MapBoard para os tokens continuarem se
// posicionando por porcentagem da área certa — ver comentário em
// MapBoard.tsx sobre boardRef). Fica dentro do mesmo `.map-image-board`
// usado pelo mapa de imagem, então os tokens (MapToken) funcionam por
// cima de qualquer um dos dois sem precisar saber qual é.
export function TileMapBoard({ data, editable, tool, onChange }: Props) {
  const painting = useRef(false);

  useEffect(() => {
    function stopPainting() {
      painting.current = false;
    }
    window.addEventListener('pointerup', stopPainting);
    return () => window.removeEventListener('pointerup', stopPainting);
  }, []);

  function paint(index: number) {
    if (!editable || data.tiles[index] === tool) return;
    const tiles = [...data.tiles];
    tiles[index] = tool;
    onChange({ ...data, tiles });
  }

  return (
    <div
      className="tile-map-grid"
      style={{ gridTemplateColumns: `repeat(${data.cols}, 1fr)`, aspectRatio: `${data.cols} / ${data.rows}` }}
    >
      {data.tiles.map((tile, i) => (
        <div
          key={i}
          className="tile-cell"
          style={{ background: TILE_COLOR[tile] }}
          onPointerDown={() => {
            painting.current = true;
            paint(i);
          }}
          onPointerEnter={() => {
            if (painting.current) paint(i);
          }}
        />
      ))}
    </div>
  );
}
