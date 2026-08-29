import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { MapToken, type TokenRow } from './MapToken';

interface MapRow {
  id: string;
  campaign_id: string;
  name: string;
  image_path: string;
}

interface CharacterOption {
  id: string;
  name: string;
  owner_id: string | null;
  is_npc: boolean;
}

interface Props {
  campaignId: string;
  currentMapId: string | null;
  onSelectMap: (mapId: string | null) => void;
  isGm: boolean;
  characters: CharacterOption[];
  myUserId: string | undefined;
}

const TYPE_LABEL: Record<TokenRow['token_type'], string> = {
  player: 'Jogador',
  npc: 'NPC',
  enemy: 'Inimigo',
  other: 'Outro',
};

export function MapBoard({ campaignId, currentMapId, onSelectMap, isGm, characters, myUserId }: Props) {
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenType, setNewTokenType] = useState<TokenRow['token_type']>('enemy');
  const [newTokenCharacterId, setNewTokenCharacterId] = useState('');

  const currentMap = maps.find((m) => m.id === currentMapId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadMaps() {
      const { data } = await supabase
        .from('maps')
        .select('id, campaign_id, name, image_path')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });
      if (!cancelled) setMaps((data ?? []) as unknown as MapRow[]);
    }

    loadMaps();

    const channel = supabase
      .channel(`maps-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maps', filter: `campaign_id=eq.${campaignId}` }, () =>
        loadMaps()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  useEffect(() => {
    if (!currentMapId) {
      setTokens([]);
      return;
    }
    let cancelled = false;

    async function loadTokens() {
      const { data } = await supabase
        .from('map_tokens')
        .select('id, map_id, campaign_id, character_id, label, token_type, color, pos_x, pos_y, visible_to_player')
        .eq('map_id', currentMapId!);
      if (!cancelled) setTokens((data ?? []) as unknown as TokenRow[]);
    }

    loadTokens();

    const channel = supabase
      .channel(`map-tokens-${currentMapId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_tokens', filter: `map_id=eq.${currentMapId}` },
        (payload) => {
          setTokens((prev) => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id: string }).id;
              return prev.filter((t) => t.id !== oldId);
            }
            const row = payload.new as unknown as TokenRow;
            const idx = prev.findIndex((t) => t.id === row.id);
            if (idx === -1) return [...prev, row];
            const copy = [...prev];
            copy[idx] = row;
            return copy;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentMapId]);

  function publicUrlFor(path: string) {
    return supabase.storage.from('maps').getPublicUrl(path).data.publicUrl;
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file || !uploadName.trim()) return;
    setUploading(true);
    setUploadError(null);

    const ext = file.name.split('.').pop() || 'png';
    const path = `${campaignId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('maps').upload(path, file);
    if (uploadErr) {
      setUploading(false);
      setUploadError(uploadErr.message);
      return;
    }

    const { data, error: insertErr } = await supabase
      .from('maps')
      .insert({ campaign_id: campaignId, name: uploadName.trim(), image_path: path })
      .select('id, campaign_id, name, image_path')
      .single();

    setUploading(false);
    if (insertErr) {
      setUploadError(insertErr.message);
      return;
    }

    setUploadName('');
    setShowUpload(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (data) {
      // Não espera o eco do Realtime pra mostrar o mapa recém-enviado —
      // adiciona na lista local na hora e já seleciona ele.
      setMaps((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as MapRow]));
      onSelectMap(data.id);
    }
  }

  async function handleAddToken(e: FormEvent) {
    e.preventDefault();
    if (!currentMapId || (!newTokenLabel.trim() && !newTokenCharacterId)) return;

    const linkedChar = characters.find((c) => c.id === newTokenCharacterId);
    const { data } = await supabase
      .from('map_tokens')
      .insert({
        map_id: currentMapId,
        campaign_id: campaignId,
        character_id: newTokenCharacterId || null,
        label: linkedChar ? linkedChar.name : newTokenLabel.trim(),
        token_type: newTokenType,
        pos_x: 50,
        pos_y: 50,
        visible_to_player: newTokenType !== 'enemy',
      })
      .select('id, map_id, campaign_id, character_id, label, token_type, color, pos_x, pos_y, visible_to_player')
      .single();

    if (data) setTokens((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data as TokenRow]));
    setNewTokenLabel('');
    setNewTokenCharacterId('');
  }

  async function handleMoveToken(id: string, pos_x: number, pos_y: number) {
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, pos_x, pos_y } : t)));
    await supabase.from('map_tokens').update({ pos_x, pos_y }).eq('id', id);
  }

  async function toggleTokenVisible(t: TokenRow) {
    setTokens((prev) => prev.map((x) => (x.id === t.id ? { ...x, visible_to_player: !x.visible_to_player } : x)));
    await supabase.from('map_tokens').update({ visible_to_player: !t.visible_to_player }).eq('id', t.id);
  }

  async function removeToken(id: string) {
    setTokens((prev) => prev.filter((t) => t.id !== id));
    await supabase.from('map_tokens').delete().eq('id', id);
  }

  function canMoveToken(t: TokenRow) {
    if (isGm) return true;
    if (!t.character_id) return false;
    const char = characters.find((c) => c.id === t.character_id);
    return !!char && char.owner_id === myUserId;
  }

  return (
    <div className="map-board-wrap">
      <div className="section-head-row">
        <h2>Mapa</h2>
        <div className="map-controls">
          {maps.length > 0 && (
            <select value={currentMapId ?? ''} onChange={(e) => onSelectMap(e.target.value || null)} disabled={!isGm}>
              <option value="">Nenhum mapa selecionado</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {isGm && (
            <button className="link-btn" onClick={() => setShowUpload((s) => !s)}>
              {showUpload ? 'Cancelar' : '+ Novo mapa'}
            </button>
          )}
        </div>
      </div>

      {isGm && showUpload && (
        <form onSubmit={handleUpload} className="reveal-form map-upload-form">
          <input placeholder="Nome do mapa" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
          <input ref={fileInputRef} type="file" accept="image/*" />
          {uploadError && <p className="auth-error">{uploadError}</p>}
          <button type="submit" disabled={uploading || !uploadName.trim()}>
            {uploading ? 'Enviando…' : 'Enviar mapa'}
          </button>
        </form>
      )}

      {!currentMap ? (
        <div className="empty-sheet-hint">
          <p className="muted">
            {maps.length === 0
              ? 'Nenhum mapa enviado ainda.'
              : 'Nenhum mapa selecionado no momento.'}
          </p>
        </div>
      ) : (
        <>
          <div className="map-image-board" ref={boardRef}>
            <img src={publicUrlFor(currentMap.image_path)} alt={currentMap.name} draggable={false} />
            {tokens
              .filter((t) => t.visible_to_player || isGm)
              .map((t) => (
                <MapToken
                  key={t.id}
                  token={t}
                  canMove={canMoveToken(t)}
                  isGm={isGm}
                  boardRef={boardRef}
                  onMove={handleMoveToken}
                />
              ))}
          </div>

          {isGm && (
            <div className="sheet-card map-token-manager">
              <strong className="sheet-card-title">Tokens neste mapa</strong>
              <form onSubmit={handleAddToken} className="reveal-form-row token-add-row">
                <select value={newTokenCharacterId} onChange={(e) => setNewTokenCharacterId(e.target.value)}>
                  <option value="">Token avulso (digite o nome)</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {!newTokenCharacterId && (
                  <input
                    placeholder="Nome do token"
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                  />
                )}
                <select value={newTokenType} onChange={(e) => setNewTokenType(e.target.value as TokenRow['token_type'])}>
                  <option value="player">Jogador</option>
                  <option value="npc">NPC</option>
                  <option value="enemy">Inimigo</option>
                  <option value="other">Outro</option>
                </select>
                <button type="submit" disabled={!newTokenCharacterId && !newTokenLabel.trim()}>
                  + Adicionar
                </button>
              </form>

              {tokens.length > 0 && (
                <ul className="reveal-list token-list">
                  {tokens.map((t) => (
                    <li key={t.id} className={t.visible_to_player ? '' : 'hidden-item'}>
                      <div className="reveal-item-main">
                        <div className="reveal-item-head">
                          <strong>{t.label}</strong>
                          <span className="tag">{TYPE_LABEL[t.token_type]}</span>
                          {!t.visible_to_player && <span className="tag hidden-tag">Oculto do jogador</span>}
                        </div>
                      </div>
                      <div className="reveal-item-actions">
                        <button className="link-btn" onClick={() => toggleTokenVisible(t)}>
                          {t.visible_to_player ? 'Ocultar' : 'Revelar'}
                        </button>
                        <button className="link-btn danger" onClick={() => removeToken(t.id)}>
                          Remover
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
