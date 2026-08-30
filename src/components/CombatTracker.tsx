import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { formatExpression, rollDice } from '../lib/dice';
import { logActivity } from '../lib/activity';
import type { GameSystemSchema, SheetData } from '../types/game-system';
import { QUICK_STATUS_EFFECTS, iconForStatus } from '../types/status-effects';
import { CombatantResources } from './CombatantResources';

interface Entry {
  id: string;
  campaign_id: string;
  character_id: string | null;
  label: string;
  initiative: number;
  is_current: boolean;
  visible_to_player: boolean;
  status_effects: string[];
  is_defeated: boolean;
}

interface CharacterOption {
  id: string;
  name: string;
  owner_id: string | null;
  sheet_data: SheetData;
}

interface Props {
  campaignId: string;
  isGm: boolean;
  characters: CharacterOption[];
  schema: GameSystemSchema | undefined;
  myUserId: string | undefined;
}

const SELECT_COLUMNS =
  'id, campaign_id, character_id, label, initiative, is_current, visible_to_player, status_effects, is_defeated';

export function CombatTracker({ campaignId, isGm, characters, schema, myUserId }: Props) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [label, setLabel] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [initiative, setInitiative] = useState('10');
  const [statusEditorId, setStatusEditorId] = useState<string | null>(null);
  const [customStatus, setCustomStatus] = useState('');

  async function refresh() {
    const { data } = await supabase
      .from('initiative_entries')
      .select(SELECT_COLUMNS)
      .eq('campaign_id', campaignId)
      .order('initiative', { ascending: false })
      .order('created_at', { ascending: true });
    setEntries((data ?? []) as unknown as Entry[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('initiative_entries')
        .select(SELECT_COLUMNS)
        .eq('campaign_id', campaignId)
        .order('initiative', { ascending: false })
        .order('created_at', { ascending: true });
      if (!cancelled) setEntries((data ?? []) as unknown as Entry[]);
    }

    load();

    const channel = supabase
      .channel(`initiative-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'initiative_entries', filter: `campaign_id=eq.${campaignId}` },
        () => {
          if (!cancelled) load();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const linkedChar = characters.find((c) => c.id === characterId);
    if (!linkedChar && !label.trim()) return;

    const { error } = await supabase.from('initiative_entries').insert({
      campaign_id: campaignId,
      character_id: characterId || null,
      label: linkedChar ? linkedChar.name : label.trim(),
      initiative: Number(initiative) || 0,
      visible_to_player: true,
    });
    if (error) {
      showToast(error.message, 'error');
      return;
    }

    setLabel('');
    setCharacterId('');
    setInitiative('10');
    await refresh();
  }

  async function updateInitiative(entry: Entry, value: number) {
    const { error } = await supabase.from('initiative_entries').update({ initiative: value }).eq('id', entry.id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function toggleVisible(entry: Entry) {
    const { error } = await supabase
      .from('initiative_entries')
      .update({ visible_to_player: !entry.visible_to_player })
      .eq('id', entry.id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function toggleDefeated(entry: Entry) {
    const { error } = await supabase
      .from('initiative_entries')
      .update({ is_defeated: !entry.is_defeated })
      .eq('id', entry.id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function addStatus(entry: Entry, status: string) {
    if (!status.trim() || entry.status_effects.includes(status)) return;
    const next = [...entry.status_effects, status];
    const { error } = await supabase.from('initiative_entries').update({ status_effects: next }).eq('id', entry.id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function removeStatus(entry: Entry, status: string) {
    const next = entry.status_effects.filter((s) => s !== status);
    const { error } = await supabase.from('initiative_entries').update({ status_effects: next }).eq('id', entry.id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('initiative_entries').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function startCombat() {
    const alive = entries.filter((e) => !e.is_defeated);
    if (alive.length === 0) return;
    const { error } = await supabase.from('initiative_entries').update({ is_current: true }).eq('id', alive[0].id);
    if (error) showToast(error.message, 'error');
    else logActivity(campaignId, `O combate começou! Turno de ${alive[0].label}.`);
    await refresh();
  }

  async function nextTurn() {
    const currentIdx = entries.findIndex((e) => e.is_current);
    if (currentIdx === -1) return startCombat();

    // Pula quem já foi marcado como derrotado — sem isso o Mestre teria
    // que clicar "Próximo turno" mais de uma vez pra passar por quem já
    // caiu da luta.
    let nextIdx = (currentIdx + 1) % entries.length;
    let hops = 0;
    while (entries[nextIdx].is_defeated && hops < entries.length) {
      nextIdx = (nextIdx + 1) % entries.length;
      hops++;
    }

    const { error: e1 } = await supabase
      .from('initiative_entries')
      .update({ is_current: false })
      .eq('id', entries[currentIdx].id);
    const { error: e2 } = await supabase
      .from('initiative_entries')
      .update({ is_current: true })
      .eq('id', entries[nextIdx].id);
    if (e1 || e2) showToast((e1 ?? e2)!.message, 'error');
    else logActivity(campaignId, `Agora é a vez de ${entries[nextIdx].label}.`);
    await refresh();
  }

  async function endCombat() {
    if (!confirm('Encerrar o combate? A ordem de iniciativa inteira será apagada.')) return;
    for (const e of entries) {
      await supabase.from('initiative_entries').delete().eq('id', e.id);
    }
    await refresh();
  }

  // Trata o valor já digitado em cada entrada como modificador: rola 1d20
  // pra cada combatente, soma com o que já estava lá, e registra cada
  // rolagem no log compartilhado de dados (visível a todos na aba Dados).
  async function rollInitiativeForAll() {
    if (!myUserId) return;
    for (const e of entries) {
      const expr = { count: 1, sides: 20, modifier: e.initiative };
      const roll = rollDice(expr);
      const { error } = await supabase.from('initiative_entries').update({ initiative: roll.total }).eq('id', e.id);
      if (error) showToast(error.message, 'error');
      await supabase.from('dice_rolls').insert({
        campaign_id: campaignId,
        user_id: myUserId,
        label: `Iniciativa: ${e.label}`,
        expression: formatExpression(expr),
        results: roll.rolls,
        total: roll.total,
      });
    }
    await refresh();
  }

  const inCombat = entries.some((e) => e.is_current);
  const visibleEntries = entries.filter((e) => e.visible_to_player || isGm);

  return (
    <div className="sheet-card combat-tracker">
      <div className="section-head-row">
        <strong className="sheet-card-title" style={{ marginBottom: 0 }}>
          Iniciativa
        </strong>
        {isGm && entries.length > 0 && (
          <div className="combat-controls">
            {!inCombat && (
              <button className="link-btn" onClick={rollInitiativeForAll} title="Usa o número atual de cada linha como modificador e rola 1d20 pra cada um">
                🎲 Rolar iniciativa
              </button>
            )}
            {!inCombat ? (
              <button className="link-btn" onClick={startCombat}>
                Iniciar combate
              </button>
            ) : (
              <button className="link-btn" onClick={nextTurn}>
                Próximo turno →
              </button>
            )}
            <button className="link-btn danger" onClick={endCombat}>
              Encerrar
            </button>
          </div>
        )}
      </div>

      <p className="muted combat-hint">
        Isto controla só a <strong>ordem dos turnos</strong>. Quando uma linha está ligada a um personagem, a barra de
        vida/recursos dele aparece embaixo do nome — dá pra ajustar sem sair desta aba.
      </p>

      {isGm && (
        <form onSubmit={handleAdd} className="reveal-form-row combat-add-row">
          <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">Combatente avulso (digite o nome)</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!characterId && <input placeholder="Nome" value={label} onChange={(e) => setLabel(e.target.value)} />}
          <input
            type="number"
            className="qty-input"
            value={initiative}
            onChange={(e) => setInitiative(e.target.value)}
            title="Iniciativa"
          />
          <button type="submit" disabled={!characterId && !label.trim()}>
            + Adicionar
          </button>
        </form>
      )}

      {visibleEntries.length === 0 ? (
        <p className="muted empty-list-hint">Nenhum combatente na iniciativa.</p>
      ) : (
        <ol className="initiative-list">
          {visibleEntries.map((e, idx) => {
            const character = characters.find((c) => c.id === e.character_id);
            const canEditResources = !!character && (isGm || character.owner_id === myUserId);
            return (
              <li
                key={e.id}
                className={`${e.is_current ? 'current-turn' : ''} ${e.visible_to_player ? '' : 'hidden-item'} ${e.is_defeated ? 'defeated' : ''}`}
              >
                <div className="initiative-row">
                  <span className="initiative-order" title="Posição na ordem de turnos">
                    {idx + 1}º
                  </span>
                  <span className="initiative-value">
                    {isGm ? (
                      <input
                        type="number"
                        className="resource-num"
                        value={e.initiative}
                        onChange={(ev) => updateInitiative(e, Number(ev.target.value))}
                      />
                    ) : (
                      e.initiative
                    )}
                  </span>
                  <span className="initiative-label">
                    {e.label}
                    {e.is_current && <span className="tag current-tag">Agora</span>}
                    {e.is_defeated && <span className="tag">Derrotado</span>}
                    {!e.visible_to_player && isGm && <span className="tag hidden-tag">Oculto</span>}
                    {e.status_effects.map((s) => (
                      <span key={s} className="tag status-tag">
                        {iconForStatus(s)} {s}
                        {isGm && (
                          <button type="button" className="status-tag-remove" onClick={() => removeStatus(e, s)}>
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </span>
                  {isGm && (
                    <span className="reveal-item-actions">
                      <button className="link-btn" onClick={() => setStatusEditorId(statusEditorId === e.id ? null : e.id)}>
                        {statusEditorId === e.id ? 'Fechar status' : '+ Status'}
                      </button>
                      <button className="link-btn" onClick={() => toggleDefeated(e)}>
                        {e.is_defeated ? 'Reviver' : 'Derrotado'}
                      </button>
                      <button className="link-btn" onClick={() => toggleVisible(e)}>
                        {e.visible_to_player ? 'Ocultar' : 'Revelar'}
                      </button>
                      <button className="link-btn danger" onClick={() => remove(e.id)}>
                        Remover
                      </button>
                    </span>
                  )}
                </div>

                {statusEditorId === e.id && (
                  <div className="status-editor">
                    {QUICK_STATUS_EFFECTS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        className="tile-palette-btn"
                        disabled={e.status_effects.includes(s.key)}
                        onClick={() => addStatus(e, s.key)}
                      >
                        {s.icon} {s.label}
                      </button>
                    ))}
                    <div className="reveal-form-row">
                      <input
                        placeholder="Condição customizada"
                        value={customStatus}
                        onChange={(ev) => setCustomStatus(ev.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          addStatus(e, customStatus.trim());
                          setCustomStatus('');
                        }}
                        disabled={!customStatus.trim()}
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                )}

                {character && schema && (
                  <CombatantResources character={character} schema={schema} editable={canEditResources} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
