import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Presença é puramente client-side (canal Realtime de Presence, sem
// tabela/migration) — reflete quem está com a aba da campanha aberta
// agora, diferente de `campaign_members` (que é permanente).
export function useOnlineUserIds(campaignId: string | undefined, userId: string | undefined, displayName: string | undefined) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!campaignId || !userId) return;

    const channel = supabase.channel(`presence-${campaignId}`, {
      config: { presence: { key: userId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      setOnlineIds(new Set(Object.keys(channel.presenceState())));
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ display_name: displayName ?? '', online_at: new Date().toISOString() });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId, userId, displayName]);

  return onlineIds;
}
