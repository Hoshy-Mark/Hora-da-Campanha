import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { debounce } from '../lib/debounce';
import { useToast } from '../context/ToastContext';
import { MapToken, type TokenRow } from './MapToken';
import { TileMapBoard } from './TileMapBoard';
import { emptyTileMap, TILE_COLOR, TILE_LABEL, TILE_TYPES, type TileMapData, type TileType } from '../types/tilemap';

interface MapRow {
  id: string;
  campaign_id: string;
  name: string;
  kind: 'image' | 'tilemap';
  image_path: string | null;
  tile_data: TileMapData | null;
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
  const { showToast } = useToast();
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [newMapKind, setNewMapKind] = useState<'image' | 'tilemap'>('image');
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tilemapCols, setTilemapCols] = useState(14);
  const [tilemapRows, setTilemapRows] = useState(10);
  const [tileTool, setTileTool] = useState<TileType>('wall');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenType, setNewTokenType] = useState<TokenRow['token_type']>('enemy');
  const [newTokenCharacterId, setNewTokenCharacterId] = useState('');

  // Enquanto uma pintura de tile ainda não foi persistida (debounce de
  // handleTileChange), o eco do Realtime pra esse mesmo mapa não pode
  // pisar em cima do tile_data local — senão um refetch que chega antes
  // do UPDATE local terminar de gravar reverte a pintura na tela (mesma
  // classe de bug do dirtyRef em CharacterSheet, aqui pro lado do mapa).
  const dirtyTileMapId = useRef<string | null>(null);

  const currentMap = maps.find((m) => m.id === currentMapId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadMaps() {
      const { data } = await supabase
        .from('maps')
        .select('id, campaign_id, name, kind, image_path, tile_data')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });
      if (!cancelled) setMaps((data ?? []) as unknown as MapRow[]);
    }

    loadMaps();

    const channel = supabase
      .channel(`maps-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maps', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          setMaps((prev) => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id: string }).id;
              return prev.filter((m) => m.id !== oldId);
            }
            const row = payload.new as unknown as MapRow;
            if (dirtyTileMapId.current === row.id) return prev;
            const idx = prev.findIndex((m) => m.id === row.id);
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
      .insert({ campaign_id: campaignId, name: uploadName.trim(), kind: 'image', image_path: path })
      .select('id, campaign_id, name, kind, image_path, tile_data')
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
      showToast('Mapa enviado!', 'success');
    }
  }

  async function handleCreateTilemap(e: FormEvent) {
    e.preventDefault();
    if (!uploadName.trim()) return;
    const cols = Math.max(4, Math.min(40, tilemapCols));
    const rows = Math.max(4, Math.min(40, tilemapRows));
    setUploading(true);
    setUploadError(null);

    const { data, error } = await supabase
      .from('maps')
      .insert({ campaign_id: campaignId, name: uploadName.trim(), kind: 'tilemap', tile_data: emptyTileMap(cols, rows) })
      .select('id, campaign_id, name, kind, image_path, tile_data')
      .single();

    setUploading(false);
    if (error) {
      setUploadError(error.message);
      return;
    }

    setUploadName('');
    setShowUpload(false);
    if (data) {
      setMaps((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as MapRow]));
      onSelectMap(data.id);
      showToast('Mapa de tiles criado!', 'success');
    }
  }

  const persistTiles = useRef(
    debounce(async (mapId: string, next: TileMapData) => {
      const { error } = await supabase.from('maps').update({ tile_data: next }).eq('id', mapId);
      if (dirtyTileMapId.current === mapId) dirtyTileMapId.current = null;
      if (error) showToast(error.message, 'error');
    }, 400)
  ).current;

  function handleTileChange(mapId: string, next: TileMapData) {
    dirtyTileMapId.current = mapId;
    setMaps((prev) => prev.map((m) => (m.id === mapId ? { ...m, tile_data: next } : m)));
    persistTiles(mapId, next);
  }

  async function handleAddToken(e: FormEvent) {
    e.preventDefault();
    if (!currentMapId || (!newTokenLabel.trim() && !newTokenCharacterId)) return;

    const linkedChar = characters.find((c) => c.id === newTokenCharacterId);
    const { data, error } = await supabase
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

    if (error) {
      showToast(error.message, 'error');
      return;
    }
    if (data) setTokens((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data as TokenRow]));
    setNewTokenLabel('');
    setNewTokenCharacterId('');
  }

  async function handleMoveToken(id: string, pos_x: number, pos_y: number) {
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, pos_x, pos_y } : t)));
    const { error } = await supabase.from('map_tokens').update({ pos_x, pos_y }).eq('id', id);
    if (error) showToast(error.message, 'error');
  }

  async function toggleTokenVisible(t: TokenRow) {
    setTokens((prev) => prev.map((x) => (x.id === t.id ? { ...x, visible_to_player: !x.visible_to_player } : x)));
    const { error } = await supabase
      .from('map_tokens')
      .update({ visible_to_player: !t.visible_to_player })
      .eq('id', t.id);
    if (error) showToast(error.message, 'error');
  }

  async function removeToken(id: string) {
    setTokens((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('map_tokens').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
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
        <div className="reveal-form map-upload-form">
          <div className="map-kind-tabs">
            <button type="button" className={newMapKind === 'image' ? 'active' : ''} onClick={() => setNewMapKind('image')}>
              Upload de imagem
            </button>
            <button type="button" className={newMapKind === 'tilemap' ? 'active' : ''} onClick={() => setNewMapKind('tilemap')}>
              Mapa de tiles
            </button>
          </div>

          {newMapKind === 'image' ? (
            <form onSubmit={handleUpload}>
              <input placeholder="Nome do mapa" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
              <input ref={fileInputRef} type="file" accept="image/*" />
              {uploadError && <p className="auth-error">{uploadError}</p>}
              <button type="submit" disabled={uploading || !uploadName.trim()}>
                {uploading ? 'Enviando…' : 'Enviar mapa'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateTilemap}>
              <input placeholder="Nome do mapa" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
              <div className="reveal-form-row">
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={tilemapCols}
                  onChange={(e) => setTilemapCols(Number(e.target.value))}
                  title="Colunas"
                />
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={tilemapRows}
                  onChange={(e) => setTilemapRows(Number(e.target.value))}
                  title="Linhas"
                />
              </div>
              <small className="muted">Colunas x linhas do grid (dá pra pintar depois de criar)</small>
              {uploadError && <p className="auth-error">{uploadError}</p>}
              <button type="submit" disabled={uploading || !uploadName.trim()}>
                {uploading ? 'Criando…' : 'Criar mapa de tiles'}
              </button>
            </form>
          )}
        </div>
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
          {isGm && currentMap.kind === 'tilemap' && (
            <div className="tile-palette">
              {TILE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`tile-palette-btn ${tileTool === t ? 'active' : ''}`}
                  onClick={() => setTileTool(t)}
                  title={TILE_LABEL[t]}
                >
                  <span className="tile-swatch" style={{ background: TILE_COLOR[t] }} />
                  {TILE_LABEL[t]}
                </button>
              ))}
            </div>
          )}

          <div className="map-image-board" ref={boardRef}>
            {currentMap.kind === 'tilemap' && currentMap.tile_data ? (
              <TileMapBoard
                data={currentMap.tile_data}
                editable={isGm}
                tool={tileTool}
                onChange={(next) => handleTileChange(currentMap.id, next)}
              />
            ) : (
              <img src={publicUrlFor(currentMap.image_path!)} alt={currentMap.name} draggable={false} />
            )}
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
