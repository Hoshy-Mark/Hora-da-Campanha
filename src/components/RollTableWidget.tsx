import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activity';
import type { RollEntry } from '../types/roll-table';

interface RollTableRow {
  id: string;
  name: string;
  entries: RollEntry[];
}

interface Props {
  campaignId: string;
  ownerId: string;
}

function pickWeighted(entries: RollEntry[]): RollEntry | null {
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (total <= 0) return entries[0] ?? null;
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

// GM-only: sorteia uma entrada de uma tabela de rolagem (loot/encontro)
// salva no Bestiário/Tabelas e registra no feed de atividade, mesmo
// canal que já mostra revelações e rolagens de dado.
export function RollTableWidget({ campaignId, ownerId }: Props) {
  const [tables, setTables] = useState<RollTableRow[]>([]);
  const [rolling, setRolling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('roll_tables')
      .select('id, name, entries')
      .eq('owner_id', ownerId)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setTables((data ?? []) as unknown as RollTableRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  async function roll(table: RollTableRow) {
    const entry = pickWeighted(table.entries);
    if (!entry) return;
    setRolling(table.id);
    await logActivity(campaignId, `🎲 ${table.name}: ${entry.text}`);
    setRolling(null);
  }

  if (tables.length === 0) return null;

  return (
    <section className="dice-roller">
      <h2>Tabelas</h2>
      <ul className="reveal-list">
        {tables.map((t) => (
          <li key={t.id}>
            <div className="reveal-item-main">
              <strong>{t.name}</strong>
            </div>
            <div className="reveal-item-actions">
              <button className="link-btn" disabled={rolling === t.id} onClick={() => roll(t)}>
                Rolar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
