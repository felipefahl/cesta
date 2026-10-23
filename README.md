# Cesta

Lista de compras compartilhada para duas pessoas. Site instalável no celular (PWA). O Firebase cuida do login e da sincronização em tempo real, e a Netlify hospeda os arquivos. Funciona sem sinal e sincroniza quando a conexão volta.

## Como funciona

- **Lista**: o fluxo da compra em andamento é **Verificar → Para comprar → No carrinho**. Em Verificar, confira e ajuste a quantidade. É possível voltar uma etapa quando precisar.
- **Recorrentes**: os itens que voltam a cada nova compra (não precisam ser mensais).
- Ao adicionar, você escolhe **Só desta vez** ou **Recorrente**. Dá para mudar depois tocando na etiqueta do item.
- **Nova compra**: os recorrentes voltam desmarcados, os avulsos já comprados saem e você decide se mantém os avulsos que ainda não comprou.
- O × na lista tira o item só desta compra. Para tirar de todas as próximas, exclua na aba Recorrentes.

## Modelo de dados

| Coleção (Firestore) | Campos |
| --- | --- |
| `recorrentes/{id}` | `nome`, `qtd`, `criadoEm` |
| `lista/{id}` | `nome`, `qtd`, `etapa` (`verificar`, `comprar` ou `carrinho`), `comprado` (compatibilidade), `recorrenteId` (ou `null` se avulso), `criadoEm` |

Itens já existentes sem `etapa` continuam aparecendo em **Para comprar** ou **No carrinho**, conforme o campo `comprado`.

A lógica de adicionar e de nova compra fica em `public/logica.js`, sem dependências, com testes em `tests/`.

## O que é e o que não é segredo

| Item | Pode ir para o GitHub público? |
| --- | --- |
| `public/firebase-config.js` (chave, projectId, appId) | Sim. Só identifica o projeto, e foi feito para ficar no navegador. |
| `firestore.rules` com os dois UIDs | Sim. O UID é um código opaco e não dá acesso à conta. |
| Senhas e e-mails das contas | Não ficam no projeto. Existem só no Firebase Authentication. |
| Chaves de conta de serviço (`*.json`), tokens (`FIREBASE_TOKEN`, tokens da Netlify) | **Nunca.** O `.gitignore` já bloqueia os nomes mais comuns. Este projeto não usa nenhum. |

Quem protege os dados são o login (com criação de contas desativada) e as regras do Firestore, que só liberam os dois UIDs.

## Passo a passo

### 1. Firebase (login e banco)

1. Em https://console.firebase.google.com crie um projeto (plano Spark, gratuito).
2. Em Configurações do projeto > Seus apps, registre um app da Web e copie o objeto `firebaseConfig` para `public/firebase-config.js`.
3. Authentication > Sign-in method: ative **E-mail/senha**. Em Users, adicione as duas contas. Em Settings > User actions, desative a criação de novas contas.
4. Ainda em Users, copie o **User UID** das duas contas e cole em `firestore.rules`, no lugar dos textos de exemplo.
5. Firestore Database: crie o banco em modo de produção, numa região da Europa (não dá para trocar depois).
6. Publique as regras. Pelo console (aba Rules > colar o conteúdo de `firestore.rules` > Publish) ou pelo terminal:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   npm run deploy:regras
   ```

### 2. GitHub (público)

Antes do primeiro commit, deixe o seu e-mail fora do histórico público. Em GitHub > Settings > Emails, marque "Keep my email addresses private" e use o endereço `...@users.noreply.github.com` no Git:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "ID+usuario@users.noreply.github.com"
```

Depois, dentro da pasta do projeto:

```bash
git init
git add .
git status          # confira: só deve aparecer código, nada de .env ou .json de credenciais
git commit -m "Cesta: primeira versão"
git branch -M main
```

Crie o repositório em https://github.com/new (nome `cesta`, **Public**, sem README nem .gitignore, porque o projeto já tem). Em seguida:

```bash
git remote add origin https://github.com/SEU_USUARIO/cesta.git
git push -u origin main
```

Com o GitHub CLI, tudo em um comando: `gh repo create cesta --public --source=. --push`.

### 3. Netlify (hospedagem)

1. Em Netlify: Add new site > Import an existing project > GitHub > repositório `cesta`.
2. Deixe o comando de build vazio. A pasta publicada (`public`) já vem do `netlify.toml`.
3. Depois do deploy, você recebe um endereço `algo.netlify.app`. A partir daí, cada `git push` publica uma versão nova.

### 4. Domínio da Squarespace

Use um subdomínio, por exemplo `compras.seudominio.com`. É o caminho mais simples e não mexe no resto do domínio.

1. Na Netlify: Site configuration > Domain management > Add a domain, e informe `compras.seudominio.com`.
2. Na Squarespace: Domínios > seu domínio > DNS > Configurações de DNS > adicionar registro `CNAME`, host `compras`, dados `algo.netlify.app` (o endereço do seu site).
3. Espere a propagação (de minutos a algumas horas). A Netlify emite o certificado HTTPS sozinha.
4. Não troque os servidores de nomes do domínio para a Netlify se o domínio tem site ou e-mail na Squarespace.
5. No Firebase: Authentication > Settings > Authorized domains, adicione `compras.seudominio.com` e `algo.netlify.app`.

### 5. Usar no celular

Abra o endereço no celular, entre com a conta e use "Adicionar à tela inicial" (iPhone: Compartilhar > Adicionar à Tela de Início; Android: menu do navegador > Instalar app).

## Desenvolvimento

```bash
npm test          # testa a lógica
npm run serve     # serve a pasta public em http://localhost:3000
```

O login funciona em `localhost` com o seu projeto real. Ao alterar arquivos do app, aumente `VERSAO` em `public/sw.js` para os celulares pegarem a versão nova mais rápido.

## Endurecimento opcional

No Google Cloud Console > APIs e serviços > Credenciais, abra a chave de API do navegador do projeto e restrinja por referenciador HTTP aos seus domínios (`compras.seudominio.com/*`, `algo.netlify.app/*` e `localhost/*`). Isso não é obrigatório, porque as regras já protegem os dados, mas reduz o uso indevido da chave.

## Limites

Os planos gratuitos do Firebase e da Netlify mudam com o tempo. Confira os limites atuais antes de depender deles; o uso de uma lista de compras para duas pessoas fica muito abaixo.

## Ideias para depois

- Categorias por corredor do mercado.
- Histórico de compras anteriores.
- Trocar o Firebase por ASP.NET Core + SQLite, se quiser treinar .NET (a lógica de `logica.js` se traduz direto).
