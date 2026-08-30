import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';

interface Note {
  id: string;
  campaign_id: string;
  character_id: string | null;
  title: string;
  content: string | null;
  category: string;
}

interface Props {
  campaignId: string;
}

const NOTE_CATEGORIES = ['Geral', 'NPC', 'Local', 'Facção', 'Missão'];
const SELECT_COLUMNS = 'id, campaign_id, character_id, title, content, category';

export function GmNotes({ campaignId }: Props) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(NOTE_CATEGORIES[0]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState(NOTE_CATEGORIES[0]);
  const [filterCategory, setFilterCategory] = useState('');

  async function refresh() {
    const { data } = await supabase
      .from('gm_notes')
      .select(SELECT_COLUMNS)
      .eq('campaign_id', campaignId)
      .is('character_id', null)
      .order('created_at', { ascending: false });
    setNotes((data ?? []) as unknown as Note[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('gm_notes')
        .select(SELECT_COLUMNS)
        .eq('campaign_id', campaignId)
        .is('character_id', null)
        .order('created_at', { ascending: false });
      if (!cancelled) setNotes((data ?? []) as unknown as Note[]);
    }

    load();

    const channel = supabase
      .channel(`gm-notes-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gm_notes', filter: `campaign_id=eq.${campaignId}` }, () =>
        load()
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
    const { error } = await supabase
      .from('gm_notes')
      .insert({ campaign_id: campaignId, title: title.trim(), content: content.trim() || null, category });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setTitle('');
    setContent('');
    setCategory(NOTE_CATEGORIES[0]);
    setShowForm(false);
    await refresh();
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditContent(note.content ?? '');
    setEditCategory(note.category);
  }

  async function saveEdit(id: string) {
    const { error } = await supabase
      .from('gm_notes')
      .update({ content: editContent, category: editCategory, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) showToast(error.message, 'error');
    setEditingId(null);
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm('Apagar esta nota?')) return;
    const { error } = await supabase.from('gm_notes').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  return (
    <div className="gm-notes-page">
      <div className="section-head-row">
        <h2>Notas do Mestre</h2>
        <div className="map-controls">
          {notes.length > 0 && (
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">Todas as categorias</option>
              {NOTE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <button className="link-btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancelar' : '+ Nova nota'}
          </button>
        </div>
      </div>
      <p className="muted gm-notes-hint">
        Visível só pra você — mesmo no banco de dados, jogadores não têm permissão de ler nada aqui.
      </p>

      {showForm && (
        <form onSubmit={handleCreate} className="reveal-form">
          <input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea rows={3} placeholder="Conteúdo" value={content} onChange={(e) => setContent(e.target.value)} />
          <button type="submit" disabled={!title.trim()}>
            Criar
          </button>
        </form>
      )}

      {notes.length === 0 ? (
        <p className="muted empty-list-hint">Nenhuma nota ainda.</p>
      ) : (
        <ul className="gm-notes-list">
          {notes
            .filter((note) => !filterCategory || note.category === filterCategory)
            .map((note) => (
              <li key={note.id} className="sheet-card">
                <div className="section-head-row">
                  <div className="reveal-item-head">
                    <strong>{note.title}</strong>
                    <span className="tag">{note.category}</span>
                  </div>
                  <div className="reveal-item-actions">
                    {editingId === note.id ? (
                      <button className="link-btn" onClick={() => saveEdit(note.id)}>
                        Salvar
                      </button>
                    ) : (
                      <button className="link-btn" onClick={() => startEdit(note)}>
                        Editar
                      </button>
                    )}
                    <button className="link-btn danger" onClick={() => remove(note.id)}>
                      Apagar
                    </button>
                  </div>
                </div>
                {editingId === note.id ? (
                  <>
                    <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                      {NOTE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <textarea rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                  </>
                ) : (
                  <p className="gm-note-content">{note.content || <span className="muted">(vazio)</span>}</p>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
