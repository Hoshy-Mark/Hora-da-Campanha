import { useEffect, useRef, useState } from 'react';
import {
  FOG_HIDDEN_COLOR,
  cellsForAoe,
  resolveTile,
  type CustomTileRow,
  type PaintTool,
  type TileMapData,
} from '../types/tilemap';

interface Props {
  data: TileMapData;
  editable: boolean;
  tool: PaintTool;
  customTiles: CustomTileRow[];
  resolveUrl: (path: string) => string;
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
// um bloco opaco, sem informação nenhuma sobre o que tem ali. Um tile
// "interativo" (porta, baú...) pode ser clicado por QUALQUER pessoa que
// vê o mapa, mesmo sem poder editar terreno — é a única interação que
// jogadores têm direto com a grade.
export function TileMapBoard({ data, editable, tool, customTiles, resolveUrl, onChange }: Props) {
  const painting = useRef(false);
  // Espelham data.tiles/data.fog/data.tileStates mas são atualizados de
  // forma síncrona a cada pintura, sem esperar o próximo render — um
  // arrastar rápido dispara vários pointerenter antes de React
  // re-renderizar com o `data` novo, e ler só a prop faria cada pintura
  // partir do mesmo array velho (a última vencendo, apagando as
  // anteriores).
  const tilesRef = useRef(data.tiles);
  const fogRef = useRef(data.fog);
  const statesRef = useRef(data.tileStates);
  useEffect(() => {
    tilesRef.current = data.tiles;
    fogRef.current = data.fog;
    statesRef.current = data.tileStates;
  }, [data.tiles, data.fog, data.tileStates]);

  const [measureStart, setMeasureStart] = useState<number | null>(null);
  const [measureEnd, setMeasureEnd] = useState<number | null>(null);
  const [aoeOrigin, setAoeOrigin] = useState<number | null>(null);
  const [aoePointer, setAoePointer] = useState<number | null>(null);

  useEffect(() => {
    function stopPainting() {
      painting.current = false;
    }
    window.addEventListener('pointerup', stopPainting);
    return () => window.removeEventListener('pointerup', stopPainting);
  }, []);

  function toggleInteractive(index: number) {
    const def = resolveTile(tilesRef.current[index], customTiles, resolveUrl);
    if (!def?.interactive) return;
    const states = statesRef.current ? [...statesRef.current] : new Array(tilesRef.current.length).fill(false);
    states[index] = !states[index];
    statesRef.current = states;
    onChange({ ...data, tiles: tilesRef.current, fog: fogRef.current, tileStates: states });
  }

  function paint(index: number, isStart: boolean) {
    if (tool.mode === 'interact') {
      if (isStart) toggleInteractive(index);
      return;
    }

    if (!editable) {
      // Jogador sem nenhum modo de edição: um clique direto na célula já
      // alterna o tile se ele for interativo, e não faz nada senão —
      // jogador nunca pinta terreno/névoa.
      if (isStart) toggleInteractive(index);
      return;
    }

    if (tool.mode === 'measure') {
      if (isStart) setMeasureStart(index);
      setMeasureEnd(index);
      return;
    }

    if (tool.mode === 'aoe') {
      if (isStart) setAoeOrigin(index);
      setAoePointer(index);
      return;
    }

    if (tool.mode === 'terrain') {
      if (tilesRef.current[index] === tool.tile) return;
      const tiles = [...tilesRef.current];
      tiles[index] = tool.tile;
      tilesRef.current = tiles;
      onChange({ ...data, tiles, fog: fogRef.current, tileStates: statesRef.current });
      return;
    }

    if (!fogRef.current || fogRef.current[index] === tool.reveal) return;
    const fog = [...fogRef.current];
    fog[index] = tool.reveal;
    fogRef.current = fog;
    onChange({ ...data, tiles: tilesRef.current, fog, tileStates: statesRef.current });
  }

  const distance =
    measureStart !== null && measureEnd !== null ? cellDistance(measureStart, measureEnd, data.cols) : null;

  const aoeCells =
    tool.mode === 'aoe' && aoeOrigin !== null && aoePointer !== null
      ? cellsForAoe(tool.shape, aoeOrigin, aoePointer, data.cols, data.rows)
      : null;

  return (
    <div
      className="tile-map-grid"
      style={{ gridTemplateColumns: `repeat(${data.cols}, 1fr)`, aspectRatio: `${data.cols} / ${data.rows}` }}
    >
      {data.tiles.map((tileKey, i) => {
        const revealed = !data.fog || data.fog[i];
        const def = resolveTile(tileKey, customTiles, resolveUrl);
        const isAlt = !!def?.interactive && !!data.tileStates?.[i];
        const color = isAlt ? def?.altColor ?? def?.color : def?.color;
        const imagePath = isAlt ? def?.altImagePath ?? def?.imagePath : def?.imagePath;
        const bg = editable || revealed ? color : FOG_HIDDEN_COLOR;
        const bgImage = editable || revealed ? imagePath : undefined;
        const opacity = editable && !revealed ? 0.55 : 1;
        const isMeasureEndpoint = tool.mode === 'measure' && (i === measureStart || i === measureEnd);
        const isAoeCell = !!aoeCells?.has(i);
        return (
          <div
            key={i}
            className={`tile-cell ${isMeasureEndpoint ? 'tile-cell-measure' : ''} ${isAoeCell ? 'tile-cell-aoe' : ''} ${def?.interactive ? 'tile-cell-interactive' : ''}`}
            style={{
              backgroundColor: bgImage ? undefined : bg,
              backgroundImage: bgImage ? `url(${bgImage})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity,
            }}
            title={def?.interactive ? `${def.label}${isAlt ? ' — alternado' : ''} (clique pra alternar)` : def?.label}
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
