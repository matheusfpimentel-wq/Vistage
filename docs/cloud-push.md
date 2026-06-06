# Push de alertas na nuvem (app fechado)

Status: **parcialmente implementado.**

## O que já funciona (local, dentro do app)

Enquanto o app está **aberto**, o Vistage dispara notificações do sistema
para alertas **críticos** usando a Web Notification API:

- `src/lib/notify.ts` — serviço + hook `useAlertNotifications()` (montado em
  `App.tsx`). Pede permissão, deduplica por chave de alerta e respeita o
  "dispensar" (snooze).
- O sininho (`NotificationBell`) mostra o botão **"Ativar notificações"**
  quando a permissão ainda não foi concedida.

O núcleo de decisão é a função **pura e portátil** `computeAlerts(stats)`
(`src/modules/revisao/alerts.ts`). Ela não depende de React nem de SQLite —
recebe um `WeekStats` e devolve a lista de alertas. É esse mesmo núcleo que a
nuvem deve reaproveitar, garantindo que app e servidor alertem pelas mesmas
regras.

## O que falta (push com o app fechado)

Notificação com o app fechado (especialmente no celular) precisa de
infraestrutura externa que **não dá para provisionar a partir deste
repositório**:

1. **Banco na nuvem (Postgres/Supabase).** Hoje os dados vivem em SQLite local.
   É preciso sincronizar (ou espelhar) as tabelas usadas pelos alertas:
   `gigs`, `tasks`, `parties`, `tracks`, `content`, `ideas`, `fans`, `okrs`.

2. **Edge Function agendada (cron).** Uma função que:
   - calcula o `WeekStats` a partir do Postgres (porta do `loadWeekStats`);
   - chama `computeAlerts(stats)`;
   - filtra `critical === true`;
   - envia push para os dispositivos registrados (evitando reenvio por chave).

3. **Registro de dispositivos + provedor de push.**
   - Web/desktop: Web Push (VAPID) + Service Worker.
   - Mobile (quando empacotar com Tauri/Capacitor): FCM/APNs, ou o
     [plugin de notificação do Tauri](https://v2.tauri.app/plugin/notification/)
     para notificações locais agendadas no próprio device.

### Esboço da Edge Function (pseudo)

```ts
// supabase/functions/push-alerts/index.ts  (a criar quando houver nuvem)
import { computeAlerts } from "../_shared/alerts.ts"; // copiar/compartilhar o core

Deno.serve(async () => {
  const stats = await loadWeekStatsFromPostgres(); // porta de loadWeekStats
  const critical = computeAlerts(stats).filter((a) => a.critical);
  for (const a of critical) {
    if (await alreadySent(a.key)) continue;
    await sendPushToAllDevices({ title: "Vistage", body: a.label, tag: a.key });
    await markSent(a.key);
  }
  return new Response("ok");
});
```

## Próximos passos sugeridos

1. Escolher o provedor de nuvem (Supabase é o caminho natural pelo Postgres +
   Edge Functions + cron embutidos).
2. Extrair `computeAlerts` e os tipos de `WeekStats` para um pacote compartilhado
   entre app e função (evita divergência de regras).
3. Implementar a sincronização SQLite → Postgres.
4. Implementar registro de dispositivos e o envio de push.
