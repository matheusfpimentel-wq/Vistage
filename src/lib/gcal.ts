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
// Tipos espelhando o Rust
// ============================================================

export type StartOauthResult = {
  auth_url: string;
  port: number;
  state: string;
  verifier: string;
  redirect_uri: string;
};

export type OauthCallback = {
  code: string;
  state: string;
};

export type GcalTokens = {
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

export type GcalEvent = {
  id: string;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: string | null;
  end?: string | null;
  status?: string | null;
  updated?: string | null;
};

export type EventInput = {
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
import { getGig, listGigs, updateGig, createGig } from "@/modules/gigs/api";

function gigToEvent(gig: Gig, tz: string): EventInput {
  const start = gig.start_time
    ? `${gig.date}T${gig.start_time}:00`
    : gig.date;
  const end = gig.end_time
    ? `${gig.date}T${gig.end_time}:00`
    : gig.date;

  const descLines = [
    gig.briefing && `Briefing: ${gig.briefing}`,
    gig.day_contact_name &&
      `Contato no dia: ${gig.day_contact_name}${
        gig.day_contact_phone ? ` (${gig.day_contact_phone})` : ""
      }`,
    typeof gig.cache_amount === "number" &&
      `Cachê: R$ ${gig.cache_amount.toFixed(2)}`,
    `MusicGest GIG #${gig.id}`,
  ].filter(Boolean);

  const location = [gig.venue_address, gig.venue_city].filter(Boolean).join(" — ");

  return {
    summary: gig.venue_city
      ? `${gig.venue_name} (${gig.venue_city})`
      : gig.venue_name,
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
  const auth = await loadAuth();
  if (!auth?.calendar_id) {
    throw new Error("Selecione um calendário nas configurações antes.");
  }
  const cfg = await loadGcalConfig();
  const accessToken = await getValidAccessToken();
  const event = gigToEvent(gig, cfg.timezone);

  if (gig.gcal_event_id) {
    await invoke<void>("gcal_update_event", {
      accessToken,
      calendarId: auth.calendar_id,
      eventId: gig.gcal_event_id,
      event,
    });
  } else {
    const id = await invoke<string>("gcal_create_event", {
      accessToken,
      calendarId: auth.calendar_id,
      event,
    });
    await updateGig({ id: gig.id, gcal_event_id: id });
  }
}

/** Deleta o evento no GCal correspondente a uma GIG (se houver). */
export async function deleteGigFromCalendar(gig: Gig): Promise<void> {
  if (!gig.gcal_event_id) return;
  const auth = await loadAuth();
  if (!auth?.calendar_id) return;
  try {
    const accessToken = await getValidAccessToken();
    await invoke<void>("gcal_delete_event", {
      accessToken,
      calendarId: auth.calendar_id,
      eventId: gig.gcal_event_id,
    });
  } catch {
    // ignora — pode já ter sido deletado manualmente
  }
}

/** Sincronização completa bidirecional, manual. Retorna contadores. */
export async function syncAll(): Promise<{
  pushed: number;
  pulled: number;
}> {
  const auth = await loadAuth();
  if (!auth?.calendar_id) {
    throw new Error("Selecione um calendário nas configurações antes.");
  }
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
        calendarId: auth.calendar_id,
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
        calendarId: auth.calendar_id,
        eventId: g.gcal_event_id,
        event: gigToEvent(g, cfg.timezone),
      });
      pushed += 1;
    }
  }

  // --- PULL: eventos com updatedMin maior que o último sync (ou todos se primeiro sync)
  const events = await invoke<GcalEvent[]>("gcal_list_events", {
    accessToken,
    calendarId: auth.calendar_id,
    updatedMin: cfg.lastSyncAt,
  });

  // mapeia gcal_event_id → gig existente
  const existingByEventId = new Map<string, Gig>();
  for (const g of gigs) if (g.gcal_event_id) existingByEventId.set(g.gcal_event_id, g);

  let pulled = 0;
  for (const ev of events) {
    if (!ev.id) continue;
    if (existingByEventId.has(ev.id)) continue; // já temos
    if (ev.status === "cancelled") continue;

    const startStr = ev.start ?? "";
    const date = startStr.slice(0, 10);
    const startTime = startStr.includes("T") ? startStr.slice(11, 16) : null;
    const endTime = ev.end?.includes("T") ? ev.end.slice(11, 16) : null;
    if (!date) continue;

    await createGig({
      date,
      start_time: startTime,
      end_time: endTime,
      venue_name: ev.summary ?? "(sem título)",
      venue_city: null,
      venue_address: ev.location ?? null,
      promoter_contact_id: null,
      day_contact_name: null,
      day_contact_phone: null,
      estimated_audience: null,
      cache_amount: null,
      script_file_path: null,
      banner_file_path: null,
      opportunities: null,
      briefing: ev.description ?? null,
      set_concept: null,
      concrete_goals: null,
      targets: null,
      status: "Proposta",
      transport: null,
      departure_time: null,
      equipment_provided: null,
      equipment_to_bring: null,
      related_expenses: null,
      payment_method: null,
      payment_status: "Pendente",
      payment_due_date: null,
      invoice_file_path: null,
      general_notes: null,
      debrief_strengths: null,
      debrief_weaknesses: null,
      debrief_learnings: null,
      debrief_opportunities_used: null,
      debrief_future_opportunities: null,
      debrief_promoter_feedback: null,
      debrief_technical_notes: null,
      debrief_media_content: null,
      rating_charisma: null,
      rating_charisma_note: null,
      rating_technique: null,
      rating_technique_note: null,
      rating_repertoire: null,
      rating_repertoire_note: null,
      gcal_event_id: ev.id,
      main_goal: null,
      prep_state: null,
      main_goal_task_id: null,
    });
    pulled += 1;
  }

  await saveGcalConfig({ lastSyncAt: new Date().toISOString() });
  return { pushed, pulled };
}
