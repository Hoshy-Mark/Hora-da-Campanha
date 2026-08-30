import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { logActivity } from '../lib/activity';

interface Handout {
  id: string;
  campaign_id: string;
  title: string;
  content: string | null;
  image_path: string | null;
  visible_to_player: boolean;
}

interface Props {
  campaignId: string;
  isGm: boolean;
}

export function Handouts({ campaignId, isGm }: Props) {
  const { showToast } = useToast();
  const [handouts, setHandouts] = useState<Handout[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const { data } = await supabase
      .from('handouts')
      .select('id, campaign_id, title, content, image_path, visible_to_player')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    setHandouts((data ?? []) as unknown as Handout[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('handouts')
        .select('id, campaign_id, title, content, image_path, visible_to_player')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });
      if (!cancelled) setHandouts((data ?? []) as unknown as Handout[]);
    }

    load();

    const channel = supabase
      .channel(`handouts-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'handouts', filter: `campaign_id=eq.${campaignId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  function publicUrlFor(path: string) {
    return supabase.storage.from('handouts').getPublicUrl(path).data.publicUrl;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    let imagePath: string | null = null;
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${campaignId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('handouts').upload(path, file);
      if (uploadErr) {
        setSaving(false);
        showToast(uploadErr.message, 'error');
        return;
      }
      imagePath = path;
    }

    const { error } = await supabase.from('handouts').insert({
      campaign_id: campaignId,
      title: title.trim(),
      content: content.trim() || null,
      image_path: imagePath,
      visible_to_player: false,
    });

    setSaving(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setTitle('');
    setContent('');
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast('Handout criado (oculto por padrão)!', 'success');
    await refresh();
  }

  async function toggleVisible(h: Handout) {
    const revealing = !h.visible_to_player;
    const { error } = await supabase.from('handouts').update({ visible_to_player: revealing }).eq('id', h.id);
    if (error) showToast(error.message, 'error');
    else if (revealing) logActivity(campaignId, `Handout "${h.title}" foi revelado.`);
    await refresh();
  }

  async function remove(h: Handout) {
    if (!confirm(`Apagar o handout "${h.title}"?`)) return;
    const { error } = await supabase.from('handouts').delete().eq('id', h.id);
    if (error) showToast(error.message, 'error');
    else if (h.image_path) await supabase.storage.from('handouts').remove([h.image_path]);
    await refresh();
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visibleHandouts = handouts.filter(
    (h) => !normalizedSearch || h.title.toLowerCase().includes(normalizedSearch)
  );

  return (
    <div className="handouts-page">
      <div className="section-head-row">
        <h2>Handouts</h2>
        <div className="map-controls">
          {handouts.length > 3 && (
            <input
              placeholder="Buscar por título…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="list-search-input"
            />
          )}
          {isGm && (
            <button className="link-btn" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancelar' : '+ Novo handout'}
            </button>
          )}
        </div>
      </div>
      {isGm && (
        <p className="muted gm-notes-hint">Imagens, cartas e pistas — crie oculto e revele pros jogadores na hora certa.</p>
      )}

      {isGm && showForm && (
        <form onSubmit={handleCreate} className="reveal-form">
          <input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea rows={3} placeholder="Texto (opcional)" value={content} onChange={(e) => setContent(e.target.value)} />
          <input ref={fileInputRef} type="file" accept="image/*" />
          <button type="submit" disabled={saving || !title.trim()}>
            {saving ? 'Salvando…' : 'Criar (oculto por padrão)'}
          </button>
        </form>
      )}

      {visibleHandouts.length === 0 ? (
        <p className="muted empty-list-hint">
          {handouts.length > 0
            ? 'Nenhum handout corresponde à busca.'
            : isGm
              ? 'Nenhum handout ainda.'
              : 'O Mestre ainda não revelou nada por aqui.'}
        </p>
      ) : (
        <div className="handout-grid">
          {visibleHandouts.map((h) => (
            <div key={h.id} className={`sheet-card handout-card ${h.visible_to_player ? '' : 'hidden-item'}`}>
              {h.image_path && (
                <a href={publicUrlFor(h.image_path)} target="_blank" rel="noreferrer" className="handout-image-link">
                  <img src={publicUrlFor(h.image_path)} alt={h.title} className="handout-image" />
                </a>
              )}
              <div className="reveal-item-head">
                <strong>{h.title}</strong>
                {!h.visible_to_player && <span className="tag hidden-tag">Oculto do jogador</span>}
              </div>
              {h.content && <p className="muted reveal-item-desc">{h.content}</p>}
              {isGm && (
                <div className="reveal-item-actions">
                  <button className="link-btn" onClick={() => toggleVisible(h)}>
                    {h.visible_to_player ? 'Ocultar' : 'Revelar'}
                  </button>
                  <button className="link-btn danger" onClick={() => remove(h)}>
                    Apagar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
