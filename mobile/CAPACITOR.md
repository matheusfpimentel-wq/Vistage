# Vistage Mobile — nativo (iOS + Android) via Capacitor

O mesmo código React de `mobile/` roda em **três alvos**: PWA (Vite), **iOS** e
**Android** (Capacitor embrulha o build web numa casca nativa). Isto habilita o
que o PWA não faz — a **notificação persistente do Modo Foco** (Live Activity no
iOS / foreground service no Android) que também é a superfície de captura ao vivo.

> As pastas nativas `ios/` e `android/` são **geradas na sua máquina** e não
> ficam versionadas aqui. Build de iOS exige **macOS + Xcode + conta Apple
> Developer (US$ 99/ano)**.

## Pré-requisitos
- Node 18+ (o projeto usa 20).
- **iOS:** macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`), conta Apple Developer.
- **Android:** Android Studio + SDK.

## Primeira vez (gerar as cascas nativas)
```bash
cd mobile
npm install
npm run build              # gera dist/ (o webDir do Capacitor)
npx cap add ios            # cria mobile/ios   (rode no Mac)
npx cap add android        # cria mobile/android
npx cap sync               # copia o web build + plugins pras cascas
```

## Ciclo de desenvolvimento
```bash
npm run cap:sync           # build web + cap sync (rode após mudar o React)
npm run cap:ios            # abre o Xcode  (Mac)
npm run cap:android        # abre o Android Studio
```
No Xcode/Android Studio: selecionar device/simulador → Run. Para distribuir:
TestFlight/App Store (iOS) e Play Store/APK (Android).

## Plugins já instalados
- `@capacitor/core`, `@capacitor/cli`
- `@capacitor/app` — estado do app (resume) → dispara o flush da fila offline.
- `@capacitor/haptics` — haptic de confirmação na captura ao vivo (cai pra
  `navigator.vibrate` no PWA — ver `src/native.ts`).
- `@capacitor/preferences` — fila offline em storage nativo (sem evicção; cai
  pra `localStorage` no PWA — ver `src/native.ts` / `src/queue.ts`).

## TODO nativo (próximos PRs — exigem o seu Mac)
- **Live Activity (iOS, Modo Foco)** — ActivityKit/SwiftUI numa *Widget
  Extension* dentro de `mobile/ios/`. Botões interativos (registrar erro pela
  lock screen) exigem **iOS 17+ + App Intents**; em iOS 16.x, tocar a Live
  Activity faz **deep-link** pra tela de Foco (grid eyes-free). Um plugin
  Capacitor faz a ponte JS↔ActivityStart/Update/End e entrega os toques de botão
  ao JS (que enfileira via `src/queue.ts`).
- **Foreground service (Android)** — notificação ongoing com ações (as mesmas
  categorias de erro), gravando no store nativo mesmo em background.
- **Push nativo** — APNs (iOS) + FCM (Android) via `@capacitor/push-notifications`
  (certificados ficam na sua conta).
- **Background tasks** — BGTaskScheduler (iOS) / WorkManager (Android) pro flush
  da fila em segundo plano.

> A captura ao vivo (grid eyes-free + 💡Ideia + 🔥Momento) e a fila offline já
> funcionam **no PWA hoje** — a parte nativa acima só torna o registro possível
> com o app fechado / pela lock screen.
