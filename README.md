# Galeria de Fotos

Galeria fluida em grid, com lightbox, botão de download e créditos de direito autoral
por foto. HTML/CSS/JS puro — sem build, sem dependências.

**Site:** https://lucianoamoretti.github.io/photos/

## Como adicionar fotos

1. Copie os arquivos para `images/` (`.jpg`, `.png`, `.webp`, `.avif`).
2. Rode o gerador:

   ```bash
   python3 tools/gen-manifest.py
   ```

3. Abra `photos.json` e preencha `title` e `author` das novas entradas.
4. Commit e push — o GitHub Pages publica em ~1 minuto.

O gerador preserva o que você já preencheu e remove entradas cujo arquivo saiu de `images/`.

## Estrutura do `photos.json`

```json
{
  "site": {
    "title": "Galeria",
    "subtitle": "Fotografias",
    "copyrightHolder": "Luciano Amoretti",
    "defaultAuthor": "",
    "defaultLicense": "Todos os direitos reservados",
    "defaultYear": "2026"
  },
  "photos": [
    {
      "file": "images/por-do-sol.jpg",
      "title": "Pôr do sol",
      "author": "Fulano de Tal",
      "year": "2025",
      "license": "Todos os direitos reservados",
      "location": "Dublin, Irlanda",
      "alt": "Sol se pondo atrás das montanhas"
    }
  ]
}
```

Campos por foto:

| Campo      | Obrigatório | Descrição |
|------------|-------------|-----------|
| `file`     | sim         | Caminho relativo do arquivo |
| `title`    | não         | Legenda no card e no lightbox (padrão: "Foto N") |
| `author`   | não         | Autor da foto; cai em `site.defaultAuthor` se vazio |
| `year`     | não         | Ano do copyright |
| `license`  | não         | Texto de licença; cai em `site.defaultLicense` se vazio |
| `location` | não         | Local, mostrado ao lado da licença |
| `alt`      | não         | Texto alternativo (acessibilidade) |
| `thumb`    | não         | Miniatura opcional para o grid, se quiser carregar mais leve |

## Recursos

- Grid fluido: 4 colunas no desktop, 3 em tablet, 2 no celular.
- Cores originais das fotos (sem filtro).
- Lightbox com setas, teclado (← → Esc) e swipe no celular.
- Download em dois lugares: botão no card e botão no lightbox.
- Crédito `© ano autor` + licença visíveis em cada foto.
- `loading="lazy"` nas imagens fora da primeira dobra e pré-carregamento
  da foto seguinte/anterior no lightbox.

## Dica de peso das imagens

Fotos direto da câmera são pesadas no celular. Para redimensionar em lote (macOS):

```bash
# reduz para no máximo 2000px no lado maior, qualidade 85
sips -Z 2000 images/*.jpg
```
