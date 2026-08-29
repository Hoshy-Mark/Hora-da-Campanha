import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

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
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        .order('joined_at', { ascending: false }),
      supabase.from('game_systems').select('id, name').eq('owner_id', user!.id).order('name'),
    ]);

    if (campaignError) setError(campaignError.message);
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
    setError(null);
    const { data, error } = await supabase.rpc('create_campaign', {
      p_name: newCampaignName.trim(),
      p_game_system_id: selectedSystemId,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewCampaignName('');
    if (data) navigate(`/campaign/${data.id}`);
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('join_campaign', { p_invite_code: inviteCode.trim() });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInviteCode('');
    if (data) navigate(`/campaign/${data.id}`);
  }

  return (
    <div className="dashboard">
      <h1>Suas Campanhas</h1>

      {error && <p className="auth-error">{error}</p>}

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
            <li key={c.campaign_id}>
              <button className="campaign-card" onClick={() => navigate(`/campaign/${c.campaign_id}`)}>
                <strong>{c.campaigns?.name ?? '(campanha removida)'}</strong>
                <span className={`role-badge role-${c.role}`}>{c.role === 'gm' ? 'Mestre' : 'Jogador'}</span>
                {c.role === 'gm' && c.campaigns && (
                  <span className="invite-hint">Convite: {c.campaigns.invite_code}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
