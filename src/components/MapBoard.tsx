import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { debounceWithMaxWait } from '../lib/debounce';
import { useToast } from '../context/ToastContext';
import { MapToken, type TokenRow } from './MapToken';
import { TileMapBoard } from './TileMapBoard';
import {
  AUTO_VISION_RADIUS,
  BUILTIN_TILE_CATEGORIES,
  BUILTIN_TILES,
  customTileKey,
  emptyFog,
  emptyTileMap,
  revealFogAroundPosition,
  type AoeShape,
  type CustomTileRow,
  type PaintTool,
  type TileMapData,
} from '../types/tilemap';
import { QUICK_STATUS_EFFECTS, descriptionForStatus, iconForStatus } from '../types/status-effects';
import { logActivity } from '../lib/activity';
import type { GameSystemSchema, SheetData } from '../types/game-system';
import { CombatantResources } from './CombatantResources';
import { CharacterSheet } from './CharacterSheet';
import { CombatTracker } from './CombatTracker';

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
  campaign_id: string;
  name: string;
  owner_id: string | null;
  is_npc: boolean;
  sheet_data: SheetData;
  avatar_path: string | null;
}

interface InitiativeEntryLite {
  id: string;
  character_id: string | null;
  label: string;
  initiative: number;
  is_current: boolean;
  is_defeated: boolean;
  visible_to_player: boolean;
}

interface Props {
  campaignId: string;
  currentMapId: string | null;
  onSelectMap: (mapId: string | null) => void;
  isGm: boolean;
  characters: CharacterOption[];
  schema: GameSystemSchema | undefined;
  gameSystemId: string;
  myUserId: string | undefined;
}

const TYPE_LABEL: Record<TokenRow['token_type'], string> = {
  player: 'Jogador',
  npc: 'NPC',
  enemy: 'Inimigo',
  other: 'Outro',
};

export function MapBoard({ campaignId, currentMapId, onSelectMap, isGm, characters, schema, gameSystemId, myUserId }: Props) {
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
  const [tileTool, setTileTool] = useState<string>('wall');
  const [tileMode, setTileMode] = useState<'terrain' | 'fog' | 'measure' | 'interact' | 'aoe'>('terrain');
  const [aoeShape, setAoeShape] = useState<AoeShape>('circle');
  const [fogBrush, setFogBrush] = useState(true);
  const [myCustomTiles, setMyCustomTiles] = useState<CustomTileRow[]>([]);
  const [mapCustomTiles, setMapCustomTiles] = useState<CustomTileRow[]>([]);
  const [showCustomTileForm, setShowCustomTileForm] = useState(false);
  const [customTileLabel, setCustomTileLabel] = useState('');
  const [customTileCategory, setCustomTileCategory] = useState('Meus tiles');
  const [customTileColor, setCustomTileColor] = useState('#4a4436');
  const [customTileInteractive, setCustomTileInteractive] = useState(false);
  const [customTileAltColor, setCustomTileAltColor] = useState('#c9a060');
  const [savingCustomTile, setSavingCustomTile] = useState(false);
  const customTileImageRef = useRef<HTMLInputElement>(null);
  const customTileAltImageRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenType, setNewTokenType] = useState<TokenRow['token_type']>('enemy');
  const [newTokenCharacterId, setNewTokenCharacterId] = useState('');
  const [newTokenVisionRadius, setNewTokenVisionRadius] = useState('');
  const newTokenAvatarRef = useRef<HTMLInputElement>(null);
  const [avatarUploadingId, setAvatarUploadingId] = useState<string | null>(null);
  const [statusEditorTokenId, setStatusEditorTokenId] = useState<string | null>(null);
  const [customStatus, setCustomStatus] = useState('');
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);
  const [openTokenPopoverId, setOpenTokenPopoverId] = useState<string | null>(null);
  // Ficha, Combate e Tokens dividem o mesmo painel flutuante (só um de
  // cada vez) — evita ter que calcular posições pra não sobrepor uns aos
  // outros quando o mapa não ocupa a tela inteira (ex: ao lado da barra
  // de personagens, num mapa pequeno sem muita altura).
  const [activeMapPanel, setActiveMapPanel] = useState<'sheet' | 'combat' | 'tokens' | null>(null);
  const [sheetPanelCharacterId, setSheetPanelCharacterId] = useState('');
  const [initiativeEntries, setInitiativeEntries] = useState<InitiativeEntryLite[]>([]);
  // Toda decisão de RENDERIZAÇÃO do mapa (o que fica visível, quem pode
  // arrastar token, quais controles de edição aparecem) usa isto em vez
  // do `isGm` cru — assim o Mestre pode pré-visualizar exatamente o que
  // o jogador vê sem trocar de conta. `isGm` puro só decide se o botão
  // de alternar o modo preview aparece.
  const effectiveIsGm = isGm && !previewAsPlayer;

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

  // Uma cópia leve, só-leitura na maior parte, da mesma tabela que o
  // CombatTracker gerencia por completo — dá pra ver a ordem de turnos
  // e destacar quem está jogando agora sem sair da aba Mapa. Os dois
  // componentes são independentes de propósito (mesmo padrão do resto
  // do app: cada aba busca sua própria fatia de dado).
  useEffect(() => {
    let cancelled = false;

    async function loadInitiative() {
      const { data } = await supabase
        .from('initiative_entries')
        .select('id, character_id, label, initiative, is_current, is_defeated, visible_to_player')
        .eq('campaign_id', campaignId)
        .order('initiative', { ascending: false })
        .order('created_at', { ascending: true });
      if (!cancelled) setInitiativeEntries((data ?? []) as unknown as InitiativeEntryLite[]);
    }

    loadInitiative();

    const channel = supabase
      .channel(`map-initiative-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'initiative_entries', filter: `campaign_id=eq.${campaignId}` },
        () => {
          if (!cancelled) loadInitiative();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  async function mapStartCombat() {
    const alive = initiativeEntries.filter((e) => !e.is_defeated);
    if (alive.length === 0) return;
    setInitiativeEntries((prev) => prev.map((e) => (e.id === alive[0].id ? { ...e, is_current: true } : e)));
    const { error } = await supabase.from('initiative_entries').update({ is_current: true }).eq('id', alive[0].id);
    if (error) showToast(error.message, 'error');
    else logActivity(campaignId, `O combate começou! Turno de ${alive[0].label}.`);
  }

  async function mapNextTurn() {
    const currentIdx = initiativeEntries.findIndex((e) => e.is_current);
    if (currentIdx === -1) return mapStartCombat();

    let nextIdx = (currentIdx + 1) % initiativeEntries.length;
    let hops = 0;
    while (initiativeEntries[nextIdx].is_defeated && hops < initiativeEntries.length) {
      nextIdx = (nextIdx + 1) % initiativeEntries.length;
      hops++;
    }

    const currentId = initiativeEntries[currentIdx].id;
    const nextId = initiativeEntries[nextIdx].id;
    // Checa nextId primeiro: com um só combatente, currentId === nextId,
    // e o resultado final (depois dos dois updates sequenciais no banco,
    // false e depois true) precisa continuar current — não sumir.
    setInitiativeEntries((prev) =>
      prev.map((e) => (e.id === nextId ? { ...e, is_current: true } : e.id === currentId ? { ...e, is_current: false } : e))
    );
    const { error: e1 } = await supabase.from('initiative_entries').update({ is_current: false }).eq('id', currentId);
    const { error: e2 } = await supabase.from('initiative_entries').update({ is_current: true }).eq('id', nextId);
    if (e1 || e2) showToast((e1 ?? e2)!.message, 'error');
    else logActivity(campaignId, `Agora é a vez de ${initiativeEntries[nextIdx].label}.`);
  }

  useEffect(() => {
    if (!currentMapId) {
      setTokens([]);
      return;
    }
    let cancelled = false;

    async function loadTokens() {
      const { data } = await supabase
        .from('map_tokens')
        .select('id, map_id, campaign_id, character_id, label, token_type, color, image_path, status_effects, pos_x, pos_y, visible_to_player, vision_radius')
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

  // A biblioteca completa de tiles customizados do Mestre (pra paleta e
  // pro painel de gerenciar) — só ele usa isto, então só busca quando
  // for o Mestre de verdade (não durante "ver como jogador").
  useEffect(() => {
    if (!isGm || !myUserId) {
      setMyCustomTiles([]);
      return;
    }
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('tile_definitions')
        .select('id, owner_id, label, category, color, image_path, interactive, alt_color, alt_image_path')
        .eq('owner_id', myUserId!)
        .order('label', { ascending: true });
      if (!cancelled) setMyCustomTiles((data ?? []) as unknown as CustomTileRow[]);
    }

    load();

    const channel = supabase
      .channel(`tile-definitions-${myUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tile_definitions', filter: `owner_id=eq.${myUserId}` },
        () => {
          if (!cancelled) load();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isGm, myUserId]);

  // Os tiles customizados de verdade usados no mapa atual — buscado à
  // parte de myCustomTiles porque QUALQUER pessoa vendo o mapa (Mestre
  // ou jogador) precisa resolver a cor/imagem de uma célula já pintada,
  // mesmo que não seja dono de nada.
  useEffect(() => {
    const ids = new Set<string>();
    for (const key of currentMap?.tile_data?.tiles ?? []) {
      if (key.startsWith('custom:')) ids.add(key.slice('custom:'.length));
    }
    if (ids.size === 0) {
      setMapCustomTiles([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('tile_definitions')
      .select('id, owner_id, label, category, color, image_path, interactive, alt_color, alt_image_path')
      .in('id', Array.from(ids))
      .then(({ data }) => {
        if (!cancelled) setMapCustomTiles((data ?? []) as unknown as CustomTileRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentMap?.tile_data?.tiles]);

  function publicUrlFor(path: string) {
    return supabase.storage.from('maps').getPublicUrl(path).data.publicUrl;
  }

  function publicTileUrlFor(path: string) {
    return supabase.storage.from('tiles').getPublicUrl(path).data.publicUrl;
  }

  // Merge dos dois: paleta de pintura mostra os do Mestre (myCustomTiles,
  // que cobre tudo que ele pode pintar, incluindo tiles ainda não usados
  // em lugar nenhum); a renderização do grid usa mapCustomTiles + os
  // dela mesma via resolveTile, então um tile que já está pintado
  // sempre resolve mesmo se quem olha não for o dono.
  const allKnownCustomTiles = (() => {
    const map = new Map<string, CustomTileRow>();
    for (const t of mapCustomTiles) map.set(t.id, t);
    for (const t of myCustomTiles) map.set(t.id, t);
    return Array.from(map.values());
  })();

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

  async function handleDeleteMap(map: MapRow) {
    if (!confirm(`Apagar o mapa "${map.name}"? Os tokens dele somem junto. Não tem como desfazer.`)) return;
    setMaps((prev) => prev.filter((m) => m.id !== map.id));
    if (currentMapId === map.id) onSelectMap(null);
    const { error } = await supabase.from('maps').delete().eq('id', map.id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    if (map.kind === 'image' && map.image_path) {
      await supabase.storage.from('maps').remove([map.image_path]);
    }
    showToast('Mapa apagado.', 'success');
  }

  const persistTiles = useRef(
    debounceWithMaxWait(async (mapId: string, next: TileMapData) => {
      const { error } = await supabase.from('maps').update({ tile_data: next }).eq('id', mapId);
      if (dirtyTileMapId.current === mapId) dirtyTileMapId.current = null;
      if (error) showToast(error.message, 'error');
    }, 400, 1500)
  ).current;

  function handleTileChange(mapId: string, next: TileMapData) {
    dirtyTileMapId.current = mapId;
    setMaps((prev) => prev.map((m) => (m.id === mapId ? { ...m, tile_data: next } : m)));
    persistTiles(mapId, next);
  }

  // Garante que uma pintura recém-feita não fique só na memória: troca de
  // mapa, saída da aba (MapBoard desmonta) ou fechar a aba força o save
  // pendente na hora em vez de confiar só no debounce (que sozinho podia
  // perder a última mudança se nenhum desses acontecesse antes do reload).
  useEffect(() => {
    return () => {
      persistTiles.flush();
    };
  }, [currentMapId, persistTiles]);

  useEffect(() => {
    window.addEventListener('beforeunload', persistTiles.flush);
    return () => window.removeEventListener('beforeunload', persistTiles.flush);
  }, [persistTiles]);

  function handleEnableFog() {
    if (!currentMap?.tile_data) return;
    const { cols, rows } = currentMap.tile_data;
    handleTileChange(currentMap.id, { ...currentMap.tile_data, fog: emptyFog(cols, rows, false) });
  }

  function handleDisableFog() {
    if (!currentMap?.tile_data) return;
    if (!confirm('Desativar a névoa de guerra apaga o que já foi revelado. Continuar?')) return;
    const { fog: _fog, ...rest } = currentMap.tile_data;
    handleTileChange(currentMap.id, rest);
  }

  function handleFogAll(reveal: boolean) {
    if (!currentMap?.tile_data?.fog) return;
    const { cols, rows } = currentMap.tile_data;
    handleTileChange(currentMap.id, { ...currentMap.tile_data, fog: emptyFog(cols, rows, reveal) });
  }

  const paintTool: PaintTool =
    tileMode === 'terrain'
      ? { mode: 'terrain', tile: tileTool }
      : tileMode === 'fog'
        ? { mode: 'fog', reveal: fogBrush }
        : tileMode === 'interact'
          ? { mode: 'interact' }
          : tileMode === 'aoe'
            ? { mode: 'aoe', shape: aoeShape }
            : { mode: 'measure' };

  async function handleCreateCustomTile(e: FormEvent) {
    e.preventDefault();
    if (!myUserId || !customTileLabel.trim()) return;
    setSavingCustomTile(true);

    async function uploadOne(file: File | undefined): Promise<string | null> {
      if (!file) return null;
      const ext = file.name.split('.').pop() || 'png';
      const path = `${myUserId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('tiles').upload(path, file);
      if (error) throw error;
      return path;
    }

    try {
      const imagePath = await uploadOne(customTileImageRef.current?.files?.[0]);
      const altImagePath = customTileInteractive ? await uploadOne(customTileAltImageRef.current?.files?.[0]) : null;

      const { data, error } = await supabase
        .from('tile_definitions')
        .insert({
          owner_id: myUserId,
          label: customTileLabel.trim(),
          category: customTileCategory.trim() || 'Meus tiles',
          color: imagePath ? null : customTileColor,
          image_path: imagePath,
          interactive: customTileInteractive,
          alt_color: customTileInteractive && !altImagePath ? customTileAltColor : null,
          alt_image_path: altImagePath,
        })
        .select('id, owner_id, label, category, color, image_path, interactive, alt_color, alt_image_path')
        .single();
      if (error) throw error;

      // Não espera o eco do Realtime — a paleta precisa mostrar o tile
      // recém-criado na hora, mesmo tratando-se de uma tela que o
      // Mestre acabou de abrir.
      if (data) setMyCustomTiles((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data as CustomTileRow]));
      showToast('Tile customizado criado!', 'success');
      setCustomTileLabel('');
      setCustomTileInteractive(false);
      if (customTileImageRef.current) customTileImageRef.current.value = '';
      if (customTileAltImageRef.current) customTileAltImageRef.current.value = '';
      setShowCustomTileForm(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao criar tile.', 'error');
    } finally {
      setSavingCustomTile(false);
    }
  }

  async function handleDeleteCustomTile(tile: CustomTileRow) {
    if (!confirm(`Apagar o tile "${tile.label}"? Células já pintadas com ele ficam sem imagem/cor.`)) return;
    setMyCustomTiles((prev) => prev.filter((t) => t.id !== tile.id));
    const { error } = await supabase.from('tile_definitions').delete().eq('id', tile.id);
    if (error) showToast(error.message, 'error');
  }

  async function uploadTokenAvatar(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'png';
    const path = `${campaignId}/tokens/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('maps').upload(path, file);
    if (error) {
      showToast(error.message, 'error');
      return null;
    }
    return path;
  }

  async function handleAddToken(e: FormEvent) {
    e.preventDefault();
    if (!currentMapId || (!newTokenLabel.trim() && !newTokenCharacterId)) return;

    const linkedChar = characters.find((c) => c.id === newTokenCharacterId);
    // Sem upload novo, reaproveita o avatar que o personagem já tem (se
    // tiver) em vez de obrigar o Mestre a subir a mesma imagem de novo.
    let imagePath: string | null = linkedChar?.avatar_path ?? null;
    const avatarFile = newTokenAvatarRef.current?.files?.[0];
    if (avatarFile) {
      imagePath = await uploadTokenAvatar(avatarFile);
      if (!imagePath) return;
    }

    const { data, error } = await supabase
      .from('map_tokens')
      .insert({
        map_id: currentMapId,
        campaign_id: campaignId,
        character_id: newTokenCharacterId || null,
        label: linkedChar ? linkedChar.name : newTokenLabel.trim(),
        token_type: newTokenType,
        image_path: imagePath,
        pos_x: 50,
        pos_y: 50,
        visible_to_player: newTokenType !== 'enemy',
        vision_radius: newTokenVisionRadius.trim() ? Number(newTokenVisionRadius) : null,
      })
      .select('id, map_id, campaign_id, character_id, label, token_type, color, image_path, status_effects, pos_x, pos_y, visible_to_player, vision_radius')
      .single();

    if (error) {
      showToast(error.message, 'error');
      return;
    }
    if (data) setTokens((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data as TokenRow]));
    setNewTokenLabel('');
    setNewTokenCharacterId('');
    setNewTokenVisionRadius('');
    if (newTokenAvatarRef.current) newTokenAvatarRef.current.value = '';
  }

  async function handleSetTokenAvatar(token: TokenRow, file: File) {
    setAvatarUploadingId(token.id);
    const path = await uploadTokenAvatar(file);
    if (!path) {
      setAvatarUploadingId(null);
      return;
    }
    setTokens((prev) => prev.map((t) => (t.id === token.id ? { ...t, image_path: path } : t)));
    const { error } = await supabase.from('map_tokens').update({ image_path: path }).eq('id', token.id);
    setAvatarUploadingId(null);
    if (error) showToast(error.message, 'error');
  }

  async function handleRemoveTokenAvatar(token: TokenRow) {
    setTokens((prev) => prev.map((t) => (t.id === token.id ? { ...t, image_path: null } : t)));
    const { error } = await supabase.from('map_tokens').update({ image_path: null }).eq('id', token.id);
    if (error) showToast(error.message, 'error');
  }

  async function handleMoveToken(id: string, pos_x: number, pos_y: number) {
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, pos_x, pos_y } : t)));
    const { error } = await supabase.from('map_tokens').update({ pos_x, pos_y }).eq('id', id);
    if (error) showToast(error.message, 'error');

    // Linha de visão: mover um token de jogador revela a névoa num raio ao
    // redor da nova posição, respeitando parede/porta fechada no caminho
    // (raycasting) — poupa o Mestre de ter que pintar manualmente célula
    // por célula conforme o grupo explora.
    const token = tokens.find((t) => t.id === id);
    if (token?.token_type === 'player' && currentMap?.kind === 'tilemap' && currentMap.tile_data) {
      const nextTileData = revealFogAroundPosition(
        currentMap.tile_data,
        pos_x,
        pos_y,
        mapCustomTiles,
        token.vision_radius ?? AUTO_VISION_RADIUS
      );
      if (nextTileData) handleTileChange(currentMap.id, nextTileData);
    }
  }

  async function toggleTokenVisible(t: TokenRow) {
    setTokens((prev) => prev.map((x) => (x.id === t.id ? { ...x, visible_to_player: !x.visible_to_player } : x)));
    const { error } = await supabase
      .from('map_tokens')
      .update({ visible_to_player: !t.visible_to_player })
      .eq('id', t.id);
    if (error) showToast(error.message, 'error');
  }

  async function handleSetTokenVisionRadius(t: TokenRow, raw: string) {
    const vision_radius = raw.trim() ? Number(raw) : null;
    setTokens((prev) => prev.map((x) => (x.id === t.id ? { ...x, vision_radius } : x)));
    const { error } = await supabase.from('map_tokens').update({ vision_radius }).eq('id', t.id);
    if (error) showToast(error.message, 'error');
  }

  async function removeToken(id: string) {
    setTokens((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('map_tokens').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
  }

  async function addTokenStatus(t: TokenRow, status: string) {
    if (!status.trim() || t.status_effects.includes(status)) return;
    const next = [...t.status_effects, status];
    setTokens((prev) => prev.map((x) => (x.id === t.id ? { ...x, status_effects: next } : x)));
    const { error } = await supabase.from('map_tokens').update({ status_effects: next }).eq('id', t.id);
    if (error) showToast(error.message, 'error');
  }

  async function removeTokenStatus(t: TokenRow, status: string) {
    const next = t.status_effects.filter((s) => s !== status);
    setTokens((prev) => prev.map((x) => (x.id === t.id ? { ...x, status_effects: next } : x)));
    const { error } = await supabase.from('map_tokens').update({ status_effects: next }).eq('id', t.id);
    if (error) showToast(error.message, 'error');
  }

  function canMoveToken(t: TokenRow) {
    if (effectiveIsGm) return true;
    if (!t.character_id) return false;
    const char = characters.find((c) => c.id === t.character_id);
    return !!char && char.owner_id === myUserId;
  }

  const visibleInitiative = initiativeEntries.filter((e) => e.visible_to_player || effectiveIsGm);
  const initiativeInCombat = initiativeEntries.some((e) => e.is_current);
  const currentTurnCharacterId = initiativeEntries.find((e) => e.is_current)?.character_id ?? null;
  const defeatedCharacterIds = new Set(
    initiativeEntries.filter((e) => e.is_defeated && e.character_id).map((e) => e.character_id as string)
  );
  const popoverToken = tokens.find((t) => t.id === openTokenPopoverId) ?? null;
  const popoverCharacter = popoverToken ? characters.find((c) => c.id === popoverToken.character_id) ?? null : null;

  // Painel de Ficha do mapa: Mestre escolhe entre todos os personagens da
  // campanha (jogadores + NPCs/inimigos), jogador só entre os seus
  // próprios (normalmente um só). Se a seleção guardada não existe mais
  // na lista disponível (ou nunca foi escolhida), cai pro primeiro —
  // assim o painel sempre abre com algo pra mostrar.
  const sheetSelectableCharacters = effectiveIsGm ? characters : characters.filter((c) => c.owner_id === myUserId);
  const activeSheetCharacterId = sheetSelectableCharacters.some((c) => c.id === sheetPanelCharacterId)
    ? sheetPanelCharacterId
    : (sheetSelectableCharacters[0]?.id ?? '');
  const sheetPanelCharacter = sheetSelectableCharacters.find((c) => c.id === activeSheetCharacterId) ?? null;

  function openSheetPanelFor(characterId: string) {
    setSheetPanelCharacterId(characterId);
    setActiveMapPanel('sheet');
    setOpenTokenPopoverId(null);
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
            <button
              className={`link-btn ${previewAsPlayer ? 'preview-active' : ''}`}
              onClick={() => setPreviewAsPlayer((s) => !s)}
            >
              {previewAsPlayer ? '◀ Voltar pra edição' : '👁 Ver como jogador'}
            </button>
          )}
          {effectiveIsGm && currentMap && (
            <button className="link-btn danger" onClick={() => handleDeleteMap(currentMap)}>
              Apagar mapa
            </button>
          )}
          {effectiveIsGm && (
            <button className="link-btn" onClick={() => setShowUpload((s) => !s)}>
              {showUpload ? 'Cancelar' : '+ Novo mapa'}
            </button>
          )}
          {currentMap && schema && sheetSelectableCharacters.length > 0 && (
            <button
              className="link-btn"
              onClick={() => setActiveMapPanel((p) => (p === 'sheet' ? null : 'sheet'))}
            >
              {activeMapPanel === 'sheet' ? 'Fechar ficha' : '📋 Ficha'}
            </button>
          )}
          {currentMap && schema && (
            <button
              className="link-btn"
              onClick={() => setActiveMapPanel((p) => (p === 'combat' ? null : 'combat'))}
            >
              {activeMapPanel === 'combat' ? 'Fechar combate' : '⚔ Combate'}
            </button>
          )}
          {effectiveIsGm && currentMap && (
            <button
              className="link-btn"
              onClick={() => setActiveMapPanel((p) => (p === 'tokens' ? null : 'tokens'))}
            >
              {activeMapPanel === 'tokens' ? 'Fechar tokens' : '🎭 Tokens'}
            </button>
          )}
        </div>
      </div>

      {previewAsPlayer && (
        <p className="muted preview-banner">
          👁 Vendo o mapa exatamente como um jogador vê — névoa oculta e tokens ocultos não aparecem aqui.
        </p>
      )}

      {effectiveIsGm && showUpload && (
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
          {effectiveIsGm && currentMap.kind === 'tilemap' && (
            <>
              <div className="map-kind-tabs">
                <button type="button" className={tileMode === 'terrain' ? 'active' : ''} onClick={() => setTileMode('terrain')}>
                  Terreno
                </button>
                <button type="button" className={tileMode === 'fog' ? 'active' : ''} onClick={() => setTileMode('fog')}>
                  Névoa de guerra
                </button>
                <button type="button" className={tileMode === 'interact' ? 'active' : ''} onClick={() => setTileMode('interact')}>
                  Interagir
                </button>
                <button type="button" className={tileMode === 'measure' ? 'active' : ''} onClick={() => setTileMode('measure')}>
                  Medir
                </button>
                <button type="button" className={tileMode === 'aoe' ? 'active' : ''} onClick={() => setTileMode('aoe')}>
                  Área
                </button>
              </div>

              {tileMode === 'terrain' ? (
                <div className="tile-palette-groups">
                  {BUILTIN_TILE_CATEGORIES.map((cat) => (
                    <div key={cat} className="tile-palette-group">
                      <span className="tile-palette-group-label">{cat}</span>
                      <div className="tile-palette">
                        {BUILTIN_TILES.filter((t) => t.category === cat).map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            className={`tile-palette-btn ${tileTool === t.key ? 'active' : ''}`}
                            onClick={() => setTileTool(t.key)}
                            title={t.label}
                          >
                            <span className="tile-swatch" style={{ background: t.color }} />
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {myCustomTiles.length > 0 && (
                    <div className="tile-palette-group">
                      <span className="tile-palette-group-label">Meus tiles</span>
                      <div className="tile-palette">
                        {myCustomTiles.map((t) => {
                          const key = customTileKey(t.id);
                          const url = t.image_path ? publicTileUrlFor(t.image_path) : null;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              className={`tile-palette-btn ${tileTool === key ? 'active' : ''}`}
                              onClick={() => setTileTool(key)}
                              title={t.label}
                            >
                              <span
                                className="tile-swatch"
                                style={
                                  url
                                    ? { backgroundImage: `url(${url})`, backgroundSize: 'cover' }
                                    : { background: t.color ?? '#888' }
                                }
                              />
                              {t.label}
                              {t.interactive && ' 🔀'}
                              <span
                                role="button"
                                tabIndex={0}
                                className="tile-palette-btn-delete"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleDeleteCustomTile(t);
                                }}
                                title="Apagar este tile"
                              >
                                ×
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="tile-palette-group">
                    <button type="button" className="link-btn" onClick={() => setShowCustomTileForm((s) => !s)}>
                      {showCustomTileForm ? 'Cancelar' : '+ Tile customizado'}
                    </button>
                    {showCustomTileForm && (
                      <form onSubmit={handleCreateCustomTile} className="reveal-form custom-tile-form">
                        <div className="reveal-form-row">
                          <input
                            placeholder="Nome (ex: Grama Alta)"
                            value={customTileLabel}
                            onChange={(e) => setCustomTileLabel(e.target.value)}
                          />
                          <input
                            placeholder="Categoria (ex: Chão)"
                            value={customTileCategory}
                            onChange={(e) => setCustomTileCategory(e.target.value)}
                          />
                        </div>
                        <label>
                          Imagem (opcional — sem imagem usa a cor abaixo)
                          <input ref={customTileImageRef} type="file" accept="image/*" />
                        </label>
                        <label className="custom-tile-color-row">
                          Cor de fallback
                          <input
                            type="color"
                            value={customTileColor}
                            onChange={(e) => setCustomTileColor(e.target.value)}
                          />
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={customTileInteractive}
                            onChange={(e) => setCustomTileInteractive(e.target.checked)}
                          />
                          Interativo (tem um segundo estado, tipo porta aberta/fechada)
                        </label>
                        {customTileInteractive && (
                          <>
                            <label>
                              Imagem do estado alternado (opcional)
                              <input ref={customTileAltImageRef} type="file" accept="image/*" />
                            </label>
                            <label className="custom-tile-color-row">
                              Cor do estado alternado
                              <input
                                type="color"
                                value={customTileAltColor}
                                onChange={(e) => setCustomTileAltColor(e.target.value)}
                              />
                            </label>
                          </>
                        )}
                        <button type="submit" disabled={savingCustomTile || !customTileLabel.trim()}>
                          {savingCustomTile ? 'Salvando…' : 'Criar tile'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ) : tileMode === 'interact' ? (
                <div className="tile-palette">
                  <p className="muted" style={{ margin: 0 }}>
                    Clique numa célula com tile interativo (🔀) pra alternar o estado dela — ex: abrir/fechar uma
                    porta. Jogadores também podem clicar direto nessas células, mesmo fora deste modo.
                  </p>
                </div>
              ) : tileMode === 'measure' ? (
                <div className="tile-palette">
                  <p className="muted" style={{ margin: 0 }}>
                    Clique e arraste entre duas células pra medir a distância (conta diagonal como 1 célula).
                  </p>
                </div>
              ) : tileMode === 'aoe' ? (
                <div className="tile-palette">
                  <button
                    type="button"
                    className={`tile-palette-btn ${aoeShape === 'circle' ? 'active' : ''}`}
                    onClick={() => setAoeShape('circle')}
                  >
                    Círculo
                  </button>
                  <button
                    type="button"
                    className={`tile-palette-btn ${aoeShape === 'cone' ? 'active' : ''}`}
                    onClick={() => setAoeShape('cone')}
                  >
                    Cone
                  </button>
                  <button
                    type="button"
                    className={`tile-palette-btn ${aoeShape === 'line' ? 'active' : ''}`}
                    onClick={() => setAoeShape('line')}
                  >
                    Linha
                  </button>
                  <p className="muted" style={{ margin: 0, flexBasis: '100%' }}>
                    Clique na origem e arraste — alcance e direção vêm do arrasto, igual ao Medir. É só visual, não
                    grava nada no mapa.
                  </p>
                </div>
              ) : !currentMap.tile_data?.fog ? (
                <div className="tile-palette">
                  <p className="muted" style={{ margin: 0, flexBasis: '100%' }}>
                    Névoa desligada — o mapa está visível por inteiro pros jogadores.
                  </p>
                  <button type="button" onClick={handleEnableFog}>
                    Ativar névoa (esconde tudo)
                  </button>
                </div>
              ) : (
                <div className="tile-palette">
                  <button
                    type="button"
                    className={`tile-palette-btn ${fogBrush ? 'active' : ''}`}
                    onClick={() => setFogBrush(true)}
                  >
                    Revelar
                  </button>
                  <button
                    type="button"
                    className={`tile-palette-btn ${!fogBrush ? 'active' : ''}`}
                    onClick={() => setFogBrush(false)}
                  >
                    Ocultar
                  </button>
                  <button type="button" className="link-btn" onClick={() => handleFogAll(true)}>
                    Revelar tudo
                  </button>
                  <button type="button" className="link-btn" onClick={() => handleFogAll(false)}>
                    Ocultar tudo
                  </button>
                  <button type="button" className="link-btn danger" onClick={handleDisableFog}>
                    Desativar névoa
                  </button>
                  <p className="muted" style={{ margin: 0, flexBasis: '100%' }}>
                    Mover um token de jogador revela a névoa automaticamente ao redor dele, respeitando parede e
                    porta fechada no caminho (não atravessa). Use o pincel acima só pra revelar áreas que os
                    personagens ainda não visitaram (ex: o que se vê de longe).
                  </p>
                </div>
              )}
            </>
          )}

          <div className="map-stage">
            {visibleInitiative.length > 0 && (
              <div className="map-initiative-strip">
                <span className="map-initiative-strip-label">Iniciativa</span>
                {visibleInitiative.map((e) => (
                  <span
                    key={e.id}
                    className={`map-initiative-pill ${e.is_current ? 'current' : ''} ${e.is_defeated ? 'defeated' : ''}`}
                  >
                    {e.label}
                  </span>
                ))}
                {effectiveIsGm && (
                  <span className="map-initiative-strip-actions">
                    {!initiativeInCombat ? (
                      <button className="link-btn" onClick={mapStartCombat}>
                        Iniciar
                      </button>
                    ) : (
                      <button className="link-btn" onClick={mapNextTurn}>
                        Próximo →
                      </button>
                    )}
                  </span>
                )}
              </div>
            )}

            <div className="map-image-board" ref={boardRef}>
              {currentMap.kind === 'tilemap' && currentMap.tile_data ? (
                <TileMapBoard
                  data={currentMap.tile_data}
                  editable={effectiveIsGm}
                  tool={paintTool}
                  customTiles={allKnownCustomTiles}
                  resolveUrl={publicTileUrlFor}
                  onChange={(next) => handleTileChange(currentMap.id, next)}
                />
              ) : (
                <img src={publicUrlFor(currentMap.image_path!)} alt={currentMap.name} draggable={false} />
              )}
              {tokens
                .filter((t) => t.visible_to_player || effectiveIsGm)
                .map((t) => (
                  <MapToken
                    key={t.id}
                    token={t}
                    canMove={canMoveToken(t)}
                    isGm={effectiveIsGm}
                    isCurrentTurn={!!t.character_id && t.character_id === currentTurnCharacterId}
                    isDefeated={!!t.character_id && defeatedCharacterIds.has(t.character_id)}
                    boardRef={boardRef}
                    gridSnap={
                      currentMap.kind === 'tilemap' && currentMap.tile_data
                        ? { cols: currentMap.tile_data.cols, rows: currentMap.tile_data.rows }
                        : null
                    }
                    avatarUrl={t.image_path ? publicUrlFor(t.image_path) : null}
                    onMove={handleMoveToken}
                    onOpenInfo={(id) => setOpenTokenPopoverId((cur) => (cur === id ? null : id))}
                  />
                ))}
            </div>

            {popoverToken && (
              <div className="map-token-popover">
                <div className="section-head-row">
                  <strong>{popoverToken.label}</strong>
                  <button className="link-btn" onClick={() => setOpenTokenPopoverId(null)}>
                    Fechar
                  </button>
                </div>

                {popoverCharacter && schema && (
                  <>
                    <CombatantResources
                      character={popoverCharacter}
                      schema={schema}
                      editable={effectiveIsGm || popoverCharacter.owner_id === myUserId}
                    />
                    {(effectiveIsGm || popoverCharacter.owner_id === myUserId) && (
                      <button className="link-btn" onClick={() => openSheetPanelFor(popoverCharacter.id)}>
                        Ver ficha completa
                      </button>
                    )}
                  </>
                )}

                {(popoverToken.status_effects.length > 0 || effectiveIsGm) && (
                  <div className="map-token-popover-statuses">
                    {popoverToken.status_effects.map((s) => (
                      <span key={s} className="tag status-tag" title={descriptionForStatus(s)}>
                        {iconForStatus(s)} {s}
                        {effectiveIsGm && (
                          <button
                            type="button"
                            className="status-tag-remove"
                            onClick={() => removeTokenStatus(popoverToken, s)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {effectiveIsGm && (
                  <div className="status-editor">
                    {QUICK_STATUS_EFFECTS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        className="tile-palette-btn"
                        title={s.description}
                        disabled={popoverToken.status_effects.includes(s.key)}
                        onClick={() => addTokenStatus(popoverToken, s.key)}
                      >
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {effectiveIsGm && activeMapPanel === 'tokens' && (
                  <div className="sheet-card map-token-manager map-floating-panel map-panel-bl-panel">
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
                      {newTokenType === 'player' && (
                        <input
                          type="number"
                          className="qty-input"
                          min={0}
                          placeholder={`Visão (padrão ${AUTO_VISION_RADIUS})`}
                          title="Raio de visão (células) — em branco usa o padrão"
                          value={newTokenVisionRadius}
                          onChange={(e) => setNewTokenVisionRadius(e.target.value)}
                        />
                      )}
                      <input
                        ref={newTokenAvatarRef}
                        type="file"
                        accept="image/*"
                        title="Avatar (opcional)"
                        className="token-avatar-input"
                      />
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
                                {t.status_effects.map((s) => (
                                  <span key={s} className="tag status-tag" title={descriptionForStatus(s)}>
                                    {iconForStatus(s)} {s}
                                    <button
                                      type="button"
                                      className="status-tag-remove"
                                      onClick={() => removeTokenStatus(t, s)}
                                      title="Remover condição"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                              {t.token_type === 'player' && (
                                <label className="token-vision-radius">
                                  Visão:
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder={String(AUTO_VISION_RADIUS)}
                                    title="Raio de visão (células) — em branco usa o padrão"
                                    value={t.vision_radius ?? ''}
                                    onChange={(e) => handleSetTokenVisionRadius(t, e.target.value)}
                                  />
                                </label>
                              )}
                              {statusEditorTokenId === t.id && (
                                <div className="status-editor">
                                  {QUICK_STATUS_EFFECTS.map((s) => (
                                    <button
                                      key={s.key}
                                      type="button"
                                      className="tile-palette-btn"
                                      title={s.description}
                                      disabled={t.status_effects.includes(s.key)}
                                      onClick={() => addTokenStatus(t, s.key)}
                                    >
                                      {s.icon} {s.label}
                                    </button>
                                  ))}
                                  <div className="reveal-form-row">
                                    <input
                                      placeholder="Condição customizada"
                                      value={customStatus}
                                      onChange={(e) => setCustomStatus(e.target.value)}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        addTokenStatus(t, customStatus.trim());
                                        setCustomStatus('');
                                      }}
                                      disabled={!customStatus.trim()}
                                    >
                                      Adicionar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="reveal-item-actions">
                              <button
                                className="link-btn"
                                onClick={() => setStatusEditorTokenId(statusEditorTokenId === t.id ? null : t.id)}
                              >
                                {statusEditorTokenId === t.id ? 'Fechar status' : '+ Status'}
                              </button>
                              <label className="link-btn token-avatar-swap">
                                {avatarUploadingId === t.id ? 'Enviando…' : t.image_path ? 'Trocar imagem' : 'Imagem'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={avatarUploadingId === t.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleSetTokenAvatar(t, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {t.image_path && (
                                <button className="link-btn" onClick={() => handleRemoveTokenAvatar(t)}>
                                  Remover imagem
                                </button>
                              )}
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

            {schema && sheetSelectableCharacters.length > 0 && activeMapPanel === 'sheet' && (
              <div className="sheet-card map-floating-panel map-panel-bl-panel">
                <div className="section-head-row">
                  <strong className="sheet-card-title" style={{ margin: 0 }}>
                    Ficha
                  </strong>
                  {sheetSelectableCharacters.length > 1 && (
                    <select value={activeSheetCharacterId} onChange={(e) => setSheetPanelCharacterId(e.target.value)}>
                      {effectiveIsGm && (
                        <>
                          <optgroup label="Jogadores">
                            {sheetSelectableCharacters
                              .filter((c) => !c.is_npc)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="NPCs / Inimigos">
                            {sheetSelectableCharacters
                              .filter((c) => c.is_npc)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </optgroup>
                        </>
                      )}
                      {!effectiveIsGm &&
                        sheetSelectableCharacters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
                {sheetPanelCharacter && (
                  <CharacterSheet
                    character={sheetPanelCharacter}
                    schema={schema}
                    gameSystemId={gameSystemId}
                    editable={effectiveIsGm || sheetPanelCharacter.owner_id === myUserId}
                    isGm={effectiveIsGm}
                    myUserId={myUserId}
                  />
                )}
              </div>
            )}

            {schema && activeMapPanel === 'combat' && (
              <div className="sheet-card map-floating-panel map-panel-bl-panel">
                <strong className="sheet-card-title">Combate</strong>
                <CombatTracker campaignId={campaignId} isGm={effectiveIsGm} characters={characters} schema={schema} myUserId={myUserId} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
