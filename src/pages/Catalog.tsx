import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parseCatalogJson, type CatalogEntryInput } from '../types/catalog';
import { downloadJson } from '../lib/download';
import bladeStrandsExample from '../examples/blade-strands.catalog.json?raw';
import dnd5eExample from '../examples/dnd5e.catalog.json?raw';

interface SystemOption {
  id: string;
  name: string;
}

interface CatalogRow {
  id: string;
  game_system_id: string;
  kind: 'item' | 'ability';
  name: string;
  category: string | null;
  cost: string | null;
  tier: string | null;
  description: string | null;
  default_quantity: number | null;
}

const EXAMPLES = [
  { label: 'Exemplo: Blade Strands', json: bladeStrandsExample },
  { label: 'Exemplo: D&D 5ª Edição', json: dnd5eExample },
];

export function Catalog() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [entries, setEntries] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSystemId, setFilterSystemId] = useState('');
  const [filterKind, setFilterKind] = useState<'' | 'item' | 'ability'>('');
  const [search, setSearch] = useState('');

  const [systemId, setSystemId] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [preview, setPreview] = useState<CatalogEntryInput[] | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: systemData }, { data: entryData }] = await Promise.all([
      supabase.from('game_systems').select('id, name').eq('owner_id', user!.id).order('name'),
      supabase
        .from('catalog_entries')
        .select('id, game_system_id, kind, name, category, cost, tier, description, default_quantity')
        .eq('owner_id', user!.id)
        .order('name', { ascending: true }),
    ]);
    setSystems((systemData ?? []) as SystemOption[]);
    setEntries((entryData ?? []) as unknown as CatalogRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      const [{ data: systemData }, { data: entryData }] = await Promise.all([
        supabase.from('game_systems').select('id, name').eq('owner_id', user!.id).order('name'),
        supabase
          .from('catalog_entries')
          .select('id, game_system_id, kind, name, category, cost, tier, description, default_quantity')
          .eq('owner_id', user!.id)
          .order('name', { ascending: true }),
      ]);
      if (cancelled) return;
      setSystems((systemData ?? []) as SystemOption[]);
      setEntries((entryData ?? []) as unknown as CatalogRow[]);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`catalog-entries-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'catalog_entries', filter: `owner_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  function handleJsonChange(value: string) {
    setRawJson(value);
    if (!value.trim()) {
      setPreview(null);
      setValidationError(null);
      return;
    }
    const result = parseCatalogJson(value);
    if (result.ok && result.entries) {
      setPreview(result.entries);
      setValidationError(null);
    } else {
      setPreview(null);
      setValidationError(result.error ?? 'Erro desconhecido ao validar o JSON.');
    }
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleJsonChange(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  async function handleImport(e: FormEvent) {
    e.preventDefault();
    if (!preview || !systemId || !user) return;
    setImporting(true);

    const { error } = await supabase.from('catalog_entries').insert(
      preview.map((entry) => ({
        owner_id: user.id,
        game_system_id: systemId,
        kind: entry.kind,
        name: entry.name,
        category: entry.category ?? null,
        cost: entry.cost ?? null,
        tier: entry.tier ?? null,
        description: entry.description ?? null,
        default_quantity: entry.defaultQuantity ?? null,
      }))
    );

    setImporting(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setRawJson('');
    setPreview(null);
    setSystemId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast(`${preview.length} entrada(s) importada(s)!`, 'success');
    await loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm('Apagar esta entrada do catálogo?')) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    const { error } = await supabase.from('catalog_entries').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
  }

  const systemNameById = new Map(systems.map((s) => [s.id, s.name]));
  const normalizedSearch = search.trim().toLowerCase();
  const visibleEntries = entries.filter(
    (e) =>
      (!filterSystemId || e.game_system_id === filterSystemId) &&
      (!filterKind || e.kind === filterKind) &&
      (!normalizedSearch || e.name.toLowerCase().includes(normalizedSearch))
  );

  return (
    <div className="systems-page">
      <h1>Catálogo</h1>
      <p className="muted">
        Itens e habilidades "padrão" de um sistema, importados uma vez por JSON e reaproveitados em qualquer
        personagem de campanhas que usem esse sistema — ao criar um item/habilidade na ficha, dá pra escolher da
        lista em vez de digitar tudo de novo.
      </p>

      <section className="system-import">
        <h2>Importar entradas</h2>

        <div className="example-buttons">
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="link-btn" onClick={() => handleJsonChange(ex.json)}>
              {ex.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleImport} className="system-form">
          <label>
            Sistema
            <select value={systemId} onChange={(e) => setSystemId(e.target.value)}>
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
            Arquivo JSON
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileUpload} />
          </label>

          <label>
            Ou cole o JSON aqui
            <textarea
              rows={10}
              value={rawJson}
              onChange={(e) => handleJsonChange(e.target.value)}
              placeholder='[{ "kind": "item", "name": "...", "description": "..." }, { "kind": "ability", "name": "...", "category": "..." }]'
            />
          </label>

          {validationError && <p className="auth-error">{validationError}</p>}

          {preview && (
            <div className="schema-preview">
              <strong>Pré-visualização:</strong> {preview.length} entrada(s) —{' '}
              {preview.filter((e) => e.kind === 'ability').length} habilidade(s),{' '}
              {preview.filter((e) => e.kind === 'item').length} item(ns)
            </div>
          )}

          <button type="submit" disabled={!preview || !systemId || importing}>
            {importing ? 'Importando…' : 'Importar'}
          </button>
        </form>
      </section>

      <section>
        <div className="section-head-row">
          <h2>Entradas salvas</h2>
          <div className="map-controls">
            {visibleEntries.length > 0 && (
              <button
                className="link-btn"
                onClick={() =>
                  downloadJson(
                    'catalogo.json',
                    visibleEntries.map((e) => ({
                      kind: e.kind,
                      name: e.name,
                      category: e.category ?? undefined,
                      cost: e.cost ?? undefined,
                      tier: e.tier ?? undefined,
                      description: e.description ?? undefined,
                      defaultQuantity: e.default_quantity ?? undefined,
                    }))
                  )
                }
              >
                Baixar JSON
              </button>
            )}
            <input
              placeholder="Buscar por nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="list-search-input"
            />
            <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as '' | 'item' | 'ability')}>
              <option value="">Todos os tipos</option>
              <option value="ability">Habilidades</option>
              <option value="item">Itens</option>
            </select>
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
        </div>

        {loading ? (
          <p className="muted">Carregando…</p>
        ) : visibleEntries.length === 0 ? (
          <p className="muted">
            {entries.length === 0
              ? 'Nenhuma entrada ainda. Importe um JSON acima (ou carregue um dos exemplos).'
              : 'Nenhuma entrada corresponde à busca/filtro.'}
          </p>
        ) : (
          <ul className="system-list">
            {visibleEntries.map((e) => (
              <li key={e.id} className="system-card">
                <div>
                  <strong>{e.name}</strong>
                  <span className="tag" style={{ marginLeft: 6 }}>
                    {e.kind === 'ability' ? 'Habilidade' : 'Item'}
                  </span>
                  <span className="muted">
                    {' '}
                    — {systemNameById.get(e.game_system_id) ?? '—'}
                    {e.category ? `, ${e.category}` : ''}
                    {e.tier ? `, nível ${e.tier}` : ''}
                  </span>
                </div>
                <button className="link-btn danger" onClick={() => handleDelete(e.id)}>
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
