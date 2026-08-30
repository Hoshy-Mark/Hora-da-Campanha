# Mesa RPG

Site de sessão para Mestre × Jogadores — **de qualquer sistema de RPG de mesa**, não só de uma campanha específica. O sistema de regras (D&D, Blade Strands, o que for) é importado como um **JSON** que descreve a forma da ficha; o site não tem nenhum sistema de jogo "hardcoded".

Todo mundo entra na mesma campanha e vê vida, recursos, itens e habilidades sincronizando ao vivo; o Mestre enxerga informações extras (notas, itens ainda não entregues, habilidades ainda não reveladas) que os jogadores não veem — inclusive no nível do banco de dados (Row Level Security), não só escondido na tela.

**Em produção:** [hora-da-campanha.vercel.app](https://hora-da-campanha.vercel.app)

**Status:** as 5 fases do roadmap original estão completas — auth, sistemas via JSON, campanhas, ficha de personagem sincronizada, Habilidades/Itens com revelação gradual, mapa tático com tokens arrastáveis, rastreador de iniciativa, Notas do Mestre, Segredos por personagem — mais rolador de dados compartilhado, presença online em tempo real, notificações toast, Mestre remover jogador da mesa, um motor de fórmulas que calcula campos derivados sozinho (Pilares de Ascensão, modificadores de D&D), e um Bestiário de moldes de monstro/NPC reaproveitáveis entre campanhas do mesmo sistema.

## Como o sistema genérico funciona

Um **Game System** é só um nome + um JSON com duas listas:

- **`sections`** — grupos de campos da ficha (atributos, identidade, o que o sistema precisar). Cada campo tem `key`, `label`, `type` (`number` / `text` / `longtext` / `select`) e limites opcionais.
- **`resources`** — barras ou textos que os personagens desse sistema rastreiam (vida, mana, munição, "insanidade", o que for). Tipo `bar` guarda `atual`/`max`; tipo `text` guarda uma descrição livre (ex: a "Integridade da Soul" de Blade Strands, que é qualitativa, não numérica).

**Campos calculados (fórmulas):** qualquer campo pode ter uma `formula` opcional (ex: `"FOR + RES"`, `"floor((DEX-10)/2)"`) — nesse caso vira somente-leitura e seu valor é recalculado sozinho sempre que qualquer campo da ficha muda, usando um avaliador de expressões próprio (`src/lib/formula.ts`, sem `eval`/`new Function`). Suporta `+ - * /`, parênteses, negativo unário e as funções `floor`, `ceil`, `round`, `abs`, `min`, `max`. Uma fórmula pode referenciar campos de **qualquer** seção da mesma ficha, não só da própria seção.

Dois exemplos completos ficam em [`src/examples/`](src/examples/):

- [`blade-strands.system.json`](src/examples/blade-strands.system.json) — a ficha completa de Blade Strands (9 atributos, 24 subatributos, Pilares de Ascensão **calculados automaticamente**, Estamina/Spirit/Mana como barras, Soul como texto).
- [`dnd5e.system.json`](src/examples/dnd5e.system.json) — uma ficha de D&D 5e com modificador de cada atributo calculado (`floor((valor-10)/2)`), Iniciativa e Percepção Passiva derivadas desses modificadores — pra provar que o motor não depende do Blade Strands.

Você pode carregar qualquer um dos dois direto na tela **Sistemas** do site, ou escrever o seu do zero pra outro sistema qualquer.

## Stack

- **Frontend:** React + TypeScript + Vite, validação de schema com [Zod](https://zod.dev)
- **Backend:** [Supabase](https://supabase.com) (Postgres + Auth + Realtime)
- **Deploy:** qualquer host de site estático (Vercel, Netlify, Cloudflare Pages…)

## Como rodar localmente

### 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto (grátis).
2. No painel do projeto, vá em **SQL Editor** → cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → execute. Isso já cria o bucket de Storage usado pelos mapas, então não precisa mexer na aba Storage manualmente.
3. Se o projeto Supabase já existir e você já tiver rodado uma versão anterior deste schema, **não rode `schema.sql` de novo** — em vez disso rode os arquivos em [`supabase/migrations/`](supabase/migrations/) que ainda faltar, em ordem numérica, cada um no SQL Editor.
4. Vá em **Project Settings → API**. Copie a **Project URL** e a chave **anon public** (ou a nova `publishable key`, que é a recomendada atualmente).
5. Vá em **Authentication → Sign In / Providers → Email** e confirme que o provedor Email está **habilitado** (em projetos novos às vezes vem desligado por padrão, e o cadastro falha com `email_provider_disabled`).
6. (Recomendado para testar localmente) Na mesma tela, desmarque **"Confirm email"**. Por padrão o Supabase exige confirmar o e-mail antes do primeiro login — sem SMTP configurado isso trava o cadastro de teste. Pode reativar depois, quando for para produção com um provedor de e-mail de verdade.

### 2. Configurar o projeto local

```bash
cp .env.example .env
```

Edite `.env`:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

### 3. Instalar e rodar

```bash
npm install
npm run dev
```

## Como testar o fluxo completo

1. Crie uma conta.
2. Vá em **Sistemas** → clique em "Exemplo: Blade Strands" (ou D&D) → Salvar Sistema.
3. Vá em **Campanhas** → crie uma campanha escolhendo esse sistema → você vira o Mestre.
4. Copie o **código de convite**. Numa aba anônima (ou outra conta), entre com esse código → essa conta vira Jogador.
5. Abra a mesma campanha nas duas contas: a lista de "Na mesa" e a pré-visualização da ficha atualizam sozinhas.

## Deploy

```bash
npm run build
```

Suba `dist/` na Vercel/Netlify e configure as variáveis de ambiente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) no painel do host.

## Roadmap

- [x] **Fase 1** — Auth, sistema genérico via JSON, criar/entrar em campanha, presença ao vivo, preview de schema
- [x] **Fase 2** — Ficha de personagem sincronizada: formulário gerado a partir do `schema` do sistema, `sheet_data` editável em tempo real por Jogador e Mestre
- [x] **Fase 3** — Habilidades (`character_abilities`) e itens (`inventory_items`) com revelação gradual (`visible_to_player`) — Mestre cria oculto, revela quando quiser
- [x] **Fase 4** — Mapa tático: upload de imagem por campanha (Supabase Storage), tokens de personagens/NPCs/inimigos arrastáveis, posição sincronizada em tempo real, revelação gradual de tokens ocultos (mesmo mecanismo de Habilidades/Itens)
- [x] **Fase 5** — Rastreador de iniciativa/combate (visível a todos, com entradas ocultáveis pra emboscadas), Notas do Mestre (aba exclusiva do GM) e Segredos por personagem (`character_secrets` — nunca visível a jogadores)
- [x] **Rolador de Dados** — expressões `NdM+K` (ex: `1d20+5`), log compartilhado da mesa em tempo real, botões rápidos por dado, e "Rolar Iniciativa" no rastreador de combate (rola 1d20 pra cada combatente usando o valor já digitado como modificador)
- [x] **Presença online** — quem está com a aba aberta agora (Supabase Presence, sem tabela/migration), bolinha verde/cinza ao lado de cada nome em "Na mesa"
- [x] **Deploy em produção** — [hora-da-campanha.vercel.app](https://hora-da-campanha.vercel.app), auto-deploy a cada push no GitHub
- [x] **Notificações toast** — substituem o texto vermelho simples de erro; também cobrem escritas que antes falhavam em silêncio (nenhum componente conferia `{ error }` da resposta do Supabase)
- [x] **Mestre remover jogador da mesa** — botão "Remover" em cada linha de "Na mesa" (a permissão já existia via RLS, só faltava a UI)
- [x] **Motor de fórmulas** — campos com `formula` no schema são calculados automaticamente (avaliador de expressões próprio, sem `eval`) e recalculados a cada edição. Pilares de Ascensão de Blade Strands e modificadores de D&D agora são de verdade, não texto digitado.
- [x] **Bestiário** — tela **Bestiário** pra criar moldes de monstro/NPC reutilizáveis entre qualquer campanha que use o mesmo sistema (ficha completa via `SheetFieldsEditor`/`ResourceBar`, habilidades e itens embutidos como JSON). Dentro de uma campanha, o Mestre escolhe um molde num seletor ao lado de "+ Criar personagem" e clica "+ Instanciar": vira um personagem novo (NPC, oculto por padrão) com a ficha já preenchida e as habilidades/itens copiados como `character_abilities`/`inventory_items` de verdade (ocultos, revele quando quiser). Requer a migration `005_monster_templates.sql`.
- [x] **Editor de mapas por tiles** — na aba **Mapa**, "+ Novo mapa" agora tem duas abas: "Upload de imagem" (o que já existia) e "Mapa de tiles" (escolhe colunas x linhas e cria um grid em branco). O Mestre pinta o grid com uma paleta (Vazio, Chão, Parede, Porta, Árvore, Água) clicando ou arrastando sobre as células — dá pra montar quartos, corredores e dungeons sem precisar de nenhum arquivo de imagem. Os tokens de personagem funcionam por cima do grid do mesmo jeito que funcionam por cima de uma imagem (mesmo mecanismo de posição em porcentagem). Requer a migration `006_tile_maps.sql`.
- [x] **Névoa de guerra (mapa de tiles)** — na aba do mapa de tiles, alterna entre "Terreno" e "Névoa de guerra". Ativar a névoa esconde o grid inteiro dos jogadores (cada jogador vê um bloco opaco onde não foi revelado); o Mestre pinta com pincel "Revelar"/"Ocultar" (ou usa "Revelar tudo"/"Ocultar tudo") e sempre enxerga o terreno de verdade por baixo, só um pouco esmaecido onde ainda está oculto pros jogadores. Guardado dentro do mesmo `tile_data` já existente — não precisa de migration nova. Tokens não são afetados pela névoa (continuam usando o próprio `visible_to_player`); pra emboscadas/áreas não exploradas, oculte o token também.
- [x] **Tokens encaixam na grade** — arrastar um token num mapa de tiles gruda ele no centro da célula mais próxima (em tempo real, durante o arrasto) em vez de deixar em posição livre. Mapa de imagem continua livre, sem grade pra encaixar. Sem migration, é só lógica de cliente.
- [x] **Handouts** — nova aba **Handouts**, visível a todos. O Mestre sobe uma imagem e/ou escreve um texto (carta, retrato de NPC, pista, mapa de tesouro) e revela quando quiser — mesmo mecanismo de `visible_to_player` usado em habilidades/itens/tokens. Requer a migration `007_handouts.sql` (cria a tabela e um bucket de Storage próprio, `handouts`, com a mesma política do bucket `maps`).
- [x] **Jogador cria a própria ficha** — antes só o Mestre podia criar qualquer personagem; agora o jogador também consegue criar (e depois apagar) um personagem pra si mesmo, direto na campanha. O Mestre continua controlando NPCs e podendo criar/apagar a ficha de qualquer um. Requer a migration `008_player_created_characters.sql` (troca as políticas de insert/delete de `characters`).
- [x] **Paleta de tiles maior** — Escada, Baú, Lava, Altar e Entulho, além dos 6 tipos originais. Sem migration (o grid guarda os tipos como texto livre num jsonb, então nunca dependeu de uma lista fixa no banco).
- [x] **Avatar de imagem no token** — token de mapa pode ter uma imagem (retrato do personagem, arte do monstro) em vez da bolinha colorida — na criação do token ou depois, com "Trocar imagem"/"Remover imagem" na lista de tokens do Mestre. Reaproveita o bucket `maps` que já existe (mesma permissão: só o Mestre sobe/remove). Requer a migration `009_token_avatars.sql` (só adiciona a coluna `image_path`, sem bucket nem policy nova).
- [x] **Catálogo de Itens/Habilidades via JSON** — nova tela **Catálogo**: importa uma lista de itens/habilidades "padrão" de um sistema por JSON (mesmo fluxo de colar/subir/exemplo pronto de Sistemas), ficam salvos como entradas reutilizáveis. Na ficha, o Mestre agora tem um seletor "Do catálogo…" ao criar um item/habilidade — escolher preenche o formulário na hora, em vez de digitar tudo de novo (ainda dá pra digitar avulso como antes). Requer a migration `010_catalog_entries.sql`.
- [x] **Marcadores de status no token** — na lista de tokens do Mestre (mapa), "+ Status" abre um seletor rápido (Envenenado, Atordoado, Amedrontado, Paralisado, Sangrando, Invisível, Escondido, Concentrando) ou aceita uma condição customizada digitada; condições ativas aparecem como tags removíveis na lista e como ícones pequenos sobre o token no mapa. Requer a migration `011_token_status_effects.sql`.
- [x] **Régua de distância no mapa de tiles** — terceira aba junto de "Terreno"/"Névoa de guerra": clique e arraste entre duas células pra ver a distância (regra simplificada tipo D&D 5e, diagonal conta como 1 célula). Não grava nada no banco — é só uma medição visual temporária, então não tem migration.
- [x] **Combate melhorado** — a aba Combate agora deixa mais claro que ela só controla a *ordem dos turnos* (texto explicativo no topo, posição numerada "1º/2º/3º..."). Quando uma linha está ligada a um personagem, a barra de vida/recursos dele aparece embaixo do nome, editável ali mesmo (mesmo mecanismo de debounce da Ficha, sem precisar trocar de aba). Dá pra marcar um combatente como "Derrotado" sem apagar da lista — "Próximo turno" pula quem está derrotado automaticamente. E dá pra colocar as mesmas condições de status dos tokens (Envenenado, Atordoado etc.) direto num combatente — são independentes do status do token do mapa, não sincronizam automaticamente. Requer a migration `012_combat_improvements.sql`.
- [x] **Combate integrado ao mapa** — uma faixa de iniciativa compacta aparece no topo do próprio mapa (com "Iniciar"/"Próximo →" pro Mestre), sem precisar abrir a aba Combate. O token de quem está na vez ganha um contorno destacado. Clicar num token abre um popover com a vida/recursos daquele combatente (editável ali mesmo) e as condições de status dele. Sem migration — reaproveita as tabelas `initiative_entries` e `map_tokens` que já existem.
- [x] **Painel de tokens flutuante** — "Tokens neste mapa" saiu de baixo do mapa e virou um painel retrátil (botão "🎭 Tokens" no canto), sobrepondo o mapa em vez de empurrar o resto da página pra baixo.
- [x] **Modo "ver como jogador"** — botão no Mestre pra pré-visualizar o mapa exatamente como um jogador vê (névoa oculta vira bloco opaco de verdade, tokens ocultos somem, controles de edição ficam escondidos) sem precisar logar em outra conta. Puramente visual, não mexe em dado nenhum.
- [ ] **Fase futura, não decidida ainda** — nada planejado no momento

## Nota de arquitetura: não confie só no eco do Realtime

Toda ação de criar/atualizar/apagar neste app segue o mesmo padrão: **atualiza o estado local imediatamente após a escrita ter sucesso, sem esperar o Realtime devolver o mesmo evento pra quem fez a ação**. O Realtime continua sendo o mecanismo que propaga a mudança pros *outros* participantes da sessão — mas quem executou a ação vê o resultado na hora, mesmo que o round-trip do Realtime atrase ou falhe por qualquer motivo de rede. Isso foi corrigido depois de um caso real: trocar o mapa ativo pelo dropdown gravava certinho no banco (confirmado no payload da requisição), mas a tela só atualizaria quando o evento de Realtime voltasse — e ficava esperando pra sempre se isso não acontecesse. Se for adicionar uma nova lista/painel a este projeto, siga o mesmo padrão dos componentes existentes (`AbilityList`, `ItemList`, `CombatTracker`, `MapBoard`, `GmNotes`, `CharacterSecrets`): sempre atualize o estado local (otimista ou via `refresh()`) depois de qualquer escrita bem-sucedida.
