import { supabase } from './supabase';

// Dispara-e-esquece: quem realiza a ação já registra a mensagem pronta
// no feed — evita que múltiplos clientes vendo o mesmo evento por
// Realtime dupliquem a entrada tentando logar reativamente.
//
// Precisa ser `async` + `await` de verdade aqui dentro: o query builder
// do Supabase só dispara a requisição quando alguém chama `.then()`
// (é "thenable" preguiçoso) — só segurar a referência sem awaitar
// (ex: `void supabase.from(...).insert(...)`) nunca chega a mandar
// nada pra rede. Quem chama esta função não precisa awaitar, o
// fire-and-forget acontece aqui dentro mesmo.
export async function logActivity(campaignId: string, message: string) {
  await supabase.from('activity_log').insert({ campaign_id: campaignId, message });
}
