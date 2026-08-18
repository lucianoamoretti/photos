# Estatísticas — publicando o coletor

O site é estático: ele não tem como contar nada sozinho. Quem conta é um Cloudflare
Worker com um banco D1, que este diretório contém. Sem cookies e sem identificar
visitante — só contadores por dia, o que dispensa banner de consentimento.

Tudo cabe no plano gratuito com folga (100 mil requisições/dia no Worker,
100 mil linhas escritas/dia no D1).

## Atenção: Workers, não Pages

No painel da Cloudflare existem duas coisas parecidas. O **Pages** é para publicar sites
estáticos e tem aquele "Create new deployment" com upload de arquivos — se você colar o
`worker.js` lá, aparece o erro *"This uploader does not yet support projects that require
a build process"*. O que precisamos é o **Workers**, que roda código e tem editor online.

## Passo a passo (uma vez só, tudo pelo painel)

1. **Conta**: crie uma conta grátis em [dash.cloudflare.com](https://dash.cloudflare.com).
   Não precisa ter domínio nem mudar nada do GitHub Pages.

2. **Banco**: menu **Storage & Databases → D1 SQL Database → Create**.
   Nome: `photos_stats`.
   Abra o banco criado, vá em **Console** e cole o conteúdo de
   [`schema.sql`](schema.sql). Execute.

3. **Worker**: menu **Workers & Pages → Create application → Workers → Start with Hello World!**
   Dê o nome `photos-stats` e clique em **Deploy** (ele publica o exemplo).
   Agora clique em **Edit code**, apague o exemplo, cole o conteúdo de
   [`worker.js`](worker.js) e **Deploy** de novo.

   > Se em algum momento o painel pedir para "fazer upload de arquivos" ou falar em
   > *build process*, você está no **Pages**. Volte e escolha **Workers**.

4. **Ligar o banco no Worker**: no Worker, **Settings → Bindings → Add → D1 database**.
   - *Variable name*: `DB`
   - *D1 database*: `photos_stats`

5. **Variáveis**: ainda em **Settings → Variables and Secrets**, adicione:
   - `STATS_KEY` — uma senha qualquer que você inventar (é o que protege a leitura
     dos números). Marque como **Secret**.
   - `SITE_ORIGIN` — `https://lucianoamoretti.github.io`

6. **Copie a URL do Worker** (algo como
   `https://photos-stats.SEU-USUARIO.workers.dev`) e coloque em `galleries.json`:

   ```json
   "site": {
     "statsEndpoint": "https://photos-stats.SEU-USUARIO.workers.dev"
   }
   ```

   Enquanto esse campo estiver vazio, o site simplesmente não envia nada — nada quebra.

7. Abra `/stats/` no site, cole a `STATS_KEY` e pronto.

## Alternativa: publicar direto do repositório

Em vez de colar o código, dá para o Worker acompanhar este repositório:

1. Crie o banco D1 (passo 2 acima) e copie o **Database ID**.
2. Cole esse ID em [`wrangler.jsonc`](wrangler.jsonc), no campo `database_id`, e faça commit.
3. **Workers & Pages → Create application → Workers → Import a repository**,
   escolha `lucianoamoretti/photos` e defina **Root directory** = `analytics`.
4. Depois de publicado, adicione o secret `STATS_KEY` em **Settings → Variables and Secrets**.

Assim cada push no repositório republica o Worker, e o binding do D1 já vem do
`wrangler.jsonc` — não precisa configurar à mão.

## Conferindo

```bash
# grava um evento de teste
curl -X POST https://SEU-WORKER.workers.dev/hit \
  -d '{"kind":"page","gallery":"","photo":""}'

# lê os números
curl "https://SEU-WORKER.workers.dev/stats?key=SUA_STATS_KEY&days=30"
```

## O que é contado

| Evento | Quando |
|---|---|
| `page` | Alguém abre a capa do site |
| `gallery` | Alguém abre uma galeria |
| `view` | Alguém abre uma foto em tela cheia |
| `download` | Alguém baixa uma foto (pelo card ou pelo lightbox) |

Não é gravado nada sobre quem visitou: sem cookie, sem IP, sem identificador.
Requisições de robôs e de crawlers de preview de link (WhatsApp, Slack) são descartadas
pelo User-Agent.

## Custo e limites

Free tier do Cloudflare: 100.000 requisições/dia no Worker e 100.000 linhas
escritas/dia no D1. Uma visita que abre 50 fotos e baixa 3 gera ~54 escritas.
Para o volume deste site, não chega perto do limite.
