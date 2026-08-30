import { useEffect, useRef, useState } from 'react';
import { FOG_HIDDEN_COLOR, TILE_COLOR, type PaintTool, type TileMapData } from '../types/tilemap';

interface Props {
  data: TileMapData;
  editable: boolean;
  tool: PaintTool;
  onChange: (next: TileMapData) => void;
}

function cellDistance(a: number, b: number, cols: number) {
  const rowA = Math.floor(a / cols);
  const colA = a % cols;
  const rowB = Math.floor(b / cols);
  const colB = b % cols;
  // Distância "em células" ao estilo D&D 5e simplificado: diagonal conta
  // igual a ortogonal (regra de xadrez do rei), não a raiz de 2.
  return Math.max(Math.abs(rowA - rowB), Math.abs(colA - colB));
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

  const [measureStart, setMeasureStart] = useState<number | null>(null);
  const [measureEnd, setMeasureEnd] = useState<number | null>(null);

  useEffect(() => {
    function stopPainting() {
      painting.current = false;
    }
    window.addEventListener('pointerup', stopPainting);
    return () => window.removeEventListener('pointerup', stopPainting);
  }, []);

  function paint(index: number, isStart: boolean) {
    if (!editable) return;

    if (tool.mode === 'measure') {
      if (isStart) setMeasureStart(index);
      setMeasureEnd(index);
      return;
    }

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

  const distance =
    measureStart !== null && measureEnd !== null ? cellDistance(measureStart, measureEnd, data.cols) : null;

  return (
    <div
      className="tile-map-grid"
      style={{ gridTemplateColumns: `repeat(${data.cols}, 1fr)`, aspectRatio: `${data.cols} / ${data.rows}` }}
    >
      {data.tiles.map((tile, i) => {
        const revealed = !data.fog || data.fog[i];
        const bg = editable || revealed ? TILE_COLOR[tile] : FOG_HIDDEN_COLOR;
        const opacity = editable && !revealed ? 0.55 : 1;
        const isMeasureEndpoint = tool.mode === 'measure' && (i === measureStart || i === measureEnd);
        return (
          <div
            key={i}
            className={`tile-cell ${isMeasureEndpoint ? 'tile-cell-measure' : ''}`}
            style={{ background: bg, opacity }}
            onPointerDown={() => {
              painting.current = true;
              paint(i, true);
            }}
            onPointerEnter={() => {
              if (painting.current) paint(i, false);
            }}
          >
            {i === measureEnd && distance !== null && (
              <span className="tile-measure-badge">{distance} célula{distance === 1 ? '' : 's'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
