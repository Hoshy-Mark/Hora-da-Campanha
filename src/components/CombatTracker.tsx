import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { formatExpression, rollDice } from '../lib/dice';

interface Entry {
  id: string;
  campaign_id: string;
  character_id: string | null;
  label: string;
  initiative: number;
  is_current: boolean;
  visible_to_player: boolean;
}

interface CharacterOption {
  id: string;
  name: string;
}

interface Props {
  campaignId: string;
  isGm: boolean;
  characters: CharacterOption[];
  myUserId: string | undefined;
}

export function CombatTracker({ campaignId, isGm, characters, myUserId }: Props) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [label, setLabel] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [initiative, setInitiative] = useState('10');

  async function refresh() {
    const { data } = await supabase
      .from('initiative_entries')
      .select('id, campaign_id, character_id, label, initiative, is_current, visible_to_player')
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
        .select('id, campaign_id, character_id, label, initiative, is_current, visible_to_player')
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

  async function remove(id: string) {
    const { error } = await supabase.from('initiative_entries').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function startCombat() {
    if (entries.length === 0) return;
    const { error } = await supabase.from('initiative_entries').update({ is_current: true }).eq('id', entries[0].id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function nextTurn() {
    const currentIdx = entries.findIndex((e) => e.is_current);
    if (currentIdx === -1) return startCombat();
    const nextIdx = (currentIdx + 1) % entries.length;
    const { error: e1 } = await supabase
      .from('initiative_entries')
      .update({ is_current: false })
      .eq('id', entries[currentIdx].id);
    const { error: e2 } = await supabase
      .from('initiative_entries')
      .update({ is_current: true })
      .eq('id', entries[nextIdx].id);
    if (e1 || e2) showToast((e1 ?? e2)!.message, 'error');
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
              <button className="link-btn" onClick={rollInitiativeForAll}>
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
          {visibleEntries.map((e) => (
            <li key={e.id} className={`${e.is_current ? 'current-turn' : ''} ${e.visible_to_player ? '' : 'hidden-item'}`}>
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
                {!e.visible_to_player && isGm && <span className="tag hidden-tag">Oculto</span>}
              </span>
              {isGm && (
                <span className="reveal-item-actions">
                  <button className="link-btn" onClick={() => toggleVisible(e)}>
                    {e.visible_to_player ? 'Ocultar' : 'Revelar'}
                  </button>
                  <button className="link-btn danger" onClick={() => remove(e.id)}>
                    Remover
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
