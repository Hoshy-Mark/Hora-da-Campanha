import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { formatExpression, parseDiceExpression, rollDice } from '../lib/dice';

interface RollRow {
  id: string;
  user_id: string | null;
  label: string | null;
  expression: string;
  results: number[];
  total: number;
  created_at: string;
  profiles: { display_name: string } | null;
}

interface Props {
  campaignId: string;
  myUserId: string | undefined;
}

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

export function DiceRoller({ campaignId, myUserId }: Props) {
  const [rolls, setRolls] = useState<RollRow[]>([]);
  const [expression, setExpression] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const { data } = await supabase
      .from('dice_rolls')
      .select('id, user_id, label, expression, results, total, created_at, profiles(display_name)')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(30);
    setRolls((data ?? []) as unknown as RollRow[]);
  }

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel(`dice-${campaignId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dice_rolls', filter: `campaign_id=eq.${campaignId}` }, () =>
        refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function commitRoll(exprText: string, rollLabel: string | null) {
    const parsed = parseDiceExpression(exprText);
    if (!parsed) {
      setError(`Expressão inválida: "${exprText}". Use o formato NdM+K, ex: 1d20+5.`);
      return;
    }
    if (!myUserId) return;
    setError(null);

    const result = rollDice(parsed);
    await supabase.from('dice_rolls').insert({
      campaign_id: campaignId,
      user_id: myUserId,
      label: rollLabel,
      expression: formatExpression(parsed),
      results: result.rolls,
      total: result.total,
    });
    await refresh();
  }

  async function handleQuickRoll(sides: number) {
    await commitRoll(`1d${sides}`, null);
  }

  async function handleCustomRoll(e: FormEvent) {
    e.preventDefault();
    if (!expression.trim()) return;
    await commitRoll(expression.trim(), label.trim() || null);
    setExpression('');
    setLabel('');
  }

  return (
    <section className="dice-roller">
      <h2>Dados</h2>

      <div className="quick-dice-row">
        {QUICK_DICE.map((sides) => (
          <button key={sides} className="quick-die-btn" onClick={() => handleQuickRoll(sides)}>
            d{sides}
          </button>
        ))}
      </div>

      <form onSubmit={handleCustomRoll} className="dice-custom-form">
        <input
          placeholder="ex: 2d6+3"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          className="mono"
        />
        <input placeholder="Pra quê? (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" disabled={!expression.trim()}>
          Rolar
        </button>
      </form>
      {error && <p className="auth-error">{error}</p>}

      <ul className="dice-log">
        {rolls.map((r) => (
          <li key={r.id}>
            <span className="dice-log-who">{r.profiles?.display_name ?? '—'}</span>
            {r.label && <span className="dice-log-label">{r.label}</span>}
            <span className="dice-log-expr mono">{r.expression}</span>
            <span className="dice-log-rolls mono">[{(r.results as number[]).join(', ')}]</span>
            <span className="dice-log-total">{r.total}</span>
          </li>
        ))}
        {rolls.length === 0 && <p className="muted empty-list-hint">Ninguém rolou nada ainda.</p>}
      </ul>
    </section>
  );
}
