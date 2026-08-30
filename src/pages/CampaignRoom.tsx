import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { emptySheetData, type GameSystemSchema, type SheetData } from '../types/game-system';
import { CharacterCard } from '../components/CharacterCard';
import { CharacterSheet } from '../components/CharacterSheet';
import { MapBoard } from '../components/MapBoard';
import { CombatTracker } from '../components/CombatTracker';
import { GmNotes } from '../components/GmNotes';
import { DiceRoller } from '../components/DiceRoller';
import { useOnlineUserIds } from '../lib/usePresence';
import { useToast } from '../context/ToastContext';

interface Member {
  user_id: string;
  role: 'gm' | 'player';
  profiles: { display_name: string } | null;
}

interface CampaignInfo {
  id: string;
  name: string;
  invite_code: string;
  gm_id: string;
  game_system_id: string;
  current_map_id: string | null;
  game_systems: { name: string; schema: GameSystemSchema } | null;
}

interface CharacterRow {
  id: string;
  campaign_id: string;
  owner_id: string | null;
  name: string;
  sheet_data: SheetData;
  is_npc: boolean;
}

export function CampaignRoom() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'sheet' | 'map' | 'combat' | 'notes'>('sheet');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newCharName, setNewCharName] = useState('');
  const [newCharOwnerId, setNewCharOwnerId] = useState('');
  const [creating, setCreating] = useState(false);

  const myRole = members.find((m) => m.user_id === user?.id)?.role;
  const isGm = myRole === 'gm';
  const schema = campaign?.game_systems?.schema;
  const ownerNameByUserId = new Map(members.map((m) => [m.user_id, m.profiles?.display_name ?? '—']));
  const myDisplayName = members.find((m) => m.user_id === user?.id)?.profiles?.display_name;
  const onlineUserIds = useOnlineUserIds(campaignId, user?.id, myDisplayName);

  useEffect(() => {
    if (!campaignId) return;
    const cid = campaignId;
    let cancelled = false;

    async function loadCampaignAndMembers() {
      const [{ data: campaignData, error: campaignError }, { data: memberData, error: memberError }] =
        await Promise.all([
          supabase
            .from('campaigns')
            .select('id, name, invite_code, gm_id, game_system_id, current_map_id, game_systems(name, schema)')
            .eq('id', cid)
            .single(),
          supabase
            .from('campaign_members')
            .select('user_id, role, profiles(display_name)')
            .eq('campaign_id', cid),
        ]);

      if (cancelled) return;
      if (campaignError) setLoadError(campaignError.message);
      else setCampaign(campaignData as unknown as CampaignInfo);

      if (memberError) setLoadError(memberError.message);
      else setMembers((memberData ?? []) as unknown as Member[]);
    }

    async function loadCharacters() {
      const { data, error } = await supabase
        .from('characters')
        .select('id, campaign_id, owner_id, name, sheet_data, is_npc')
        .eq('campaign_id', cid)
        .order('created_at', { ascending: true });
      if (!cancelled && !error) setCharacters((data ?? []) as unknown as CharacterRow[]);
    }

    loadCampaignAndMembers();
    loadCharacters();

    const memberChannel = supabase
      .channel(`campaign-members-${cid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_members', filter: `campaign_id=eq.${cid}` },
        () => loadCampaignAndMembers()
      )
      .subscribe();

    // Quando o Mestre troca o mapa ativo, todo mundo na sessão precisa
    // ver a troca sem precisar recarregar a página.
    const campaignChannel = supabase
      .channel(`campaign-${cid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${cid}` },
        () => loadCampaignAndMembers()
      )
      .subscribe();

    // Sincronização ao vivo das fichas: qualquer INSERT/UPDATE/DELETE em
    // characters desta campanha (vindo do Mestre, de outro jogador, ou do
    // próprio ecoando de volta) atualiza a lista local na hora.
    const charChannel = supabase
      .channel(`characters-${cid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'characters', filter: `campaign_id=eq.${cid}` },
        (payload) => {
          setCharacters((prev) => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id: string }).id;
              return prev.filter((c) => c.id !== oldId);
            }
            const row = payload.new as unknown as CharacterRow;
            const idx = prev.findIndex((c) => c.id === row.id);
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
      supabase.removeChannel(memberChannel);
      supabase.removeChannel(campaignChannel);
      supabase.removeChannel(charChannel);
    };
  }, [campaignId]);

  async function handleSelectMap(mapId: string | null) {
    if (!campaignId) return;
    // Atualiza a tela na hora, sem esperar o round-trip do Realtime — quem
    // clicou não deveria depender de um evento voltando pelo servidor pra
    // ver o próprio clique surtir efeito. Os outros na mesa ainda recebem
    // a mudança via campaignChannel normalmente.
    setCampaign((prev) => (prev ? { ...prev, current_map_id: mapId } : prev));
    const { error } = await supabase.from('campaigns').update({ current_map_id: mapId }).eq('id', campaignId);
    if (error) showToast(error.message, 'error');
  }

  async function handleCreateCharacter(e: FormEvent) {
    e.preventDefault();
    if (!campaignId || !schema || !newCharName.trim()) return;
    setCreating(true);
    const ownerId = newCharOwnerId || null;
    const { data, error } = await supabase
      .from('characters')
      .insert({
        campaign_id: campaignId,
        owner_id: ownerId,
        name: newCharName.trim(),
        sheet_data: emptySheetData(schema),
        is_npc: !ownerId,
      })
      .select('id, campaign_id, owner_id, name, sheet_data, is_npc')
      .single();
    setCreating(false);
    if (error) showToast(error.message, 'error');
    else {
      if (data) setCharacters((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data as CharacterRow]));
      setNewCharName('');
      setNewCharOwnerId('');
      showToast('Personagem criado!', 'success');
    }
  }

  async function handleDeleteCharacter(id: string) {
    if (!confirm('Apagar esta ficha? Não tem como desfazer.')) return;
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    const { error } = await supabase.from('characters').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
  }

  async function handleRemoveMember(userId: string, name: string) {
    if (!campaignId) return;
    if (!confirm(`Remover ${name} da campanha? Ele(a) precisará de um novo convite pra voltar.`)) return;
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    const { error } = await supabase
      .from('campaign_members')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('user_id', userId);
    if (error) showToast(error.message, 'error');
    else showToast(`${name} foi removido(a) da mesa.`, 'success');
  }

  if (loadError) return <p className="auth-error">{loadError}</p>;
  if (!campaign) return <p className="muted">Carregando campanha…</p>;

  const selected = characters.find((c) => c.id === selectedId) ?? null;
  const playerMembers = members.filter((m) => m.role === 'player');

  return (
    <div className="campaign-room">
      <header className="room-header">
        <h1>{campaign.name}</h1>
        {campaign.game_systems && <span className="system-badge">{campaign.game_systems.name}</span>}
        {isGm && <span className="invite-hint">Convite: {campaign.invite_code}</span>}
      </header>

      <div className="room-layout">
        <div className="room-sidebar">
          <section>
            <h2>Na mesa</h2>
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.user_id}>
                  <span
                    className={`presence-dot ${onlineUserIds.has(m.user_id) ? 'online' : 'offline'}`}
                    title={onlineUserIds.has(m.user_id) ? 'Online agora' : 'Offline'}
                  />
                  <span className="member-name">{m.profiles?.display_name ?? '—'}</span>
                  <span className={`role-badge role-${m.role}`}>{m.role === 'gm' ? 'Mestre' : 'Jogador'}</span>
                  {isGm && m.user_id !== user?.id && (
                    <button
                      className="link-btn danger member-remove-btn"
                      onClick={() => handleRemoveMember(m.user_id, m.profiles?.display_name ?? 'esse jogador')}
                    >
                      Remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="section-head-row">
              <h2>Personagens</h2>
            </div>

            {isGm && schema && (
              <form onSubmit={handleCreateCharacter} className="create-character-form">
                <input
                  placeholder="Nome do personagem"
                  value={newCharName}
                  onChange={(e) => setNewCharName(e.target.value)}
                />
                <select value={newCharOwnerId} onChange={(e) => setNewCharOwnerId(e.target.value)}>
                  <option value="">NPC (controlado pelo Mestre)</option>
                  {playerMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.display_name ?? m.user_id}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={creating || !newCharName.trim()}>
                  + Criar personagem
                </button>
              </form>
            )}

            {characters.length === 0 ? (
              <p className="muted">Nenhum personagem ainda.</p>
            ) : (
              <div className="character-grid">
                {characters.map((c) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    schema={schema!}
                    ownerName={c.owner_id ? ownerNameByUserId.get(c.owner_id) ?? null : null}
                    selected={c.id === selectedId}
                    onSelect={() => {
                      setSelectedId(c.id === selectedId ? null : c.id);
                      setActiveView('sheet');
                    }}
                    onDelete={isGm ? () => handleDeleteCharacter(c.id) : undefined}
                  />
                ))}
              </div>
            )}
          </section>

          <DiceRoller campaignId={campaign.id} myUserId={user?.id} />
        </div>

        <div className="room-main">
          <div className="view-tabs">
            <button className={activeView === 'sheet' ? 'active' : ''} onClick={() => setActiveView('sheet')}>
              Ficha
            </button>
            <button className={activeView === 'map' ? 'active' : ''} onClick={() => setActiveView('map')}>
              Mapa
            </button>
            <button className={activeView === 'combat' ? 'active' : ''} onClick={() => setActiveView('combat')}>
              Combate
            </button>
            {isGm && (
              <button className={activeView === 'notes' ? 'active' : ''} onClick={() => setActiveView('notes')}>
                Notas do Mestre
              </button>
            )}
          </div>

          {activeView === 'notes' && isGm ? (
            <GmNotes campaignId={campaign.id} />
          ) : activeView === 'combat' ? (
            <CombatTracker
              campaignId={campaign.id}
              isGm={isGm}
              characters={characters.map((c) => ({ id: c.id, name: c.name }))}
              myUserId={user?.id}
            />
          ) : activeView === 'map' ? (
            <MapBoard
              campaignId={campaign.id}
              currentMapId={campaign.current_map_id}
              onSelectMap={handleSelectMap}
              isGm={isGm}
              characters={characters.map((c) => ({ id: c.id, name: c.name, owner_id: c.owner_id, is_npc: c.is_npc }))}
              myUserId={user?.id}
            />
          ) : selected && schema ? (
            <CharacterSheet
              character={selected}
              schema={schema}
              editable={isGm || selected.owner_id === user?.id}
              isGm={isGm}
            />
          ) : (
            <div className="empty-sheet-hint">
              <p className="muted">Selecione um personagem na lista para ver a ficha.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
