import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

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
                <button
                  className="link-btn danger campaign-list-action"
                  onClick={() => handleDeleteCampaign(c.campaign_id, c.campaigns?.name ?? 'esta campanha')}
                >
                  Apagar
                </button>
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
