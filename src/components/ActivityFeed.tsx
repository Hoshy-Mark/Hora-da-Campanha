import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ActivityRow {
  id: string;
  message: string;
  created_at: string;
}

interface Props {
  campaignId: string;
}

// Feed de "o que aconteceu" além das rolagens de dado (que já têm o
// próprio log em Dados): revelações, trocas de turno, personagem que
// entrou na mesa. Só leitura aqui — quem dispara o evento já grava a
// mensagem pronta via src/lib/activity.ts, então este componente nunca
// precisa de estado otimista próprio.
export function ActivityFeed({ campaignId }: Props) {
  const [entries, setEntries] = useState<ActivityRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('activity_log')
        .select('id, message, created_at')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!cancelled) setEntries((data ?? []) as unknown as ActivityRow[]);
    }

    load();

    const channel = supabase
      .channel(`activity-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const row = payload.new as unknown as ActivityRow;
          setEntries((prev) => (prev.some((e) => e.id === row.id) ? prev : [row, ...prev].slice(0, 30)));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  return (
    <section className="activity-feed">
      <h2>Atividade</h2>
      {entries.length === 0 ? (
        <p className="muted empty-list-hint">Nada aconteceu ainda.</p>
      ) : (
        <ul className="activity-list">
          {entries.map((e) => (
            <li key={e.id}>{e.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
