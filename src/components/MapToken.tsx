import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { iconForStatus } from '../types/status-effects';

export interface TokenRow {
  id: string;
  map_id: string;
  campaign_id: string;
  character_id: string | null;
  label: string;
  token_type: 'player' | 'npc' | 'enemy' | 'other';
  color: string | null;
  image_path: string | null;
  status_effects: string[];
  pos_x: number;
  pos_y: number;
  visible_to_player: boolean;
  vision_radius: number | null;
}

const TYPE_COLOR: Record<TokenRow['token_type'], string> = {
  player: '#5aa3e0',
  npc: '#a879e0',
  enemy: '#e0655a',
  other: '#8f95a3',
};

interface GridSnap {
  cols: number;
  rows: number;
}

interface Props {
  token: TokenRow;
  canMove: boolean;
  isGm: boolean;
  isCurrentTurn: boolean;
  isDefeated: boolean;
  boardRef: React.RefObject<HTMLDivElement | null>;
  gridSnap: GridSnap | null;
  avatarUrl: string | null;
  onMove: (id: string, pos_x: number, pos_y: number) => void;
  onOpenInfo: (id: string) => void;
}

function snapToCellCenter(pct: number, cellCount: number) {
  const cellPct = 100 / cellCount;
  const idx = Math.min(cellCount - 1, Math.max(0, Math.floor(pct / cellPct)));
  return (idx + 0.5) * cellPct;
}

export function MapToken({ token, canMove, isGm, isCurrentTurn, isDefeated, boardRef, gridSnap, avatarUrl, onMove, onOpenInfo }: Props) {
  const dragging = useRef(false);
  // Distingue um clique (abre o popover de info) de um arrastar (move o
  // token) — sem isso, um token não-arrastável (canMove=false) nunca
  // teria handler de pointer nenhum engatado e não daria pra clicar
  // nele só pra ver a info.
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    if (canMove) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (pointerStart.current) {
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      if (Math.hypot(dx, dy) > 4) moved.current = true;
    }
    if (!dragging.current || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    let pctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    let pctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    // Num mapa de tiles, o token gruda no centro da célula mais próxima em
    // vez de ficar em posição livre — mais fácil de ler quem está onde
    // numa grade tática. Mapa de imagem continua livre (sem grid pra
    // encaixar).
    if (gridSnap) {
      pctX = snapToCellCenter(pctX, gridSnap.cols);
      pctY = snapToCellCenter(pctY, gridSnap.rows);
    }
    e.currentTarget.style.left = `${pctX}%`;
    e.currentTarget.style.top = `${pctY}%`;
    e.currentTarget.dataset.pendingX = String(pctX);
    e.currentTarget.dataset.pendingY = String(pctY);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragging.current) {
      dragging.current = false;
      const x = e.currentTarget.dataset.pendingX;
      const y = e.currentTarget.dataset.pendingY;
      if (x && y && moved.current) onMove(token.id, Number(x), Number(y));
    }
    if (!moved.current) onOpenInfo(token.id);
    pointerStart.current = null;
  }

  const color = token.color || TYPE_COLOR[token.token_type];

  return (
    <div
      className={`map-token ${canMove ? 'draggable' : ''} ${!token.visible_to_player ? 'hidden-token' : ''} ${isCurrentTurn ? 'current-turn-token' : ''} ${isDefeated ? 'defeated-token' : ''}`}
      style={{ left: `${token.pos_x}%`, top: `${token.pos_y}%`, borderColor: color }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={`${token.label}${token.status_effects.length ? ` (${token.status_effects.join(', ')})` : ''}${!token.visible_to_player && isGm ? ' (oculto do jogador)' : ''}${isDefeated ? ' — derrotado' : ''}`}
    >
      {token.status_effects.length > 0 && (
        <span className="map-token-statuses">
          {token.status_effects.map((s) => (
            <span key={s} className="map-token-status-badge">
              {iconForStatus(s)}
            </span>
          ))}
        </span>
      )}
      {avatarUrl ? (
        <img className="map-token-avatar" src={avatarUrl} alt="" style={{ borderColor: color }} draggable={false} />
      ) : (
        <span className="map-token-dot" style={{ background: color }} />
      )}
      <span className="map-token-label">{token.label}</span>
    </div>
  );
}
