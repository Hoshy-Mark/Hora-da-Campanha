import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parseCampaignBackupJson, type CampaignSnapshot } from '../types/campaign-backup';
import { buildCampaignSnapshot } from '../lib/campaignSnapshot';
import { restoreCampaignFromSnapshot } from '../lib/campaignRestore';

interface CampaignRow {
  campaign_id: string;
  role: 'gm' | 'player';
  campaigns: { id: string; name: string; invite_code: string } | null;
}

interface SystemOption {
  id: string;
  name: string;
}

export function Dashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCampaignName, setNewCampaignName] = useState('');
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importRawJson, setImportRawJson] = useState('');
  const [importPreview, setImportPreview] = useState<CampaignSnapshot | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: campaignData, error: campaignError }, { data: systemData }] = await Promise.all([
      supabase
        .from('campaign_members')
        .select('campaign_id, role, campaigns(id, name, invite_code)')
        .eq('user_id', user!.id)
        .order('joined_at', { ascending: false }),
      supabase.from('game_systems').select('id, name').eq('owner_id', user!.id).order('name'),
    ]);

    if (campaignError) showToast(campaignError.message, 'error');
    else setCampaigns((campaignData ?? []) as unknown as CampaignRow[]);

    const opts = (systemData ?? []) as SystemOption[];
    setSystems(opts);
    if (opts.length > 0) setSelectedSystemId((prev) => prev || opts[0].id);

    setLoading(false);
  }

  useEffect(() => {
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newCampaignName.trim() || !selectedSystemId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_campaign', {
      p_name: newCampaignName.trim(),
      p_game_system_id: selectedSystemId,
    });
    setBusy(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setNewCampaignName('');
    showToast('Campanha criada!', 'success');
    if (data) navigate(`/campaign/${data.id}`);
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('join_campaign', { p_invite_code: inviteCode.trim() });
    setBusy(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setInviteCode('');
    showToast('Você entrou na campanha!', 'success');
    if (data) navigate(`/campaign/${data.id}`);
  }

  function handleImportJsonChange(value: string) {
    setImportRawJson(value);
    if (!value.trim()) {
      setImportPreview(null);
      setImportError(null);
      return;
    }
    const result = parseCampaignBackupJson(value);
    if (result.ok && result.snapshot) {
      setImportPreview(result.snapshot);
      setImportError(null);
    } else {
      setImportPreview(null);
      setImportError(result.error ?? 'Erro desconhecido ao validar o backup.');
    }
  }

  function handleImportFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleImportJsonChange(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  async function handleImportSubmit(e: FormEvent) {
    e.preventDefault();
    if (!importPreview) return;
    setImporting(true);
    try {
      const { campaignId, warnings } = await restoreCampaignFromSnapshot(importPreview);
      showToast(`Campanha "${importPreview.name}" restaurada!`, 'success');
      warnings.forEach((w) => showToast(w, 'info'));
      setImportRawJson('');
      setImportPreview(null);
      setShowImport(false);
      if (importFileInputRef.current) importFileInputRef.current.value = '';
      navigate(`/campaign/${campaignId}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao restaurar a campanha.', 'error');
    } finally {
      setImporting(false);
    }
  }

  async function handleCloneCampaign(campaignId: string, name: string) {
    if (!confirm(`Clonar "${name}" como uma campanha nova? Personagens são copiados sem dono (o Mestre atribui depois); mapas de imagem não são copiados.`))
      return;
    setCloningId(campaignId);
    try {
      const snapshot = await buildCampaignSnapshot(campaignId);
      const { campaignId: newCampaignId, warnings } = await restoreCampaignFromSnapshot(snapshot);
      showToast(`Campanha "${name}" clonada!`, 'success');
      warnings.forEach((w) => showToast(w, 'info'));
      navigate(`/campaign/${newCampaignId}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao clonar a campanha.', 'error');
    } finally {
      setCloningId(null);
    }
  }

  async function handleDeleteCampaign(campaignId: string, name: string) {
    if (!confirm(`Apagar a campanha "${name}"? Isso apaga tudo dela — personagens, mapas, itens — e não tem como desfazer.`))
      return;
    setCampaigns((prev) => prev.filter((c) => c.campaign_id !== campaignId));
    const { error } = await supabase.from('campaigns').delete().eq('id', campaignId);
    if (error) {
      showToast(error.message, 'error');
      await loadAll();
    } else {
      showToast('Campanha apagada.', 'success');
    }
  }

  async function handleLeaveCampaign(campaignId: string, name: string) {
    if (!confirm(`Sair da campanha "${name}"? Você vai precisar de um novo convite pra voltar.`)) return;
    setCampaigns((prev) => prev.filter((c) => c.campaign_id !== campaignId));
    const { error } = await supabase.from('campaign_members').delete().eq('campaign_id', campaignId).eq('user_id', user!.id);
    if (error) {
      showToast(error.message, 'error');
      await loadAll();
    } else {
      showToast('Você saiu da campanha.', 'success');
    }
  }

  return (
    <div className="dashboard">
      <h1>Suas Campanhas</h1>

      <section className="dashboard-actions">
        <form onSubmit={handleCreate} className="inline-form create-campaign-form">
          <input
            placeholder="Nome da nova campanha"
            value={newCampaignName}
            onChange={(e) => setNewCampaignName(e.target.value)}
          />
          {systems.length === 0 ? (
            <span className="muted">
              Crie um <Link to="/systems">sistema</Link> primeiro.
            </span>
          ) : (
            <select value={selectedSystemId} onChange={(e) => setSelectedSystemId(e.target.value)}>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button type="submit" disabled={busy || systems.length === 0}>
            Criar (vira Mestre)
          </button>
        </form>

        <form onSubmit={handleJoin} className="inline-form">
          <input
            placeholder="Código de convite"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          />
          <button type="submit" disabled={busy}>Entrar como Jogador</button>
        </form>
      </section>

      <section className="system-import">
        <div className="section-head-row">
          <h2>Importar campanha (JSON)</h2>
          <button
            className="link-btn"
            onClick={() => {
              if (showImport) {
                setImportRawJson('');
                setImportPreview(null);
                setImportError(null);
              }
              setShowImport((s) => !s);
            }}
          >
            {showImport ? 'Cancelar' : '+ Importar campanha'}
          </button>
        </div>

        {showImport && (
          <form onSubmit={handleImportSubmit} className="system-form">
            <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
              Recria uma campanha nova a partir de um backup baixado em "Baixar backup (JSON)" dentro de uma
              campanha. É uma restauração parcial: mapas de imagem e imagens de handout não fazem parte do backup,
              então não são restaurados. Personagens nascem sem dono — atribua a um jogador depois.
            </p>
            <label>
              Arquivo JSON
              <input ref={importFileInputRef} type="file" accept=".json,application/json" onChange={handleImportFileUpload} />
            </label>
            <label>
              Ou cole o JSON aqui
              <textarea rows={8} value={importRawJson} onChange={(e) => handleImportJsonChange(e.target.value)} />
            </label>
            {importError && <p className="auth-error">{importError}</p>}
            {importPreview && (
              <div className="schema-preview">
                <strong>Pré-visualização:</strong> "{importPreview.name}" — {importPreview.characters.length}{' '}
                personagem(ns), {importPreview.maps.length} mapa(s), {importPreview.gmNotes.length} nota(s),{' '}
                {importPreview.handouts.length} handout(s)
              </div>
            )}
            <button type="submit" disabled={!importPreview || importing}>
              {importing ? 'Restaurando…' : 'Restaurar campanha'}
            </button>
          </form>
        )}
      </section>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : campaigns.length === 0 ? (
        <p className="muted">Nenhuma campanha ainda. Crie uma ou entre com um código de convite.</p>
      ) : (
        <ul className="campaign-list">
          {campaigns.map((c) => (
            <li key={c.campaign_id} className="campaign-list-item">
              <button className="campaign-card" onClick={() => navigate(`/campaign/${c.campaign_id}`)}>
                <strong>{c.campaigns?.name ?? '(campanha removida)'}</strong>
                <span className={`role-badge role-${c.role}`}>{c.role === 'gm' ? 'Mestre' : 'Jogador'}</span>
                {c.role === 'gm' && c.campaigns && (
                  <span className="invite-hint">Convite: {c.campaigns.invite_code}</span>
                )}
              </button>
              {c.role === 'gm' ? (
                <>
                  <button
                    className="link-btn campaign-list-action"
                    disabled={cloningId === c.campaign_id}
                    onClick={() => handleCloneCampaign(c.campaign_id, c.campaigns?.name ?? 'esta campanha')}
                  >
                    {cloningId === c.campaign_id ? 'Clonando…' : 'Clonar'}
                  </button>
                  <button
                    className="link-btn danger campaign-list-action"
                    onClick={() => handleDeleteCampaign(c.campaign_id, c.campaigns?.name ?? 'esta campanha')}
                  >
                    Apagar
                  </button>
                </>
              ) : (
                <button
                  className="link-btn danger campaign-list-action"
                  onClick={() => handleLeaveCampaign(c.campaign_id, c.campaigns?.name ?? 'esta campanha')}
                >
                  Sair
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
