import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';

interface Ability {
  id: string;
  character_id: string;
  campaign_id: string;
  name: string;
  category: string | null;
  cost: string | null;
  tier: string | null;
  description: string | null;
  visible_to_player: boolean;
}

interface CatalogAbility {
  id: string;
  name: string;
  category: string | null;
  cost: string | null;
  tier: string | null;
  description: string | null;
}

interface Props {
  characterId: string;
  campaignId: string;
  gameSystemId: string;
  isGm: boolean;
}

const emptyForm = { name: '', category: '', cost: '', tier: '', description: '' };

export function AbilityList({ characterId, campaignId, gameSystemId, isGm }: Props) {
  const { showToast } = useToast();
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<CatalogAbility[]>([]);
  const [catalogPick, setCatalogPick] = useState('');

  useEffect(() => {
    if (!isGm) return;
    let cancelled = false;
    supabase
      .from('catalog_entries')
      .select('id, name, category, cost, tier, description')
      .eq('game_system_id', gameSystemId)
      .eq('kind', 'ability')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setCatalog((data ?? []) as unknown as CatalogAbility[]);
      });
    return () => {
      cancelled = true;
    };
  }, [isGm, gameSystemId]);

  function pickFromCatalog(id: string) {
    setCatalogPick(id);
    const entry = catalog.find((c) => c.id === id);
    if (!entry) return;
    setForm({
      name: entry.name,
      category: entry.category ?? '',
      cost: entry.cost ?? '',
      tier: entry.tier ?? '',
      description: entry.description ?? '',
    });
    setShowForm(true);
  }

  async function refresh() {
    const { data } = await supabase
      .from('character_abilities')
      .select('id, character_id, campaign_id, name, category, cost, tier, description, visible_to_player')
      .eq('character_id', characterId)
      .order('created_at', { ascending: true });
    setAbilities((data ?? []) as unknown as Ability[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('character_abilities')
        .select('id, character_id, campaign_id, name, category, cost, tier, description, visible_to_player')
        .eq('character_id', characterId)
        .order('created_at', { ascending: true });
      if (!cancelled) setAbilities((data ?? []) as unknown as Ability[]);
    }

    load();

    const channel = supabase
      .channel(`abilities-${characterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'character_abilities', filter: `character_id=eq.${characterId}` },
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
    if (!form.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('character_abilities').insert({
      character_id: characterId,
      campaign_id: campaignId,
      name: form.name.trim(),
      category: form.category.trim() || null,
      cost: form.cost.trim() || null,
      tier: form.tier.trim() || null,
      description: form.description.trim() || null,
      visible_to_player: false,
    });
    setSaving(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setForm(emptyForm);
    setCatalogPick('');
    setShowForm(false);
    await refresh();
  }

  async function toggleVisible(a: Ability) {
    const { error } = await supabase
      .from('character_abilities')
      .update({ visible_to_player: !a.visible_to_player })
      .eq('id', a.id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('character_abilities').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    await refresh();
  }

  return (
    <div className="sheet-card">
      <div className="section-head-row">
        <strong className="sheet-card-title" style={{ marginBottom: 0 }}>
          Habilidades
        </strong>
        {isGm && (
          <button className="link-btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancelar' : '+ Nova'}
          </button>
        )}
      </div>

      {isGm && showForm && (
        <form onSubmit={handleCreate} className="reveal-form">
          {catalog.length > 0 && (
            <select value={catalogPick} onChange={(e) => pickFromCatalog(e.target.value)}>
              <option value="">Do catálogo… (ou digite abaixo)</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="reveal-form-row">
            <input
              placeholder="Categoria (ex: Física)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <input
              placeholder="Custo (ex: Spirit)"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
            <input
              placeholder="Nível (ex: III)"
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: e.target.value })}
            />
          </div>
          <textarea
            rows={2}
            placeholder="Descrição / efeito"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button type="submit" disabled={saving || !form.name.trim()}>
            Criar (oculta por padrão)
          </button>
        </form>
      )}

      {abilities.length === 0 ? (
        <p className="muted empty-list-hint">Nenhuma habilidade registrada ainda.</p>
      ) : (
        <ul className="reveal-list">
          {abilities.map((a) => (
            <li key={a.id} className={a.visible_to_player ? '' : 'hidden-item'}>
              <div className="reveal-item-main">
                <div className="reveal-item-head">
                  <strong>{a.name}</strong>
                  {a.tier && <span className="tag">{a.tier}</span>}
                  {a.category && <span className="tag">{a.category}</span>}
                  {a.cost && <span className="tag cost-tag">{a.cost}</span>}
                  {!a.visible_to_player && <span className="tag hidden-tag">Oculta do jogador</span>}
                </div>
                {a.description && <p className="muted reveal-item-desc">{a.description}</p>}
              </div>
              {isGm && (
                <div className="reveal-item-actions">
                  <button className="link-btn" onClick={() => toggleVisible(a)}>
                    {a.visible_to_player ? 'Ocultar' : 'Revelar'}
                  </button>
                  <button className="link-btn danger" onClick={() => remove(a.id)}>
                    Apagar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
