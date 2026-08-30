import { supabase } from '../lib/supabase';
import type { GameSystemSchema, SheetData } from '../types/game-system';

interface CharacterRow {
  id: string;
  owner_id: string | null;
  name: string;
  sheet_data: SheetData;
  is_npc: boolean;
  avatar_path: string | null;
}

interface Props {
  character: CharacterRow;
  schema: GameSystemSchema;
  ownerName: string | null;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  // Presentes só pro Mestre: lista de jogadores da mesa pra escolher, e o
  // callback que grava a troca de dono. Ausentes = jogador vendo o card,
  // sem controle nenhum de atribuição.
  players?: { user_id: string; name: string }[];
  onAssignOwner?: (ownerId: string | null) => void;
}

export function CharacterCard({
  character,
  schema,
  ownerName,
  selected,
  onSelect,
  onDelete,
  onDuplicate,
  players,
  onAssignOwner,
}: Props) {
  const barResources = schema.resources.filter((r) => r.type === 'bar');
  const avatarUrl = character.avatar_path
    ? supabase.storage.from('maps').getPublicUrl(character.avatar_path).data.publicUrl
    : null;

  return (
    <div className={`character-card ${selected ? 'selected' : ''}`}>
      <button type="button" className="character-card-main" onClick={onSelect}>
        <div className="character-card-title">
          {avatarUrl && <img className="character-card-avatar" src={avatarUrl} alt="" />}
          <strong>{character.name}</strong>
          {character.is_npc ? (
            <span className="npc-badge">NPC</span>
          ) : (
            <span className="muted owner-hint">{ownerName ?? '—'}</span>
          )}
        </div>
        <div className="character-card-mini-bars">
          {barResources.slice(0, 2).map((r) => {
            const v = character.sheet_data.resources?.[r.key];
            const atual = v?.atual ?? 0;
            const max = v?.max ?? r.maxDefault ?? 0;
            const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
            return (
              <div key={r.key} className="mini-bar" title={`${r.label}: ${atual}/${max}`}>
                <div className="mini-bar-fill" style={{ width: `${pct}%`, background: r.color ?? '#c9a84c' }} />
              </div>
            );
          })}
        </div>
      </button>
      {onDuplicate && (
        <button
          type="button"
          className="link-btn character-card-delete"
          title="Duplicar personagem"
          onClick={onDuplicate}
        >
          ⧉
        </button>
      )}
      {onDelete && (
        <button type="button" className="link-btn danger character-card-delete" onClick={onDelete}>
          ✕
        </button>
      )}
      {onAssignOwner && players && (
        <select
          className="character-card-assign"
          value={character.owner_id ?? ''}
          title="Atribuir a um jogador"
          onChange={(e) => onAssignOwner(e.target.value || null)}
        >
          <option value="">NPC (Mestre)</option>
          {players.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
