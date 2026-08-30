import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { debounce } from '../lib/debounce';
import { useToast } from '../context/ToastContext';
import { formatExpression, rollDice } from '../lib/dice';
import { recomputeFormulas, type FieldDef, type GameSystemSchema, type SheetData } from '../types/game-system';
import { ResourceBar } from './ResourceBar';
import { AbilityList } from './AbilityList';
import { ItemList } from './ItemList';
import { CharacterSecrets } from './CharacterSecrets';
import { SheetFieldsEditor } from './SheetFieldsEditor';

interface CharacterRow {
  id: string;
  campaign_id: string;
  owner_id: string | null;
  name: string;
  sheet_data: SheetData;
  is_npc: boolean;
  avatar_path: string | null;
}

interface Props {
  character: CharacterRow;
  schema: GameSystemSchema;
  gameSystemId: string;
  editable: boolean;
  isGm: boolean;
  myUserId: string | undefined;
}

export function CharacterSheet({ character, schema, gameSystemId, editable, isGm, myUserId }: Props) {
  const { showToast } = useToast();
  const [data, setData] = useState<SheetData>(character.sheet_data);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
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
    const next = recomputeFormulas(schema, { ...data, fields: { ...data.fields, [key]: value } });
    update(next);
  }

  function setResource(key: string, value: (typeof data.resources)[string]) {
    update({ ...data, resources: { ...data.resources, [key]: value } });
  }

  async function handleRollField(field: FieldDef, value: number) {
    if (!myUserId) return;
    const expr = { count: 1, sides: 20, modifier: Math.trunc(value) };
    const roll = rollDice(expr);
    showToast(`🎲 ${field.label} (${character.name}): ${roll.total}`, 'success');
    const { error } = await supabase.from('dice_rolls').insert({
      campaign_id: character.campaign_id,
      user_id: myUserId,
      label: `${field.label} (${character.name})`,
      expression: formatExpression(expr),
      results: roll.rolls,
      total: roll.total,
    });
    if (error) showToast(error.message, 'error');
  }

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true);
    const ext = file.name.split('.').pop() || 'png';
    const path = `${character.campaign_id}/characters/${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('maps').upload(path, file);
    if (uploadErr) {
      setUploadingAvatar(false);
      showToast(uploadErr.message, 'error');
      return;
    }
    const { error } = await supabase.from('characters').update({ avatar_path: path }).eq('id', character.id);
    setUploadingAvatar(false);
    if (error) showToast(error.message, 'error');
  }

  async function handleRemoveAvatar() {
    const { error } = await supabase.from('characters').update({ avatar_path: null }).eq('id', character.id);
    if (error) showToast(error.message, 'error');
  }

  const avatarUrl = character.avatar_path
    ? supabase.storage.from('maps').getPublicUrl(character.avatar_path).data.publicUrl
    : null;

  return (
    <div className="character-sheet">
      <div className="character-sheet-head">
        {avatarUrl ? (
          <img className="character-avatar" src={avatarUrl} alt="" />
        ) : (
          isGm && <span className="character-avatar character-avatar-placeholder">?</span>
        )}
        <h3>{character.name}</h3>
        {character.is_npc && <span className="npc-badge">NPC</span>}
        {saving && <span className="muted saving-indicator">salvando…</span>}
        {isGm && (
          <span className="character-avatar-actions">
            <label className="link-btn token-avatar-swap">
              {uploadingAvatar ? 'Enviando…' : avatarUrl ? 'Trocar avatar' : '+ Avatar'}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingAvatar}
                ref={avatarInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
            {avatarUrl && (
              <button className="link-btn" onClick={handleRemoveAvatar}>
                Remover avatar
              </button>
            )}
          </span>
        )}
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

      <SheetFieldsEditor
        schema={schema}
        data={data}
        editable={editable}
        onFieldChange={setField}
        onRollField={myUserId ? handleRollField : undefined}
      />

      <AbilityList characterId={character.id} campaignId={character.campaign_id} gameSystemId={gameSystemId} isGm={isGm} />
      <ItemList characterId={character.id} campaignId={character.campaign_id} gameSystemId={gameSystemId} isGm={isGm} />
      {isGm && <CharacterSecrets characterId={character.id} campaignId={character.campaign_id} />}
    </div>
  );
}
