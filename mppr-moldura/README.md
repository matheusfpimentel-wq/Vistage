# Moldura Residente — MPPR

Aplicação de página única (um único arquivo `index.html`, sem dependências externas)
que aplica a moldura do MPPR sobre uma **foto** ou **vídeo** enviado pelo usuário e
permite **baixar** o resultado.

## O que ela faz

- Botão **Adicionar foto ou vídeo**.
- A mídia entra como fundo dentro da janela da moldura; é possível **arrastar para
  posicionar** e dar **zoom** (roda do mouse, dois dedos no celular ou a barrinha de zoom).
- Botão **Salvar**:
  - Foto → baixa um **PNG** em alta resolução (2400 × 3200).
  - Vídeo → grava o vídeo com a moldura embutida e baixa (`.mp4` quando o navegador
    suporta, senão `.webm`).
- A moldura (turquesa, logo MPPR, bandeira do Brasil, selo **RESIDENTE** etc.) é
  desenhada em código (Canvas), seguindo a identidade visual do MPPR. A fonte da
  marca é um subconjunto da *Outfit Bold* embutido no próprio arquivo (~1,5 KB),
  então o resultado fica idêntico em qualquer navegador, sem depender de internet.

## Como publicar no Google Sites

O arquivo é autocontido, então há duas formas:

**Opção A — colar o código (mais simples)**
1. No editor do Google Sites: **Inserir → Incorporar → Código incorporado**.
2. Cole todo o conteúdo de `index.html`.
3. **Avançar → Inserir** e ajuste o tamanho do bloco (sugestão: largura total,
   altura ~900 px).

**Opção B — incorporar por URL (recomendada se a opção A reclamar do tamanho)**
1. Hospede o `index.html` em qualquer lugar público (GitHub Pages, Drive publicado,
   Netlify, etc.).
2. No Sites: **Inserir → Incorporar → Por URL** e cole o endereço.

> A aplicação foi feita para aparecer "como uma notícia", logo abaixo do cabeçalho
> do site — ela tem só o título, uma linha de instrução e a ferramenta.

## Ajustes rápidos

No `index.html`, no início do `<script>`, há uma seção de constantes:

```js
var WIN = { x:72, y:64, w:812, h:1300, r:44 };   // posição/tamanho da janela da foto
var TURQ="#45C6D0", GREEN="#1AA64C", DTEAL="#2E8089", ORANGE="#F4521E";
```

- `WIN` controla onde a foto aparece dentro da moldura.
- As cores e os textos (`MP`, `PR`, `BRASIL`, `RESIDENTE`) podem ser alterados na
  função `renderTo()`.

Se você tiver o **arquivo oficial da moldura** (PNG com o centro transparente),
dá para trocar o desenho em código por esse PNG facilmente — é só pedir.

## Observações

- Gravação de vídeo usa a API `MediaRecorder`. Funciona na maioria dos navegadores
  de desktop e Android; no iPhone/Safari o suporte é mais limitado — nesse caso o
  ideal é usar foto.
- Nada é enviado para servidor: todo o processamento acontece no navegador do usuário.
