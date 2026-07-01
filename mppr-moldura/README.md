# Moldura MPPR

Aplicação de página única (`index.html`, autocontido, sem dependências) que aplica a
**moldura oficial do MPPR** sobre uma **foto** ou **vídeo** enviado pelo usuário e
permite **baixar** o resultado. Feita para ser incorporada no Google Sites.

## O que ela faz

- Botão **Adicionar foto ou vídeo**.
- A mídia aparece pela **janela transparente** da moldura. Dá para:
  - **arrastar** para posicionar;
  - dar **zoom** pela **barra vertical ao lado da figurinha** (ou roda do mouse / pinça);
  - **duplo-clique** para centralizar;
  - enquanto arrasta, a parte que fica **fora da janela** aparece esmaecida (ajuda a enquadrar).
- Campos **Nome** e **Lotação** — o texto aparece nas duas barras escuras (nome em cima,
  lotação embaixo), com **MAIÚSCULAS** opcional e ajuste automático de tamanho.
- Seletor **Vínculo: Estagiário / Residente** — a palavra escolhida aparece no **selo azul**
  do canto da moldura.
- **Salvar** (foto → PNG ~1072×1906; vídeo → `.mp4`/`.webm` com áudio) e **Copiar** imagem
  (desktop). O arquivo sai nomeado com o nome digitado (ex.: `moldura-mppr-ana.png`).
- Os botões seguem a identidade da moldura: formato pílula, fonte **Futura** e a paleta
  do card (laranja do selo, verde, turquesa-escuro).
- Fotos são corrigidas de **orientação (EXIF)** e **reduzidas** se forem muito grandes,
  para não travar em celulares.
- A moldura é a **imagem oficial** (`moldura-estagiario.webp`), embutida em base64. Nada é redesenhado
  e tudo roda no navegador do usuário (nada vai para servidor).

## Como publicar no Google Sites

**Opção A — colar o código:** Inserir → Incorporar → **Código incorporado** → cole o
`index.html` → Inserir.

> O arquivo tem ~120 KB (moldura + fontes embutidas). Se o Sites reclamar do tamanho, use a Opção B.

**Opção B — incorporar por URL:** hospede o `index.html` em algo público (GitHub Pages,
Netlify…) e use Inserir → Incorporar → **Por URL**.

## Ajustes (no início do `<script>`)

```js
var WIN      = { x:79, y:185, w:297, h:450 };  // janela da foto/vídeo
var BAR_NOME = { x:79, y:640, w:300, h:54 };   // barra do Nome
var BAR_LOT  = { x:79, y:698, w:258, h:25 };   // barra da Lotação
var BAR_ROLE = { x:342, y:698, w:115, h:25 };  // selo azul (Estagiário/Residente)
```

## Observações

- **Áudio do vídeo** é capturado via Web Audio (`createMediaElementSource` →
  `MediaStreamDestination`) — funciona em Chrome/Firefox (desktop) e Chrome (Android).
  No iPhone/Safari a captura é bloqueada; nesse caso o vídeo é salvo sem som.
- **Formato do vídeo:** grava em **MP4** quando o navegador suporta (Chrome no PC/Android,
  Safari) — formato aceito pelos Stories. Onde só há WebM (ex.: Firefox), o app avisa, pois
  os Stories não aceitam WEBM.
- A fonte do **Nome/Lotação** é a **Futura** (Bold no nome, Medium na lotação) — a fonte
  da identidade do MPPR —, embutida como subconjunto. O arquivo de Futura fornecido não
  traz os **acentos** (á, ã, ç, é…), então esses caracteres usam como reserva a *Outfit*
  (também geométrica); na prática quase não se nota. Se você tiver uma Futura com acentos,
  dá para trocar e dispensar a reserva.
- `moldura-estagiario.webp` é a arte oficial (WebP 536×953 com janela central transparente).
  Para trocar a moldura, embuta a nova imagem em base64 no lugar de `FRAME_SRC` e reajuste
  as medidas acima. Uma arte em resolução maior (ex.: 1080×1920) deixa o resultado mais nítido.
