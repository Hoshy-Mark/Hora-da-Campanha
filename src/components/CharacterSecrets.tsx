import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Secret {
  id: string;
  character_id: string;
  campaign_id: string;
  title: string;
  content: string;
}

interface Props {
  characterId: string;
  campaignId: string;
}

// Só é montado pelo CharacterSheet quando isGm === true — mas RLS já
// garante que, mesmo se algo mudar nesse controle de UI no futuro, um
// jogador nunca consegue ler uma linha de character_secrets.
export function CharacterSecrets({ characterId, campaignId }: Props) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    const { data } = await supabase
      .from('character_secrets')
      .select('id, character_id, campaign_id, title, content')
      .eq('character_id', characterId)
      .order('created_at', { ascending: true });
    setSecrets((data ?? []) as unknown as Secret[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('character_secrets')
        .select('id, character_id, campaign_id, title, content')
        .eq('character_id', characterId)
        .order('created_at', { ascending: true });
      if (!cancelled) setSecrets((data ?? []) as unknown as Secret[]);
    }

    load();

    const channel = supabase
      .channel(`secrets-${characterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'character_secrets', filter: `character_id=eq.${characterId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [characterId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await supabase
      .from('character_secrets')
      .insert({ character_id: characterId, campaign_id: campaignId, title: title.trim(), content: content.trim() });
    setTitle('');
    setContent('');
    setShowForm(false);
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm('Apagar este segredo?')) return;
    await supabase.from('character_secrets').delete().eq('id', id);
    await refresh();
  }

  return (
    <div className="sheet-card secrets-card">
      <div className="section-head-row">
        <strong className="sheet-card-title" style={{ marginBottom: 0 }}>
          🔒 Segredos (só o Mestre vê)
        </strong>
        <button className="link-btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancelar' : '+ Novo'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="reveal-form">
          <input placeholder="Título (ex: verdade sobre o passado)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea rows={3} placeholder="O que o jogador não sabe" value={content} onChange={(e) => setContent(e.target.value)} />
          <button type="submit" disabled={!title.trim()}>
            Criar
          </button>
        </form>
      )}

      {secrets.length === 0 ? (
        <p className="muted empty-list-hint">Nenhum segredo registrado para este personagem.</p>
      ) : (
        <ul className="reveal-list">
          {secrets.map((s) => (
            <li key={s.id} className="secret-item">
              <div className="reveal-item-main">
                <div className="reveal-item-head">
                  <strong>{s.title}</strong>
                </div>
                <p className="muted reveal-item-desc">{s.content}</p>
              </div>
              <button className="link-btn danger" onClick={() => remove(s.id)}>
                Apagar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
