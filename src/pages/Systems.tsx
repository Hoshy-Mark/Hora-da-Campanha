import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { parseGameSystemSchema, type GameSystemSchema } from '../types/game-system';
import bladeStrandsExample from '../examples/blade-strands.system.json?raw';
import dnd5eExample from '../examples/dnd5e.system.json?raw';

interface SystemRow {
  id: string;
  name: string;
  schema: GameSystemSchema;
  created_at: string;
}

const EXAMPLES = [
  { label: 'Exemplo: Blade Strands', json: bladeStrandsExample },
  { label: 'Exemplo: D&D 5ª Edição', json: dnd5eExample },
];

export function Systems() {
  const { user } = useAuth();
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [preview, setPreview] = useState<GameSystemSchema | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadSystems() {
    setLoading(true);
    const { data, error } = await supabase
      .from('game_systems')
      .select('id, name, schema, created_at')
      .eq('owner_id', user!.id)
      .order('created_at', { ascending: false });

    if (!error) setSystems((data ?? []) as unknown as SystemRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (user) loadSystems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleJsonChange(value: string) {
    setRawJson(value);
    setSaveError(null);

    if (!value.trim()) {
      setPreview(null);
      setValidationError(null);
      return;
    }

    const result = parseGameSystemSchema(value);
    if (result.ok && result.schema) {
      setPreview(result.schema);
      setValidationError(null);
      if (!name.trim()) setName(result.schema.name);
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

  function loadExample(json: string) {
    handleJsonChange(json);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setSaving(true);
    setSaveError(null);

    const { error } = await supabase.rpc('create_game_system', {
      p_name: name.trim() || preview.name,
      p_schema: preview,
    });

    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }

    setName('');
    setRawJson('');
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadSystems();
  }

  async function handleDelete(id: string) {
    if (!confirm('Apagar este sistema? Campanhas que já o usam deixarão de poder ser abertas.')) return;
    const { error } = await supabase.from('game_systems').delete().eq('id', id);
    if (!error) loadSystems();
  }

  return (
    <div className="systems-page">
      <h1>Meus Sistemas</h1>
      <p className="muted">
        Um sistema define a forma da ficha (seções de campos + recursos) usada pelas suas campanhas. Sem fórmulas
        automáticas ainda — campos derivados (como os Pilares de Ascensão de Blade Strands) são preenchidos à mão.
      </p>

      <section className="system-import">
        <h2>Importar novo sistema</h2>

        <div className="example-buttons">
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="link-btn" onClick={() => loadExample(ex.json)}>
              {ex.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSave} className="system-form">
          <label>
            Nome do sistema
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Blade Strands" />
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
              placeholder='{ "name": "...", "sections": [...], "resources": [...] }'
            />
          </label>

          {validationError && <p className="auth-error">{validationError}</p>}
          {saveError && <p className="auth-error">{saveError}</p>}

          {preview && (
            <div className="schema-preview">
              <strong>Pré-visualização:</strong> {preview.sections.length} seções (
              {preview.sections.map((s) => s.label).join(', ')}), {preview.resources.length} recursos (
              {preview.resources.map((r) => r.label).join(', ') || 'nenhum'})
            </div>
          )}

          <button type="submit" disabled={!preview || saving}>
            {saving ? 'Salvando…' : 'Salvar Sistema'}
          </button>
        </form>
      </section>

      <section>
        <h2>Sistemas salvos</h2>
        {loading ? (
          <p className="muted">Carregando…</p>
        ) : systems.length === 0 ? (
          <p className="muted">Nenhum sistema ainda. Importe um acima (ou carregue um dos exemplos).</p>
        ) : (
          <ul className="system-list">
            {systems.map((s) => (
              <li key={s.id} className="system-card">
                <div>
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {' '}
                    — {s.schema.sections.length} seções, {s.schema.resources.length} recursos
                  </span>
                </div>
                <button className="link-btn danger" onClick={() => handleDelete(s.id)}>
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
