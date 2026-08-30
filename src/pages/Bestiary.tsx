import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { emptySheetData, recomputeFormulas, type GameSystemSchema, type SheetData } from '../types/game-system';
import type { TemplateAbility, TemplateItem } from '../types/monster-template';
import { SheetFieldsEditor } from '../components/SheetFieldsEditor';
import { ResourceBar } from '../components/ResourceBar';

interface SystemRow {
  id: string;
  name: string;
  schema: GameSystemSchema;
}

interface TemplateRow {
  id: string;
  owner_id: string;
  game_system_id: string;
  name: string;
  is_boss: boolean;
  sheet_data: SheetData;
  abilities: TemplateAbility[];
  items: TemplateItem[];
  notes: string | null;
}

const emptyAbilityDraft = { name: '', category: '', cost: '', tier: '', description: '' };
const emptyItemDraft = { name: '', description: '', quantity: '1' };

export function Bestiary() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSystemId, setFilterSystemId] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [systemId, setSystemId] = useState('');
  const [name, setName] = useState('');
  const [isBoss, setIsBoss] = useState(false);
  const [notes, setNotes] = useState('');
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [abilities, setAbilities] = useState<TemplateAbility[]>([]);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [abilityDraft, setAbilityDraft] = useState(emptyAbilityDraft);
  const [itemDraft, setItemDraft] = useState(emptyItemDraft);
  const [saving, setSaving] = useState(false);

  const activeSchema = systems.find((s) => s.id === systemId)?.schema ?? null;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [{ data: systemData }, { data: templateData }] = await Promise.all([
        supabase.from('game_systems').select('id, name, schema').eq('owner_id', user!.id),
        supabase
          .from('monster_templates')
          .select('id, owner_id, game_system_id, name, is_boss, sheet_data, abilities, items, notes')
          .eq('owner_id', user!.id)
          .order('name', { ascending: true }),
      ]);
      if (cancelled) return;
      setSystems((systemData ?? []) as unknown as SystemRow[]);
      setTemplates((templateData ?? []) as unknown as TemplateRow[]);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`monster-templates-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monster_templates', filter: `owner_id=eq.${user.id}` },
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
    setSystemId('');
    setName('');
    setIsBoss(false);
    setNotes('');
    setSheetData(null);
    setAbilities([]);
    setItems([]);
    setAbilityDraft(emptyAbilityDraft);
    setItemDraft(emptyItemDraft);
  }

  function handlePickSystem(id: string) {
    setSystemId(id);
    const sys = systems.find((s) => s.id === id);
    if (sys) setSheetData(emptySheetData(sys.schema));
  }

  function handleFieldChange(key: string, value: number | string) {
    if (!activeSchema || !sheetData) return;
    setSheetData(recomputeFormulas(activeSchema, { ...sheetData, fields: { ...sheetData.fields, [key]: value } }));
  }

  function handleResourceChange(key: string, value: SheetData['resources'][string]) {
    if (!sheetData) return;
    setSheetData({ ...sheetData, resources: { ...sheetData.resources, [key]: value } });
  }

  function addAbility() {
    if (!abilityDraft.name.trim()) return;
    setAbilities((prev) => [
      ...prev,
      {
        name: abilityDraft.name.trim(),
        category: abilityDraft.category.trim() || undefined,
        cost: abilityDraft.cost.trim() || undefined,
        tier: abilityDraft.tier.trim() || undefined,
        description: abilityDraft.description.trim() || undefined,
      },
    ]);
    setAbilityDraft(emptyAbilityDraft);
  }

  function addItem() {
    if (!itemDraft.name.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        name: itemDraft.name.trim(),
        description: itemDraft.description.trim() || undefined,
        quantity: Number(itemDraft.quantity) || 1,
      },
    ]);
    setItemDraft(emptyItemDraft);
  }

  function startEdit(t: TemplateRow) {
    setEditingId(t.id);
    setSystemId(t.game_system_id);
    setName(t.name);
    setIsBoss(t.is_boss);
    setNotes(t.notes ?? '');
    setSheetData(t.sheet_data);
    setAbilities(t.abilities);
    setItems(t.items);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !systemId || !name.trim() || !sheetData) return;
    setSaving(true);

    const fields = {
      name: name.trim(),
      is_boss: isBoss,
      sheet_data: sheetData,
      abilities,
      items,
      notes: notes.trim() || null,
    };

    const { error } = editingId
      ? await supabase.from('monster_templates').update(fields).eq('id', editingId)
      : await supabase
          .from('monster_templates')
          .insert({ ...fields, owner_id: user.id, game_system_id: systemId });

    setSaving(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast(editingId ? 'Molde atualizado!' : 'Molde criado!', 'success');
    resetForm();
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Apagar este molde? Personagens já instanciados a partir dele não são afetados.')) return;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('monster_templates').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    else showToast('Molde apagado.', 'success');
  }

  const systemNameById = new Map(systems.map((s) => [s.id, s.name]));
  const visibleTemplates = filterSystemId ? templates.filter((t) => t.game_system_id === filterSystemId) : templates;

  return (
    <div className="systems-page">
      <h1>Bestiário</h1>
      <p className="muted">
        Moldes de monstros e NPCs reutilizáveis entre campanhas que usam o mesmo sistema. Ao instanciar um molde numa
        mesa, ele vira um personagem novo (NPC oculto por padrão) com a ficha, habilidades e itens já preenchidos.
      </p>

      <section className="system-import">
        <div className="section-head-row">
          <h2>{editingId ? 'Editando molde' : 'Novo molde'}</h2>
          <button
            className="link-btn"
            onClick={() => {
              if (showForm) resetForm();
              setShowForm((s) => !s);
            }}
          >
            {showForm ? 'Cancelar' : '+ Novo molde'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="system-form">
            <label>
              Sistema
              <select value={systemId} onChange={(e) => handlePickSystem(e.target.value)} disabled={!!editingId}>
                <option value="" disabled>
                  Selecione um sistema…
                </option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Lobo Sombrio" />
            </label>

            <label className="checkbox-label">
              <input type="checkbox" checked={isBoss} onChange={(e) => setIsBoss(e.target.checked)} />
              Este molde é um chefe (boss)
            </label>

            {activeSchema && sheetData && (
              <>
                {activeSchema.resources.length > 0 && (
                  <div className="sheet-card resources-card">
                    {activeSchema.resources.map((r) => (
                      <ResourceBar
                        key={r.key}
                        def={r}
                        value={sheetData.resources[r.key] ?? {}}
                        editable
                        onChange={(v) => handleResourceChange(r.key, v)}
                      />
                    ))}
                  </div>
                )}
                <SheetFieldsEditor schema={activeSchema} data={sheetData} editable onFieldChange={handleFieldChange} />
              </>
            )}

            <div className="sheet-card">
              <strong className="sheet-card-title">Habilidades</strong>
              <div className="reveal-form">
                <input
                  placeholder="Nome"
                  value={abilityDraft.name}
                  onChange={(e) => setAbilityDraft({ ...abilityDraft, name: e.target.value })}
                />
                <div className="reveal-form-row">
                  <input
                    placeholder="Categoria"
                    value={abilityDraft.category}
                    onChange={(e) => setAbilityDraft({ ...abilityDraft, category: e.target.value })}
                  />
                  <input
                    placeholder="Custo"
                    value={abilityDraft.cost}
                    onChange={(e) => setAbilityDraft({ ...abilityDraft, cost: e.target.value })}
                  />
                  <input
                    placeholder="Nível"
                    value={abilityDraft.tier}
                    onChange={(e) => setAbilityDraft({ ...abilityDraft, tier: e.target.value })}
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Descrição / efeito"
                  value={abilityDraft.description}
                  onChange={(e) => setAbilityDraft({ ...abilityDraft, description: e.target.value })}
                />
                <button type="button" onClick={addAbility} disabled={!abilityDraft.name.trim()}>
                  + Adicionar habilidade
                </button>
              </div>
              {abilities.length > 0 && (
                <ul className="reveal-list">
                  {abilities.map((a, idx) => (
                    <li key={idx}>
                      <div className="reveal-item-main">
                        <div className="reveal-item-head">
                          <strong>{a.name}</strong>
                          {a.tier && <span className="tag">{a.tier}</span>}
                          {a.category && <span className="tag">{a.category}</span>}
                          {a.cost && <span className="tag cost-tag">{a.cost}</span>}
                        </div>
                        {a.description && <p className="muted reveal-item-desc">{a.description}</p>}
                      </div>
                      <div className="reveal-item-actions">
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => setAbilities((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remover
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="sheet-card">
              <strong className="sheet-card-title">Itens</strong>
              <div className="reveal-form">
                <input
                  placeholder="Nome"
                  value={itemDraft.name}
                  onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })}
                />
                <div className="reveal-form-row">
                  <input
                    type="number"
                    min={1}
                    placeholder="Qtd"
                    value={itemDraft.quantity}
                    onChange={(e) => setItemDraft({ ...itemDraft, quantity: e.target.value })}
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Descrição"
                  value={itemDraft.description}
                  onChange={(e) => setItemDraft({ ...itemDraft, description: e.target.value })}
                />
                <button type="button" onClick={addItem} disabled={!itemDraft.name.trim()}>
                  + Adicionar item
                </button>
              </div>
              {items.length > 0 && (
                <ul className="reveal-list">
                  {items.map((it, idx) => (
                    <li key={idx}>
                      <div className="reveal-item-main">
                        <div className="reveal-item-head">
                          <strong>{it.name}</strong>
                          {it.quantity && it.quantity > 1 && <span className="tag">x{it.quantity}</span>}
                        </div>
                        {it.description && <p className="muted reveal-item-desc">{it.description}</p>}
                      </div>
                      <div className="reveal-item-actions">
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remover
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label>
              Notas do Mestre
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Táticas, dicas de uso em jogo, etc." />
            </label>

            <button type="submit" disabled={saving || !systemId || !name.trim()}>
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar molde'}
            </button>
          </form>
        )}
      </section>

      <section>
        <div className="section-head-row">
          <h2>Moldes salvos</h2>
          {systems.length > 1 && (
            <select value={filterSystemId} onChange={(e) => setFilterSystemId(e.target.value)}>
              <option value="">Todos os sistemas</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <p className="muted">Carregando…</p>
        ) : visibleTemplates.length === 0 ? (
          <p className="muted">Nenhum molde ainda. Crie um acima.</p>
        ) : (
          <ul className="system-list">
            {visibleTemplates.map((t) => (
              <li key={t.id} className="system-card">
                <div>
                  <strong>{t.name}</strong>
                  {t.is_boss && <span className="tag hidden-tag" style={{ marginLeft: 6 }}>Boss</span>}
                  <span className="muted">
                    {' '}
                    — {systemNameById.get(t.game_system_id) ?? '—'}, {t.abilities.length} habilidades, {t.items.length}{' '}
                    itens
                  </span>
                </div>
                <div className="reveal-item-actions">
                  <button className="link-btn" onClick={() => startEdit(t)}>
                    Editar
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
