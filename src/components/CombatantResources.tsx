import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { debounce } from '../lib/debounce';
import type { GameSystemSchema, SheetData } from '../types/game-system';
import { ResourceBar } from './ResourceBar';

interface Props {
  character: { id: string; sheet_data: SheetData };
  schema: GameSystemSchema;
  editable: boolean;
}

// Mesma lógica de edição de recursos da CharacterSheet (debounce +
// dirtyRef pra não perder uma edição local pro eco do Realtime), só que
// isolada por combatente dentro do rastreador de combate — assim dá pra
// ajustar vida/recursos sem sair da aba Combate pra ir na Ficha.
export function CombatantResources({ character, schema, editable }: Props) {
  const [data, setData] = useState<SheetData>(character.sheet_data);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setData(character.sheet_data);
  }, [character.sheet_data]);

  const persist = useRef(
    debounce(async (next: SheetData) => {
      await supabase.from('characters').update({ sheet_data: next }).eq('id', character.id);
      dirtyRef.current = false;
    }, 500)
  ).current;

  function setResource(key: string, value: SheetData['resources'][string]) {
    const next = { ...data, resources: { ...data.resources, [key]: value } };
    setData(next);
    dirtyRef.current = true;
    persist(next);
  }

  if (schema.resources.length === 0) return null;

  return (
    <div className="combatant-resources">
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
  );
}
