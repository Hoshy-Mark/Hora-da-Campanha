import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { logActivity } from '../lib/activity';

interface Quest {
  id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  status: 'active' | 'completed' | 'failed';
  visible_to_player: boolean;
}

interface Props {
  campaignId: string;
  isGm: boolean;
}

const STATUS_LABEL: Record<Quest['status'], string> = {
  active: 'Ativa',
  completed: 'Concluída',
  failed: 'Falhada',
};

const SELECT_COLUMNS = 'id, campaign_id, title, description, status, visible_to_player';

// Rastreador de missões/objetivos — mesmo mecanismo de revelação gradual
// de Handouts: Mestre cria oculta, revela quando quiser; jogador só vê o
// que foi revelado (a RLS de `quests` já filtra isso no servidor, sem
// precisar de `.eq('visible_to_player', true)` aqui). Fica na sidebar
// persistente (ao lado de Dados/Atividade), não numa aba própria — mesmo
// princípio de "tudo acessível sem trocar de tela" do resto do app.
export function QuestTracker({ campaignId, isGm }: Props) {
  const { showToast } = useToast();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('quests')
        .select(SELECT_COLUMNS)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });
      if (!cancelled) setQuests((data ?? []) as unknown as Quest[]);
    }

    load();

    const channel = supabase
      .channel(`quests-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quests', filter: `campaign_id=eq.${campaignId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from('quests').insert({
      campaign_id: campaignId,
      title: title.trim(),
      description: description.trim() || null,
    });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setTitle('');
    setDescription('');
    setShowForm(false);
  }

  async function toggleVisible(q: Quest) {
    const revealing = !q.visible_to_player;
    setQuests((prev) => prev.map((x) => (x.id === q.id ? { ...x, visible_to_player: revealing } : x)));
    const { error } = await supabase.from('quests').update({ visible_to_player: revealing }).eq('id', q.id);
    if (error) showToast(error.message, 'error');
    else if (revealing) logActivity(campaignId, `Missão "${q.title}" foi revelada.`);
  }

  async function setStatus(q: Quest, status: Quest['status']) {
    setQuests((prev) => prev.map((x) => (x.id === q.id ? { ...x, status } : x)));
    const { error } = await supabase.from('quests').update({ status }).eq('id', q.id);
    if (error) showToast(error.message, 'error');
    else if (q.visible_to_player && status !== 'active')
      logActivity(campaignId, `Missão "${q.title}" foi marcada como ${STATUS_LABEL[status].toLowerCase()}.`);
  }

  async function remove(q: Quest) {
    if (!confirm(`Apagar a missão "${q.title}"?`)) return;
    setQuests((prev) => prev.filter((x) => x.id !== q.id));
    const { error } = await supabase.from('quests').delete().eq('id', q.id);
    if (error) showToast(error.message, 'error');
  }

  return (
    <section className="quest-tracker">
      <div className="section-head-row">
        <h2>Missões</h2>
        {isGm && (
          <button className="link-btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancelar' : '+ Nova missão'}
          </button>
        )}
      </div>

      {isGm && showForm && (
        <form onSubmit={handleCreate} className="quest-form">
          <input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            rows={2}
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="submit" disabled={!title.trim()}>
            Criar (oculta por padrão)
          </button>
        </form>
      )}

      {quests.length === 0 ? (
        <p className="muted empty-list-hint">
          {isGm ? 'Nenhuma missão ainda.' : 'Nenhum objetivo revelado ainda.'}
        </p>
      ) : (
        <ul className="quest-list">
          {quests.map((q) => (
            <li key={q.id} className={`quest-item quest-${q.status} ${q.visible_to_player ? '' : 'hidden-item'}`}>
              <div className="reveal-item-head">
                <strong>{q.title}</strong>
                <span className="tag">{STATUS_LABEL[q.status]}</span>
                {isGm && !q.visible_to_player && <span className="tag hidden-tag">Oculta</span>}
              </div>
              {q.description && <p className="muted reveal-item-desc">{q.description}</p>}
              {isGm && (
                <div className="reveal-item-actions">
                  <button className="link-btn" onClick={() => toggleVisible(q)}>
                    {q.visible_to_player ? 'Ocultar' : 'Revelar'}
                  </button>
                  {q.status === 'active' ? (
                    <>
                      <button className="link-btn" onClick={() => setStatus(q, 'completed')}>
                        Concluir
                      </button>
                      <button className="link-btn" onClick={() => setStatus(q, 'failed')}>
                        Marcar falha
                      </button>
                    </>
                  ) : (
                    <button className="link-btn" onClick={() => setStatus(q, 'active')}>
                      Reabrir
                    </button>
                  )}
                  <button className="link-btn danger" onClick={() => remove(q)}>
                    Apagar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
