# Vistage — APK (Android)

O PWA já instala via **"Adicionar à tela inicial"**. Pra um **APK** de verdade
(instalável por arquivo ou publicável na Play Store), embrulhe o PWA numa **TWA**
(Trusted Web Activity). Dois caminhos:

## Caminho 1 — PWABuilder (mais fácil, sem instalar nada)

1. Acesse **https://www.pwabuilder.com** e cole a URL do PWA:
   `https://matheusfpimentel-wq.github.io/Vistage/`
2. *Package For Stores → Android* → **Generate**.
3. Baixe o `.apk` (teste/sideload) ou o `.aab` (Play Store) + o pacote vem com o
   `assetlinks.json`.

## Caminho 2 — Bubblewrap (CLI, reproduzível)

Pré-requisitos: Node, JDK 17, Android SDK.

```bash
npm i -g @bubblewrap/cli
cd mobile-apk
bubblewrap init --manifest https://matheusfpimentel-wq.github.io/Vistage/manifest.webmanifest
# (o twa-manifest.json deste diretório já traz a config pronta)
bubblewrap build       # gera app-release-signed.apk + assetlinks.json
```

## Verificação (tira a barrinha de URL do app)

Pra TWA abrir em tela cheia (sem a barra do Chrome), o site precisa servir o
**Digital Asset Links** com a impressão digital (SHA-256) da chave que assinou o APK:

1. Pegue o `assetlinks.json` gerado (PWABuilder/Bubblewrap).
2. Coloque em **`mobile/public/.well-known/assetlinks.json`** (vai pro deploy do
   Pages e fica acessível em `…/Vistage/.well-known/assetlinks.json`).
3. Rebuild/redeploy do PWA. Pronto — o APK abre full-screen.

> Native real (não-TWA) via **Tauri Mobile** é possível no futuro, mas é um port
> bem maior do app inteiro.
