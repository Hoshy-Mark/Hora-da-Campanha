import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { emptySheetData, type GameSystemSchema, type SheetData } from '../types/game-system';
import type { TemplateAbility, TemplateItem } from '../types/monster-template';
import { CharacterCard } from '../components/CharacterCard';
import { CharacterSheet } from '../components/CharacterSheet';
import { MapBoard } from '../components/MapBoard';
import { CombatTracker } from '../components/CombatTracker';
import { GmNotes } from '../components/GmNotes';
import { Handouts } from '../components/Handouts';
import { DiceRoller } from '../components/DiceRoller';
import { ActivityFeed } from '../components/ActivityFeed';
import { logActivity } from '../lib/activity';
import { useOnlineUserIds } from '../lib/usePresence';
import { useToast } from '../context/ToastContext';
import { downloadJson } from '../lib/download';

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
  avatar_path: string | null;
}

interface MonsterTemplateRow {
  id: string;
  name: string;
  is_boss: boolean;
  sheet_data: SheetData;
  abilities: TemplateAbility[];
  items: TemplateItem[];
}

export function CampaignRoom() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'sheet' | 'map' | 'combat' | 'handouts' | 'notes'>('map');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newCharName, setNewCharName] = useState('');
  const [newCharOwnerId, setNewCharOwnerId] = useState('');
  const [creating, setCreating] = useState(false);

  const [templates, setTemplates] = useState<MonsterTemplateRow[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [templateQty, setTemplateQty] = useState(1);
  const [instantiating, setInstantiating] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);

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
        .select('id, campaign_id, owner_id, name, sheet_data, is_npc, avatar_path')
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

  useEffect(() => {
    if (!isGm || !user || !campaign?.game_system_id) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('monster_templates')
      .select('id, name, is_boss, sheet_data, abilities, items')
      .eq('owner_id', user.id)
      .eq('game_system_id', campaign.game_system_id)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setTemplates((data ?? []) as unknown as MonsterTemplateRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [isGm, user, campaign?.game_system_id]);

  // Avisa o jogador quando algo vira visível pra ele enquanto está numa
  // aba diferente (ex: olhando o Mapa quando o Mestre revela um item na
  // Ficha) — sem isto a revelação passa em branco até ele voltar pra lá
  // por conta própria. Fica em CampaignRoom (sempre montado, não importa
  // a aba ativa) de propósito — AbilityList/ItemList/Handouts só existem
  // enquanto a aba deles está aberta, tarde demais pra notar a mudança.
  // Não usa o `old` do payload (Realtime só manda a chave primária ali
  // por padrão) — compara contra o que já sabíamos localmente.
  useEffect(() => {
    if (!campaignId || isGm) return;
    let cancelled = false;
    const tracked = new Map<string, boolean>();

    const watchers: { table: string; nameField: string; kind: string }[] = [
      { table: 'character_abilities', nameField: 'name', kind: 'Habilidade' },
      { table: 'inventory_items', nameField: 'name', kind: 'Item' },
      { table: 'handouts', nameField: 'title', kind: 'Handout' },
      { table: 'map_tokens', nameField: 'label', kind: 'Algo' },
      { table: 'initiative_entries', nameField: 'label', kind: 'Combatente' },
    ];

    const channels = watchers.map(({ table, nameField, kind }) => {
      supabase
        .from(table)
        .select('id, visible_to_player')
        .eq('campaign_id', campaignId)
        .then(({ data }) => {
          if (cancelled || !data) return;
          for (const row of data as unknown as { id: string; visible_to_player: boolean }[]) {
            tracked.set(`${table}:${row.id}`, row.visible_to_player);
          }
        });

      return supabase
        .channel(`reveal-watch-${table}-${campaignId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `campaign_id=eq.${campaignId}` },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              tracked.delete(`${table}:${(payload.old as { id: string }).id}`);
              return;
            }
            const row = payload.new as Record<string, unknown>;
            const key = `${table}:${row.id}`;
            const wasVisible = tracked.get(key);
            const isVisible = row.visible_to_player === true;
            tracked.set(key, isVisible);
            // O Realtime aplica RLS por assinante: enquanto a linha está
            // oculta, o jogador nunca recebe evento nenhum dela (nem o
            // INSERT) — então na hora que ela vira visível, chega aqui
            // sem nenhum estado anterior conhecido (`wasVisible` fica
            // undefined, nunca `false`). Tratar "não sabia antes" e
            // "sabia que estava oculto" como a mesma coisa é o correto:
            // pra um jogador, qualquer uma das duas só pode significar
            // "isso acabou de ficar visível".
            if (isVisible && wasVisible !== true) {
              const name = row[nameField] as string | undefined;
              showToast(`🔔 Revelado: ${name ?? '—'} (${kind})`, 'success');
            }
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [campaignId, isGm]);

  async function handleInstantiateTemplate() {
    if (!campaignId || !templateId) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const quantity = Math.max(1, Math.min(20, templateQty));
    setInstantiating(true);

    const created: CharacterRow[] = [];
    for (let i = 0; i < quantity; i++) {
      const name = quantity > 1 ? `${template.name} ${i + 1}` : template.name;
      const { data: character, error } = await supabase
        .from('characters')
        .insert({
          campaign_id: campaignId,
          owner_id: null,
          name,
          sheet_data: template.sheet_data,
          is_npc: true,
        })
        .select('id, campaign_id, owner_id, name, sheet_data, is_npc, avatar_path')
        .single();

      if (error || !character) {
        showToast(error?.message ?? 'Erro ao instanciar molde.', 'error');
        continue;
      }

      created.push(character as CharacterRow);

      if (template.abilities.length > 0) {
        await supabase.from('character_abilities').insert(
          template.abilities.map((a) => ({
            character_id: character.id,
            campaign_id: campaignId,
            name: a.name,
            category: a.category ?? null,
            cost: a.cost ?? null,
            tier: a.tier ?? null,
            description: a.description ?? null,
            visible_to_player: false,
          }))
        );
      }

      if (template.items.length > 0) {
        await supabase.from('inventory_items').insert(
          template.items.map((it) => ({
            campaign_id: campaignId,
            character_id: character.id,
            name: it.name,
            description: it.description ?? null,
            quantity: it.quantity ?? 1,
            visible_to_player: false,
          }))
        );
      }
    }

    if (created.length > 0) {
      setCharacters((prev) => [...prev, ...created.filter((c) => !prev.some((p) => p.id === c.id))]);
      logActivity(
        campaignId,
        quantity > 1 ? `${quantity}x ${template.name} entraram na mesa.` : `${template.name} entrou na mesa.`
      );
    }

    setInstantiating(false);
    setTemplateId('');
    setTemplateQty(1);
    if (created.length > 0) showToast(`${created.length}x ${template.name} instanciado(s) do molde!`, 'success');
  }

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
    // Mestre escolhe o dono (ou deixa NPC); jogador só cria pra si mesmo.
    const ownerId = isGm ? newCharOwnerId || null : user!.id;
    const { data, error } = await supabase
      .from('characters')
      .insert({
        campaign_id: campaignId,
        owner_id: ownerId,
        name: newCharName.trim(),
        sheet_data: emptySheetData(schema),
        is_npc: isGm && !ownerId,
      })
      .select('id, campaign_id, owner_id, name, sheet_data, is_npc, avatar_path')
      .single();
    setCreating(false);
    if (error) showToast(error.message, 'error');
    else {
      if (data) setCharacters((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data as CharacterRow]));
      setNewCharName('');
      setNewCharOwnerId('');
      showToast('Personagem criado!', 'success');
      logActivity(campaignId, `${newCharName.trim()} entrou na mesa.`);
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

  // Backup somente-leitura da campanha inteira, pra download local — sem
  // fluxo de "restaurar" simétrico, porque isso exigiria remapear IDs e
  // reenviar assets de imagem pro Storage (mapas-imagem só levam
  // nome/metadados aqui, sem os bytes da imagem).
  async function handleExportBackup() {
    if (!campaignId || !campaign) return;
    setExportingBackup(true);

    const [
      { data: abilitiesData },
      { data: itemsData },
      { data: secretsData },
      { data: mapsData },
      { data: notesData },
      { data: handoutsData },
    ] = await Promise.all([
      supabase
        .from('character_abilities')
        .select('character_id, name, category, cost, tier, description')
        .eq('campaign_id', campaignId),
      supabase
        .from('inventory_items')
        .select('character_id, name, description, quantity')
        .eq('campaign_id', campaignId),
      supabase.from('character_secrets').select('character_id, title, content').eq('campaign_id', campaignId),
      supabase.from('maps').select('name, kind, tile_data').eq('campaign_id', campaignId),
      supabase.from('gm_notes').select('title, content').eq('campaign_id', campaignId),
      supabase.from('handouts').select('title, content').eq('campaign_id', campaignId),
    ]);

    type Linked<T> = T & { character_id: string | null };
    const abilities = (abilitiesData ?? []) as unknown as Linked<{
      name: string;
      category: string | null;
      cost: string | null;
      tier: string | null;
      description: string | null;
    }>[];
    const items = (itemsData ?? []) as unknown as Linked<{
      name: string;
      description: string | null;
      quantity: number;
    }>[];
    const secrets = (secretsData ?? []) as unknown as Linked<{ title: string; content: string }>[];

    const backup = {
      name: campaign.name,
      exportedAt: new Date().toISOString(),
      gameSystem: campaign.game_systems
        ? { name: campaign.game_systems.name, schema: campaign.game_systems.schema }
        : null,
      characters: characters.map((c) => ({
        name: c.name,
        isNpc: c.is_npc,
        sheetData: c.sheet_data,
        abilities: abilities.filter((a) => a.character_id === c.id),
        items: items.filter((it) => it.character_id === c.id),
        secrets: secrets.filter((s) => s.character_id === c.id),
      })),
      maps: ((mapsData ?? []) as unknown as { name: string; kind: string; tile_data: unknown }[]).map((m) => ({
        name: m.name,
        kind: m.kind,
        tileData: m.kind === 'tilemap' ? m.tile_data : undefined,
      })),
      gmNotes: notesData ?? [],
      handouts: handoutsData ?? [],
    };

    setExportingBackup(false);
    downloadJson(`${campaign.name}.backup.json`, backup);
    showToast('Backup gerado (só leitura — não há como reimportar uma campanha inteira).', 'success');
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
        {isGm && (
          <button
            className="link-btn"
            disabled={exportingBackup}
            onClick={handleExportBackup}
            title="Backup somente-leitura: personagens, fichas, mapas, notas e handouts. Não existe importar de volta."
          >
            {exportingBackup ? 'Gerando…' : 'Baixar backup (JSON)'}
          </button>
        )}
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

            {!isGm && schema && (
              <form onSubmit={handleCreateCharacter} className="create-character-form">
                <input
                  placeholder="Nome do seu personagem"
                  value={newCharName}
                  onChange={(e) => setNewCharName(e.target.value)}
                />
                <button type="submit" disabled={creating || !newCharName.trim()}>
                  + Criar meu personagem
                </button>
              </form>
            )}

            {isGm && templates.length > 0 && (
              <div className="create-character-form instantiate-template-form">
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Instanciar do Bestiário…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.is_boss ? '★ ' : ''}
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="qty-input"
                  min={1}
                  max={20}
                  value={templateQty}
                  onChange={(e) => setTemplateQty(Number(e.target.value))}
                  title="Quantidade"
                />
                <button type="button" disabled={!templateId || instantiating} onClick={handleInstantiateTemplate}>
                  {templateQty > 1 ? `+ Instanciar x${templateQty}` : '+ Instanciar'}
                </button>
              </div>
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
                    onDelete={isGm || c.owner_id === user?.id ? () => handleDeleteCharacter(c.id) : undefined}
                  />
                ))}
              </div>
            )}
          </section>

          <DiceRoller campaignId={campaign.id} myUserId={user?.id} />
          <ActivityFeed campaignId={campaign.id} />
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
            <button className={activeView === 'handouts' ? 'active' : ''} onClick={() => setActiveView('handouts')}>
              Handouts
            </button>
            {isGm && (
              <button className={activeView === 'notes' ? 'active' : ''} onClick={() => setActiveView('notes')}>
                Notas do Mestre
              </button>
            )}
          </div>

          {activeView === 'notes' && isGm ? (
            <GmNotes campaignId={campaign.id} />
          ) : activeView === 'handouts' ? (
            <Handouts campaignId={campaign.id} isGm={isGm} />
          ) : activeView === 'combat' ? (
            <CombatTracker
              campaignId={campaign.id}
              isGm={isGm}
              characters={characters.map((c) => ({ id: c.id, name: c.name, owner_id: c.owner_id, sheet_data: c.sheet_data }))}
              schema={schema}
              myUserId={user?.id}
            />
          ) : activeView === 'map' ? (
            <MapBoard
              campaignId={campaign.id}
              currentMapId={campaign.current_map_id}
              onSelectMap={handleSelectMap}
              isGm={isGm}
              characters={characters.map((c) => ({
                id: c.id,
                campaign_id: c.campaign_id,
                name: c.name,
                owner_id: c.owner_id,
                is_npc: c.is_npc,
                sheet_data: c.sheet_data,
                avatar_path: c.avatar_path,
              }))}
              schema={schema}
              gameSystemId={campaign.game_system_id}
              myUserId={user?.id}
            />
          ) : selected && schema ? (
            <CharacterSheet
              character={selected}
              schema={schema}
              gameSystemId={campaign.game_system_id}
              editable={isGm || selected.owner_id === user?.id}
              isGm={isGm}
              myUserId={user?.id}
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
