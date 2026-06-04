# Roadmap — App de Celular (Vistage Mobile)

> Objetivo: app iOS + Android que permite **editar todos os módulos** (criar/excluir
> GIGs, aulas, festas, etc.), com uma **view simplificada** e, principalmente,
> **notificações push de alertas críticos e recomendações** mesmo com o app fechado.

## Decisões já tomadas
- **Sincronização:** backend na nuvem (Supabase) — dados em tempo real, sem conflito.
- **Notificações:** push reais (chegam com o app fechado).
- **Plataformas:** Android **e** iOS.
- **Stack mobile:** Tauri 2 Mobile, reaproveitando o frontend React/TS atual.

## Arquitetura alvo

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────────┐
│  Desktop    │◄───────►│   Supabase (nuvem)    │◄───────►│   Mobile    │
│ (Tauri)     │  sync   │  • Postgres (dados)   │  sync   │ (Tauri iOS/ │
│             │         │  • Auth               │         │  Android)   │
└─────────────┘         │  • Edge Function (cron)│        └─────────────┘
                        │    → calcula alertas   │                ▲
                        │    → dispara push      │── FCM/APNs ────┘
                        └──────────────────────┘
```

Hoje os dados ficam em **SQLite local**. A migração para um modelo sincronizável é o
trabalho de base (Fase 1).

## Fases

### Fase 0 — Pré-requisitos (você)
- [ ] Criar projeto no **Supabase** (grátis).
- [ ] Conta **Apple Developer** (US$99/ano) — só quando formos para iOS.
- [ ] Conta **Google Play** (US$25) + projeto **Firebase** — para push Android.
- [ ] Ter um **Mac** disponível para o build iOS.

### Fase 1 — Camada de dados sincronizável
- [ ] Modelar o schema atual (SQLite) em **Postgres** no Supabase.
- [ ] Criar uma **camada de acesso a dados** abstrata (`src/lib/db.ts`) que fale tanto
      com SQLite (offline/desktop) quanto com Supabase (nuvem).
- [ ] Estratégia de sync: local-first com push/pull incremental por `updated_at`.
- [ ] Migrar o backup do Drive para apenas exportação (a fonte da verdade vira a nuvem).

### Fase 2 — Motor de alertas no servidor (reuso de `loadWeekStats`)
- [ ] Portar a lógica de `src/modules/revisao/api.ts` (`loadWeekStats`) para uma
      **Edge Function** do Supabase, lendo do Postgres.
- [ ] Agendar com **cron** (ex: a cada 1–3h) para recalcular alertas por usuário.
- [ ] Persistir os alertas e marcar quais já foram notificados (evitar repetição).

### Fase 3 — Push notifications
- [ ] Registrar token do device (FCM no Android, APNs no iOS) no Supabase.
- [ ] A Edge Function envia push para alertas **críticos** novos.
- [ ] Tela de preferências: quais alertas notificar, horário de silêncio.

### Fase 4 — App mobile (Tauri Mobile)
- [ ] `npm run tauri ios init` / `tauri android init`.
- [ ] **Layout responsivo / simplificado**: navegação por abas inferiores, listas
      em vez de tabelas largas, formulários em tela cheia.
- [ ] Reusar todos os módulos (CRUD) apontando para a camada de dados da Fase 1.
- [ ] Tela inicial = feed de **alertas e recomendações** (o `NotificationBell` vira a
      home do mobile).

### Fase 5 — Distribuição
- [ ] Android: gerar APK/AAB assinado → Google Play (ou APK direto para teste).
- [ ] iOS: build no Mac → TestFlight → App Store.

## O que pode começar JÁ (sem contas externas)
1. **Responsividade**: deixar a UI atual adaptável a telas pequenas (já usa Tailwind).
2. **Portar o motor de alertas** para um módulo puro/portável, pronto para rodar tanto
   no cliente quanto na futura Edge Function.
3. **Camada de dados abstrata**: preparar `db.ts` para múltiplos backends.

## Alertas já existentes (base das recomendações)
Fonte: `src/modules/revisao/api.ts` → `WeekStats`. Críticos marcados com 🔴:
- 🔴 Tarefas atrasadas
- 🔴 Debriefs de GIG pendentes
- 🔴 Ideias quentes paradas em "Embrião" +15d
- 🔴 GIGs em 72h sem prep musical completa
- 🔴 GIGs concluídas +48h com cachê não recebido
- Tracks/festas/conteúdos sem movimento +15d
- Festas sem data
- Nenhuma GIG futura / nenhuma música em produção
- Aulas em <=48h não preparadas
- Superfãs sem interação há 30d
- OKRs do quarter abaixo de 20% com <30 dias para fechar
