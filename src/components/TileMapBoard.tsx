import { useEffect, useRef } from 'react';
import { FOG_HIDDEN_COLOR, TILE_COLOR, type PaintTool, type TileMapData } from '../types/tilemap';

interface Props {
  data: TileMapData;
  editable: boolean;
  tool: PaintTool;
  onChange: (next: TileMapData) => void;
}

// Renderiza só o grid (sem paleta/controles, que ficam fora do container
// medido por MapBoard para os tokens continuarem se posicionando por
// porcentagem da área certa — ver comentário em MapBoard.tsx sobre
// boardRef). Fica dentro do mesmo `.map-image-board` usado pelo mapa de
// imagem, então os tokens (MapToken) funcionam por cima de qualquer um
// dos dois sem precisar saber qual é.
//
// `editable` aqui também significa "é o Mestre": o Mestre sempre vê o
// terreno de verdade (célula com névoa fica só meio apagada, pra saber
// o que ainda não foi revelado); jogadores veem célula com névoa como
// um bloco opaco, sem informação nenhuma sobre o que tem ali.
export function TileMapBoard({ data, editable, tool, onChange }: Props) {
  const painting = useRef(false);
  // Espelham data.tiles/data.fog mas são atualizados de forma síncrona a
  // cada pintura, sem esperar o próximo render — um arrastar rápido
  // dispara vários pointerenter antes de React re-renderizar com o
  // `data` novo, e ler só a prop faria cada pintura partir do mesmo
  // array velho (a última vencendo, apagando as anteriores).
  const tilesRef = useRef(data.tiles);
  const fogRef = useRef(data.fog);
  useEffect(() => {
    tilesRef.current = data.tiles;
    fogRef.current = data.fog;
  }, [data.tiles, data.fog]);

  useEffect(() => {
    function stopPainting() {
      painting.current = false;
    }
    window.addEventListener('pointerup', stopPainting);
    return () => window.removeEventListener('pointerup', stopPainting);
  }, []);

  function paint(index: number) {
    if (!editable) return;

    if (tool.mode === 'terrain') {
      if (tilesRef.current[index] === tool.tile) return;
      const tiles = [...tilesRef.current];
      tiles[index] = tool.tile;
      tilesRef.current = tiles;
      onChange({ ...data, tiles, fog: fogRef.current });
      return;
    }

    if (!fogRef.current || fogRef.current[index] === tool.reveal) return;
    const fog = [...fogRef.current];
    fog[index] = tool.reveal;
    fogRef.current = fog;
    onChange({ ...data, tiles: tilesRef.current, fog });
  }

  return (
    <div
      className="tile-map-grid"
      style={{ gridTemplateColumns: `repeat(${data.cols}, 1fr)`, aspectRatio: `${data.cols} / ${data.rows}` }}
    >
      {data.tiles.map((tile, i) => {
        const revealed = !data.fog || data.fog[i];
        const bg = editable || revealed ? TILE_COLOR[tile] : FOG_HIDDEN_COLOR;
        const opacity = editable && !revealed ? 0.55 : 1;
        return (
          <div
            key={i}
            className="tile-cell"
            style={{ background: bg, opacity }}
            onPointerDown={() => {
              painting.current = true;
              paint(i);
            }}
            onPointerEnter={() => {
              if (painting.current) paint(i);
            }}
          />
        );
      })}
    </div>
  );
}
