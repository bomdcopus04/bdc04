# Bom D' Copus — Gestão do Time

App web (HTML + JS puro) para gerenciar o time: adversários, campos, atletas,
jogos, escalações, gols/assistências e avaliações pós-jogo — com dashboards,
ranking de artilharia e escalação ideal calculada automaticamente.

Os dados ficam salvos no **Firebase Firestore**, então tudo que você (ou
qualquer pessoa autorizada) cadastrar fica sincronizado em tempo real e
acessível de qualquer dispositivo, mesmo com o app hospedado como site
estático no GitHub Pages.

## 1. Criar o projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um projeto (pode ser gratuito, plano Spark).
2. No menu lateral, vá em **Build → Authentication** → aba **Sign-in method** → ative o provedor **Google**.
3. Vá em **Build → Firestore Database** → **Criar banco de dados** → escolha o modo **produção** e a região mais próxima (ex: `southamerica-east1`).
4. Vá em **Configurações do projeto** (ícone de engrenagem) → aba **Geral** → seção **Seus apps** → clique no ícone **`</>`** (Web) para registrar um app web.
5. Copie o objeto `firebaseConfig` que aparece na tela.

## 2. Configurar o app

Abra `js/firebase-config.js` e:

- Cole os valores copiados no passo anterior em `firebaseConfig`.
- (Recomendado) Preencha `ALLOWED_EMAILS` com os e-mails Google de quem pode
  acessar o app (você, o técnico, etc). Deixe `[]` para liberar qualquer
  conta Google — não recomendado, pois qualquer pessoa poderia entrar.

```js
export const ALLOWED_EMAILS = [
  "seuemail@gmail.com",
  "outrapessoa@gmail.com",
];
```

## 3. Regras de segurança do Firestore

A lista `ALLOWED_EMAILS` só esconde os botões no navegador — a segurança de
verdade é configurada nas regras do Firestore. Vá em **Firestore Database →
Regras** e cole (ajustando a lista de e-mails):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function emailPermitido() {
      return request.auth != null && request.auth.token.email in [
        "seuemail@gmail.com",
        "outrapessoa@gmail.com"
      ];
    }

    // Leitura pública — alimenta Dashboard, Ranking, Escalação ideal e
    // Histórico sem exigir login. Escrita continua restrita aos e-mails
    // autorizados (telas de Jogos, Atletas, Adversários, Campos).
    match /adversarios/{id} {
      allow read: if true;
      allow write: if emailPermitido();
    }
    match /campos/{id} {
      allow read: if true;
      allow write: if emailPermitido();
    }
    match /atletas/{id} {
      allow read: if true;
      allow write: if emailPermitido();
    }
    match /jogos/{id} {
      allow read: if true;
      allow write: if emailPermitido();
    }

    // CPF e data de nascimento ficam numa coleção à parte, com o mesmo id
    // do atleta, e essa coleção NÃO é pública — só leitura/escrita para
    // e-mails autorizados.
    match /atletas_privado/{id} {
      allow read, write: if emailPermitido();
    }

    // Financeiro (lançamentos de entrada/saída/mensalidade) e a configuração
    // geral (valor da mensalidade) são dados sensíveis — nada de leitura
    // pública aqui, diferente das coleções acima.
    match /financeiro/{id} {
      allow read, write: if emailPermitido();
    }
    match /configuracoes/{id} {
      allow read, write: if emailPermitido();
    }

    // Confirmação de presença: pública de propósito (o jogador não faz
    // login). Só aceita os 4 campos esperados, uma resposta válida e o id
    // no formato jogoId_atletaId; apagar fica restrito aos e-mails autorizados.
    match /presencas/{id} {
      allow read: if true;
      allow create, update: if request.resource.data.keys().hasOnly(['jogoId', 'atletaId', 'resposta', 'atualizadoEm'])
        && request.resource.data.resposta in ['vou', 'talvez', 'nao']
        && id == request.resource.data.jogoId + '_' + request.resource.data.atletaId;
      allow delete: if emailPermitido();
    }
  }
}
```

Clique em **Publicar**. Sem isso, as telas de Jogos/Atletas/Adversários/
Campos ficam com a leitura/escrita liberada para qualquer pessoa, mesmo que
o app esconda os botões no navegador. `financeiro` e `configuracoes` ficam
totalmente fechadas (nem leitura pública) — sem publicar essas regras, a
página Financeiro dá erro de permissão ao tentar salvar.

> ℹ️ As coleções `adversarios`, `campos`, `atletas` e `jogos` ficam com
> **leitura pública** de propósito — é assim que Dashboard, Ranking,
> Escalação ideal e Histórico funcionam sem exigir login. Só a **escrita**
> (criar/editar/excluir) e a coleção `atletas_privado` (CPF, nascimento)
> exigem estar logado com um e-mail da lista `ALLOWED_EMAILS`.

## 4. Testar localmente

Como o app usa módulos ES (`type="module"`), abrir o `index.html` direto
pelo navegador (`file://`) não funciona — é preciso servir por HTTP. Duas
opções simples:

```bash
# Opção 1 — Python (já vem instalado na maioria dos sistemas)
python3 -m http.server 8000

# Opção 2 — Node
npx serve .
```

Depois acesse `http://localhost:8000`.

## 5. Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "Bom D' Copus — app de gestão do time"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source** → selecione a branch `main` e a
pasta `/ (root)` → **Save**. Em alguns minutos o app estará disponível em
`https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

> ⚠️ O arquivo `js/firebase-config.js` fica público no repositório (é assim
> mesmo para apps Firebase client-side — a chave de API não é secreta). Quem
> protege seus dados são as **regras do Firestore** do passo 3, não o
> segredo da config. Por isso não pule aquele passo.

## Estrutura do projeto

```
index.html              shell do app (sidebar desktop / barra inferior mobile + área de conteúdo)
assets/logo-bomdcopus.png  escudo do time (usado na sidebar, header mobile e tela de acesso restrito)
css/style.css           design system (cores, tipografia, componentes)
js/firebase-config.js   chaves do seu projeto Firebase + e-mails autorizados
js/auth.js              login com Google / logout
js/db.js                funções genéricas de leitura/escrita no Firestore
js/stats.js             cálculos: médias, ranking, contagens
js/filters.js           filtro de período (ano/mês) compartilhado entre Dashboard e Histórico
js/utils.js             helpers de UI (modal, toast, formatação, widget de nota)
js/app.js               roteamento (por #hash), controle de acesso e ligação entre views e dados
js/views/*.js           uma view por tela (dashboard, jogos, cadastros, avaliacao...)
```

## Navegação pública x protegida

- **Públicas (sem login):** Dashboard e o hub Relatórios (Ranking, Extrato do
  jogador, Escalação ideal e Histórico; clicar no nome de um atleta no Ranking
  abre o extrato dele).
  Qualquer pessoa com o link consegue abrir e ver os dados. Dashboard e
  Histórico têm filtros de Ano/Mês sincronizados entre si (mudar o período
  numa tela mantém a seleção ao navegar para a outra).
- **Protegidas (exige login com e-mail autorizado):** Partidas (antiga
  "Jogos", agora dentro do hub Cadastros), Atletas, Adversários, Campos,
  Avaliação e Financeiro. Sem login, esses links somem do menu e, se alguém
  tentar acessar direto pela URL (`#jogos`, `#atletas`, `#avaliacao`,
  `#financeiro`...), o app mostra uma tela de "Acesso restrito" com um botão
  para entrar com Google.
- No celular, o menu vira uma barra fixa de ícones no rodapé; no desktop
  continua como uma barra lateral.

## Modelo de dados (Firestore)

- **`adversarios`**: `{ nome, cidade, observacoes }`
- **`campos`**: `{ nome, endereco, tipo, observacoes }`
- **`atletas`**: `{ nome, posicao, numero, ativo, podeVotar, pagante, observacoes }` (pública).
  `podeVotar` marca diretores/capitão/técnicos com direito a avaliar jogadores
  na página Avaliação. `posicao` aceita as posições de linha (Goleiro,
  Zagueiro, Lateral, Volante, Meia, Atacante) ou `"Técnico"` — atletas
  marcados como Técnico não entram nas listagens de jogadores (escalação de
  partida, Ranking, Escalação ideal), mas continuam disponíveis para votar
  na Avaliação se `podeVotar` estiver marcado. `pagante` marca quem entra na
  lista de mensalidades da página Financeiro (só aparecem lá os atletas com
  `pagante: true` e `ativo` diferente de `false`).
- **`atletas_privado`**: `{ cpf, dataNascimento }`, documento com o **mesmo id**
  do atleta correspondente — coleção não pública, só leitura/escrita para
  e-mails autorizados. Ambos os campos são opcionais.
- **`jogos`**: documento central de cada partida —
  `{ data, status, adversarioId, campoId, placarNos, placarAdversario,
  escalacaoInicial: [{ atletaId, posicao }...], escalacaoFinal: [{ atletaId, posicao }...],
  golsAssistencias: [{ atletaGolId, atletaAssistId, minuto }],
  avaliacoesJogadores: { [atletaId]: { [votanteId]: { nota, obs } } },
  avaliacaoCampo: { nota, obs }, avaliacaoAdversario: { nota, obs },
  observacoes }`

  `posicao` em `escalacaoInicial`/`escalacaoFinal` é a posição que o atleta
  jogou **naquela partida específica**, não a posição de cadastro — é ela que
  alimenta a tela de Escalação ideal, já que um mesmo atleta pode jogar de
  posições diferentes em jogos diferentes. Jogos criados antes desse recurso
  existir têm esses campos como array simples de ids (sem posição); o app
  continua lendo esse formato antigo normalmente, só sem separar por posição.

  `avaliacoesJogadores` guarda uma nota por **votante** (diretor/capitão),
  para permitir várias avaliações por jogador na mesma partida — a nota
  exibida no app é sempre a média de todos os votos. Partidas antigas, de
  antes desse recurso, guardam `{ [atletaId]: { nota, obs } }` direto (um
  valor só, sem identificar quem votou); o app continua lendo esse formato
  normalmente e soma essa nota antiga como mais um voto na média.

Tudo relacionado a uma partida fica dentro do próprio documento do jogo —
mais simples de consultar e de fazer backup/export manual pelo console do
Firebase, se precisar um dia.

- **`financeiro`**: uma linha por lançamento — `{ tipo, valor, data, descricao,
  atletaId, mesRef, criadoEm }`. `tipo` é `"entrada"`, `"saida"` ou
  `"mensalidade"`. Lançamentos de entrada/saída manuais só usam
  `valor`/`data`/`descricao`; lançamentos de mensalidade (criados ao marcar
  um jogador como "pago" no mês, na página Financeiro) também preenchem
  `atletaId` e `mesRef` (`"AAAA-MM"`) e usam um id de documento fixo
  (`mens_{mesRef}_{atletaId}`), o que torna marcar/desmarcar pago uma
  operação idempotente — desmarcar simplesmente apaga o documento. O saldo
  exibido é sempre a soma de todos os lançamentos (entradas e mensalidades
  somam, saídas subtraem); não existe um "saldo inicial" separado — o saldo
  de partida é lançado manualmente como uma Entrada.
- **`configuracoes/geral`**: documento único — `{ valorMensalidade }`. Mudar
  esse valor só afeta lançamentos de mensalidade futuros; cada lançamento já
  feito guarda o valor de quando foi pago e não muda retroativamente.

## Como usar

1. Cadastre primeiro **Adversários**, **Campos** e **Atletas** (marcando
   `podeVotar` para diretores/capitão).
2. Crie um **Jogo** (pode ser antes ou depois de acontecer — use o status
   *Agendado*/*Realizado*).
3. Dentro do jogo: defina a **escalação inicial**, depois a **final**,
   registre os **gols e assistências** e, após a partida, a **avaliação do
   campo e do adversário** (aba "Campo & adversário").
4. Na página **Avaliação**, cada votante autorizado escolhe seu nome e a
   partida, e dá nota de 1 a 10 para cada jogador que entrou em campo. A nota
   final de cada jogador é a média de todos os votos recebidos.
5. As telas **Dashboard**, **Ranking**, **Escalação ideal** e **Histórico**
   são todas calculadas automaticamente a partir desses cadastros.
6. Na página **Financeiro**, marque `pagante` no cadastro dos atletas que
   pagam mensalidade, informe o valor da mensalidade, clique nos meses pra
   marcar quem pagou (isso já lança o valor no saldo) e use os botões de
   Entrada/Saída para os demais lançamentos (compra de material, aluguel de
   campo, etc.).
