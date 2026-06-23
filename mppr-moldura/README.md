# Moldura MPPR

Aplicação de página única (`index.html`, autocontido, sem dependências) que aplica a
**moldura oficial do MPPR** sobre uma **foto** ou **vídeo** enviado pelo usuário e
permite **baixar / compartilhar** o resultado. Feita para ser incorporada no Google Sites.

## O que ela faz

- Botão **Adicionar foto ou vídeo**.
- A mídia aparece pela **janela transparente** da moldura. Dá para:
  - **arrastar** para posicionar;
  - dar **zoom** (roda do mouse, pinça no celular, barrinha ou botões **+/−**);
  - **duplo-clique** para centralizar;
  - enquanto arrasta, a parte que fica **fora da janela** aparece esmaecida (ajuda a enquadrar).
- Campos **Nome** e **Lotação** — o texto aparece nas duas barras escuras (nome em cima,
  lotação embaixo), com **MAIÚSCULAS** opcional e ajuste automático de tamanho.
- **Salvar** (foto → PNG 1489×2013; vídeo → `.mp4`/`.webm` com áudio), **Compartilhar**
  (menu nativo do celular → Instagram/Stories) e **Copiar** imagem (desktop). O arquivo
  sai nomeado com o nome digitado (ex.: `moldura-mppr-ana.png`).
- Fotos são corrigidas de **orientação (EXIF)** e **reduzidas** se forem muito grandes,
  para não travar em celulares.
- A moldura é a **imagem oficial** (`moldura.png`), embutida em base64. Nada é redesenhado
  e tudo roda no navegador do usuário (nada vai para servidor).

## Como publicar no Google Sites

**Opção A — colar o código:** Inserir → Incorporar → **Código incorporado** → cole o
`index.html` → Inserir.

> O arquivo tem ~113 KB (moldura + fonte embutidas). Se o Sites reclamar do tamanho, use a Opção B.

**Opção B — incorporar por URL:** hospede o `index.html` em algo público (GitHub Pages,
Netlify…) e use Inserir → Incorporar → **Por URL**.

> **Compartilhar:** o botão usa a API nativa de compartilhamento do navegador. Dentro do
> iframe do Google Sites isso pode ser bloqueado — nesse caso o app baixa a imagem e
> orienta a postar pelo Instagram. Funciona melhor com a página aberta na própria URL
> (Opção B). Não é possível enviar direto para os Stories a partir de um site — só apps
> nativos têm essa permissão.

## Ajustes (no início do `<script>`)

```js
var WIN      = { x:67, y:53, w:1062, h:1610 };  // janela da foto/vídeo
var BAR_NOME = { x:66, y:1685, w:1076, h:191 };  // barra do Nome
var BAR_LOT  = { x:66, y:1893, w:927,  h:90  };  // barra da Lotação
```

## Observações

- **Áudio do vídeo** é capturado via Web Audio (`createMediaElementSource` →
  `MediaStreamDestination`) — funciona em Chrome/Firefox (desktop) e Chrome (Android).
  No iPhone/Safari a captura é bloqueada; nesse caso o vídeo é salvo sem som.
- A fonte do **Nome/Lotação** é a **Futura** (Bold no nome, Medium na lotação) — a fonte
  da identidade do MPPR —, embutida como subconjunto. O arquivo de Futura fornecido não
  traz os **acentos** (á, ã, ç, é…), então esses caracteres usam como reserva a *Outfit*
  (também geométrica); na prática quase não se nota. Se você tiver uma Futura com acentos,
  dá para trocar e dispensar a reserva.
- `moldura.png` é a arte oficial (PNG 1489×2013 com janela central transparente). Para
  trocar a moldura, basta embutir o novo PNG em base64 no lugar de `FRAME_SRC`.
