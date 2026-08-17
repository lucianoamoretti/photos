# Galeria de Fotos

Galerias de fotos com grid fluido, lightbox, botão de download e créditos de direito
autoral por foto. HTML/CSS/JS puro — sem build, sem dependências.

- **Site:** https://lucianoamoretti.github.io/photos/
- **Upload:** https://lucianoamoretti.github.io/photos/upload/

## Estrutura

```
index.html            capa — lista as galerias
gallery.html?g=<id>   grid de uma galeria, com lightbox
upload/index.html     página de envio de fotos
galleries.json        manifesto: galerias, fotos e créditos
images/<galeria>/     arquivos das fotos, uma pasta por galeria
tools/gen-manifest.py gerador do manifesto (para quem copia fotos na mão)
```

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

## Adicionando fotos na mão

1. Copie os arquivos para `images/<nome-da-galeria>/`.
2. Rode `python3 tools/gen-manifest.py`.
3. Preencha `title` e `author` das novas entradas em `galleries.json`.
4. Commit e push.

## Formato do `galleries.json`

```json
{
  "site": {
    "title": "Galeria",
    "subtitle": "Fotografias",
    "copyrightHolder": "Luciano Amoretti",
    "defaultAuthor": "",
    "defaultLicense": "Todos os direitos reservados",
    "defaultYear": "2026",
    "repo": "lucianoamoretti/photos",
    "branch": "main"
  },
  "galleries": [
    {
      "id": "praia-2026",
      "name": "Praia 2026",
      "description": "Fim de semana em Wicklow",
      "createdAt": "2026-08-18",
      "cover": "images/praia-2026/por-do-sol.jpg",
      "photos": [
        {
          "file": "images/praia-2026/por-do-sol.jpg",
          "title": "Pôr do sol",
          "author": "Fulano de Tal",
          "year": "2026",
          "license": "Todos os direitos reservados",
          "location": "Wicklow, Irlanda",
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
| `title` | Legenda no card e no lightbox (padrão: "Foto N") |
| `author` | Autor da foto |
| `year` | Ano do copyright |
| `license` | Texto de licença |
| `location` | Local, mostrado ao lado da licença |
| `alt` | Texto alternativo (acessibilidade) |
| `thumb` | Miniatura opcional para o grid |

## Recursos

- Capa listando as galerias, com foto de capa e contagem de fotos.
- Grid fluido: 4 colunas no desktop, 3 em tablet, 2 no celular.
- Cores originais das fotos (sem filtro).
- Lightbox com setas, teclado (← → Esc) e swipe no celular.
- Download em dois lugares: botão no card e botão no lightbox.
- Crédito `© ano autor` + licença visíveis em cada foto.
