import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface TokenRow {
  id: string;
  map_id: string;
  campaign_id: string;
  character_id: string | null;
  label: string;
  token_type: 'player' | 'npc' | 'enemy' | 'other';
  color: string | null;
  pos_x: number;
  pos_y: number;
  visible_to_player: boolean;
}

const TYPE_COLOR: Record<TokenRow['token_type'], string> = {
  player: '#5aa3e0',
  npc: '#a879e0',
  enemy: '#e0655a',
  other: '#8f95a3',
};

interface Props {
  token: TokenRow;
  canMove: boolean;
  isGm: boolean;
  boardRef: React.RefObject<HTMLDivElement | null>;
  onMove: (id: string, pos_x: number, pos_y: number) => void;
}

export function MapToken({ token, canMove, isGm, boardRef, onMove }: Props) {
  const dragging = useRef(false);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!canMove) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const pctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const pctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    e.currentTarget.style.left = `${pctX}%`;
    e.currentTarget.style.top = `${pctY}%`;
    e.currentTarget.dataset.pendingX = String(pctX);
    e.currentTarget.dataset.pendingY = String(pctY);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    const x = e.currentTarget.dataset.pendingX;
    const y = e.currentTarget.dataset.pendingY;
    if (x && y) onMove(token.id, Number(x), Number(y));
  }

  const color = token.color || TYPE_COLOR[token.token_type];

  return (
    <div
      className={`map-token ${canMove ? 'draggable' : ''} ${!token.visible_to_player ? 'hidden-token' : ''}`}
      style={{ left: `${token.pos_x}%`, top: `${token.pos_y}%`, borderColor: color }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={`${token.label}${!token.visible_to_player && isGm ? ' (oculto do jogador)' : ''}`}
    >
      <span className="map-token-dot" style={{ background: color }} />
      <span className="map-token-label">{token.label}</span>
    </div>
  );
}
