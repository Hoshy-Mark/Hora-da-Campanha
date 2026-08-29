import type { GameSystemSchema, SheetData } from '../types/game-system';

interface CharacterRow {
  id: string;
  owner_id: string | null;
  name: string;
  sheet_data: SheetData;
  is_npc: boolean;
}

interface Props {
  character: CharacterRow;
  schema: GameSystemSchema;
  ownerName: string | null;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

export function CharacterCard({ character, schema, ownerName, selected, onSelect, onDelete }: Props) {
  const barResources = schema.resources.filter((r) => r.type === 'bar');

  return (
    <div className={`character-card ${selected ? 'selected' : ''}`}>
      <button type="button" className="character-card-main" onClick={onSelect}>
        <div className="character-card-title">
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
      {onDelete && (
        <button type="button" className="link-btn danger character-card-delete" onClick={onDelete}>
          ✕
        </button>
      )}
    </div>
  );
}
