import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { RollEntry } from '../types/roll-table';

interface RollTableRow {
  id: string;
  owner_id: string;
  name: string;
  entries: RollEntry[];
}

const emptyEntryDraft = { text: '', weight: '1' };

export function RollTables() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tables, setTables] = useState<RollTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [entries, setEntries] = useState<RollEntry[]>([]);
  const [entryDraft, setEntryDraft] = useState(emptyEntryDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('roll_tables')
        .select('id, owner_id, name, entries')
        .eq('owner_id', user!.id)
        .order('name', { ascending: true });
      if (!cancelled) {
        setTables((data ?? []) as unknown as RollTableRow[]);
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel(`roll-tables-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roll_tables', filter: `owner_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setEntries([]);
    setEntryDraft(emptyEntryDraft);
  }

  function addEntry() {
    if (!entryDraft.text.trim()) return;
    setEntries((prev) => [...prev, { text: entryDraft.text.trim(), weight: Number(entryDraft.weight) || 1 }]);
    setEntryDraft(emptyEntryDraft);
  }

  function startEdit(t: RollTableRow) {
    setEditingId(t.id);
    setName(t.name);
    setEntries(t.entries);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !name.trim() || entries.length === 0) return;
    setSaving(true);

    const fields = { name: name.trim(), entries };

    const { error } = editingId
      ? await supabase.from('roll_tables').update(fields).eq('id', editingId)
      : await supabase.from('roll_tables').insert({ ...fields, owner_id: user.id });

    setSaving(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast(editingId ? 'Tabela atualizada!' : 'Tabela criada!', 'success');
    resetForm();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Apagar esta tabela de rolagem?')) return;
    setTables((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('roll_tables').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    else showToast('Tabela apagada.', 'success');
  }

  async function handleDuplicate(t: RollTableRow) {
    if (!user) return;
    const { error } = await supabase
      .from('roll_tables')
      .insert({ owner_id: user.id, name: `${t.name} (cópia)`, entries: t.entries });
    if (error) showToast(error.message, 'error');
    else showToast('Tabela duplicada!', 'success');
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visibleTables = tables.filter(
    (t) => !normalizedSearch || t.name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <div className="systems-page">
      <h1>Tabelas de rolagem</h1>
      <p className="muted">
        Tabelas de sorteio ponderado pra loot, encontros aleatórios ou qualquer lista que você queira rolar na hora.
        Dentro de uma campanha, use o widget "Rolar" na barra lateral pra sortear uma entrada e registrar no feed de
        atividade.
      </p>

      <section className="system-import">
        <div className="section-head-row">
          <h2>{editingId ? 'Editando tabela' : 'Nova tabela'}</h2>
          <button
            className="link-btn"
            onClick={() => {
              if (showForm) resetForm();
              setShowForm((s) => !s);
            }}
          >
            {showForm ? 'Cancelar' : '+ Nova tabela'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="system-form">
            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Loot — masmorra nível 1" />
            </label>

            <div className="sheet-card">
              <strong className="sheet-card-title">Entradas</strong>
              <div className="reveal-form">
                <input
                  placeholder="Texto (ex: 2 poções de cura)"
                  value={entryDraft.text}
                  onChange={(e) => setEntryDraft({ ...entryDraft, text: e.target.value })}
                />
                <div className="reveal-form-row">
                  <input
                    type="number"
                    min={1}
                    placeholder="Peso"
                    value={entryDraft.weight}
                    onChange={(e) => setEntryDraft({ ...entryDraft, weight: e.target.value })}
                  />
                </div>
                <button type="button" onClick={addEntry} disabled={!entryDraft.text.trim()}>
                  + Adicionar entrada
                </button>
              </div>
              {entries.length > 0 && (
                <ul className="reveal-list">
                  {entries.map((en, idx) => (
                    <li key={idx}>
                      <div className="reveal-item-main">
                        <div className="reveal-item-head">
                          <strong>{en.text}</strong>
                          <span className="tag">peso {en.weight}</span>
                        </div>
                      </div>
                      <div className="reveal-item-actions">
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => setEntries((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remover
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="submit" disabled={saving || !name.trim() || entries.length === 0}>
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar tabela'}
            </button>
          </form>
        )}
      </section>

      <section>
        <div className="section-head-row">
          <h2>Tabelas salvas</h2>
          <input
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="list-search-input"
          />
        </div>

        {loading ? (
          <p className="muted">Carregando…</p>
        ) : visibleTables.length === 0 ? (
          <p className="muted">
            {tables.length === 0 ? 'Nenhuma tabela ainda. Crie uma acima.' : 'Nenhuma tabela corresponde à busca.'}
          </p>
        ) : (
          <ul className="system-list">
            {visibleTables.map((t) => (
              <li key={t.id} className="system-card">
                <div>
                  <strong>{t.name}</strong>
                  <span className="muted"> — {t.entries.length} entrada(s)</span>
                </div>
                <div className="reveal-item-actions">
                  <button className="link-btn" onClick={() => startEdit(t)}>
                    Editar
                  </button>
                  <button className="link-btn" onClick={() => handleDuplicate(t)}>
                    Duplicar
                  </button>
                  <button className="link-btn danger" onClick={() => handleDelete(t.id)}>
                    Apagar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
