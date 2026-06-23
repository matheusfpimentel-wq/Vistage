# Moldura MPPR

Aplicação de página única (`index.html`, autocontido, sem dependências) que aplica a
**moldura oficial do MPPR** sobre uma **foto** ou **vídeo** enviado pelo usuário e
permite **baixar** o resultado. Feita para ser incorporada no Google Sites.

## O que ela faz

- Botão **Adicionar foto ou vídeo**.
- A mídia aparece pela **janela transparente** da moldura; dá para **arrastar para
  posicionar** e dar **zoom** (roda do mouse, dois dedos no celular ou a barrinha).
- Campos **Nome** e **Lotação** — o que você digita aparece nas duas barras escuras
  da moldura (nome na de cima, lotação na de baixo) e sai no arquivo final.
- Botão **Salvar**:
  - Foto → baixa um **PNG** (1489 × 2013, mesmo tamanho da arte oficial).
  - Vídeo → grava o vídeo com a moldura embutida (`.mp4` quando o navegador suporta,
    senão `.webm`).
- A moldura é a **imagem oficial** (`moldura.png`), embutida no próprio arquivo em
  base64 — nada é redesenhado e nada depende de internet. Todo o processamento
  acontece no navegador do usuário (nada vai para servidor).

## Como publicar no Google Sites

**Opção A — colar o código (mais simples)**
1. No editor do Google Sites: **Inserir → Incorporar → Código incorporado**.
2. Cole todo o conteúdo de `index.html`.
3. **Avançar → Inserir** e ajuste o tamanho do bloco.

> O arquivo tem ~93 KB por causa da moldura embutida. Se o Google Sites reclamar do
> tamanho ao colar, use a Opção B.

**Opção B — incorporar por URL**
1. Hospede o `index.html` em qualquer lugar público (GitHub Pages, Netlify, etc.).
2. No Sites: **Inserir → Incorporar → Por URL** e cole o endereço.

## Trocar a moldura ou ajustar posições

A moldura é o arquivo `moldura.png` (PNG 1489 × 2013 com a janela central
transparente). Se um dia a arte mudar, basta gerar o `index.html` de novo embutindo o
novo PNG em base64 no lugar de `FRAME_SRC`.

No início do `<script>` ficam as medidas (em pixels da arte), caso precise reposicionar:

```js
var WIN      = { x:67, y:53, w:1062, h:1610 };  // janela da foto/vídeo
var BAR_NOME = { x:66, y:1685, w:1076, h:191 };  // barra do Nome
var BAR_LOT  = { x:66, y:1893, w:927,  h:90  };  // barra da Lotação
```

## Observações

- Gravação de vídeo usa a API `MediaRecorder`. O **áudio** é capturado via Web Audio
  (`createMediaElementSource` → `MediaStreamDestination`), que funciona em Chrome/Firefox
  no desktop e no Chrome Android. No **iPhone/Safari** a captura de áudio do vídeo no
  navegador é bloqueada — o app avisa e salva o vídeo sem som; para vídeo com áudio, use
  o Chrome no computador ou Android (ou salve uma foto).
- O texto de Nome/Lotação usa uma fonte do sistema (negrito). Se quiser a fonte
  geométrica exata da identidade do MPPR, dá para embutir uma fonte específica.
