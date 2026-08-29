# Mesa RPG

Site de sessão para Mestre × Jogadores — **de qualquer sistema de RPG de mesa**, não só de uma campanha específica. O sistema de regras (D&D, Blade Strands, o que for) é importado como um **JSON** que descreve a forma da ficha; o site não tem nenhum sistema de jogo "hardcoded".

Todo mundo entra na mesma campanha e vê vida, recursos, itens e habilidades sincronizando ao vivo; o Mestre enxerga informações extras (notas, itens ainda não entregues, habilidades ainda não reveladas) que os jogadores não veem — inclusive no nível do banco de dados (Row Level Security), não só escondido na tela.

**Fase atual: Fase 3** — autenticação, sistemas via JSON, campanhas, presença ao vivo, ficha de personagem sincronizada (gerada a partir do schema, com Estamina/Spirit/Mana/Soul editáveis em tempo real), e agora Habilidades e Itens com revelação gradual: o Mestre cadastra qualquer coisa oculta por padrão e revela quando quiser — os jogadores nem sabem que existe até isso acontecer (garantido pelo Row Level Security, não só escondido na tela).

## Como o sistema genérico funciona

Um **Game System** é só um nome + um JSON com duas listas:

- **`sections`** — grupos de campos da ficha (atributos, identidade, o que o sistema precisar). Cada campo tem `key`, `label`, `type` (`number` / `text` / `longtext` / `select`) e limites opcionais.
- **`resources`** — barras ou textos que os personagens desse sistema rastreiam (vida, mana, munição, "insanidade", o que for). Tipo `bar` guarda `atual`/`max`; tipo `text` guarda uma descrição livre (ex: a "Integridade da Soul" de Blade Strands, que é qualitativa, não numérica).

**Sem fórmulas automáticas nesta fase** — um campo derivado (tipo "Capacidade de Spirit = FOR+RES" ou "modificador de Destreza" em D&D) vira um campo numérico comum que o próprio grupo calcula e digita. Motor de fórmulas é uma fase futura, decisão deliberada pra não travar o projeto num avaliador de expressões antes de validar o resto.

Dois exemplos completos ficam em [`src/examples/`](src/examples/):

- [`blade-strands.system.json`](src/examples/blade-strands.system.json) — a ficha completa de Blade Strands (9 atributos, 24 subatributos, Pilares de Ascensão manuais, Estamina/Spirit/Mana como barras, Soul como texto).
- [`dnd5e.system.json`](src/examples/dnd5e.system.json) — uma ficha básica de D&D 5e (6 atributos, combate, HP como barra), pra provar que o motor não depende do Blade Strands.

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
- [ ] **Fase futura, não decidida ainda** — motor de fórmulas derivadas no schema (ex: modificadores de D&D, Pilares de Ascensão calculados sozinhos), presença online real via Supabase Presence, deploy em produção

## Nota de arquitetura: não confie só no eco do Realtime

Toda ação de criar/atualizar/apagar neste app segue o mesmo padrão: **atualiza o estado local imediatamente após a escrita ter sucesso, sem esperar o Realtime devolver o mesmo evento pra quem fez a ação**. O Realtime continua sendo o mecanismo que propaga a mudança pros *outros* participantes da sessão — mas quem executou a ação vê o resultado na hora, mesmo que o round-trip do Realtime atrase ou falhe por qualquer motivo de rede. Isso foi corrigido depois de um caso real: trocar o mapa ativo pelo dropdown gravava certinho no banco (confirmado no payload da requisição), mas a tela só atualizaria quando o evento de Realtime voltasse — e ficava esperando pra sempre se isso não acontecesse. Se for adicionar uma nova lista/painel a este projeto, siga o mesmo padrão dos componentes existentes (`AbilityList`, `ItemList`, `CombatTracker`, `MapBoard`, `GmNotes`, `CharacterSecrets`): sempre atualize o estado local (otimista ou via `refresh()`) depois de qualquer escrita bem-sucedida.
