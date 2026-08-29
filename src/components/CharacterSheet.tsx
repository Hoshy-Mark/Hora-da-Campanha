import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { debounce } from '../lib/debounce';
import type { GameSystemSchema, SheetData } from '../types/game-system';
import { ResourceBar } from './ResourceBar';
import { AbilityList } from './AbilityList';
import { ItemList } from './ItemList';
import { CharacterSecrets } from './CharacterSecrets';

interface CharacterRow {
  id: string;
  campaign_id: string;
  owner_id: string | null;
  name: string;
  sheet_data: SheetData;
  is_npc: boolean;
}

interface Props {
  character: CharacterRow;
  schema: GameSystemSchema;
  editable: boolean;
  isGm: boolean;
}

export function CharacterSheet({ character, schema, editable, isGm }: Props) {
  const [data, setData] = useState<SheetData>(character.sheet_data);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  // Só aceita a versão que chegou via realtime se não há edição local
  // pendente ainda não salva — evita que a digitação de alguém seja
  // apagada por uma atualização remota no meio do caminho.
  useEffect(() => {
    if (!dirtyRef.current) setData(character.sheet_data);
  }, [character.sheet_data]);

  const persist = useRef(
    debounce(async (next: SheetData) => {
      setSaving(true);
      await supabase.from('characters').update({ sheet_data: next }).eq('id', character.id);
      dirtyRef.current = false;
      setSaving(false);
    }, 500)
  ).current;

  function update(next: SheetData) {
    setData(next);
    dirtyRef.current = true;
    persist(next);
  }

  function setField(key: string, value: number | string) {
    update({ ...data, fields: { ...data.fields, [key]: value } });
  }

  function setResource(key: string, value: (typeof data.resources)[string]) {
    update({ ...data, resources: { ...data.resources, [key]: value } });
  }

  return (
    <div className="character-sheet">
      <div className="character-sheet-head">
        <h3>{character.name}</h3>
        {character.is_npc && <span className="npc-badge">NPC</span>}
        {saving && <span className="muted saving-indicator">salvando…</span>}
      </div>

      {schema.resources.length > 0 && (
        <div className="sheet-card resources-card">
          {schema.resources.map((r) => (
            <ResourceBar
              key={r.key}
              def={r}
              value={data.resources[r.key] ?? {}}
              editable={editable}
              onChange={(v) => setResource(r.key, v)}
            />
          ))}
        </div>
      )}

      <div className="sheet-sections">
        {schema.sections.map((section) => (
          <div key={section.key} className="sheet-card">
            <strong className="sheet-card-title">{section.label}</strong>
            {section.description && <p className="muted sheet-section-desc">{section.description}</p>}
            <div className="sheet-fields-grid">
              {section.fields.map((field) => (
                <label key={field.key} className="sheet-field">
                  <span>{field.label}</span>
                  {field.type === 'select' ? (
                    <select
                      disabled={!editable}
                      value={String(data.fields[field.key] ?? '')}
                      onChange={(e) => setField(field.key, e.target.value)}
                    >
                      <option value="" disabled>
                        —
                      </option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'longtext' ? (
                    <textarea
                      rows={3}
                      disabled={!editable}
                      value={String(data.fields[field.key] ?? '')}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      disabled={!editable}
                      min={field.min}
                      max={field.max}
                      value={data.fields[field.key] ?? (field.type === 'number' ? 0 : '')}
                      onChange={(e) =>
                        setField(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)
                      }
                    />
                  )}
                  {field.helpText && <small className="muted">{field.helpText}</small>}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AbilityList characterId={character.id} campaignId={character.campaign_id} isGm={isGm} />
      <ItemList characterId={character.id} campaignId={character.campaign_id} isGm={isGm} />
      {isGm && <CharacterSecrets characterId={character.id} campaignId={character.campaign_id} />}
    </div>
  );
}
