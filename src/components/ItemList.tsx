import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Item {
  id: string;
  campaign_id: string;
  character_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  visible_to_player: boolean;
}

interface Props {
  characterId: string;
  campaignId: string;
  isGm: boolean;
}

const emptyForm = { name: '', description: '', quantity: '1' };

export function ItemList({ characterId, campaignId, isGm }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const { data } = await supabase
      .from('inventory_items')
      .select('id, campaign_id, character_id, name, description, quantity, visible_to_player')
      .eq('character_id', characterId)
      .order('created_at', { ascending: true });
    setItems((data ?? []) as unknown as Item[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('inventory_items')
        .select('id, campaign_id, character_id, name, description, quantity, visible_to_player')
        .eq('character_id', characterId)
        .order('created_at', { ascending: true });
      if (!cancelled) setItems((data ?? []) as unknown as Item[]);
    }

    load();

    const channel = supabase
      .channel(`items-${characterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `character_id=eq.${characterId}` },
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
    await supabase.from('inventory_items').insert({
      campaign_id: campaignId,
      character_id: characterId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      quantity: Number(form.quantity) || 1,
      visible_to_player: false,
    });
    setSaving(false);
    setForm(emptyForm);
    setShowForm(false);
    await refresh();
  }

  async function toggleVisible(item: Item) {
    await supabase.from('inventory_items').update({ visible_to_player: !item.visible_to_player }).eq('id', item.id);
    await refresh();
  }

  async function changeQuantity(item: Item, delta: number) {
    const next = Math.max(0, item.quantity + delta);
    await supabase.from('inventory_items').update({ quantity: next }).eq('id', item.id);
    await refresh();
  }

  async function remove(id: string) {
    await supabase.from('inventory_items').delete().eq('id', id);
    await refresh();
  }

  return (
    <div className="sheet-card">
      <div className="section-head-row">
        <strong className="sheet-card-title" style={{ marginBottom: 0 }}>
          Itens
        </strong>
        {isGm && (
          <button className="link-btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancelar' : '+ Novo'}
          </button>
        )}
      </div>

      {isGm && showForm && (
        <form onSubmit={handleCreate} className="reveal-form">
          <div className="reveal-form-row">
            <input placeholder="Nome do item" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input
              type="number"
              min={1}
              className="qty-input"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </div>
          <textarea
            rows={2}
            placeholder="Descrição"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button type="submit" disabled={saving || !form.name.trim()}>
            Criar (oculto por padrão)
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="muted empty-list-hint">Nenhum item ainda.</p>
      ) : (
        <ul className="reveal-list">
          {items.map((item) => (
            <li key={item.id} className={item.visible_to_player ? '' : 'hidden-item'}>
              <div className="reveal-item-main">
                <div className="reveal-item-head">
                  <strong>{item.name}</strong>
                  <span className="tag">x{item.quantity}</span>
                  {!item.visible_to_player && <span className="tag hidden-tag">Oculto do jogador</span>}
                </div>
                {item.description && <p className="muted reveal-item-desc">{item.description}</p>}
              </div>
              {isGm && (
                <div className="reveal-item-actions">
                  <button className="link-btn" onClick={() => changeQuantity(item, -1)}>
                    −
                  </button>
                  <button className="link-btn" onClick={() => changeQuantity(item, 1)}>
                    +
                  </button>
                  <button className="link-btn" onClick={() => toggleVisible(item)}>
                    {item.visible_to_player ? 'Ocultar' : 'Revelar'}
                  </button>
                  <button className="link-btn danger" onClick={() => remove(item.id)}>
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
