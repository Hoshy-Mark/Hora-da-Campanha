-- =====================================================================
-- Mesa RPG — Schema (motor genérico de sessão para qualquer sistema)
--
-- Rode este arquivo inteiro no SQL Editor SÓ em um projeto Supabase
-- NOVO, do zero. Se você já rodou uma versão anterior deste arquivo,
-- NÃO rode de novo — vai dar erro de "relation already exists". Em vez
-- disso, aplique só os arquivos novos em supabase/migrations/ (em
-- ordem, pelo número do nome) — é isso que mantém um projeto existente
-- sincronizado com as mudanças de schema mais recentes.
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- PROFILES — espelha auth.users com um nome de exibição
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_all_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- GAME_SYSTEMS — o "molde" de um sistema de RPG (D&D, Blade Strands, o
-- que for), importado como JSON. Não guarda regras de jogo nem fórmulas
-- (v1 é só a forma da ficha) — só a forma dos campos que compõem uma
-- ficha de personagem: seções de atributos e recursos (barras ou texto).
--
-- Formato esperado de `schema` (validado no cliente, ver
-- src/types/game-system.ts):
-- {
--   "name": "Blade Strands",
--   "version": "1.0",
--   "sections": [
--     { "key": "atributos", "label": "Atributos Principais",
--       "fields": [ { "key": "FOR", "label": "Força", "type": "number", "min": 1, "max": 15 }, ... ] }
--   ],
--   "resources": [
--     { "key": "estamina", "label": "Estamina", "type": "bar", "maxDefault": 100 },
--     { "key": "soul", "label": "Soul", "type": "text" }
--   ]
-- }
-- =====================================================================
create table public.game_systems (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  schema jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_systems enable row level security;

-- A policy de select que também libera leitura para membros de campanhas
-- que usam este sistema fica mais abaixo (política "game_systems_select_
-- owner_or_campaign_member"), depois que as tabelas campaigns e
-- campaign_members existirem — ela faz join com as duas.

create policy "game_systems_insert_own"
  on public.game_systems for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "game_systems_update_owner_only"
  on public.game_systems for update
  to authenticated
  using (owner_id = auth.uid());

create policy "game_systems_delete_owner_only"
  on public.game_systems for delete
  to authenticated
  using (owner_id = auth.uid());

-- =====================================================================
-- CAMPAIGNS — uma mesa/campanha, rodando em cima de um game_system
-- =====================================================================
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  gm_id uuid not null references public.profiles(id) on delete cascade,
  game_system_id uuid not null references public.game_systems(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;

-- =====================================================================
-- CAMPAIGN_MEMBERS — quem é Mestre e quem é Jogador em cada campanha
-- =====================================================================
create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('gm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

alter table public.campaign_members enable row level security;

create function public.is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid()
  );
$$;

create function public.is_campaign_gm(p_campaign_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid() and role = 'gm'
  );
$$;

create policy "campaigns_select_members"
  on public.campaigns for select
  to authenticated
  using (public.is_campaign_member(id));

create policy "campaigns_insert_any_authenticated"
  on public.campaigns for insert
  to authenticated
  with check (gm_id = auth.uid());

create policy "campaigns_update_gm_only"
  on public.campaigns for update
  to authenticated
  using (public.is_campaign_gm(id));

create policy "campaigns_delete_gm_only"
  on public.campaigns for delete
  to authenticated
  using (public.is_campaign_gm(id));

create policy "campaign_members_select_members"
  on public.campaign_members for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "campaign_members_delete_gm_or_self"
  on public.campaign_members for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id) or user_id = auth.uid());

-- Agora que campaigns e campaign_members existem, fecha a policy de
-- select de game_systems: dono sempre lê o próprio sistema, e qualquer
-- membro de uma campanha que usa esse sistema também precisa ler o
-- schema pra montar a ficha.
create policy "game_systems_select_owner_or_campaign_member"
  on public.game_systems for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.campaigns c
      join public.campaign_members cm on cm.campaign_id = c.id
      where c.game_system_id = game_systems.id and cm.user_id = auth.uid()
    )
  );

-- =====================================================================
-- RPCs — criar sistema, criar campanha (GM), entrar em campanha (Jogador)
-- =====================================================================
create function public.create_game_system(p_name text, p_schema jsonb)
returns public.game_systems
language plpgsql
security definer set search_path = public
as $$
declare
  v_system public.game_systems;
begin
  insert into public.game_systems (owner_id, name, schema)
  values (auth.uid(), p_name, p_schema)
  returning * into v_system;

  return v_system;
end;
$$;

create function public.update_game_system(p_id uuid, p_name text, p_schema jsonb)
returns public.game_systems
language plpgsql
security definer set search_path = public
as $$
declare
  v_system public.game_systems;
begin
  update public.game_systems
    set name = p_name, schema = p_schema, updated_at = now()
    where id = p_id and owner_id = auth.uid()
    returning * into v_system;

  if v_system.id is null then
    raise exception 'Sistema não encontrado ou sem permissão para editar';
  end if;

  return v_system;
end;
$$;

create function public.create_campaign(p_name text, p_game_system_id uuid)
returns public.campaigns
language plpgsql
security definer set search_path = public
as $$
declare
  v_campaign public.campaigns;
  v_code text;
begin
  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into public.campaigns (name, invite_code, gm_id, game_system_id)
  values (p_name, v_code, auth.uid(), p_game_system_id)
  returning * into v_campaign;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign.id, auth.uid(), 'gm');

  return v_campaign;
end;
$$;

create function public.join_campaign(p_invite_code text)
returns public.campaigns
language plpgsql
security definer set search_path = public
as $$
declare
  v_campaign public.campaigns;
begin
  select * into v_campaign from public.campaigns where invite_code = upper(p_invite_code);

  if v_campaign.id is null then
    raise exception 'Código de convite inválido';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign.id, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;

  return v_campaign;
end;
$$;

-- =====================================================================
-- CHARACTERS — ficha de personagem. `sheet_data` é livre: seu formato é
-- ditado pelo `schema` do game_system da campanha, não por colunas fixas.
-- =====================================================================
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null, -- null = NPC controlado pelo Mestre
  name text not null,
  sheet_data jsonb not null default '{"fields": {}, "resources": {}}'::jsonb,
  is_npc boolean not null default false,
  avatar_path text, -- retrato opcional, bucket "maps" em "{campaign_id}/characters/{arquivo}"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.characters enable row level security;

create policy "characters_select_members"
  on public.characters for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

-- Um jogador pode criar uma ficha pra si mesmo (owner_id = seu próprio
-- id, is_npc = false) numa campanha em que já é membro; o Mestre pode
-- criar qualquer ficha (incluindo NPCs e fichas de outros jogadores).
create policy "characters_insert_gm_or_self"
  on public.characters for insert
  to authenticated
  with check (
    public.is_campaign_gm(campaign_id)
    or (owner_id = auth.uid() and is_npc = false and public.is_campaign_member(campaign_id))
  );

create policy "characters_update_owner_or_gm"
  on public.characters for update
  to authenticated
  using (owner_id = auth.uid() or public.is_campaign_gm(campaign_id));

create policy "characters_delete_gm_or_self"
  on public.characters for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id) or owner_id = auth.uid());

-- =====================================================================
-- CHARACTER_SECRETS — informações do personagem que o próprio jogador
-- não vê. Tabela separada porque RLS do Postgres é por linha, não coluna.
-- =====================================================================
create table public.character_secrets (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.character_secrets enable row level security;

create policy "character_secrets_gm_only"
  on public.character_secrets for all
  to authenticated
  using (public.is_campaign_gm(campaign_id))
  with check (public.is_campaign_gm(campaign_id));

-- =====================================================================
-- CHARACTER_ABILITIES — técnicas/magias/talentos de cada personagem.
-- Campos livres em texto (tipo, custo, nível) para caber em qualquer
-- sistema sem precisar de outro schema JSON por enquanto.
-- =====================================================================
create table public.character_abilities (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  category text,      -- ex: "Física", "Arcana", "Evocação" — livre por sistema
  cost text,           -- ex: "Spirit", "1 Espaço de Magia" — livre por sistema
  tier text,            -- ex: "Nível III", "3º Círculo" — livre por sistema
  description text,
  visible_to_player boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.character_abilities enable row level security;

create policy "character_abilities_select_visible_or_gm"
  on public.character_abilities for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "character_abilities_write_gm_only"
  on public.character_abilities for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "character_abilities_update_gm_only"
  on public.character_abilities for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "character_abilities_delete_gm_only"
  on public.character_abilities for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

-- =====================================================================
-- INVENTORY_ITEMS — itens da campanha/personagens
-- =====================================================================
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null, -- null = pool da campanha
  name text not null,
  description text,
  quantity int not null default 1,
  visible_to_player boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.inventory_items enable row level security;

create policy "inventory_items_select_visible_or_gm"
  on public.inventory_items for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "inventory_items_write_gm_only"
  on public.inventory_items for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "inventory_items_update_gm_only"
  on public.inventory_items for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "inventory_items_delete_gm_only"
  on public.inventory_items for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

-- =====================================================================
-- GM_NOTES — anotações do Mestre. Nunca visível a jogadores, nem via API.
-- =====================================================================
create table public.gm_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade, -- null = nota geral da campanha
  title text not null,
  content text,
  category text not null default 'Geral', -- texto livre com sugestões na UI (Geral, NPC, Local, Facção, Missão)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gm_notes enable row level security;

create policy "gm_notes_gm_only"
  on public.gm_notes for all
  to authenticated
  using (public.is_campaign_gm(campaign_id))
  with check (public.is_campaign_gm(campaign_id));

-- =====================================================================
-- HANDOUTS — imagens/textos que o Mestre revela pros jogadores no
-- momento certo (cartas, retratos de NPC, pistas, mapas de tesouro).
-- Mesmo mecanismo de revelação gradual do resto do app.
-- =====================================================================
create table public.handouts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  content text,
  image_path text,
  visible_to_player boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.handouts enable row level security;

create policy "handouts_select_visible_or_gm"
  on public.handouts for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "handouts_insert_gm_only"
  on public.handouts for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "handouts_update_gm_only"
  on public.handouts for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "handouts_delete_gm_only"
  on public.handouts for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

-- =====================================================================
-- INITIATIVE_ENTRIES — rastreador de iniciativa/combate
-- =====================================================================
create table public.initiative_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null, -- null = entrada avulsa (ex: "Emboscada")
  label text not null,
  initiative int not null default 0,
  is_current boolean not null default false,
  visible_to_player boolean not null default true, -- mesmo mecanismo de revelação gradual do resto do app
  status_effects jsonb not null default '[]'::jsonb, -- independente do status_effects de map_tokens
  is_defeated boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.initiative_entries enable row level security;

create policy "initiative_entries_select_visible_or_gm"
  on public.initiative_entries for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "initiative_entries_insert_gm_only"
  on public.initiative_entries for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "initiative_entries_update_gm_only"
  on public.initiative_entries for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "initiative_entries_delete_gm_only"
  on public.initiative_entries for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

-- =====================================================================
-- DICE_ROLLS — log compartilhado de rolagens da mesa
-- =====================================================================
create table public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  label text,
  expression text not null,
  results jsonb not null default '[]'::jsonb,
  total integer not null,
  created_at timestamptz not null default now()
);

alter table public.dice_rolls enable row level security;

create policy "dice_rolls_select_members"
  on public.dice_rolls for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "dice_rolls_insert_own"
  on public.dice_rolls for insert
  to authenticated
  with check (public.is_campaign_member(campaign_id) and user_id = auth.uid());

-- =====================================================================
-- MONSTER_TEMPLATES — Bestiário: moldes de monstro/NPC reutilizáveis
-- entre campanhas, dono é o usuário (igual a game_systems). `abilities`
-- e `items` ficam embutidos como JSON — viram character_abilities e
-- inventory_items de verdade só na hora de instanciar numa campanha.
-- =====================================================================
create table public.monster_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  game_system_id uuid not null references public.game_systems(id) on delete cascade,
  name text not null,
  is_boss boolean not null default false,
  sheet_data jsonb not null default '{"fields": {}, "resources": {}}'::jsonb,
  abilities jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monster_templates enable row level security;

create policy "monster_templates_owner_all"
  on public.monster_templates for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- =====================================================================
-- CATALOG_ENTRIES — itens/habilidades "padrão" de um sistema,
-- reutilizáveis entre qualquer personagem de campanhas que usem esse
-- sistema. Mesma ideia de dono do monster_templates; uma linha por
-- entrada (não um documento grande) pra listar/filtrar fácil num
-- seletor na hora de criar um item/habilidade de personagem.
-- =====================================================================
create table public.catalog_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  game_system_id uuid not null references public.game_systems(id) on delete cascade,
  kind text not null check (kind in ('item', 'ability')),
  name text not null,
  category text,
  cost text,
  tier text,
  description text,
  default_quantity int,
  created_at timestamptz not null default now()
);

alter table public.catalog_entries enable row level security;

create policy "catalog_entries_owner_all"
  on public.catalog_entries for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- =====================================================================
-- TILE_DEFINITIONS — tileset customizável: tiles com imagem própria,
-- dono é o usuário mas LEITURA é liberada pra qualquer autenticado (um
-- mapa pintado pelo Mestre com um tile customizado precisa renderizar
-- certo pros jogadores também). Só criar/editar/apagar é do dono.
-- =====================================================================
create table public.tile_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  category text not null default 'Meus tiles',
  color text,
  image_path text,
  interactive boolean not null default false,
  alt_color text,
  alt_image_path text,
  created_at timestamptz not null default now()
);

alter table public.tile_definitions enable row level security;

create policy "tile_definitions_select_any_authenticated"
  on public.tile_definitions for select
  to authenticated
  using (true);

create policy "tile_definitions_insert_owner"
  on public.tile_definitions for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "tile_definitions_update_owner"
  on public.tile_definitions for update
  to authenticated
  using (owner_id = auth.uid());

create policy "tile_definitions_delete_owner"
  on public.tile_definitions for delete
  to authenticated
  using (owner_id = auth.uid());

-- =====================================================================
-- ACTIVITY_LOG — feed cronológico de eventos da campanha (revelações,
-- trocas de turno, personagem que entrou...), separado do log de dados
-- (dice_rolls). Mensagem já pronta de quem dispara o evento.
-- =====================================================================
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

create policy "activity_log_select_members"
  on public.activity_log for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "activity_log_insert_members"
  on public.activity_log for insert
  to authenticated
  with check (public.is_campaign_member(campaign_id));

-- =====================================================================
-- MAPS — mapas de uma campanha, em dois formatos possíveis (`kind`):
-- 'image' é upload de PNG/JPEG pro bucket de Storage "maps" (criado mais
-- abaixo), com `image_path` no formato "{campaign_id}/{arquivo}" — as
-- policies de Storage abaixo dependem dessa convenção pra saber quem é
-- o Mestre daquele caminho. 'tilemap' é um grid montado na própria tela
-- (sem arquivo), guardado em `tile_data` como { cols, rows, tiles[] }.
-- =====================================================================
create table public.maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  kind text not null default 'image',
  image_path text,
  tile_data jsonb,
  created_at timestamptz not null default now(),
  constraint maps_kind_check check (kind in ('image', 'tilemap')),
  constraint maps_kind_data_check check (
    (kind = 'image' and image_path is not null)
    or (kind = 'tilemap' and tile_data is not null)
  )
);

alter table public.maps enable row level security;

create policy "maps_select_members"
  on public.maps for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "maps_insert_gm_only"
  on public.maps for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

create policy "maps_update_gm_only"
  on public.maps for update
  to authenticated
  using (public.is_campaign_gm(campaign_id));

create policy "maps_delete_gm_only"
  on public.maps for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

-- Qual mapa a mesa está vendo agora. Fica em campaigns (não em maps)
-- porque é um estado da campanha, não do mapa — e assim já reaproveita
-- a policy de update "campaigns_update_gm_only" que já existe acima.
alter table public.campaigns add column current_map_id uuid references public.maps(id) on delete set null;

-- =====================================================================
-- MAP_TOKENS — ícones de personagens/NPCs/inimigos posicionados sobre um
-- mapa. Posição em porcentagem (0-100) da imagem, não em pixels — assim
-- funciona independente do tamanho de tela de quem está vendo.
-- =====================================================================
create table public.map_tokens (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null, -- null = token avulso (ex: "Goblin #3")
  label text not null,
  token_type text not null default 'other' check (token_type in ('player', 'npc', 'enemy', 'other')),
  color text,
  image_path text, -- avatar opcional, no bucket "maps" em "{campaign_id}/tokens/{arquivo}"
  status_effects jsonb not null default '[]'::jsonb, -- lista de strings livres (ex: "Envenenado")
  pos_x numeric not null default 50,
  pos_y numeric not null default 50,
  visible_to_player boolean not null default true,
  vision_radius integer, -- null = usa o padrão do app (AUTO_VISION_RADIUS) em vez de um valor fixo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.map_tokens enable row level security;

create policy "map_tokens_select_visible_or_gm"
  on public.map_tokens for select
  to authenticated
  using (
    (visible_to_player = true and public.is_campaign_member(campaign_id))
    or public.is_campaign_gm(campaign_id)
  );

create policy "map_tokens_insert_gm_only"
  on public.map_tokens for insert
  to authenticated
  with check (public.is_campaign_gm(campaign_id));

-- Mover um token: o Mestre move qualquer um; um jogador só move o token
-- do próprio personagem (arrastar no mapa durante a cena).
create policy "map_tokens_update_gm_or_owner"
  on public.map_tokens for update
  to authenticated
  using (
    public.is_campaign_gm(campaign_id)
    or exists (
      select 1 from public.characters c
      where c.id = map_tokens.character_id and c.owner_id = auth.uid()
    )
  );

create policy "map_tokens_delete_gm_only"
  on public.map_tokens for delete
  to authenticated
  using (public.is_campaign_gm(campaign_id));

-- =====================================================================
-- STORAGE — bucket público "maps" para as imagens. Público só para
-- LEITURA (qualquer um com a URL vê a imagem, sem exigir sessão) — o
-- controle de quem pode ver que aquele mapa existe continua sendo feito
-- pela tabela `maps` acima. Upload e remoção exigem ser Mestre da
-- campanha cujo id é o primeiro segmento do caminho do arquivo.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('maps', 'maps', true)
on conflict (id) do nothing;

create policy "maps_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'maps');

create policy "maps_bucket_insert_gm"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'maps' and public.is_campaign_gm((storage.foldername(name))[1]::uuid));

create policy "maps_bucket_delete_gm"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'maps' and public.is_campaign_gm((storage.foldername(name))[1]::uuid));

-- =====================================================================
-- STORAGE — bucket público "handouts", mesmo esquema de permissão do
-- bucket "maps" acima.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('handouts', 'handouts', true)
on conflict (id) do nothing;

create policy "handouts_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'handouts');

create policy "handouts_bucket_insert_gm"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'handouts' and public.is_campaign_gm((storage.foldername(name))[1]::uuid));

create policy "handouts_bucket_delete_gm"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'handouts' and public.is_campaign_gm((storage.foldername(name))[1]::uuid));

-- =====================================================================
-- STORAGE — bucket público "tiles" pras imagens de tile customizado.
-- Caminho no formato "{owner_id}/{arquivo}" — dono é quem pode subir/
-- remover, leitura é liberada geral (precisa renderizar pros jogadores).
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('tiles', 'tiles', true)
on conflict (id) do nothing;

create policy "tiles_bucket_read_public"
  on storage.objects for select
  using (bucket_id = 'tiles');

create policy "tiles_bucket_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'tiles' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "tiles_bucket_delete_owner"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'tiles' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- REALTIME — habilita replicação para as tabelas que a UI sincroniza ao vivo
-- =====================================================================
alter publication supabase_realtime add table public.characters;
alter publication supabase_realtime add table public.inventory_items;
alter publication supabase_realtime add table public.character_abilities;
alter publication supabase_realtime add table public.campaign_members;
alter publication supabase_realtime add table public.campaigns;
alter publication supabase_realtime add table public.maps;
alter publication supabase_realtime add table public.map_tokens;
alter publication supabase_realtime add table public.initiative_entries;
alter publication supabase_realtime add table public.gm_notes;
alter publication supabase_realtime add table public.character_secrets;
alter publication supabase_realtime add table public.dice_rolls;
alter publication supabase_realtime add table public.monster_templates;
alter publication supabase_realtime add table public.handouts;
alter publication supabase_realtime add table public.catalog_entries;
alter publication supabase_realtime add table public.tile_definitions;
alter publication supabase_realtime add table public.activity_log;
