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
  // Espelha data.tiles mas é atualizado de forma síncrona a cada pintura,
  // sem esperar o próximo render — um arrastar rápido dispara vários
  // pointerenter antes de React re-renderizar com o `data` novo, e ler
  // só a prop faria cada pintura partir do mesmo array velho (a última
  // vencendo, apagando as anteriores).
  const tilesRef = useRef(data.tiles);
  useEffect(() => {
    tilesRef.current = data.tiles;
  }, [data.tiles]);

  useEffect(() => {
    function stopPainting() {
      painting.current = false;
    }
    window.addEventListener('pointerup', stopPainting);
    return () => window.removeEventListener('pointerup', stopPainting);
  }, []);

  function paint(index: number) {
    if (!editable || tilesRef.current[index] === tool) return;
    const tiles = [...tilesRef.current];
    tiles[index] = tool;
    tilesRef.current = tiles;
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
