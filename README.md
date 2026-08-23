# Galeria de Fotos

Galerias de fotos com grid fluido, lightbox, botão de download e créditos de direito
autoral por foto. HTML/CSS/JS puro — sem build, sem dependências.

A interface do site é toda em inglês; este README e os comentários do código ficaram
em português.

- **Site:** https://lucianoamoretti.github.io/photos/
- **Enviar fotos:** https://lucianoamoretti.github.io/photos/upload/
- **Editar galerias:** https://lucianoamoretti.github.io/photos/edit/
- **Estatísticas:** https://lucianoamoretti.github.io/photos/stats/

As três últimas não aparecem em lugar nenhum do site: não têm link, levam `noindex` e estão
bloqueadas no `robots.txt`. Elas continuam acessíveis por URL — em site estático não existe
login — mas **sem o token do GitHub não fazem nada**: só leem o manifesto e falham em qualquer
escrita. O que protege o repositório é o token, não o sigilo da URL.

## Estrutura

```
index.html                  capa — lista as galerias
g/<id>/index.html           página da galeria (é o link que se compartilha)
gallery.html?g=<id>         a mesma galeria, template das páginas em g/
upload/index.html           página de envio de fotos
edit/index.html             página de edição de galerias
stats/index.html            página de estatísticas
analytics/                  coletor de estatísticas (Cloudflare Worker + D1)
galleries.json              manifesto: galerias, fotos e créditos
images/<galeria>/           foto original — é o que o botão "Baixar" entrega
images/<galeria>/view/      1800 px — o que aparece em tela cheia
images/<galeria>/thumbs/    700 px — o que aparece no grid e na capa
tools/gen-manifest.py       gerador do manifesto (para quem copia fotos na mão)
tools/make-sizes.py         gera as versões leves a partir dos originais
tools/gen-pages.py          gera as páginas de g/ a partir de gallery.html
```

### Três tamanhos por foto

O original de uma câmera tem 5 MB ou mais; 50 deles no grid seriam 250 MB no 4G.
Por isso cada foto tem três versões: o grid carrega a de 700 px, a tela cheia carrega
a de 1800 px, e só o download entrega o arquivo original. A página de upload gera as
três sozinha; se você copiar fotos na mão, rode `python3 tools/make-sizes.py`.

### Preview do link no WhatsApp

WhatsApp, Instagram e Slack não rodam JavaScript: leem só o HTML cru. Como `gallery.html`
é a mesma página para todas as galerias, o preview saía sempre com o mesmo título.
Por isso cada galeria tem uma página própria em `g/<id>/`, gerada a partir de
`gallery.html` com `<base>`, `<title>` e as tags Open Graph (nome da galeria, data,
número de fotos, autor e a miniatura da capa) já escritas no HTML.

O upload e o editor regeram essa página sozinhos a cada mudança. **Compartilhe o link
`/g/<id>/`** — é o que a capa do site usa. Links `gallery.html?g=<id>` continuam
funcionando, mas sem preview.

Uma observação: o WhatsApp guarda o preview em cache por bastante tempo. Se você já
mandou um link antes desta mudança, o preview antigo pode continuar aparecendo naquela
conversa por um tempo.

## Enviando fotos pela página de upload

A forma normal de adicionar fotos, e funciona do celular.

1. Crie um **token fine-grained** em
   [Settings → Personal access tokens](https://github.com/settings/personal-access-tokens/new):
   - *Repository access*: **Only select repositories** → `lucianoamoretti/photos`
   - *Permissions* → *Repository permissions* → **Contents: Read and write**
   - Escolha uma expiração (o GitHub avisa por e-mail quando estiver perto de vencer).
2. Abra `/upload/`, cole o token e clique em **Conectar**. Ele fica salvo no
   localStorage **deste** navegador — o botão "Esquecer token" apaga.
3. Escolha uma galeria existente ou **Nova galeria** e digite o nome.
4. Preencha os créditos padrão (autor, ano, licença) — o autor é obrigatório.
5. Escolha as fotos, ajuste título/autor de cada uma se quiser, e clique em **Publicar**.

O envio vira **um único commit** (fotos + manifesto atualizado) via API do Git do GitHub.
Por padrão as fotos são redimensionadas no próprio navegador para 2000 px no lado maior
e convertidas em JPEG a 85% de qualidade, o que corta bastante o peso no 4G. Dá para
desmarcar e enviar o arquivo original.

### Sobre o token

A página é pública, mas o token não: ele fica só no navegador de quem o colou e só é
enviado para `api.github.com`. Ninguém consegue publicar sem o próprio token.
Nunca comite o token no repositório.

## Galeria pública ou privada

Cada galeria é **pública** (aparece na capa do site, como sempre) ou **privada**. A privada
some da capa: só quem tem o link `/g/<id>/` chega nela. Opcionalmente ela pede uma **senha**
antes de mostrar as fotos. Escolhe-se no passo 2 do upload, e dá para trocar depois no editor
— inclusive virar pública, e aí ela volta para a capa.

No manifesto isso é `"visibility": "private"` e, quando tem senha, um `"lock"`.

### O que a senha faz, e o que ela não faz

Vale ler antes de mandar uma galeria privada para um cliente.

**O que ela faz:** a galeria sai da capa; a página `/g/<id>/` não abre sem a senha; a página
leva `noindex` e o preview do link não mostra a foto de capa, só o nome; a senha não fica
guardada em lugar nenhum — o manifesto tem só o resultado de PBKDF2-SHA256 com 200 mil
iterações e um sal aleatório, de onde não se volta para a senha.

**O que ela não faz:** as fotos continuam em `images/<galeria>/`, em um repositório público,
alcançáveis por URL direta. Quem souber (ou adivinhar) o caminho de um arquivo vê a foto sem
passar pela senha, e o `galleries.json` lista esses caminhos. Ou seja: isto é uma porta com
tranca, não um cofre. Serve para "não quero isso na capa nem aberto a qualquer um que chegue
no link"; não serve para material que não pode vazar.

Para privacidade de verdade as fotos precisam sair do repositório público — outro
armazenamento, com URL assinada e algo que valide a senha do lado do servidor. Não dá para
fazer isso só com GitHub Pages.

Esqueceu a senha? Não tem como recuperar, só definir outra no editor.

## Baixar a galeria inteira

Cada galeria pode mostrar um botão **"Download all"** que entrega todas as fotos em um
zip. Fica desligado por padrão: ligue por galeria, no passo 2 da página de upload ou no
editor. No manifesto isso é só `"downloadAll": true` na galeria.

O zip é montado no próprio navegador de quem baixa — não existe servidor para isso em
site estático. As fotos entram sem recompressão (já são JPEG), então o zip fica do
tamanho da soma dos originais e sai rápido: as 54 fotos da galeria do Grêmio, 289 MB,
levaram poucos segundos. O código está em `assets/js/zip.js`, sem dependência, e o
progresso aparece ao lado do botão.

Duas coisas a saber antes de ligar:

- **O que vai no zip é o arquivo original**, o mesmo do botão de cada foto — não a
  versão leve. Uma galeria de 300 MB é um download de 300 MB.
- O zip é montado na memória do aparelho. Em celular antigo, uma galeria muito grande
  pode falhar; nesse caso o visitante ainda pode baixar foto a foto.

Nas estatísticas isso conta como **um download da galeria**, não como um download de
cada foto — os números por foto continuam refletindo quem baixou aquela foto.

## Editando galerias

Em `/edit/`, com o mesmo token, dá para:

- trocar nome, data e descrição da galeria;
- escolher a miniatura (a estrela em cada foto);
- dar o mesmo nome a todas as fotos, numeradas em sequência — e, se quiser,
  renomear também os arquivos (o download sai com o nome novo);
- reordenar: por data, por nome, invertendo, com as setas ↑ ↓ ou arrastando;
- trocar autor, Instagram, ano, local e licença de uma foto ou de todas;
- apagar fotos — some o original, a miniatura e a versão de tela cheia;
- ligar ou desligar o botão de baixar a galeria inteira;
- alternar entre pública e privada, definir, trocar ou remover a senha.

Tudo o que você mexer fica listado em "Salvar" antes de confirmar, e vai em **um único commit**.
Renomear não reenvia bytes: o arquivo é movido reaproveitando o blob que já está no repositório.

## Estatísticas

Site estático não tem log de acesso: quem conta é um Cloudflare Worker com banco D1,
cujo código está em [`analytics/`](analytics/) — com o passo a passo para publicar.
Enquanto `site.statsEndpoint` estiver vazio no `galleries.json`, o site não envia nada.

Depois de configurado, `/stats/` mostra visitas da capa, aberturas por galeria e
visualizações e downloads foto a foto, com miniatura. Sem cookies e sem identificar
visitante — só contadores por dia, então não precisa de banner de consentimento.

## Adicionando fotos na mão

1. Copie os arquivos para `images/<nome-da-galeria>/`.
2. Rode `python3 tools/gen-manifest.py` — ordena as fotos pela data do EXIF,
   da mais antiga para a mais nova.
3. Rode `python3 tools/make-sizes.py` para gerar as versões leves.
   Depois `python3 tools/gen-pages.py` para atualizar as páginas de `g/`.
4. Preencha `title` e `author` das novas entradas em `galleries.json`.
5. Commit e push.

## Formato do `galleries.json`

```json
{
  "site": {
    "title": "Gallery",
    "subtitle": "Photography",
    "copyrightHolder": "Luciano Amoretti",
    "defaultAuthor": "",
    "defaultLicense": "All rights reserved",
    "defaultYear": "2026",
    "repo": "lucianoamoretti/photos",
    "branch": "main"
  },
  "galleries": [
    {
      "id": "praia-2026",
      "name": "Praia 2026",
      "date": "2026-08-17",
      "description": "Fim de semana em Wicklow",
      "createdAt": "2026-08-18",
      "cover": "images/praia-2026/por-do-sol.jpg",
      "photos": [
        {
          "file": "images/praia-2026/por-do-sol.jpg",
          "title": "Pôr do sol",
          "author": "Fulano de Tal",
          "year": "2026",
          "license": "All rights reserved",
          "location": "Wicklow, Irlanda",
          "instagram": "oliveirapaolacosta",
          "taken": "2026-08-17T20:14:03",
          "alt": "Sol se pondo atrás das montanhas"
        }
      ]
    }
  ]
}
```

Campos por foto — só `file` é obrigatório; os demais caem no padrão de `site` quando vazios:

| Campo | Descrição |
|---|---|
| `file` | Caminho relativo do arquivo |
| `title` | Legenda no card e no lightbox (padrão: "Photo N") |
| `author` | Autor da foto |
| `year` | Ano do copyright |
| `license` | Texto de licença |
| `location` | Local, mostrado ao lado da licença |
| `instagram` | Usuário do Instagram do fotógrafo, sem o @ — vira link no lightbox |
| `taken` | Data em que a foto foi tirada (EXIF), usada para ordenar |
| `alt` | Texto alternativo (acessibilidade) |
| `thumb` | Miniatura opcional para o grid |

## Recursos

- Capa listando as galerias, com foto de capa e contagem de fotos.
- Grid fluido: 4 colunas no desktop, 3 em tablet, 2 no celular.
- Cores originais das fotos (sem filtro).
- Lightbox com setas, teclado (← → Esc) e swipe no celular.
- Download em dois lugares: botão no card e botão no lightbox.
- Crédito `© ano autor` + Instagram clicável + licença visíveis em cada foto.
- "Salvar imagem" do navegador desativado nas fotos, com aviso apontando o botão
  Download — não é proteção (o arquivo precisa estar acessível para aparecer na tela),
  é um empurrão para o caminho que também conta nas estatísticas.
- Data da galeria na capa e no cabeçalho, preenchida a partir da foto mais antiga.
