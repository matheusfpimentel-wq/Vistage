import { invoke } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { getDb } from "./db";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const SETTINGS_KEYS = {
  CLIENT_ID: "gcal.client_id",
  CLIENT_SECRET: "gcal.client_secret",
  TIMEZONE: "gcal.timezone",
  LAST_SYNC_AT: "gcal.last_sync_at",
};

// ============================================================
// Calendários por módulo
// ============================================================

/** Módulos que sincronizam com o Google Calendar. */
export const GCAL_MODULES = ["gigs", "classes", "parties", "okrs"] as const;
export type GcalModule = (typeof GCAL_MODULES)[number];

export const GCAL_MODULE_LABELS: Record<GcalModule, string> = {
  gigs: "GIGs",
  classes: "Aulas",
  parties: "Festas",
  okrs: "OKRs",
};

function moduleCalendarKey(module: GcalModule): string {
  return `gcal.calendar.${module}`;
}

/** Define o calendário usado por um módulo (null = usar o principal). */
export async function setModuleCalendarId(
  module: GcalModule,
  calendarId: string | null
): Promise<void> {
  await setSetting(moduleCalendarKey(module), calendarId);
}

/** Lê o id de calendário configurado para cada módulo (null se usar o principal). */
export async function loadModuleCalendarIds(): Promise<Record<GcalModule, string | null>> {
  const entries = await Promise.all(
    GCAL_MODULES.map(async (m) => [m, await getSetting(moduleCalendarKey(m))] as const)
  );
  return Object.fromEntries(entries) as Record<GcalModule, string | null>;
}

/**
 * Resolve qual calendário usar para um módulo: o específico do módulo, ou o
 * principal (gcal_auth.calendar_id) como fallback.
 */
async function resolveCalendarId(module: GcalModule): Promise<string> {
  const specific = await getSetting(moduleCalendarKey(module));
  if (specific) return specific;
  const auth = await loadAuth();
  if (!auth?.calendar_id) {
    throw new Error("Selecione um calendário nas configurações antes.");
  }
  return auth.calendar_id;
}

// ============================================================
// Tipos espelhando o Rust
// ============================================================

type StartOauthResult = {
  auth_url: string;
  port: number;
  state: string;
  verifier: string;
  redirect_uri: string;
};

type OauthCallback = {
  code: string;
  state: string;
};

type GcalTokens = {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  scope?: string | null;
  token_type?: string | null;
};

export type CalendarListItem = {
  id: string;
  summary: string;
  primary: boolean;
  access_role?: string | null;
  time_zone?: string | null;
};

type EventInput = {
  summary: string;
  description?: string | null;
  location?: string | null;
  /** "YYYY-MM-DD" (dia inteiro) ou "YYYY-MM-DDTHH:MM:SS" (com hora). */
  start: string;
  end: string;
  time_zone?: string | null;
  status?: string | null;
};

// ============================================================
// Persistência (app_settings + gcal_auth)
// ============================================================

async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string | null }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string | null): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export type GcalConfig = {
  clientId: string | null;
  clientSecret: string | null;
  timezone: string;
  lastSyncAt: string | null;
};

export async function loadGcalConfig(): Promise<GcalConfig> {
  return {
    clientId: await getSetting(SETTINGS_KEYS.CLIENT_ID),
    clientSecret: await getSetting(SETTINGS_KEYS.CLIENT_SECRET),
    timezone: (await getSetting(SETTINGS_KEYS.TIMEZONE)) ?? "America/Sao_Paulo",
    lastSyncAt: await getSetting(SETTINGS_KEYS.LAST_SYNC_AT),
  };
}

export async function saveGcalConfig(cfg: Partial<GcalConfig>): Promise<void> {
  if (cfg.clientId !== undefined)
    await setSetting(SETTINGS_KEYS.CLIENT_ID, cfg.clientId);
  if (cfg.clientSecret !== undefined)
    await setSetting(SETTINGS_KEYS.CLIENT_SECRET, cfg.clientSecret);
  if (cfg.timezone !== undefined)
    await setSetting(SETTINGS_KEYS.TIMEZONE, cfg.timezone);
  if (cfg.lastSyncAt !== undefined)
    await setSetting(SETTINGS_KEYS.LAST_SYNC_AT, cfg.lastSyncAt);
}

type GcalAuthRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  calendar_id: string | null;
};

export async function loadAuth(): Promise<GcalAuthRow | null> {
  const db = getDb();
  const rows = await db.select<GcalAuthRow[]>(
    "SELECT access_token, refresh_token, expires_at, calendar_id FROM gcal_auth WHERE id = 1"
  );
  return rows[0] ?? null;
}

async function saveTokens(tokens: GcalTokens): Promise<void> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  // garantir existência da linha (id=1)
  await db.execute(
    `INSERT OR IGNORE INTO gcal_auth (id, access_token, refresh_token, expires_at)
     VALUES (1, NULL, NULL, NULL)`
  );
  await db.execute(
    `UPDATE gcal_auth
        SET access_token = $1,
            refresh_token = COALESCE($2, refresh_token),
            expires_at = $3
      WHERE id = 1`,
    [tokens.access_token, tokens.refresh_token ?? null, expiresAt]
  );
}

export async function setCalendarId(calendarId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE gcal_auth SET calendar_id = $1 WHERE id = 1",
    [calendarId]
  );
}

export async function disconnect(): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM gcal_auth WHERE id = 1");
}

// ============================================================
// Tokens: refresh automático
// ============================================================

async function getValidAccessToken(): Promise<string> {
  const cfg = await loadGcalConfig();
  const auth = await loadAuth();
  if (!auth?.access_token) throw new Error("Não autenticado no Google Calendar");
  if (!cfg.clientId || !cfg.clientSecret)
    throw new Error("Credenciais OAuth não configuradas");

  const expiresAt = auth.expires_at ? new Date(auth.expires_at).getTime() : 0;
  const now = Date.now();
  // renova com 60s de margem
  if (now + 60_000 < expiresAt) return auth.access_token;

  if (!auth.refresh_token) {
    throw new Error("Token expirado e sem refresh_token — reconecte o Google.");
  }
  const fresh = await invoke<GcalTokens>("gcal_refresh_token", {
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    refreshToken: auth.refresh_token,
  });
  await saveTokens(fresh);
  return fresh.access_token;
}

// ============================================================
// Conectar / Desconectar
// ============================================================

export async function connect(): Promise<void> {
  const cfg = await loadGcalConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error(
      "Antes de conectar, preencha o Client ID e o Client Secret do Google Cloud Console."
    );
  }

  const start = await invoke<StartOauthResult>("gcal_start_oauth", {
    clientId: cfg.clientId,
    scopes: [CALENDAR_SCOPE],
  });

  await openExternal(start.auth_url);

  const callback = await invoke<OauthCallback>("gcal_wait_callback", {
    port: start.port,
    timeoutSecs: 300,
  });

  const tokens = await invoke<GcalTokens>("gcal_exchange_code", {
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    code: callback.code,
    verifier: start.verifier,
    redirectUri: start.redirect_uri,
  });

  await saveTokens(tokens);
}

export async function listCalendars(): Promise<CalendarListItem[]> {
  const accessToken = await getValidAccessToken();
  return invoke<CalendarListItem[]>("gcal_list_calendars", { accessToken });
}

// ============================================================
// Sync — Gigs ↔ Eventos
// ============================================================

import type { Gig } from "@/modules/gigs/types";
import { getGig, listGigs, updateGig } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";

/** Soma N dias a uma data "YYYY-MM-DD" e devolve no mesmo formato. */
function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function gigToEvent(gig: Gig, tz: string): EventInput {
  const hasTime = !!gig.start_time;
  let start: string;
  let end: string;

  if (hasTime) {
    // Evento com hora. Garante que o fim seja >= início; se não houver hora de
    // fim, ou se ela for anterior/igual ao início (ex.: vira a madrugada),
    // considera +1h ou o dia seguinte.
    start = `${gig.date}T${gig.start_time}:00`;
    if (gig.end_time) {
      end = `${gig.date}T${gig.end_time}:00`;
      if (end <= start) {
        // fim no dia seguinte (festa que atravessa a meia-noite)
        end = `${addDaysISO(gig.date, 1)}T${gig.end_time}:00`;
      }
    } else {
      // sem hora de fim: assume 1h de duração
      const d = new Date(`${start}`);
      d.setHours(d.getHours() + 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      end = `${gig.date}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
      if (end <= start) end = `${addDaysISO(gig.date, 1)}T00:00:00`;
    }
  } else {
    // Evento de dia inteiro: o "end.date" no Google é exclusivo, então precisa
    // ser o dia seguinte — senão a API rejeita (start == end) com 400.
    start = gig.date;
    end = addDaysISO(gig.date, 1);
  }

  const descLines = [
    // Quando o título é o nome da festa, registra o local no corpo também.
    gig.event_name?.trim() && gig.venue_name && `Local: ${gig.venue_name}`,
    gig.briefing && `Briefing: ${gig.briefing}`,
    gig.day_contact_name &&
      `Contato no dia: ${gig.day_contact_name}${
        gig.day_contact_phone ? ` (${gig.day_contact_phone})` : ""
      }`,
    typeof gig.cache_amount === "number" &&
      `Cachê: R$ ${gig.cache_amount.toFixed(2)}`,
    `Vistage GIG #${gig.id}`,
  ].filter(Boolean);

  const location = [gig.venue_address, gig.venue_city].filter(Boolean).join(" — ");

  return {
    // Prefere o nome da festa/evento (o que vai no flyer); cai pro venue.
    summary: gigDisplayName(gig),
    description: descLines.length ? descLines.join("\n") : null,
    location: location || null,
    start,
    end,
    time_zone: tz,
    status: gig.status === "Cancelada" ? "cancelled" : "confirmed",
  };
}

/** Cria/atualiza o evento no GCal correspondente a uma GIG. Salva o id no banco. */
export async function pushGigToCalendar(gigId: number): Promise<void> {
  const gig = await getGig(gigId);
  if (!gig) throw new Error("GIG não encontrada");
  const calendarId = await resolveCalendarId("gigs");
  const cfg = await loadGcalConfig();
  const accessToken = await getValidAccessToken();
  const event = gigToEvent(gig, cfg.timezone);

  if (gig.gcal_event_id) {
    await invoke<void>("gcal_update_event", {
      accessToken,
      calendarId,
      eventId: gig.gcal_event_id,
      event,
    });
  } else {
    const id = await invoke<string>("gcal_create_event", {
      accessToken,
      calendarId,
      event,
    });
    await updateGig({ id: gig.id, gcal_event_id: id });
  }
}

/** Deleta o evento no GCal correspondente a uma GIG (se houver). */
export async function deleteGigFromCalendar(gig: Gig): Promise<void> {
  if (!gig.gcal_event_id) return;
  try {
    const calendarId = await resolveCalendarId("gigs");
    const accessToken = await getValidAccessToken();
    await invoke<void>("gcal_delete_event", {
      accessToken,
      calendarId,
      eventId: gig.gcal_event_id,
    });
  } catch {
    // ignora — pode já ter sido deletado manualmente
  }
}

/**
 * Sincronização manual — **somente push** (GIGs → Google Calendar).
 * A importação reversa (eventos da agenda virando GIGs) foi removida de
 * propósito: o fluxo é unidirecional, a GIG é a fonte da verdade.
 * `pulled` é mantido em 0 só pra preservar o formato de retorno.
 */
export async function syncAll(): Promise<{
  pushed: number;
  pulled: number;
}> {
  const calendarId = await resolveCalendarId("gigs");
  const accessToken = await getValidAccessToken();
  const cfg = await loadGcalConfig();

  // --- PUSH: GIGs sem evento ainda, ou atualizadas após o último sync
  const gigs = await listGigs();
  let pushed = 0;
  for (const g of gigs) {
    if (g.status === "Cancelada" && !g.gcal_event_id) continue;
    if (!g.gcal_event_id) {
      const id = await invoke<string>("gcal_create_event", {
        accessToken,
        calendarId,
        event: gigToEvent(g, cfg.timezone),
      });
      await updateGig({ id: g.id, gcal_event_id: id });
      pushed += 1;
    } else if (
      cfg.lastSyncAt &&
      g.updated_at &&
      g.updated_at > cfg.lastSyncAt
    ) {
      await invoke<void>("gcal_update_event", {
        accessToken,
        calendarId,
        eventId: g.gcal_event_id,
        event: gigToEvent(g, cfg.timezone),
      });
      pushed += 1;
    }
  }

  await saveGcalConfig({ lastSyncAt: new Date().toISOString() });
  return { pushed, pulled: 0 };
}


// ============================================================
// Sync — Aulas, Festas, OKRs ↔ Eventos
// ============================================================

/** Cria/atualiza evento no GCal para uma aula. Retorna o event id. */
export async function pushClassToCalendar(classData: {
  id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  subject: string | null;
  student_name: string;
  gcal_event_id: string | null;
}): Promise<string> {
  const calendarId = await resolveCalendarId("classes");
  const cfg = await loadGcalConfig();
  const accessToken = await getValidAccessToken();

  const start = classData.start_time
    ? `${classData.date}T${classData.start_time}:00`
    : classData.date;
  const end = classData.end_time
    ? `${classData.date}T${classData.end_time}:00`
    : classData.date;

  const event: EventInput = {
    summary: `Aula: ${classData.student_name}`,
    description: classData.subject ?? null,
    start,
    end,
    time_zone: classData.start_time ? cfg.timezone : null,
  };

  if (classData.gcal_event_id) {
    await invoke<void>("gcal_update_event", {
      accessToken,
      calendarId,
      eventId: classData.gcal_event_id,
      event,
    });
    return classData.gcal_event_id;
  } else {
    return invoke<string>("gcal_create_event", {
      accessToken,
      calendarId,
      event,
    });
  }
}

/** Cria/atualiza evento no GCal para uma festa. Retorna o event id. */
export async function pushPartyToCalendar(partyData: {
  id: number;
  title: string;
  date: string | null;
  venue_name?: string | null;
  gcal_event_id: string | null;
}): Promise<string> {
  if (!partyData.date) throw new Error("Festa sem data não pode ser sincronizada.");
  const calendarId = await resolveCalendarId("parties");
  const accessToken = await getValidAccessToken();

  const event: EventInput = {
    summary: partyData.title,
    location: partyData.venue_name ?? null,
    start: partyData.date,
    end: partyData.date,
  };

  if (partyData.gcal_event_id) {
    await invoke<void>("gcal_update_event", {
      accessToken,
      calendarId,
      eventId: partyData.gcal_event_id,
      event,
    });
    return partyData.gcal_event_id;
  } else {
    return invoke<string>("gcal_create_event", {
      accessToken,
      calendarId,
      event,
    });
  }
}

/** Cria/atualiza evento no GCal para um OKR (data fim do trimestre). Retorna o event id. */
export async function pushOkrToCalendar(okrData: {
  id: number;
  quarter: string;
  objective: string;
  gcal_event_id: string | null;
}): Promise<string> {
  const calendarId = await resolveCalendarId("okrs");
  const accessToken = await getValidAccessToken();

  // Compute end of quarter
  const [year, q] = okrData.quarter.split("-Q");
  const qNum = parseInt(q);
  const endMonth = qNum * 3;
  const lastDay = new Date(parseInt(year), endMonth, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const endDate = `${year}-${pad(endMonth)}-${lastDay}`;

  const event: EventInput = {
    summary: `OKR fim: ${okrData.objective}`,
    start: endDate,
    end: endDate,
  };

  if (okrData.gcal_event_id) {
    await invoke<void>("gcal_update_event", {
      accessToken,
      calendarId,
      eventId: okrData.gcal_event_id,
      event,
    });
    return okrData.gcal_event_id;
  } else {
    return invoke<string>("gcal_create_event", {
      accessToken,
      calendarId,
      event,
    });
  }
}

